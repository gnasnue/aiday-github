/**
 * 환경 데이터 공유 페처 — 홈·환경정보·건강팁·옷차림이 **같은 입력으로** 판단하게 하는 단일 창구.
 *
 * 이 파일이 존재하는 이유: 같은 4개 API(기상청·에어코리아·꽃가루·자외선)를 화면마다 따로
 * 불러오면 위치 파라미터·타임아웃·결측 처리가 화면 수만큼 갈라지고, 결국 같은 순간에
 * 홈은 "나쁨", 환경정보는 "보통"을 말하는 모순이 생긴다. 실제로 그런 사고가 있었다.
 * 여기서 한 번만 정하고, 화면은 결과를 해석만 한다.
 *
 * 책임 세 가지:
 *  1. 위치 → 파라미터 매핑 (좌표=날씨 / 측정소=대기질 / 지역명=꽃가루·자외선)
 *  2. 소스별 타임아웃·재시도 — 공공 API가 느린 날 화면이 영구 스켈레톤에 갇히지 않게
 *  3. 값 범위 검증 — 기상청 결측 센티널(-998/-999 등)이 실측인 척 화면에 흘러가지 않게
 *
 * 반환은 **부분 결과**다. 한 소스가 죽어도 나머지는 그대로 오고, 못 받은 신호는
 * `missing`에 남는다. 소비처는 `missing`을 보고 "모르는 건 말하지 않는" 판단을 할 수 있다.
 */

import type { AppLocation } from "@/lib/location";

/* ----------------------------- 신호·페이로드 타입 ----------------------------- */

export type EnvSignal = "weather" | "air" | "pollen" | "uv" | "weekly";

export type EnvHourlyForecast = {
  hour: string;
  temp: number | null;
  sky: number | null;
  pty: number | null;
  humidity: number | null;
  windSpeed: number | null;
  pop: number | null;
};

export type EnvWeather = {
  temperature: number | null;
  feelsLike: number | null;
  sky: number | null;
  pty: number | null;
  humidity: number | null;
  windSpeed: number | null;
  pop: number | null;
  hourlyForecast?: EnvHourlyForecast[];
  /** 내일 미리보기용 — 같은 발표본에서 추출 (홈 타임라인이 쓴다) */
  hourlyForecastTomorrow?: EnvHourlyForecast[];
  /** 현재 스칼라 출처 — ncst=실황 관측, fcst=예보 폴백 (정합성 검증용) */
  currentSource?: string | null;
};

export type EnvAir = {
  pm10: number | null;
  pm25: number | null;
  pm10Grade: number | null;
  pm25Grade: number | null;
  o3: number | null;
  stationName: string | null;
  hourly?: Record<string, number | null>;
};

export type EnvPollen = {
  oak: number | null;
  pine: number | null;
  weed: number | null;
};

export type EnvUv = {
  uvi: number | null;
  hourly?: Record<string, number | null>;
  /** 내일 미리보기용 (홈 타임라인이 쓴다) */
  hourlyTomorrow?: Record<string, number | null>;
};

export type EnvWeekDay = {
  day: string;
  date: string;
  icon: string;
  high: number | null;
  low: number | null;
  rain: number;
  weekend: boolean;
};

export type EnvData = {
  weather: EnvWeather | null;
  air: EnvAir | null;
  pollen: EnvPollen | null;
  uv: EnvUv | null;
  weekly: EnvWeekDay[] | null;
  /**
   * 쓸 수 있는 값을 못 받은 신호들. 페이로드가 아예 없는 경우뿐 아니라
   * 껍데기만 오고 핵심 값이 결측인 경우(예: uv 응답은 200인데 uvi가 null)도 포함한다 —
   * 소비처가 "응답은 왔으니 있다"고 오판하지 않게.
   */
  missing: EnvSignal[];
};

/* ----------------------------- 위치 → 파라미터 매핑 ----------------------------- */

/**
 * 꽃가루·자외선 API가 받는 지역명. 현재 서비스 지원 범위가 서울 한정이라
 * (`nearestSeoulGu` — 서울 밖 좌표는 기본 기준지로 되돌린다) 항상 "서울"이다.
 * 지방 확장 시 이 함수 하나만 고치면 모든 화면이 함께 따라온다 —
 * 화면마다 `region=서울`을 하드코딩했던 것이 위치 불일치의 원인이었다.
 */
export const envRegion = (_location: AppLocation): string => "서울";

/* ----------------------------- 값 검증 ----------------------------- */

/**
 * 범위 밖 값을 결측으로 만든다. 기상청은 결측을 ±900대 센티널(-998·-999 등)로 표기하는데,
 * 이게 그대로 흘러가면 "체감 -999도"처럼 명백히 틀린 값이거나 — 더 나쁘게는 —
 * 평균에 섞여 그럴듯한 오답이 된다.
 */
const num = (v: unknown, min: number, max: number): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) || n < min || n > max ? null : n;
};

/** 대기질 등급은 1~4만 유효 — 0·null은 에어코리아의 결측 표기다. */
const grade = (v: unknown): number | null => num(v, 1, 4);

