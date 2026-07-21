import { NextRequest, NextResponse } from "next/server";
import { resolveKmaArea } from "@/lib/kma-area";

// 기상청 보건기상지수 조회서비스(3.0) — 꽃가루농도위험지수(참나무·소나무·잡초류)
//
// 지점 코드(areaNo)는 자외선 API와 같은 10자리 법정동코드를 쓴다 (lib/kma-area.ts 참조).
// 발표시각(time)은 YYYYMMDDHH — 공식 명세의 전 언어 샘플이 `time=2021070618`을 쓴다.
//
// 자료제공 기간 (2026-07-22 실호출로 확인한 API 응답 메시지 기준):
//   · 참나무·소나무 3월~6월  · 잡초류 8월~10월
// 기간 밖 요청은 resultCode 99("해당지수자료 제공기간이 아닙니다")로 거절되고,
// 기간 안이어도 "최근 1일 간의 자료만 제공합니다" 제약이 있어 과거 시각 조회는 불가하다.
const BASE = "https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3";

// 오퍼레이션명 철자 주의 — 잡초류만 `Riskndx`이고 참나무·소나무는 `RiskIdx`다.
const OPERATIONS = [
  { key: "oak", operation: "getOakPollenRiskIdxV3" },
  { key: "pine", operation: "getPinePollenRiskIdxV3" },
  { key: "weed", operation: "getWeedsPollenRiskndxV3" },
] as const;

type PollenKey = (typeof OPERATIONS)[number]["key"];

// 2026-06 이전 구현이 쓰던 기상청 자체 2자리 지역코드 + YYYYMMDD. 명세와 어긋나지만,
// 제공 기간 밖에서는 기간 검사가 파라미터 검증보다 먼저 걸려 어느 쪽이 유효한지 실측할 수
// 없었다(2026-07-22 조사). 명세대로 10자리·YYYYMMDDHH를 먼저 쓰고, 값이 비면 구 체계로
// 한 번 더 시도해 어느 쪽이든 결측이 생기지 않게 한다. 구 체계로 값을 받으면 로그를 남겨
// 잡초류 제공이 시작되는 8월에 실제 코드 체계를 확정할 수 있게 한다.
const LEGACY_AREA_CODE_MAP: Record<string, string> = {
  서울: "11",
  부산: "21",
  대구: "22",
  인천: "23",
  광주: "24",
  대전: "25",
  울산: "26",
  세종: "29",
  경기: "31",
  강원: "32",
  충북: "33",
  충남: "34",
  전북: "35",
  전남: "36",
  경북: "37",
  경남: "38",
  제주: "39",
};

function getNowKST(): { date: string; hour: string } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return {
    date:
      String(kst.getUTCFullYear()) +
      String(kst.getUTCMonth() + 1).padStart(2, "0") +
      String(kst.getUTCDate()).padStart(2, "0"),
    hour: String(kst.getUTCHours()).padStart(2, "0"),
  };
}

// 응답 item의 지수 필드명은 공식 설명서에 없다(설명서는 호출 예제만 수록). 오퍼레이션별
// 이름(oak/pine/weed)을 먼저 보고, 없으면 메타 필드를 뺀 나머지에서 단계 범위(0~3)의
// 정수를 취한다. `-`는 기상청 결측 표기.
const META_FIELDS = new Set(["code", "areano", "areaname", "date", "sido", "gugun"]);

function toGrade(raw: unknown): number | null {
  if (raw == null || raw === "" || raw === "-") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
}

function readIndex(item: Record<string, string>, key: PollenKey): number | null {
  const named = toGrade(item[key] ?? item.today ?? item.value);
  if (named != null) return named;
  for (const [field, raw] of Object.entries(item)) {
    if (META_FIELDS.has(field.toLowerCase())) continue;
    const n = toGrade(raw);
    if (n != null) return n;
  }
  return null;
}

async function callPollen(
  operation: string,
  key: PollenKey,
  apiKey: string,
  areaNo: string,
  time: string
): Promise<number | null> {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    numOfRows: "10",
    pageNo: "1",
    dataType: "JSON",
    areaNo,
    time,
  });
  try {
    const res = await fetch(`${BASE}/${operation}?${params}`, {
      next: { revalidate: 3600 * 6 },
      // 종류당 최대 2회(명세 체계 → 구 체계) 직렬 호출이라 4s씩 — 합쳐도 종전 상한(8s)과 같다.
      // 홈은 꽃가루에 5s 클라이언트 타임아웃을 걸어두므로 여기서 더 늘리면 리포트 착수가 밀린다.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.response?.header?.resultCode !== "00") return null;
    const items: Array<Record<string, string>> = data?.response?.body?.items?.item ?? [];
    return items.length ? readIndex(items[0], key) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { region, areaNo } = resolveKmaArea(searchParams.get("region"));
  const { date, hour } = getNowKST();

  const apiKey = process.env.POLLEN_API_KEY;
  if (!apiKey || apiKey === "YOUR_DATA_GO_KR_API_KEY") {
    return NextResponse.json(
      { error: "POLLEN_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  try {
    const results = await Promise.all(
      OPERATIONS.map(async ({ key, operation }) => {
        const value = await callPollen(operation, key, apiKey, areaNo, `${date}${hour}`);
        if (value != null) return [key, value] as const;

        const legacy = await callPollen(
          operation,
          key,
          apiKey,
          LEGACY_AREA_CODE_MAP[region],
          date
        );
        if (legacy != null) {
          console.info(
            `[pollen API] ${operation}: 구 지역코드(${LEGACY_AREA_CODE_MAP[region]}/YYYYMMDD)로 값을 받았습니다 — areaNo 체계 재확인 필요`
          );
        }
        return [key, legacy] as const;
      })
    );

    return NextResponse.json({
      ...Object.fromEntries(results),
      region,
      date,
    });
  } catch (err) {
    console.error("[pollen API]", err);
    return NextResponse.json({ error: "꽃가루 데이터를 가져올 수 없습니다." }, { status: 500 });
  }
}
