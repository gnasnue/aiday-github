/**
 * 건강팁 선별 엔진 — 오늘 실제 환경값 × 아이 프로필로 노출할 팁을 고른다.
 *
 * 설계 규칙 셋:
 *  1. **공인 등급이 단일 소스.** 자체 숫자 cutoff를 두지 않고 `lib/timeline`의 라벨 함수
 *     (dustLabel·pollenLabel·uvLabel·humidityLabel)에서 레벨을 도출한다. 여기서 자체
 *     기준을 쓰면 같은 순간에 건강팁은 "나쁨", 환경정보는 "보통"을 말하게 된다.
 *  2. **fail-closed.** 필요한 신호가 결측이면 그 팁은 아예 노출하지 않는다. 자외선을
 *     모르는데 "자외선 높음 주의"를 띄우는 것은, 근거가 없는 확신을 근거 있는 척
 *     보여주는 것이라 이 화면의 존재 이유와 정면으로 충돌한다.
 *  3. **프로필 판정은 공유 함수로.** `lib/domain/child-conditions`를 쓴다. 화면에서
 *     `includes("비염")` 식으로 다시 구현하면 온보딩 라벨과 어긋나 실사용자에게만
 *     조용히 발동하지 않는 버그가 재발한다.
 */

import { isPollenSeason, type EnvData } from "../env-data";
import { dustLabel, pollenLabel, uvLabel, humidityLabel, heatLabel, coldLabel } from "../timeline";
import { feelsLikeC } from "../feels-like";
import {
  hasRespiratory,
  hasAllergy,
  hasSkin,
  ageInMonths,
  canRecommendMask,
} from "../domain/child-conditions";
import {
  TIP_ENTRIES,
  type TipEntry,
  type TipCategory,
  type TipSeverity,
  type TipSignal,
  type TipSource,
  type TipProfileFlag,
} from "./content";

export type SelectedTip = {
  id: string;
  category: TipCategory;
  severity: TipSeverity;
  title: string;
  summary: string;
  recommendations: string[];
  sources: TipSource[];
  /** 이 팁이 이 아이에게 보이는 이유 (프로필 매칭 시에만) */
  matchedProfile?: string;
};

/** 셀렉터 입력 — ChildProfile에서 판정에 쓰는 필드만 받는다(테스트 용이). */
export type TipProfileInput = {
  name?: string;
  conditions?: string[];
  age?: string;
  birth?: { year?: string; month?: string };
};

export type SelectTipsResult = {
  tips: SelectedTip[];
  /**
   * 결측이라 침묵시킨 신호. 화면은 이걸 보고 "환경 데이터를 못 불러와 일반 가이드만
   * 보여준다"는 정직한 안내를 띄우고, 계측에도 남긴다 — fail-closed가 실제로 얼마나
   * 자주 발동하는지 모르면 데이터 구멍이 흔한지 판단할 수 없다.
   */
  suppressedSignals: Exclude<TipSignal, null>[];
  /**
   * 확인했지만 기준에 못 미친 신호. 화면이 "오늘은 괜찮다"고 말하기 위한 재료다.
   * 조용한 이유를 밝히지 않으면 정상 동작이 고장으로 읽힌다 — 실제로 팁이 하나만
   * 보이자 "왜 이것뿐이냐"는 질문이 나왔다.
   */
  calmSignals: Exclude<TipSignal, null>[];
};

/* ----------------------------- 공인 등급 → 레벨(0~3) ----------------------------- */

const UV_LEVELS = ["낮음", "보통", "강함", "매우강함"] as const;
const DUST_LEVELS = ["좋음", "보통", "나쁨", "매우나쁨"] as const;
const POLLEN_LEVELS = ["낮음", "보통", "높음", "매우높음"] as const;
// 폭염·한파 공통 위험 계단 — timeline.heatLabel/coldLabel의 반환값과 1:1 정렬한다.
const TEMP_LEVELS = ["보통", "주의", "위험", "매우위험"] as const;

