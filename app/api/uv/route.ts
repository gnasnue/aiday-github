import { NextRequest, NextResponse } from "next/server";
import { resolveKmaArea } from "@/lib/kma-area";

// 기상청_생활기상지수 조회서비스(3.0) — 자외선지수(UV)
// areaNo는 꽃가루 API와 공유하는 10자리 법정동코드 (lib/kma-area.ts 참조).
// 단기예보의 격자 좌표(nx/ny)와는 다른 체계다.

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
  const { region, areaNo } = resolveKmaArea(searchParams.get("region"));

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
    const SLOT_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
    const hourly: Record<string, number | null> = {};
    for (const h of SLOT_HOURS) {
      hourly[String(h)] = uviAt(todayMidnightMs + h * 60 * 60 * 1000);
    }

    // 내일 미리보기(홈 "오늘|내일" 세그먼트)용 — 오프셋 필드가 h75(약 3일치)까지라
    // 같은 발표본에서 내일분이 그대로 나온다. 추가 호출 없음.
    const tomorrowMidnightMs = todayMidnightMs + 24 * 60 * 60 * 1000;
    const hourlyTomorrow: Record<string, number | null> = {};
    for (const h of SLOT_HOURS) {
      hourlyTomorrow[String(h)] = uviAt(tomorrowMidnightMs + h * 60 * 60 * 1000);
    }

    return NextResponse.json({
      uvi: uvValue,
      hourly,
      hourlyTomorrow,
      region,
      date: announcedDateStr || todayStr,
    });
  } catch (err) {
    console.error("[uv API]", err);
    return NextResponse.json({ error: "자외선 데이터를 가져올 수 없습니다." }, { status: 500 });
  }
}
