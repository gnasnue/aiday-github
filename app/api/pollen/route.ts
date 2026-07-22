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
// 이름(oak/pine/weed)을 먼저 보고, 없으면 메타 필드를 뺀 나머지에서 찾는다.
// `-`는 기상청 결측 표기.
const META_FIELDS = new Set(["code", "areano", "areaname", "date", "sido", "gugun"]);

// 단계는 0~3(낮음·보통·높음·매우높음)이지만 상한을 넘는 값이 와도 여기서 버리지 않는다 —
// 버리면 결측이 되고 렌더 폴백에서 "낮음"으로 표시돼, 알레르기 체질 아이에게 위험을 과소
// 표기하는 방향이 된다. 상한 clamp는 라벨 매핑(lib/timeline.ts `pollenLevelOf`) 담당.
function toGrade(raw: unknown): number | null {
  if (raw == null || raw === "" || raw === "-") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function readIndex(item: Record<string, string>, key: PollenKey): number | null {
  const named = toGrade(item[key] ?? item.today ?? item.value);
  if (named != null) return named;
  // 필드명을 못 찾았을 때의 최후 수단. 여기서는 날짜(20260722)·코드 같은 큰 정수를 지수로
  // 오인하면 안 되므로, 이 경로에 한해 단계 범위(0~3) 안의 값만 후보로 본다.
  for (const [field, raw] of Object.entries(item)) {
    if (META_FIELDS.has(field.toLowerCase())) continue;
    const n = toGrade(raw);
    if (n != null && n <= 3) return n;
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
      signal: AbortSignal.timeout(8000),
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
        return [key, value] as const;
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
