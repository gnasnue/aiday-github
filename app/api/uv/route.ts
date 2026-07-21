import { NextRequest, NextResponse } from "next/server";

// 기상청_생활기상지수 조회서비스(3.0) — 자외선지수(UV)
// areaNo는 표준 법정동코드(시/도 단위, 10자리, 뒷자리 0 패딩)다.
// 2자리 코드(11/21/22...)는 이 계열 API에서 통하지 않는다 — areaNo=11로 질의하면
// resultCode 99 "검색결과가 없습니다. [11]"로 떨어진다(2026-07-22 실측).
//
// 2026-07-01 행정구역 개편으로 광주광역시(2900000000)·전라남도(4600000000)가
// 폐지되고 전남광주통합특별시(1200000000)로 통합됐다. 구 코드로 질의하면 자외선이
// 상시 결측이 되므로 두 지역명 모두 통합 코드로 보낸다(지역명 키는 기존 UI·저장값
// 호환을 위해 유지). 근거: 공공데이터포털 15085289 첨부 행정구역코드 파일
// (dfs-zone-tree_excel_20260701) 및 실 API 응답 대조 — 17개 시/도 전수 확인 결과
// 이 2개만 실패했고 나머지 15개는 정상.
const GWANGJU_JEONNAM = "1200000000"; // 전남광주통합특별시 (2026-07-01 통합)

const AREA_CODE_MAP: Record<string, string> = {
  서울: "1100000000",
  부산: "2600000000",
  대구: "2700000000",
  인천: "2800000000",
  광주: GWANGJU_JEONNAM,
  대전: "3000000000",
  울산: "3100000000",
  세종: "3600000000",
  경기: "4100000000",
  강원: "5100000000", // 강원특별자치도 (전환 후 51로 재부여)
  충북: "4300000000",
  충남: "4400000000",
  전북: "5200000000", // 전북특별자치도 (전환 후 52로 재부여)
  전남: GWANGJU_JEONNAM,
  경북: "4700000000",
  경남: "4800000000",
  제주: "5000000000",
};

function getDateHourKST(offsetHours = 0): { dateStr: string; hour: number } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetHours * 60 * 60 * 1000);
  const dateStr =
    String(kst.getUTCFullYear()) +
    String(kst.getUTCMonth() + 1).padStart(2, "0") +
    String(kst.getUTCDate()).padStart(2, "0");
  return { dateStr, hour: kst.getUTCHours() };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const regionParam = searchParams.get("region") ?? "서울";
  const region = regionParam in AREA_CODE_MAP ? regionParam : "서울";
  const areaNo = AREA_CODE_MAP[region];

  const apiKey = process.env.KMA_API_KEY;
  if (!apiKey || apiKey === "YOUR_DATA_GO_KR_API_KEY") {
    return NextResponse.json(
      { error: "KMA_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const { dateStr: todayStr, hour } = getDateHourKST();

  async function fetchUV(time: string) {
    try {
      const params = new URLSearchParams({
        serviceKey: apiKey!,
        numOfRows: "10",
        pageNo: "1",
        dataType: "JSON",
        areaNo,
        time,
      });
      const res = await fetch(
        `https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5?${params}`,
        { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.response?.header?.resultCode !== "00") return null;
      return data?.response?.body?.items?.item ?? [];
    } catch {
      return null;
    }
  }

  try {
    // time은 YYYYMMDDHH 형식. 요청 시각에 발표된 자료가 없으면 API가 자동으로
    // 가장 최근 발표 시각으로 내려서 응답하므로, 자정 직후 등 당일 자료가 아직
    // 없는 구간을 위해 24시간 전(어제 같은 시각)도 fallback으로 시도
    const candidates = [
      `${todayStr}${String(hour).padStart(2, "0")}`,
      `${getDateHourKST(-24).dateStr}${String(hour).padStart(2, "0")}`,
    ];

    let items: Array<Record<string, string>> | null = null;
    for (const time of candidates) {
      const result = await fetchUV(time);
      if (result && result.length > 0) {
        items = result;
        break;
      }
    }

    if (!items || !items.length) {
      return NextResponse.json({ uvi: null, date: todayStr });
    }

    const item = items[0];

    // item.date(YYYYMMDDHH)는 실제 발표 시각. h0/h3/h6...h75는 발표 시각 기준
    // 3시간 단위 오프셋 필드라 h22 같은 키는 존재하지 않음 — 특정 시각이 발표
    // 시각으로부터 몇 시간 지났는지 계산해 가장 가까운 3시간 배수로 내림
    const announced = item.date ?? "";
    const announcedDateStr = announced.slice(0, 8);
    const announcedHour = parseInt(announced.slice(8, 10), 10) || 0;
    const announcedMs = Date.UTC(
      Number(announcedDateStr.slice(0, 4)),
      Number(announcedDateStr.slice(4, 6)) - 1,
      Number(announcedDateStr.slice(6, 8)),
      announcedHour
    );

    // 임의의 KST 시각(epoch)에 해당하는 자외선지수를 오프셋 필드에서 추출
    const uviAt = (targetMs: number): number | null => {
      const elapsed = Math.round((targetMs - announcedMs) / (60 * 60 * 1000));
      if (elapsed < 0) return null; // 발표 이전(주로 이른 새벽) — 값 없음
      const offset = Math.min(75, Math.floor(elapsed / 3) * 3);
      const raw = item[`h${offset}`];
      const v = raw && raw !== "-" ? Number(raw) : null;
      return v !== null && !Number.isNaN(v) ? v : null;
    };

    const nowMs = Date.now() + 9 * 60 * 60 * 1000;
    const uvValue = uviAt(nowMs);

    // 홈 시간대별 카드용: 오늘 3시간 단위 시각별 지수 맵 ("6" → 값)
    const todayMidnightMs = Date.UTC(
      Number(todayStr.slice(0, 4)),
      Number(todayStr.slice(4, 6)) - 1,
      Number(todayStr.slice(6, 8)),
      0
    );
    const hourly: Record<string, number | null> = {};
    for (const h of [0, 3, 6, 9, 12, 15, 18, 21]) {
      hourly[String(h)] = uviAt(todayMidnightMs + h * 60 * 60 * 1000);
    }

    return NextResponse.json({
      uvi: uvValue,
      hourly,
      region,
      date: announcedDateStr || todayStr,
    });
  } catch (err) {
    console.error("[uv API]", err);
    return NextResponse.json({ error: "자외선 데이터를 가져올 수 없습니다." }, { status: 500 });
  }
}
