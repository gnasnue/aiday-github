import type { DustLevel, PollenLevel, UvLevel, WindLevel } from "./weather-api";
import { feelsLikeC } from "./feels-like";

/**
 * 홈 화면 "시간대별 환경" 카드 데이터 빌더.
 *
 * 육아 일과(온보딩 입력) 기준 4슬롯(등원·야외활동·하원·저녁)을,
 * 각 슬롯 시각에 가장 가까운 실측/예보 데이터로 채운다.
 * - 기온·체감·습도·바람·하늘상태: 기상청 단기예보(시간대별 실값)
 * - 자외선: 기상청 생활기상지수(3시간 단위 실값)
 * - 미세먼지: 지나간 시각은 그 시각의 실측 등급(에어코리아 24시간), 미래는 현재 대푯값
 * - 꽃가루: 일 단위 지수라 오늘의 대푯값을 전 슬롯 공유
 */

export type HomeTimeSlot = {
  time: string; // 슬롯 라벨: "등원시간"
  hour: string; // 슬롯 시작 시각: "09:00"
  // 구간 슬롯(야외활동·저녁 외출)의 끝 시각 "12:00". 사용자가 시작·끝을 모두 입력했을 때만 채워지고,
  // 점 슬롯(등원·하원, 끝 미입력)은 null. "지금" 판정에서 구간은 [hour,endHour] 전체가 활성.
  endHour: string | null;
  // 이 슬롯 시각이 사용자 입력이 아니라 기본값(온보딩 일과 생략)인지. true면 홈에서 분 단위
  // 카운트다운을 숨기고 "기본 시간"으로 표기해, 지어낸 시각에 거짓 정밀도를 얹지 않는다.
  isDefault: boolean;
  sky: number | null; // SKY 1=맑음 3=구름많음 4=흐림
  pty: number | null; // PTY 0=없음 1=비 2=비/눈 3=눈 4=소나기
  pop: number | null; // 강수확률 %
  // 강수 노출 창(이 슬롯 시각 ~ 다음 슬롯 시각) 집계 — 우산 판단용.
  // 창 내 최댓값을 쓰는 이유: 비는 창 안 어느 한 시점만 와도 젖으므로(합집합 확률 ≥ max ≥ 평균),
  // 슬롯 정시값만 보면 시점이 몇 시간 어긋난 소나기 예보를 놓친다. mock 폴백 경로엔 없는 값(옵셔널).
  popWindow?: number | null; // 창 내 최대 강수확률 %
  rainWindow?: boolean; // 창 내 강수형태(PTY>0) 예보 존재 여부
  temp: number;
  feels: number;
  dust: DustLevel;
  uv: UvLevel;
  pollen: PollenLevel;
  humidity: number;
  wind: WindLevel;
};

type WeatherHour = {
  hour: string;
  temp: number;
  sky: number | null;
  pty: number | null;
  humidity: number | null;
  windSpeed: number | null;
  pop: number | null;
};

export type ScheduleInput = {
  goSchool?: string;
  outdoorStart?: string;
  outdoorEnd?: string;
  leaveSchool?: string;
  eveningStart?: string;
  eveningEnd?: string;
};

export type EnvRaw = {
  weather: { hourlyForecast?: WeatherHour[] } | null;
  air: {
    pm10Grade?: number | null;
    hourly?: Record<string, number | null>; // 오늘 시각별 pm10 1시간 등급 실측
  } | null;
  uv: { uvi?: number | null; hourly?: Record<string, number | null> } | null;
  pollen: { oak?: number | null; pine?: number | null; weed?: number | null } | null;
};

const parseHour = (t?: string): number | null => {
  if (!t) return null;
  const h = parseInt(t.split(":")[0], 10);
  return Number.isNaN(h) ? null : h;
};

