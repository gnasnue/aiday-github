import { NextRequest, NextResponse } from "next/server";
import { feelsLikeC } from "@/lib/feels-like";
import { getNcstBaseDateTime } from "@/lib/kma-time";
import {
  buildHourlyForecast,
  kmaNum,
  KMA_RANGE,
  type FcstItem,
} from "@/lib/kma-forecast";

// 위경도 → 기상청 격자 좌표 변환 (Lambert Conformal Conic Projection)
function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
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

function getBaseDateTime(): { base_date: string; base_time: string } {
  const now = new Date();
  // KST = UTC+9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();

  // 발표 시각: 0200, 0500, 0800, 1100, 1400, 1700, 2000, 2300
  // 발표 후 약 10분 뒤 데이터 제공 → 안전하게 30분 여유
  const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
  const currentMinutes = hour * 60 + minute;

  // 02:30 이전엔 당일 첫 발표본(0200)이 아직 없다 — 전날 2300 발표본으로 롤백한다.
  // (미발표 발표본을 요청하면 NO_DATA로 시간대별 예보가 통째로 비고, 현재값 정시(0000 등)도
  //  0200 발표본엔 없어 스칼라가 전부 null이 된다 → 홈이 mock으로 조용히 폴백)
  if (currentMinutes < baseTimes[0] * 60 + 30) {
    const y = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
    const base_date =
      String(y.getUTCFullYear()) +
      String(y.getUTCMonth() + 1).padStart(2, "0") +
      String(y.getUTCDate()).padStart(2, "0");
    return { base_date, base_time: "2300" };
  }

  let selectedHour = baseTimes[0];
  for (const t of baseTimes) {
    if (currentMinutes >= t * 60 + 30) {
      selectedHour = t;
    }
  }

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const base_date = `${year}${month}${day}`;
  const base_time = String(selectedHour).padStart(2, "0") + "00";

  return { base_date, base_time };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "37.5665");
  const lon = parseFloat(searchParams.get("lon") ?? "126.9780");

  const apiKey = process.env.KMA_API_KEY;
  if (!apiKey || apiKey === "YOUR_DATA_GO_KR_API_KEY") {
    return NextResponse.json(
      { error: "KMA_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const { nx, ny } = latLonToGrid(lat, lon);
  const { base_date, base_time } = getBaseDateTime();

  const fcstUrl = (bd: string, bt: string) => {
    const params = new URLSearchParams({
      serviceKey: apiKey,
      // 이른 발표 시각(예: 0200)에서도 당일 21시까지 전 시간대 예보를 확보하려면
      // 넉넉한 행 수가 필요하다. 100행은 ~7시간분이라 오후 슬롯이 잘린다.
      numOfRows: "1000",
      pageNo: "1",
      dataType: "JSON",
      base_date: bd,
      base_time: bt,
      nx: String(nx),
      ny: String(ny),
    });
    return `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params}`;
  };

  try {
    // 기상청 단기예보는 base_time 이후 시각만 반환해, 오후에는 오늘 오전 시간대(06·09·12시)가
    // 최신 발표본에서 빠진다. 당일 0200 발표본은 하루 전체를 커버하므로 함께 받아
    // 지나간 시각 슬롯을 그날 아침에 봤던 값 그대로 고정해 채운다.
    // 초단기실황: '현재' 스칼라(기온·습도·풍속·강수형태)의 1차 소스. 예보(단기예보)는
    // 발표 후 최대 3시간 지난 값이라 실황과 상시 1~3°C 어긋난다 — 실황을 우선하고
    // 실황 실패 시에만 종전처럼 예보 최근접값으로 폴백한다. base_time이 URL에 포함돼
    // 캐시 키가 매시 갱신된다.
    const ncst = getNcstBaseDateTime();
    const ncstUrl = (bd: string, bt: string) => {
      const params = new URLSearchParams({
        serviceKey: apiKey,
        numOfRows: "10",
        pageNo: "1",
        dataType: "JSON",
        base_date: bd,
        base_time: bt,
        nx: String(nx),
        ny: String(ny),
      });
      return `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?${params}`;
    };

    const [res, fillRes, ncstRes] = await Promise.all([
      fetch(fcstUrl(base_date, base_time), { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) }), // 30분 캐시
      base_time !== "0200"
        ? fetch(fcstUrl(base_date, "0200"), { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) }).catch(() => null)
        : Promise.resolve(null),
      fetch(ncstUrl(ncst.base_date, ncst.base_time), { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) }).catch(() => null),
    ]);
    if (!res.ok) {
      return NextResponse.json(
        { error: `기상청 API 오류: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const items: FcstItem[] = data?.response?.body?.items?.item ?? [];

    // 0200 발표본은 보조 데이터 — 실패해도 최신 발표본만으로 기존과 동일하게 동작한다
    let fillItems: FcstItem[] = [];
    if (fillRes?.ok) {
      try {
        const fillData = await fillRes.json();
        fillItems = fillData?.response?.body?.items?.item ?? [];
      } catch {}
    }

    // 실황 관측값 — 실패해도 예보 폴백으로 기존과 동일하게 동작한다
    const obs: Record<string, string> = {};
    const parseObs = async (r: Response | null) => {
      if (!r?.ok) return;
      try {
        const d = await r.json();
        const its: Array<{ category: string; obsrValue: string }> =
          d?.response?.body?.items?.item ?? [];
        for (const it of its) obs[it.category] = it.obsrValue;
      } catch {}
    };
    await parseObs(ncstRes);
    // 발표 지연으로 이번 시각 실황이 비어 있으면(빈 200 응답이 30분 캐시에 고정될 수 있음)
    // 직전 시각 발표본으로 한 번 더 시도한다 — URL이 달라 별도 캐시 엔트리라 안전하다.
    // 타임아웃은 3s로 짧게 잡는다: 이 재시도는 순차라 임계경로를 늘려, 8s면 앞단(최대 8s)과 합쳐
    // 라우트가 클라이언트 abort(9s)를 넘긴다. 실패해도 예보 최근접값 폴백(usingNcst=false)이 있어
    // 정확도 보정용일 뿐이라 빠르게 포기하는 편이 홈 로딩 성공률에 유리하다.
    let obsBase = ncst;
    if (obs["T1H"] == null) {
      const prev = getNcstBaseDateTime(new Date(Date.now() + 9 * 60 * 60 * 1000 - 60 * 60 * 1000));
      const prevRes = await fetch(ncstUrl(prev.base_date, prev.base_time), {
        next: { revalidate: 1800 },
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);
      await parseObs(prevRes);
      obsBase = prev;
    }

    // 오늘 날짜 기준 현재 시각에 가장 가까운 예보만 추출
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr =
      String(kst.getUTCFullYear()) +
      String(kst.getUTCMonth() + 1).padStart(2, "0") +
      String(kst.getUTCDate()).padStart(2, "0");

    // 현재값(상단 '현재 환경' 스칼라): '지금'에 가장 가까운 예보 정시를 고른다.
    // 특정 정시를 정확히 일치시키던 종전 방식은 발표본 경계(자정 직후 등)에서 그 정시가
    // 비면 스칼라가 통째로 null이 돼 홈이 mock으로 새는 문제가 있었다. 최근접 매칭으로
    // 데이터가 하나라도 있으면 항상 실측 현재값을 노출한다. (fcstDate/Time을 KST 벽시계로
    // 해석해 epoch 비교 — uv 라우트와 동일 패턴, +9h는 차분에서 상쇄되어 무관)
    const nowShiftedMs = kst.getTime();
    const fcstMs = (it: FcstItem) =>
      Date.UTC(
        Number(it.fcstDate.slice(0, 4)),
        Number(it.fcstDate.slice(4, 6)) - 1,
        Number(it.fcstDate.slice(6, 8)),
        Number(it.fcstTime.slice(0, 2)),
        Number(it.fcstTime.slice(2, 4))
      );
    // 최신 발표본에 항목이 없으면(콜드 응답 등) 보조 0200 발표본으로 폴백
    const currentItems = items.length ? items : fillItems;
    let curDate = "";
    let curTime = "";
    let bestDiff = Infinity;
    for (const item of currentItems) {
      const diff = Math.abs(fcstMs(item) - nowShiftedMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        curDate = item.fcstDate;
        curTime = item.fcstTime;
      }
    }

    const forecast: Record<string, string> = {};
    for (const item of currentItems) {
      if (item.fcstDate === curDate && item.fcstTime === curTime) {
        forecast[item.category] = item.fcstValue;
      }
    }

    // 오늘 3시간 간격 시간대별 예보 (06~21시).
    // 스칼라와 동일한 값 검증(kmaNum)을 거친다 — 센티널(-999 등)이 섞인 슬롯이
    // 그대로 나가면 홈 시간대 카드·리포트 프롬프트에 "-999°C"가 실린다.
    const hourlyForecast = buildHourlyForecast(items, fillItems, todayStr);

    // 내일 미리보기(홈 "오늘|내일" 세그먼트, buildTomorrowTimeline)용.
    // 단기예보 발표본은 +3일치를 담고 있어 이미 받아 온 응답에서 그대로 뽑는다 — 추가 호출 없음.
    const tomorrow = new Date(kst.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr =
      String(tomorrow.getUTCFullYear()) +
      String(tomorrow.getUTCMonth() + 1).padStart(2, "0") +
      String(tomorrow.getUTCDate()).padStart(2, "0");
    const hourlyForecastTomorrow = buildHourlyForecast(items, fillItems, tomorrowStr);

    // SKY: 1=맑음, 3=구름많음, 4=흐림
    // PTY: 0=없음, 1=비, 2=비/눈, 3=눈, 4=소나기
    // 현재 스칼라: 실황(T1H·REH·WSD·PTY) 우선, 없으면 예보 최근접값.
    // SKY·POP은 실황에 없는 예보 전용 항목이라 예보값 유지.
    // 실황 PTY는 0~7(5=빗방울 6=빗방울눈날림 7=눈날림) — 소비처가 가정하는 예보 코드(0~4)로 정규화
    const normPty = (p: number | null): number | null =>
      p == null ? null : p === 5 ? 1 : p === 6 ? 2 : p === 7 ? 3 : p;
    const obsTemp = kmaNum(obs["T1H"], KMA_RANGE.TMP);
    // 부분 관측 방지: 기온이 유효할 때만 실황 세트를 쓴다 (출처 표기가 거짓이 되지 않게)
    const usingNcst = obsTemp != null;
    const rawTemp = usingNcst ? obsTemp : kmaNum(forecast["TMP"], KMA_RANGE.TMP);
    // 실황 T1H는 소수 1자리("27.3") — 예보와 동일하게 정수로 반올림해 표시 회귀를 막는다
    const temperature = rawTemp != null ? Math.round(rawTemp) : null;
    const humidity =
      (usingNcst ? kmaNum(obs["REH"], KMA_RANGE.REH) : null) ?? kmaNum(forecast["REH"], KMA_RANGE.REH);
    const windSpeed =
      (usingNcst ? kmaNum(obs["WSD"], KMA_RANGE.WSD) : null) ?? kmaNum(forecast["WSD"], KMA_RANGE.WSD);
    const pty =
      (usingNcst ? normPty(kmaNum(obs["PTY"], KMA_RANGE.PTY_OBS)) : null) ??
      kmaNum(forecast["PTY"], KMA_RANGE.PTY);
    return NextResponse.json({
      temperature,
      feelsLike: temperature != null ? feelsLikeC(temperature, humidity, windSpeed) : null,
      sky: kmaNum(forecast["SKY"], KMA_RANGE.SKY),
      pty,
      humidity,
      windSpeed,
      pop: kmaNum(forecast["POP"], KMA_RANGE.POP),
      // 현재 스칼라 출처 — 정합성 검증 스크립트·디버깅용 (ncst=실황 관측, fcst=예보 폴백)
      currentSource: usingNcst ? "ncst" : "fcst",
      currentBaseTime: usingNcst
        ? `${obsBase.base_date} ${obsBase.base_time}`
        : `${base_date} ${base_time}`,
      hourlyForecast,
      hourlyForecastTomorrow,
    });
  } catch (err) {
    console.error("[weather API]", err);
    return NextResponse.json({ error: "날씨 데이터를 가져올 수 없습니다." }, { status: 500 });
  }
}
