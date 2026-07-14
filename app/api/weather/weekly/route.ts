import { NextRequest, NextResponse } from "next/server";

// 주간 날씨(7일) = 단기예보(오늘~D+2, 격자·시간대별) + 중기예보(D+3~, 광역·오전/오후)
// 기상청 단기예보 getVilageFcst는 최대 D+2까지만 신뢰 구간이라, 3일 후부터는
// 중기예보(getMidLandFcst 육상 + getMidTa 기온)로 채운다.

/* ----------------------------- 격자 변환 (단기예보용) ----------------------------- */
function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0;
  const OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  const ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  const r = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  const nx = Math.floor(r * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - r * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

/* ----------------------------- 중기예보 지역코드 ----------------------------- */
// land: getMidLandFcst 광역 육상코드, ta: getMidTa 대표도시 기온코드
// 서울 코드는 표준값으로 검증됨. 그 외는 best-effort이며 미지정 시 서울로 fallback.
const MID_REGION: Record<string, { land: string; ta: string }> = {
  서울: { land: "11B00000", ta: "11B10101" },
  인천: { land: "11B00000", ta: "11B20201" },
  경기: { land: "11B00000", ta: "11B20601" },
  강원: { land: "11D10000", ta: "11D10301" },
  대전: { land: "11C20000", ta: "11C20401" },
  세종: { land: "11C20000", ta: "11C20404" },
  충북: { land: "11C10000", ta: "11C10301" },
  충남: { land: "11C20000", ta: "11C20101" },
  광주: { land: "11F20000", ta: "11F20501" },
  전북: { land: "11F10000", ta: "11F10201" },
  전남: { land: "11F20000", ta: "11F20801" },
  대구: { land: "11H10000", ta: "11H10701" },
  경북: { land: "11H10000", ta: "11H10501" },
  부산: { land: "11H20000", ta: "11H20201" },
  울산: { land: "11H20000", ta: "11H20101" },
  경남: { land: "11H20000", ta: "11H20301" },
  제주: { land: "11G00000", ta: "11G00201" },
};

/* ----------------------------- 시각 helper (KST) ----------------------------- */
function kstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}
function ymd(d: Date): string {
  return (
    String(d.getUTCFullYear()) +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}
function daysBetween(fromYmd: string, toYmd: string): number {
  const f = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(4, 6) - 1, +fromYmd.slice(6, 8));
  const t = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(4, 6) - 1, +toYmd.slice(6, 8));
  return Math.round((t - f) / (24 * 60 * 60 * 1000));
}

// 단기예보 base_time (0200~2300 중 발표 후 30분 지난 최신)
function getShortBase(now: Date): { base_date: string; base_time: string } {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
  let selected = baseTimes[0];
  for (const t of baseTimes) if (minutes >= t * 60 + 30) selected = t;
  // 0230 이전이면 전날 2300 발표본
  let base = now;
  if (minutes < 2 * 60 + 30) {
    base = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    selected = 23;
  }
  return { base_date: ymd(base), base_time: String(selected).padStart(2, "0") + "00" };
}

// 중기예보 tmFc (06시/18시 발표, 발표 후 약 10분 여유)
function getMidTmFc(now: Date): { tmFc: string; tmFcDate: string } {
  const h = now.getUTCHours(), m = now.getUTCMinutes();
  const mins = h * 60 + m;
  if (mins >= 18 * 60 + 10) return { tmFc: ymd(now) + "1800", tmFcDate: ymd(now) };
  if (mins >= 6 * 60 + 10) return { tmFc: ymd(now) + "0600", tmFcDate: ymd(now) };
  const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { tmFc: ymd(y) + "1800", tmFcDate: ymd(y) };
}