const indexOf = <T extends readonly string[]>(levels: T, label: string): number => {
  const i = levels.indexOf(label as T[number]);
  return i < 0 ? 0 : i;
};

type SignalReading = { level: number; label: string; value?: number };

/** 시간대별 값 맵에서 유효한 숫자만 뽑는다. */
const hourValues = (hourly?: Record<string, number | null>): number[] =>
  hourly ? Object.values(hourly).filter((v): v is number => v != null) : [];

/**
 * 판단은 **오늘 하루의 피크**로 한다. "지금 이 순간" 값만 보면 새벽·저녁에 화면을 연
 * 부모에게 자외선 팁이 구조적으로 뜨지 않는다 — 새벽 2시 자외선은 언제나 0이기 때문이다.
 * 아이데이는 하루의 첫 판단을 돕는 앱이므로, "오늘 조심할 것"은 오늘 가장 나쁜 순간을
 * 기준으로 말해야 한다.
 */
const peak = (current: number | null, hours: number[]): number | null => {
  const all = [...(current != null ? [current] : []), ...hours];
  return all.length ? Math.max(...all) : null;
};

/** 건조는 습도가 **낮을수록** 위험하므로 하루 최저값이 피크다. */
const trough = (current: number | null, hours: number[]): number | null => {
  const all = [...(current != null ? [current] : []), ...hours];
  return all.length ? Math.min(...all) : null;
};

/**
 * 신호별 현재 레벨. 신호를 쓸 수 없으면 null을 돌려주고, 호출부는 해당 팁을 침묵시킨다.
 * `env.missing`이 이미 "응답은 왔지만 핵심 값이 결측"인 경우까지 잡아내므로 그걸 신뢰한다.
 */
const readSignal = (env: EnvData, signal: Exclude<TipSignal, null>): SignalReading | null => {
  const missing = new Set(env.missing);
  switch (signal) {
    case "uv": {
      if (missing.has("uv") || env.uv?.uvi == null) return null;
      // 오늘 시간대별 예보의 최대값 — 밤에 열어도 낮의 위험을 놓치지 않는다
      const dayPeak = peak(env.uv.uvi, hourValues(env.uv.hourly));
      if (dayPeak == null) return null;
      const label = uvLabel(dayPeak);
      return { level: indexOf(UV_LEVELS, label), label, value: dayPeak };
    }
    case "air": {
      if (missing.has("air")) return null;
      // PM10·PM2.5 중 나쁜 쪽이 판단을 이끈다. 등급이 하나만 있으면 그것으로 판단한다.
      // hourly는 PM10 시각별 등급이라, 현재 등급과 함께 하루 최악 등급을 만든다.
      const grades = [env.air?.pm10Grade, env.air?.pm25Grade].filter(
        (g): g is number => g != null
      );
      if (grades.length === 0) return null;
      const worst = peak(Math.max(...grades), hourValues(env.air?.hourly));
      if (worst == null) return null;
      const label = dustLabel(worst);
      return { level: indexOf(DUST_LEVELS, label), label };
    }
    case "pollen": {
      if (missing.has("pollen")) return null;
      const grades = [env.pollen?.oak, env.pollen?.pine].filter(
        (g): g is number => g != null
      );
      if (grades.length === 0) return null;
      const label = pollenLabel(Math.max(...grades));
      return { level: indexOf(POLLEN_LEVELS, label), label };
    }
    case "humidity": {
      if (missing.has("weather") || env.weather?.humidity == null) return null;
      // 건조는 낮을수록 위험 — 오늘 최저 습도로 판단한다
      const h = trough(
        env.weather.humidity,
        (env.weather.hourlyForecast ?? [])
          .map((s) => s.humidity)
          .filter((v): v is number => v != null)
      );
      if (h == null) return null;
      // 표시 계층과 같은 기준(습도 30% 이하 = 건조)으로만 발동한다
      return { level: humidityLabel(h) === "건조" ? 1 : 0, label: "건조", value: h };
    }
    case "heat":
    case "cold": {
      // 온열·한랭 판단은 기온이 아니라 **체감온도**로 한다(습도·바람이 얹힌 값).
      // hourlyForecast엔 체감이 없어 시각마다 feelsLikeC로 계산한다 — 홈 카드와 같은 공식.
      if (missing.has("weather")) return null;
      const hourFeels = (env.weather?.hourlyForecast ?? [])
        .map((s) => (s.temp != null ? feelsLikeC(s.temp, s.humidity, s.windSpeed) : null))
        .filter((v): v is number => v != null);
      // 폭염은 하루 최고 체감(peak), 한파는 하루 최저 체감(trough)이 위험의 피크다.
      const extreme =
        signal === "heat"
          ? peak(env.weather?.feelsLike ?? null, hourFeels)
          : trough(env.weather?.feelsLike ?? null, hourFeels);
      if (extreme == null) return null;
      const label = signal === "heat" ? heatLabel(extreme) : coldLabel(extreme);
      return { level: indexOf(TEMP_LEVELS, label), label, value: extreme };
    }
  }
};

