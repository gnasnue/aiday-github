import type {
  DustLevel,
  PollenLevel,
  TimeSlot,
  UvLevel,
  WeatherData,
  WindLevel,
} from "./weather-api";

// API 라우트 응답 중 스냅샷 조립에 필요한 필드만 정의
export interface WeatherApiData {
  temperature: number | null;
  feelsLike?: number | null;
  sky: number | null;
  pty: number | null;
  humidity: number | null;
  windSpeed: number | null;
  pop?: number | null;
  hourlyForecast?: Array<{
    hour: string; // "06:00" 형식
    temp: number;
    sky: number | null;
    pty: number | null;
    humidity: number | null;
    windSpeed: number | null;
    pop: number | null;
  }>;
}

export interface AirApiData {
  pm10Grade: number | null;
  pm25Grade: number | null;
}

export interface PollenApiData {
  oak: number | null;
  pine: number | null;
}

export interface UvApiData {
  uvi: number | null;
}

export interface DaySchedule {
  goSchool?: string;
  outdoorStart?: string;
  leaveSchool?: string;
  eveningStart?: string;
}

const DUST_LABELS: DustLevel[] = ["좋음", "보통", "나쁨", "매우나쁨"];

// 에어코리아 등급(1~4) → 라벨. PM10/PM2.5 중 나쁜 쪽 기준, 둘 다 없으면 중립값 "보통"
export function dustLevelFrom(air: AirApiData | null): DustLevel {
  const grades = [air?.pm10Grade, air?.pm25Grade].filter(
    (g): g is number => g != null
  );
  if (!grades.length) return "보통";
  return DUST_LABELS[Math.min(Math.max(...grades), 4) - 1] ?? "보통";
}

// 기상청 꽃가루 위험지수 → 라벨 (env 페이지 pollenGradeLabel과 동일 기준).
// 참나무/소나무 중 높은 쪽, 데이터 없으면 경고가 뜨지 않는 "낮음"
export function pollenLevelFrom(pollen: PollenApiData | null): PollenLevel {
  const values = [pollen?.oak, pollen?.pine].filter(
    (v): v is number => v != null
  );
  if (!values.length) return "낮음";
  const g = Math.max(...values);
  return g >= 4 ? "매우높음" : g >= 3 ? "높음" : g >= 2 ? "보통" : "낮음";
}

// 자외선지수 → 타임라인 라벨. 09시 이전/18시 이후는 실질 노출이 낮아 "낮음" 처리
function uvLevelAt(uvi: number | null, hour: number): UvLevel {
  if (uvi == null || hour < 9 || hour >= 18) return "낮음";
  return uvi >= 8 ? "매우강함" : uvi >= 6 ? "강함" : uvi >= 3 ? "보통" : "낮음";
}

// 홈 화면 기존 기준과 동일 (9m/s 이상 강함, 4m/s 이상 보통)
export function windLevelFrom(ms: number | null): WindLevel {
  if (ms == null) return "약함";
  return ms >= 9 ? "강함" : ms >= 4 ? "보통" : "약함";
}

function slotIcon(sky: number | null, pty: number | null): string {
  if (pty === 1 || pty === 4) return "🌧️";
  if (pty === 2) return "🌨️";
  if (pty === 3) return "❄️";
  if (sky === 1) return "☀️";
  if (sky === 3) return "⛅";
  if (sky === 4) return "☁️";
  return "🌤️";
}

// /api/weather의 feelsLike와 동일 공식 (TMP - 0.7 * WSD)
function feelsLike(temp: number, windMs: number | null): number {
  return Math.round(temp - 0.7 * (windMs ?? 0));
}

function parseHour(time: string | undefined): number | null {
  if (!time) return null;
  const h = parseInt(time.split(":")[0], 10);
  return Number.isNaN(h) ? null : h;
}

/**
 * 실측 API 응답 4종 + 아이 일과를 홈 화면의 단일 환경 스냅샷(WeatherData)으로 조립한다.
 * AI 리포트 fallback·뱃지·시간대별 환경·종합솔루션이 모두 이 스냅샷 하나를 소비해
 * 한 화면에서 판정 재료가 갈라지지 않게 하는 것이 목적.
 * 대기질·꽃가루·자외선은 시간대별 예보가 없으므로 현재값을 전 슬롯에 적용한다.
 */
export function buildEnvSnapshot(
  weather: WeatherApiData,
  air: AirApiData | null,
  pollen: PollenApiData | null,
  uv: UvApiData | null,
  schedule?: DaySchedule
): WeatherData {
  const dust = dustLevelFrom(air);
  const pollenLevel = pollenLevelFrom(pollen);
  const uvi = uv?.uvi ?? null;

  const slots: Array<{ time: string; defaultHour: number; scheduled?: string }> = [
    { time: "등원시간", defaultHour: 8, scheduled: schedule?.goSchool },
    { time: "야외활동", defaultHour: 11, scheduled: schedule?.outdoorStart },
    { time: "하원시간", defaultHour: 15, scheduled: schedule?.leaveSchool },
    { time: "저녁", defaultHour: 18, scheduled: schedule?.eveningStart },
  ];

  const hourly = weather.hourlyForecast ?? [];

  const timeline: TimeSlot[] = slots.map(({ time, defaultHour, scheduled }) => {
    const hour = parseHour(scheduled) ?? defaultHour;
    // 가장 가까운 예보 슬롯 선택. 예보가 없으면 현재 관측값으로 대체
    const nearest = hourly.length
      ? hourly.reduce((best, s) =>
          Math.abs((parseHour(s.hour) ?? 0) - hour) <
          Math.abs((parseHour(best.hour) ?? 0) - hour)
            ? s
            : best
        )
      : null;

    const temp = nearest?.temp ?? weather.temperature ?? 0;
    const windMs = nearest?.windSpeed ?? weather.windSpeed;
    const sky = nearest?.sky ?? weather.sky;
    const pty = nearest?.pty ?? weather.pty;

    return {
      time,
      hour: `${String(hour).padStart(2, "0")}:00`,
      icon: slotIcon(sky, pty),
      temp: Math.round(temp),
      feels: feelsLike(temp, windMs),
      dust,
      uv: uvLevelAt(uvi, hour),
      pollen: pollenLevel,
      humidity: Math.round(nearest?.humidity ?? weather.humidity ?? 0),
      wind: windLevelFrom(windMs),
    };
  });

  return {
    temp: Math.round(weather.temperature ?? 0),
    dustLevel: dust,
    pollenLevel,
    uvIndex: uvi ?? 0,
    humidity: Math.round(weather.humidity ?? 0),
    windSpeed: windLevelFrom(weather.windSpeed),
    timeline,
  };
}