/* ----------------------------- 날씨 텍스트 → 아이콘 ----------------------------- */
const skyIconFromCode = (sky: number | null, pty: number | null): string => {
  if (pty && pty > 0) return pty === 3 ? "🌨️" : "🌧️";
  if (sky === 1) return "☀️";
  if (sky === 3) return "⛅";
  if (sky === 4) return "☁️";
  return "🌤️";
};
// 중기 육상예보 wf 텍스트(예: "구름많고 비", "흐림", "맑음")
const iconFromMidText = (wf: string): { icon: string; rainy: boolean } => {
  const snow = wf.includes("눈");
  const rain = wf.includes("비") || wf.includes("소나기");
  if (snow) return { icon: "🌨️", rainy: true };
  if (rain) return { icon: wf.includes("구름") ? "🌦️" : "🌧️", rainy: true };
  if (wf.includes("흐림")) return { icon: "☁️", rainy: false };
  if (wf.includes("구름많")) return { icon: "⛅", rainy: false };
  if (wf.includes("맑")) return { icon: "☀️", rainy: false };
  return { icon: "🌤️", rainy: false };
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "37.5665");
  const lon = parseFloat(searchParams.get("lon") ?? "126.9780");
  const regionParam = searchParams.get("region") ?? "서울";
  const region = regionParam in MID_REGION ? regionParam : "서울";
  const { land: landRegId, ta: taRegId } = MID_REGION[region];

  const apiKey = process.env.KMA_API_KEY;
  if (!apiKey || apiKey === "YOUR_DATA_GO_KR_API_KEY") {
    return NextResponse.json({ error: "KMA_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  const now = kstNow();
  const todayStr = ymd(now);
  const { nx, ny } = latLonToGrid(lat, lon);
  const { base_date, base_time } = getShortBase(now);
  const { tmFc, tmFcDate } = getMidTmFc(now);

  const shortUrl = (() => {
    const p = new URLSearchParams({
      serviceKey: apiKey, numOfRows: "1000", pageNo: "1", dataType: "JSON",
      base_date, base_time, nx: String(nx), ny: String(ny),
    });
    return `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${p}`;
  })();
  const midUrl = (op: string, regId: string) => {
    const p = new URLSearchParams({
      serviceKey: apiKey, numOfRows: "10", pageNo: "1", dataType: "JSON", regId, tmFc,
    });
    return `https://apis.data.go.kr/1360000/MidFcstInfoService/${op}?${p}`;
  };

  try {
    const [shortRes, landRes, taRes] = await Promise.allSettled([
      fetch(shortUrl, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) }),
      fetch(midUrl("getMidLandFcst", landRegId), { next: { revalidate: 3600 * 3 }, signal: AbortSignal.timeout(8000) }),
      fetch(midUrl("getMidTa", taRegId), { next: { revalidate: 3600 * 3 }, signal: AbortSignal.timeout(8000) }),
    ]);

    /* --- 단기예보: 일별 최저/최고/대표하늘/최대강수확률 (오늘~D+2) --- */
    type Daily = { tmn?: number; tmx?: number; sky?: number; pty?: number; pop: number };
    const shortDaily: Record<string, Daily> = {};
    if (shortRes.status === "fulfilled" && shortRes.value.ok) {
      const data = await shortRes.value.json();
      const items: Array<{ category: string; fcstValue: string; fcstDate: string; fcstTime: string }> =
        data?.response?.body?.items?.item ?? [];
      for (const it of items) {
        const d = (shortDaily[it.fcstDate] ??= { pop: 0 });
        const v = Number(it.fcstValue);
        if (it.category === "TMN") d.tmn = Math.round(v);
        else if (it.category === "TMX") d.tmx = Math.round(v);
        else if (it.category === "POP") d.pop = Math.max(d.pop, v);
        else if (it.category === "SKY" && (it.fcstTime === "1500" || (d.sky == null && it.fcstTime === "1200"))) d.sky = v;
        else if (it.category === "PTY" && (it.fcstTime === "1500" || (d.pty == null && it.fcstTime === "1200"))) d.pty = v;
      }
    }

    /* --- 중기예보: 육상(날씨/강수확률) + 기온(최저/최고), 발표일 기준 n일 후 --- */
    let land: Record<string, string> = {};
    let ta: Record<string, string> = {};
    if (landRes.status === "fulfilled" && landRes.value.ok) {
      try {
        const d = await landRes.value.json();
        if (d?.response?.header?.resultCode === "00")
          land = d?.response?.body?.items?.item?.[0] ?? {};
      } catch {}
    }
    if (taRes.status === "fulfilled" && taRes.value.ok) {
      try {
        const d = await taRes.value.json();
        if (d?.response?.header?.resultCode === "00")
          ta = d?.response?.body?.items?.item?.[0] ?? {};
      } catch {}
    }

    /* --- 7일 병합 (오늘 ~ D+6) --- */
    const week = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const dStr = ymd(date);
      const dow = date.getUTCDay();
      const label = i === 0 ? "오늘" : WEEKDAYS[dow];
      const dateLabel = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
      const weekend = dow === 0 || dow === 6;

      let icon = "🌤️", high: number | null = null, low: number | null = null, rain = 0, source = "none";
      const sd = shortDaily[dStr];
      const midN = daysBetween(tmFcDate, dStr); // 발표일 기준 n일 후

      if (sd && (sd.tmn != null || sd.tmx != null)) {
        // 단기예보 우선 (오늘~D+2)
        icon = skyIconFromCode(sd.sky ?? null, sd.pty ?? null);
        high = sd.tmx ?? null;
        low = sd.tmn ?? null;
        rain = Math.round(sd.pop);
        source = "short";
      } else if (midN >= 3 && midN <= 7) {
        // 중기예보 (D+3~D+7): 오후 값 사용
        const wf = land[`wf${midN}Pm`] ?? land[`wf${midN}Am`] ?? "";
        const rn = land[`rnSt${midN}Pm`] ?? land[`rnSt${midN}Am`];
        const tmax = ta[`taMax${midN}`];
        const tmin = ta[`taMin${midN}`];
        const m = iconFromMidText(wf);
        icon = m.icon;
        high = tmax != null && tmax !== "" ? Math.round(Number(tmax)) : null;
        low = tmin != null && tmin !== "" ? Math.round(Number(tmin)) : null;
        rain = rn != null && rn !== "" ? Number(rn) : 0;
        source = "mid";
      }

      week.push({ day: label, date: dateLabel, icon, high, low, rain, weekend, source });
    }

    // 단기·중기 모두 실패해 온도가 하나도 없으면 에러로 간주
    if (!week.some((w) => w.high != null || w.low != null)) {
      return NextResponse.json({ error: "주간 예보 데이터 없음" }, { status: 502 });
    }

    return NextResponse.json({ week, region, base: { base_date, base_time, tmFc } });
  } catch (err) {
    console.error("[weekly API]", err);
    return NextResponse.json({ error: "주간 날씨 데이터를 가져올 수 없습니다." }, { status: 500 });
  }
}