// 에어코리아 통합대기 등급(1~4) → 라벨 (홈 상단 환경 한 줄·시간대 카드 공용).
// null(측정 실패)은 "좋음"이 아니라 중립값 "보통"으로 — 데이터가 없을 때 거짓 안심을 주지 않는다.
export const dustLabel = (g: number | null): DustLevel =>
  g === 1 ? "좋음" : g === 3 ? "나쁨" : g === 4 ? "매우나쁨" : "보통";

// 꽃가루 위험지수(0~4) → 라벨 (홈 상단 환경 칩·시간대 카드 공용)
export const pollenLabel = (g: number | null): PollenLevel =>
  g == null ? "낮음" : g >= 4 ? "매우높음" : g >= 3 ? "높음" : g >= 2 ? "보통" : "낮음";

// 자외선지수(UVI) → 라벨 (홈 카드 표시 계층 4단계)
const uvLevel = (v: number | null): UvLevel =>
  v == null ? "낮음" : v >= 8 ? "매우강함" : v >= 6 ? "강함" : v >= 3 ? "보통" : "낮음";

// 풍속(m/s) → 라벨 (홈 환경 매핑과 동일 임계값)
const windLevel = (mps: number | null): WindLevel =>
  mps == null ? "약함" : mps >= 9 ? "강함" : mps >= 4 ? "보통" : "약함";

// 예보는 3시간 해상도(06~21시)라 정상 커버 범위에선 목표 시각과 최대 1.5시간 차이.
// 2시간을 넘으면 해당 시각 데이터가 없는 것이므로, 엉뚱한 시간대 예보를
// 그 슬롯인 것처럼 보여주지 않도록 null을 반환한다.
const MAX_HOUR_GAP = 2;

const nearestWeather = (hours: WeatherHour[], target: number): WeatherHour | null => {
  if (!hours.length) return null;
  const best = hours.reduce((a, s) => {
    const sh = parseHour(s.hour) ?? 0;
    const bh = parseHour(a.hour) ?? 0;
    return Math.abs(sh - target) < Math.abs(bh - target) ? s : a;
  });
  const bh = parseHour(best.hour);
  if (bh == null || Math.abs(bh - target) > MAX_HOUR_GAP) return null;
  return best;
};

// 미세먼지: 지나간 시각은 그 시각(±1시간)의 실측 등급으로 고정해,
// 이후 공기질이 변해도 지나간 슬롯의 표시·준비물이 바뀌지 않게 한다.
// 실측이 없는 시각(미래 슬롯)은 fallback(현재 대푯값)을 그대로 쓴다.
const dustAt = (
  hourly: Record<string, number | null> | undefined,
  target: number,
  fallback: number | null
): number | null => {
  if (!hourly) return fallback;
  for (const h of [target, target - 1, target + 1]) {
    const v = hourly[String(h)];
    if (v != null) return v;
  }
  return fallback;
};

const nearestUv = (
  hourly: Record<string, number | null> | undefined,
  target: number
): number | null => {
  if (!hourly) return null;
  const keys = Object.keys(hourly)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  if (!keys.length) return null;
  const best = keys.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
  return hourly[String(best)] ?? null;
};

/**
 * 실측 데이터로 시간대별 슬롯을 구성한다.
 * 시간대별 예보(weather.hourlyForecast)가 없으면 null을 반환해
 * 호출부가 mock으로 폴백하도록 한다.
 */