/* ----------------------------- 심각도·치환 ----------------------------- */

const SEVERITY_ORDER: TipSeverity[] = ["정보", "주의", "경고"];

const bumpSeverity = (s: TipSeverity): TipSeverity =>
  SEVERITY_ORDER[Math.min(SEVERITY_ORDER.indexOf(s) + 1, SEVERITY_ORDER.length - 1)];

const matchesProfile = (flag: TipProfileFlag, conditions: string[]): boolean =>
  flag === "respiratory"
    ? hasRespiratory(conditions)
    : flag === "allergy"
      ? hasAllergy(conditions)
      : hasSkin(conditions);

const fill = (
  template: string,
  ctx: { level?: string; value?: number; name?: string }
): string =>
  template
    .replace(/\{level\}/g, ctx.level ?? "")
    .replace(/\{value\}/g, ctx.value != null ? String(ctx.value) : "")
    .replace(/\{name\}/g, ctx.name ?? "아이");

/* ----------------------------- 셀렉터 ----------------------------- */

const buildTip = (
  entry: TipEntry,
  reading: SignalReading | null,
  profile: TipProfileInput | null,
  now: Date
): SelectedTip => {
  const conditions = profile?.conditions ?? [];
  const matched = entry.profileFlag ? matchesProfile(entry.profileFlag, conditions) : false;
  const level = reading?.level ?? 0;

  let severity: TipSeverity =
    entry.alertLevel != null && level >= entry.alertLevel
      ? "경고"
      : (entry.baseSeverity ?? "주의");
  // 체질이 걸리면 한 단계 올린다 — 같은 환경도 이 아이에겐 더 무겁게 온다
  if (matched) severity = bumpSeverity(severity);

  const ctx = { level: reading?.label, value: reading?.value, name: profile?.name };

  const recommendations = [
    ...entry.recommendations,
    ...(matched ? (entry.recommendationsWhenMatched ?? []) : []),
  ];

  // 만 2세 미만에게는 마스크를 권하지 않는다(질식 위험). AI 리포트·준비물 칩과 같은 규칙.
  if (entry.maskRecommendationIndex != null && entry.maskAlternative) {
    const months = ageInMonths(profile?.age, profile?.birth, now);
    if (!canRecommendMask(months)) {
      recommendations[entry.maskRecommendationIndex] = entry.maskAlternative;
    }
  }

  return {
    id: entry.id,
    category: entry.category,
    severity,
    title: fill(entry.title, ctx),
    summary: fill(
      matched ? (entry.summaryWhenMatched ?? entry.summary) : entry.summary,
      ctx
    ),
    recommendations: recommendations.map((r) => fill(r, ctx)),
    sources: entry.sources,
    ...(matched && entry.matchedLabel ? { matchedProfile: entry.matchedLabel } : {}),
  };
};