type RawJson = Record<string, unknown> | null;

/**
 * 시간대별 예보 슬롯 검증. 주의: `lib/timeline.ts`의 `WeatherHour.temp`는 아직 non-null이라
 * 홈이 이 헬퍼로 이전할 때 타입을 맞춰야 한다(결측 슬롯 제외 또는 nullable 수용).
 */
const sanitizeHours = (raw: unknown): EnvHourlyForecast[] | undefined =>
  Array.isArray(raw)
    ? (raw as Record<string, unknown>[]).map((h) => ({
        hour: String(h.hour ?? ""),
        temp: num(h.temp, -50, 50),
        sky: num(h.sky, 1, 4),
        pty: num(h.pty, 0, 4),
        humidity: num(h.humidity, 0, 100),
        windSpeed: num(h.windSpeed, 0, 70),
        pop: num(h.pop, 0, 100),
      }))
    : undefined;

const sanitizeWeather = (raw: RawJson): EnvWeather | null => {
  if (!raw) return null;
  const hourly = sanitizeHours(raw.hourlyForecast);
  const hourlyTomorrow = sanitizeHours(raw.hourlyForecastTomorrow);
  return {
    temperature: num(raw.temperature, -50, 50),
    feelsLike: num(raw.feelsLike, -60, 60),
    sky: num(raw.sky, 1, 4),
    pty: num(raw.pty, 0, 4),
    humidity: num(raw.humidity, 0, 100),
    windSpeed: num(raw.windSpeed, 0, 70),
    pop: num(raw.pop, 0, 100),
    ...(hourly ? { hourlyForecast: hourly } : {}),
    ...(hourlyTomorrow ? { hourlyForecastTomorrow: hourlyTomorrow } : {}),
    currentSource: typeof raw.currentSource === "string" ? raw.currentSource : null,
  };
};

const sanitizeAir = (raw: RawJson): EnvAir | null => {
  if (!raw) return null;
  return {
    pm10: num(raw.pm10, 0, 1000),
    pm25: num(raw.pm25, 0, 1000),
    pm10Grade: grade(raw.pm10Grade),
    pm25Grade: grade(raw.pm25Grade),
    o3: num(raw.o3, 0, 1),
    stationName: typeof raw.stationName === "string" ? raw.stationName : null,
    ...(raw.hourly && typeof raw.hourly === "object"
      ? { hourly: raw.hourly as Record<string, number | null> }
      : {}),
  };
};

const sanitizePollen = (raw: RawJson): EnvPollen | null => {
  if (!raw) return null;
  // 꽃가루 위험지수는 0~4 (0=없음 ~ 4=매우높음)
  return {
    oak: num(raw.oak, 0, 4),
    pine: num(raw.pine, 0, 4),
    // 잡초는 기상청 V3가 제공하지 않아 항상 null — 소비처에서 자연 제외된다
    weed: num(raw.weed, 0, 4),
  };
};

const sanitizeUv = (raw: RawJson): EnvUv | null => {
  if (!raw) return null;
  return {
    uvi: num(raw.uvi, 0, 20),
    ...(raw.hourly && typeof raw.hourly === "object"
      ? { hourly: raw.hourly as Record<string, number | null> }
      : {}),
    ...(raw.hourlyTomorrow && typeof raw.hourlyTomorrow === "object"
      ? { hourlyTomorrow: raw.hourlyTomorrow as Record<string, number | null> }
      : {}),
  };
};

const sanitizeWeekly = (raw: RawJson): EnvWeekDay[] | null => {
  if (!raw || !Array.isArray(raw.week)) return null;
  const week = (raw.week as Record<string, unknown>[]).map((d) => ({
    day: String(d.day ?? ""),
    date: String(d.date ?? ""),
    icon: String(d.icon ?? ""),
    high: num(d.high, -50, 50),
    low: num(d.low, -50, 50),
    rain: num(d.rain, 0, 100) ?? 0,
    weekend: Boolean(d.weekend),
  }));
  return week.length > 0 ? week : null;
};

/* ----------------------------- 신호별 "쓸 수 있는가" 판정 ----------------------------- */

/**
 * 페이로드가 있어도 핵심 값이 없으면 그 신호는 없는 것으로 친다.
 * 예: 자외선 API가 06시 발행 전이라 200 응답에 uvi만 null인 경우 —
 * 소비처가 "자외선 정보 있음"으로 오판하면 결측이 판단 근거로 둔갑한다.
 */
const isUsable = {
  weather: (d: EnvWeather | null) => !!d && d.temperature != null,
  air: (d: EnvAir | null) =>
    !!d && (d.pm10Grade != null || d.pm25Grade != null || d.o3 != null),
  pollen: (d: EnvPollen | null) => !!d && (d.oak != null || d.pine != null),
  uv: (d: EnvUv | null) => !!d && d.uvi != null,
  weekly: (d: EnvWeekDay[] | null) => !!d && d.length > 0,
};

/* ----------------------------- 페치 ----------------------------- */

