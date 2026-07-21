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

import type { EnvData } from "../env-data";
import { dustLabel, pollenLabel, uvLabel, humidityLabel } from "../timeline";
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
};

/* ----------------------------- 공인 등급 → 레벨(0~3) ----------------------------- */

const UV_LEVELS = ["낮음", "보통", "강함", "매우강함"] as const;
const DUST_LEVELS = ["좋음", "보통", "나쁨", "매우나쁨"] as const;
const POLLEN_LEVELS = ["낮음", "보통", "높음", "매우높음"] as const;

const indexOf = <T extends readonly string[]>(levels: T, label: string): number => {
  const i = levels.indexOf(label as T[number]);
  return i < 0 ? 0 : i;
};

type SignalReading = { level: number; label: string; value?: number };

/**
 * 신호별 현재 레벨. 신호를 쓸 수 없으면 null을 돌려주고, 호출부는 해당 팁을 침묵시킨다.
 * `env.missing`이 이미 "응답은 왔지만 핵심 값이 결측"인 경우까지 잡아내므로 그걸 신뢰한다.
 */
const readSignal = (env: EnvData, signal: Exclude<TipSignal, null>): SignalReading | null => {
  const missing = new Set(env.missing);
  switch (signal) {
    case "uv": {
      if (missing.has("uv") || env.uv?.uvi == null) return null;
      const label = uvLabel(env.uv.uvi);
      return { level: indexOf(UV_LEVELS, label), label, value: env.uv.uvi };
    }
    case "air": {
      if (missing.has("air")) return null;
      // PM10·PM2.5 중 나쁜 쪽이 판단을 이끈다. 등급이 하나만 있으면 그것으로 판단한다.
      const grades = [env.air?.pm10Grade, env.air?.pm25Grade].filter(
        (g): g is number => g != null
      );
      if (grades.length === 0) return null;
      const worst = Math.max(...grades);
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
      const h = env.weather.humidity;
      // 표시 계층과 같은 기준(습도 30% 이하 = 건조)으로만 발동한다
      return { level: humidityLabel(h) === "건조" ? 1 : 0, label: "건조", value: h };
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

/**
 * 오늘 환경 × 이 아이에게 보여줄 팁 목록.
 *
 * @param env  `fetchEnvData` 결과. null이면 전부 결측으로 간주한다(상시 팁만 남는다).
 * @param now  테스트 주입용 — 나이 계산 기준 시각.
 */
export function selectTips(
  env: EnvData | null,
  profile: TipProfileInput | null,
  now: Date = new Date()
): SelectTipsResult {
  const tips: SelectedTip[] = [];
  const suppressed: Exclude<TipSignal, null>[] = [];

  for (const entry of TIP_ENTRIES) {
    if (entry.requires == null) {
      tips.push(buildTip(entry, null, profile, now));
      continue;
    }

    const reading = env ? readSignal(env, entry.requires) : null;
    if (reading == null) {
      // fail-closed — 모르는 것에 대해서는 말하지 않는다
      if (!suppressed.includes(entry.requires)) suppressed.push(entry.requires);
      continue;
    }
    if (entry.minLevel != null && reading.level < entry.minLevel) continue;

    tips.push(buildTip(entry, reading, profile, now));
  }

  return { tips, suppressedSignals: suppressed };
}