export function buildTimeline(
  schedule: ScheduleInput | undefined,
  env: EnvRaw
): HomeTimeSlot[] | null {
  const hours = env.weather?.hourlyForecast ?? [];
  if (!hours.length) return null;

  const dustG = env.air?.pm10Grade ?? null;
  const pollenVals = [env.pollen?.oak, env.pollen?.pine, env.pollen?.weed].filter(
    (v): v is number => v != null
  );
  const pollenG = pollenVals.length ? Math.max(...pollenVals) : null;

  // 4슬롯(등원·야외활동·하원·저녁) 모두 일과 미입력 시에도 기본 시각으로 항상 노출.
  // 저녁: 온보딩에서 '저녁 외출 시간'을 설정했으면 그 시각, 아니면 21:00
  // (기상청 예보가 06·09·12·15·18·21시로 제공돼 21:00은 정확히 커버됨).
  // 야외활동 기본 11:00 — 종전엔 허구의 슬롯 방지를 위해 미입력 시 숨겼으나,
  // 기본 4슬롯이 하루 리듬(등원~저녁)을 온전히 보여주는 가치가 더 크다고 판단해 승격.
  const defs: { label: string; time?: string; end?: string; fallback: string }[] = [
    { label: "등원시간", time: schedule?.goSchool, fallback: "08:00" },
    { label: "야외활동", time: schedule?.outdoorStart, end: schedule?.outdoorEnd, fallback: "11:00" },
    { label: "하원시간", time: schedule?.leaveSchool, fallback: "15:00" },
    { label: "저녁", time: schedule?.eveningStart, end: schedule?.eveningEnd, fallback: "21:00" },
  ];

  // "HH:MM" → 자정 기준 분. 구간 유효성(끝>시작) 판정용.
  const toMin = (t?: string | null): number | null => {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hh = parseInt(h, 10);
    if (Number.isNaN(hh)) return null;
    const mm = parseInt(m ?? "0", 10);
    return hh * 60 + (Number.isNaN(mm) ? 0 : mm);
  };

  const slots: HomeTimeSlot[] = [];
  const slotHours: number[] = []; // slots와 같은 인덱스의 슬롯 시(hour) — 창 경계 계산용
  for (const d of defs) {
    const time = d.time || d.fallback;
    if (!time) continue;
    const th = parseHour(time);
    if (th == null) continue;
    const w = nearestWeather(hours, th);
    if (!w) continue;
    const wind = w.windSpeed ?? null;
    // 구간 슬롯: 시작·끝을 모두 입력했고 끝이 시작보다 뒤일 때만 endHour를 채운다.
    // 시작만 있거나 끝이 잘못된 경우(끝≤시작)는 점 슬롯으로 취급(null).
    const startMin = toMin(time);
    const endMin = d.end ? toMin(d.end) : null;
    const endHour = endMin != null && startMin != null && endMin > startMin ? (d.end as string) : null;
    slotHours.push(th);
    slots.push({
      time: d.label,
      hour: time,
      endHour,
      isDefault: !d.time,
      sky: w.sky,
      pty: w.pty,
      pop: w.pop,
      temp: Math.round(w.temp),
      feels: feelsLikeC(w.temp, w.humidity, wind),
      dust: dustLabel(dustAt(env.air?.hourly, th, dustG)),
      uv: uvLevel(nearestUv(env.uv?.hourly, th) ?? env.uv?.uvi ?? null),
      pollen: pollenLabel(pollenG),
      humidity: w.humidity ?? 0,
      wind: windLevel(wind),
    });
  }

  // 강수 노출 창 집계: [이 슬롯 시각, 다음 슬롯 시각] 범위의 예보 점들로 popWindow(최대)·
  // rainWindow(PTY>0 존재)를 채운다. 경계 시각의 점은 양쪽 슬롯에 모두 포함 —
  // 전환 시각의 비는 두 슬롯 모두에 유효한 신호다. 마지막 슬롯은 +3시간(예보 해상도 1스텝).
  for (let i = 0; i < slots.length; i++) {
    const start = slotHours[i];
    const end = i + 1 < slots.length ? slotHours[i + 1] : start + 3;
    const inWindow = hours.filter((h) => {
      const hh = parseHour(h.hour);
      return hh != null && hh >= start && hh <= end;
    });
    const pops = inWindow.map((h) => h.pop).filter((v): v is number => v != null);
    if (slots[i].pop != null) pops.push(slots[i].pop as number); // 슬롯 자체 최근접값 포함(창에 예보 점이 없어도 유지)
    slots[i].popWindow = pops.length ? Math.max(...pops) : null;
    slots[i].rainWindow =
      inWindow.some((h) => h.pty != null && h.pty > 0) || (slots[i].pty != null && (slots[i].pty as number) > 0);
  }

  return slots.length ? slots : null;
}