export type FetchEnvOptions = {
  /** 호출자 취소 신호 — 화면 이탈·프로필 전환 시 진행 중 요청을 끊는다. */
  signal?: AbortSignal;
  /** 주간 예보까지 받을지. 환경정보 화면만 쓴다(기본 false). */
  includeWeekly?: boolean;
  /** 소스별 타임아웃(ms) 재정의 */
  timeouts?: Partial<Record<EnvSignal, number>>;
  /** 소스별 재시도 횟수 재정의 */
  retries?: Partial<Record<EnvSignal, number>>;
  /** 재시도 간격(ms) */
  retryDelayMs?: number;
  /** 테스트 주입용 fetch */
  fetchImpl?: typeof fetch;
};

/**
 * 기본 타임아웃 — weather·air는 화면 셸의 근거라 넉넉히, uv·꽃가루는 짧게.
 * 홈이 쓰던 값을 그대로 가져와, 홈이 이 헬퍼로 이전할 때 동작이 바뀌지 않게 한다.
 */
const DEFAULT_TIMEOUTS: Record<EnvSignal, number> = {
  weather: 9000,
  air: 9000,
  pollen: 5000,
  uv: 5000,
  weekly: 9000,
};

/** weather·air만 1회 재시도 — 콜드 캐시 첫 로드가 폴백에 갇히지 않게. */
const DEFAULT_RETRIES: Record<EnvSignal, number> = {
  weather: 1,
  air: 1,
  pollen: 0,
  uv: 0,
  weekly: 0,
};

/**
 * 한 소스를 받아온다. 실패·타임아웃·에러 응답은 모두 null로 수렴시켜
 * 호출부가 예외 대신 결측으로 다루게 한다.
 *
 * 부모 취소와 타임아웃을 요청별 AbortController에 **수동으로** 연결한다 —
 * `AbortSignal.any()`는 Safari 17.4+ 전용이라 구형 iOS에서 throw하고,
 * 그러면 스켈레톤이 영구 정지한다.
 */
const getJson = async (
  url: string,
  timeoutMs: number,
  retries: number,
  retryDelayMs: number,
  parentSignal: AbortSignal | undefined,
  fetchImpl: typeof fetch
): Promise<RawJson> => {
  const attempt = async (n: number): Promise<RawJson> => {
    if (parentSignal?.aborted) return null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const onParentAbort = () => ac.abort();
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });
    try {
      const res = await fetchImpl(url, { signal: ac.signal });
      const json = (await res.json()) as Record<string, unknown>;
      // 라우트가 { error } 를 실어 보내면 실패로 취급한다(HTTP 200이어도).
      if (!json || json.error) throw new Error("env source error");
      return json;
    } catch {
      if (n > 0 && !parentSignal?.aborted) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        return parentSignal?.aborted ? null : attempt(n - 1);
      }
      return null;
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onParentAbort);
    }
  };
  return attempt(retries);
};

/**
 * 환경 데이터 4종(+선택적 주간 예보)을 병렬로 받아 검증된 부분 결과를 돌려준다.
 * 개별 소스 실패는 전체를 실패시키지 않는다 — 못 받은 신호는 `missing`에 남는다.
 */
export async function fetchEnvData(
  location: AppLocation,
  options: FetchEnvOptions = {}
): Promise<EnvData> {
  const {
    signal,
    includeWeekly = false,
    timeouts,
    retries,
    retryDelayMs = 1200,
    fetchImpl = fetch,
  } = options;

  const t = { ...DEFAULT_TIMEOUTS, ...timeouts };
  const r = { ...DEFAULT_RETRIES, ...retries };
  const region = envRegion(location);
  const get = (url: string, sig: EnvSignal) =>
    getJson(url, t[sig], r[sig], retryDelayMs, signal, fetchImpl);

  const [wRaw, aRaw, pRaw, uRaw, weekRaw] = await Promise.all([
    get(`/api/weather?lat=${location.lat}&lon=${location.lon}`, "weather"),
    get(`/api/air?station=${encodeURIComponent(location.station)}`, "air"),
    get(`/api/pollen?region=${encodeURIComponent(region)}`, "pollen"),
    get(`/api/uv?region=${encodeURIComponent(region)}`, "uv"),
    includeWeekly
      ? get(
          `/api/weather/weekly?region=${encodeURIComponent(region)}&lat=${location.lat}&lon=${location.lon}`,
          "weekly"
        )
      : Promise.resolve(null),
  ]);

  const weather = sanitizeWeather(wRaw);
  const air = sanitizeAir(aRaw);
  const pollen = sanitizePollen(pRaw);
  const uv = sanitizeUv(uRaw);
  const weekly = sanitizeWeekly(weekRaw);

  const missing: EnvSignal[] = [];
  if (!isUsable.weather(weather)) missing.push("weather");
  if (!isUsable.air(air)) missing.push("air");
  if (!isUsable.pollen(pollen)) missing.push("pollen");
  if (!isUsable.uv(uv)) missing.push("uv");
  if (includeWeekly && !isUsable.weekly(weekly)) missing.push("weekly");

  return { weather, air, pollen, uv, weekly, missing };
}
