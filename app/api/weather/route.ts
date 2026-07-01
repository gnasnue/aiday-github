import { NextRequest, NextResponse } from "next/server";

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

  const params = new URLSearchParams({
    serviceKey: apiKey,
    numOfRows: "100",
    pageNo: "1",
    dataType: "JSON",
    base_date,
    base_time,
    nx: String(nx),
    ny: String(ny),
  });

  const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params}`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } }); // 30분 캐시
    if (!res.ok) {
      return NextResponse.json(
        { error: `기상청 API 오류: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const items: Array<{ category: string; fcstValue: string; fcstDate: string; fcstTime: string }> =
      data?.response?.body?.items?.item ?? [];

    // 오늘 날짜 기준 현재 시각에 가장 가까운 예보만 추출
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr =
      String(kst.getUTCFullYear()) +
      String(kst.getUTCMonth() + 1).padStart(2, "0") +
      String(kst.getUTCDate()).padStart(2, "0");

    const currentHour = kst.getUTCHours();
    const nearestHour = Math.ceil(currentHour / 3) * 3;
    const wrapsToNextDay = nearestHour >= 24;
    const fcstTime = String(wrapsToNextDay ? 0 : nearestHour).padStart(2, "0") + "00";

    // 22~23시엔 nearestHour가 24(=다음날 0시)로 넘어가므로, 조회 날짜도 함께 하루 넘겨야 함
    const targetDate = wrapsToNextDay
      ? new Date(kst.getTime() + 24 * 60 * 60 * 1000)
      : kst;
    const targetDateStr =
      String(targetDate.getUTCFullYear()) +
      String(targetDate.getUTCMonth() + 1).padStart(2, "0") +
      String(targetDate.getUTCDate()).padStart(2, "0");

    const forecast: Record<string, string> = {};
    for (const item of items) {
      if (item.fcstDate === targetDateStr && item.fcstTime === fcstTime) {
        forecast[item.category] = item.fcstValue;
      }
    }

    // 오늘 3시간 간격 시간대별 예보 (06~21시)
    const hourSlots = ["0600", "0900", "1200", "1500", "1800", "2100"];
    const hourlyForecast = hourSlots
      .map((slot) => {
        const d: Record<string, string> = {};
        for (const item of items) {
          if (item.fcstDate === todayStr && item.fcstTime === slot) {
            d[item.category] = item.fcstValue;
          }
        }
        if (!d["TMP"]) return null;
        return {
          hour: slot.slice(0, 2) + ":" + slot.slice(2),
          temp: Number(d["TMP"]),
          sky: d["SKY"] ? Number(d["SKY"]) : null,
          pty: d["PTY"] ? Number(d["PTY"]) : null,
          humidity: d["REH"] ? Number(d["REH"]) : null,
          windSpeed: d["WSD"] ? Number(d["WSD"]) : null,
          pop: d["POP"] ? Number(d["POP"]) : null,
        };
      })
      .filter(Boolean);

    // SKY: 1=맑음, 3=구름많음, 4=흐림
    // PTY: 0=없음, 1=비, 2=비/눈, 3=눈, 4=소나기
    return NextResponse.json({
      temperature: forecast["TMP"] ? Number(forecast["TMP"]) : null,
      feelsLike: forecast["WSD"] ? Math.round(Number(forecast["TMP"]) - 0.7 * Number(forecast["WSD"])) : null,
      sky: forecast["SKY"] ? Number(forecast["SKY"]) : null,
      pty: forecast["PTY"] ? Number(forecast["PTY"]) : null,
      humidity: forecast["REH"] ? Number(forecast["REH"]) : null,
      windSpeed: forecast["WSD"] ? Number(forecast["WSD"]) : null,
      pop: forecast["POP"] ? Number(forecast["POP"]) : null,
      hourlyForecast,
    });
  } catch (err) {
    console.error("[weather API]", err);
    return NextResponse.json({ error: "날씨 데이터를 가져올 수 없습니다." }, { status: 500 });
  }
}