/* ----------------------------- 감염병 만료 게이트 ----------------------------- */

/**
 * 감염병 팁의 활성 기간(`activeUntil`, "YYYY-MM-DD") 만료 여부.
 * KST 기준 만료일 당일 23:59까지 활성, 익일 00:00부터 만료. `feels-like.ts`와 같은
 * KST 보정 관례(`Date.now()+9h` → getUTC*)를 쓴다. 결측·형식오류·가짜 날짜
 * (2026-02-30 등)는 **만료로 간주(true)** 한다 — fail-closed. 정규식만으론 존재하지
 * 않는 날짜가 통과하므로 Date.UTC 왕복으로 실제 달력 날짜까지 검증한다.
 */
export const isOutbreakExpired = (activeUntil: string | undefined, now: Date): boolean => {
  if (!activeUntil) return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(activeUntil);
  if (!m) return true;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return true; // 가짜 날짜 — 만료 처리
  }
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstToday = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return kstToday > Date.UTC(y, mo - 1, d); // 만료일 당일까지 활성
};

/**
 * 오늘 환경 × 이 아이에게 보여줄 팁 목록.
 *
 * @param env  `fetchEnvData` 결과. null이면 전부 결측으로 간주한다(상시 팁만 남는다).
 * @param now  테스트 주입용 — 나이 계산 기준 시각.
 */
export function selectTips(
  env: EnvData | null,
  profile: TipProfileInput | null,
  now: Date = new Date(),
  opts?: { includeDrafts?: boolean }
): SelectTipsResult {
  const tips: SelectedTip[] = [];
  const suppressed: Exclude<TipSignal, null>[] = [];
  const calm: Exclude<TipSignal, null>[] = [];

  const month = now.getMonth() + 1;
  // 미검증 초안은 기본적으로 개발 환경에서만 렌더한다 — 프로덕션·테스트(NODE_ENV≠development)
  // 에는 나오지 않는다. 테스트는 opts.includeDrafts로 명시적으로 켜서 로직만 검증한다.
  const includeDrafts = opts?.includeDrafts ?? process.env.NODE_ENV === "development";

  for (const entry of TIP_ENTRIES) {
    if (entry.draft && !includeDrafts) continue;
    // 계절 밖 신호(예: 7월의 한파)는 아예 평가하지 않는다 — 침묵도 안심도 아니다.
    if (entry.activeMonths && !entry.activeMonths.includes(month)) continue;
    // 감염병 팁은 activeUntil 필수 — 결측·오타·만료면 숨긴다(fail-closed).
    // requires:null 상시 분기보다 먼저 둬야 만료된 유행 팁이 영원히 노출되지 않는다.
    if (entry.category === "감염병" && isOutbreakExpired(entry.activeUntil, now)) continue;

    if (entry.requires == null) {
      tips.push(buildTip(entry, null, profile, now));
      continue;
    }

    const reading = env ? readSignal(env, entry.requires) : null;
    if (reading == null) {
      // fail-closed — 모르는 것에 대해서는 말하지 않는다.
      // 다만 제공 기간 밖의 꽃가루처럼 "없는 게 정상"인 결측은 침묵 목록에 넣지 않는다.
      // 넣으면 화면이 7월에 "꽃가루를 불러오지 못했어요"라고 사실과 다른 말을 한다.
      const expectedAbsence = entry.requires === "pollen" && !isPollenSeason(now);
      if (!expectedAbsence && !suppressed.includes(entry.requires)) {
        suppressed.push(entry.requires);
      }
      continue;
    }
    if (entry.minLevel != null && reading.level < entry.minLevel) {
      // 확인했고, 오늘은 주의 수준이 아니다 — 이것도 부모에게는 정보다
      if (!calm.includes(entry.requires)) calm.push(entry.requires);
      continue;
    }

    tips.push(buildTip(entry, reading, profile, now));
  }

  return { tips, suppressedSignals: suppressed, calmSignals: calm };
}
