// 오늘의 마무리(Daily Reflection) — Family Memory 원료의 로컬 정본.
//
// 설계 근거 (docs/01-plan/features/day-review-family-memory.plan.md):
//   - PRD S-003(저녁 결과 피드백)의 구현. 아침 판단(리포트)의 결과 라벨과 아이 하루
//     리캡을 수집해 Family Memory(PRD 용어 정의)의 원료를 만든다.
//   - P0 정본은 localStorage다 — 기존 events/feedback 테이블은 append-only(클라 SELECT
//     불가)라 "기록 N일째"를 그릴 수 없고, 건강 관찰(태그)은 events 원칙 2(건강정보
//     금지) 때문에 서버 계측에 실을 수 없다. 서버 영속화(daily_reflections)는 P1.
//   - 패턴 판정은 결정론 규칙(관찰 ≥3 + 신뢰도 ≥0.67)만 쓴다 — LLM이 기억을 자유
//     해석하지 않는다. P1 프롬프트 실연동은 이 판정기를 그대로 서버로 승격한다.
//   - 어휘 가드: 판정 결과 문구는 관찰 서술("더워했다는 기록")까지만 — "학습했다",
//     "체질" 단정은 금지(MANIFESTO 안티패턴, 리포트 v22 질병명 단정 제거와 같은 원칙).

import { localDateStr } from "@/lib/date";
import { hasJongseong, withTopicParticle } from "@/lib/korean";

/* ---------- 타입 ---------- */

/** Step 1 필수 — 아침 판단 전체 적합도 (PRD S-003 라벨의 분리 개정판) */
export type OverallFit = "matched" | "partly_matched" | "not_matched" | "not_executed";

/** Step 1 조건부 — 옷차림 체감 (의류계 준비물이 있던 날만 수집) */
export type ThermalOutcome = "too_warm" | "comfortable" | "too_cold" | "unknown";

/** Step 2 필수 — 아이 하루 컨디션 */
export type DayComfort = "comfortable" | "some_discomfort" | "high_discomfort" | "unknown";

/** 준비물을 실제로 썼는지 — 아침 체크 상태를 프리필한 뒤 확인만 받는다 */
export type ActionExecution = "done" | "not_done" | "not_needed";

/** 그날 아침 판단의 1순위 이슈를 검증하는 동적 질문의 축 */
export type DynamicAxis = "thermal" | "airway" | null;

/** 호흡기 축(대기질·꽃가루 경고일 때만 묻는다) 응답 */
export type AirwayOutcome = "none" | "rubbing" | "cough" | "unknown";

export type DayReviewEntry = {
  childId: string;
  /** YYYY-MM-DD (로컬) — 아이·날짜당 1건 (upsert) */
  date: string;
  overallFit: OverallFit;
  /** 의류 액션이 없던 날은 null */
  thermalOutcome: ThermalOutcome | null;
  dayComfort: DayComfort;
  /** 관찰 어휘 태그 — 진단형 금지 (TAGS의 부분집합) */
  tags: string[];
  /** 선택 메모 ≤300자 */
  note?: string;
  /** 저장 시각(ms) */
  ts: number;

  /* --- v6: "최근 비슷한 날" 행과 리캡 문장을 만들기 위한 그날의 맥락 --- */
  /** 그날 hook 조건절 ("낮 30도 습도 85%") — 없으면 생략 */
  conditionLabel?: string;
  /** 그날 준비물 표준명 요약 (최대 3) */
  prepSummary?: string[];
  /** 준비물별 실제 사용 여부 — 아침 체크 프리필 후 확인/수정한 결과 */
  actionOutcomes?: { name: string; execution: ActionExecution }[];
  /** 동적 질문이 호흡기 축이었던 날의 응답 */
  airwayOutcome?: AirwayOutcome;

  /* --- v7: 그날 환경 요약 — 컨디션 예보(lib/week-radar.ts)의 개인 근거 매칭용 --- */
  /**
   * 저장 시점의 홈 환경 스냅샷에서 파생한 그날의 기온 범위·강수 여부.
   * 스냅샷이 없으면 저장하지 않는다(추정 금지) — 매칭에서 그냥 빠질 뿐이다.
   */
  envDigest?: EnvDigest;
};

/** 그날 환경 요약 — 시간대별 예보(06~21시)의 최저/최고 기온과 강수 여부 */
export type EnvDigest = {
  tMin: number | null;
  tMax: number | null;
  /** 강수형태(PTY>0) 예보가 있었거나 강수확률이 확정 경계(60%) 이상이었는지 */
  rainy: boolean;
};

/**
 * 홈 환경 스냅샷의 시간대별 예보에서 그날의 요약을 만든다. 예보가 없으면 null —
 * 없는 값으로 digest를 지어내지 않는다. 구조 타입으로 받아 lib/timeline.ts(EnvRaw)와
 * lib/env-data.ts(EnvHourlyForecast) 어느 쪽 시간 배열이든 수용한다.
 */
export const buildEnvDigest = (
  env: {
    weather: {
      hourlyForecast?: { temp: number | null; pty: number | null; pop: number | null }[];
    } | null;
  } | null
): EnvDigest | null => {
  const hours = env?.weather?.hourlyForecast ?? [];
  const temps = hours.map((h) => h.temp).filter((t): t is number => t != null);
  if (!temps.length) return null;
  return {
    tMin: Math.min(...temps),
    tMax: Math.max(...temps),
    rainy: hours.some((h) => (h.pty != null && h.pty > 0) || (h.pop != null && h.pop >= 60)),
  };
};

/* ---------- 선택지 사전 (화면·저장이 같은 소스를 쓴다) ---------- */

export const OVERALL_FIT_OPTIONS: { value: OverallFit; label: string }[] = [
  { value: "matched", label: "잘 맞았어요" },
  { value: "partly_matched", label: "일부만 맞았어요" },
  { value: "not_matched", label: "잘 맞지 않았어요" },
  { value: "not_executed", label: "실행하지 못했어요" },
];

export const THERMAL_OPTIONS: { value: ThermalOutcome; label: string }[] = [
  { value: "too_warm", label: "더워했어요" },
  { value: "comfortable", label: "적당했어요" },
  { value: "too_cold", label: "추워했어요" },
  { value: "unknown", label: "잘 모르겠어요" },
];

export const DAY_COMFORT_OPTIONS: { value: DayComfort; label: string }[] = [
  { value: "comfortable", label: "대체로 편안했어요" },
  { value: "some_discomfort", label: "조금 불편해했어요" },
  { value: "high_discomfort", label: "많이 힘들어했어요" },
  { value: "unknown", label: "잘 모르겠어요" },
];

/** 호흡기 축 — 대기질·꽃가루가 경고였던 날에만 묻는다(관찰 어휘, 진단형 금지) */
export const AIRWAY_OPTIONS: { value: AirwayOutcome; label: string }[] = [
  { value: "none", label: "없었어요" },
  { value: "rubbing", label: "코·눈을 자주 비볐어요" },
  { value: "cough", label: "기침·콧물이 있었어요" },
  { value: "unknown", label: "잘 모르겠어요" },
];

export const ACTION_EXECUTION_OPTIONS: { value: ActionExecution; label: string }[] = [
  { value: "done", label: "했어요" },
  { value: "not_done", label: "못 했어요" },
  { value: "not_needed", label: "필요 없었어요" },
];

/** 의류계 준비물 판정 — 이 어휘가 있던 날만 옷차림 체감을 묻는다 (표준명 기준) */
export const CLOTHING_PREP_RE = /옷|상의|내복|긴팔|반팔|가디건|바람막이|외투|겉옷|목수건/;

/**
 * 그날 아침 판단의 1순위 이슈로 3번째 질문을 정한다 — 매일 같은 걸 묻지 않는다.
 * 우선순위: 호흡기(대기질·꽃가루 경고) > 옷차림(의류 준비물 존재) > 없음.
 * 호흡기를 앞에 두는 이유: 의류는 거의 매일 있어 항상 이기면 축이 고정된다.
 */
export const pickDynamicAxis = (input: {
  preps: string[];
  airwayAlert: boolean;
}): DynamicAxis => {
  if (input.airwayAlert) return "airway";
  if (input.preps.some((p) => CLOTHING_PREP_RE.test(p))) return "thermal";
  return null;
};

/** "특별한 일 없었어요" — 다른 태그와 상호배타 */
export const TAG_NONE = "특별한 일 없었어요";

/**
 * 하루 리캡 태그 — 전부 관찰 어휘(진단형 "비염이 심해졌어요"류 금지).
 * cond: 프로필 체질과 매칭되면 앞으로 정렬하기 위한 분류.
 */
export const DAY_TAGS: { tag: string; cond: "respiratory" | "allergy" | "skin" | null }[] = [
  { tag: "땀을 많이 흘렸어요", cond: null },
  { tag: "기침·콧물이 있었어요", cond: "respiratory" },
  { tag: "눈·코를 자주 비볐어요", cond: "allergy" },
  { tag: "피부가 건조하거나 가려워했어요", cond: "skin" },
  { tag: "평소보다 피곤해했어요", cond: null },
  { tag: "옷을 갈아입었어요", cond: null },
  { tag: "야외활동을 하지 않았어요", cond: null },
  { tag: TAG_NONE, cond: null },
];

export const NOTE_MAX = 300;

/* ---------- 저장 (localStorage 정본) ---------- */

const STORE_KEY = "aiday:memory:days"; // 네임스페이스 결정(PRODUCT-DECISIONS §3-4)
const MAX_ENTRIES_PER_CHILD = 60;

export const dismissedKey = (childId: string, date = localDateStr()) =>
  `aiday:reflection-dismissed:${childId}:${date}`;

const loadAll = (): DayReviewEntry[] => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as DayReviewEntry[]) : [];
  } catch {
    return [];
  }
};

const persist = (entries: DayReviewEntry[]): void => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  } catch {
    // 저장 불가(시크릿 모드 등) — 무기록으로 정상 진행 (플로우를 막지 않는다)
  }
};

/** 아이별 기록 (최신 날짜 우선 정렬) */
export const loadEntries = (childId: string): DayReviewEntry[] =>
  loadAll()
    .filter((e) => e.childId === childId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

/** 아이·날짜당 1건 upsert + 아이별 상한 유지 */
export const saveEntry = (entry: DayReviewEntry): void => {
  const rest = loadAll().filter((e) => !(e.childId === entry.childId && e.date === entry.date));
  const mine = rest
    .filter((e) => e.childId === entry.childId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, MAX_ENTRIES_PER_CHILD - 1);
  const others = rest.filter((e) => e.childId !== entry.childId);
  persist([...others, ...mine, entry]);
};

export const loadTodayEntry = (childId: string): DayReviewEntry | null =>
  loadEntries(childId).find((e) => e.date === localDateStr()) ?? null;

/** 특정 날짜 결과 삭제 — 하루 탭의 결과 관리(개인정보 통제)에서 호출 */
export const deleteEntry = (childId: string, date: string): void =>
  persist(loadAll().filter((e) => !(e.childId === childId && e.date === date)));

/** 이 아이의 결과 전체 삭제 (다른 아이 기록은 보존) */
export const clearEntries = (childId: string): void =>
  persist(loadAll().filter((e) => e.childId !== childId));

/* ---------- 파생 통계 ---------- */

/** 누적 기록 일수 (연속 아님 — 첫날부터 의미 있게) */
export const daysLogged = (entries: DayReviewEntry[]): number => entries.length;

/**
 * 최근 7일 결과 적합률 — overallFit === "matched" 비율 (PRD "결과 적합률" 정의 준용).
 * 표본 2건 미만이면 null — 1건짜리 100%는 지표가 아니라 소음이다.
 */
export const fitRate7d = (entries: DayReviewEntry[], today = localDateStr()): number | null => {
  const cutoff = addDays(today, -6);
  const recent = entries.filter((e) => e.date >= cutoff && e.date <= today);
  if (recent.length < 2) return null;
  const matched = recent.filter((e) => e.overallFit === "matched").length;
  return Math.round((matched / recent.length) * 100);
};

/* ---------- Memory 패턴 판정 (결정론) ---------- */

/** P0가 생성하는 trait — 의료·성격·발달 trait는 만들지 않는다 */
export type MemoryTrait = "heat_sensitivity_observed" | "cold_sensitivity_observed";

export type MemoryStatus =
  /** 유효 관찰 3회 미만 — 저장은 하되 패턴을 주장하지 않는다 */
  | { kind: "insufficient"; validCount: number }
  /** 지배 결과가 신뢰도 기준(≥0.67)을 충족 */
  | { kind: "pattern"; trait: MemoryTrait; evidence: number; total: number }
  /** 꾸준히 "적당했어요" — 민감 패턴 없음(현행 기준 유지 신호) */
  | { kind: "stable"; evidence: number; total: number }
  /** 관찰은 충분하나 결과가 갈림 — 반영 보류 */
  | { kind: "inconsistent"; total: number };

const OBSERVATION_WINDOW_DAYS = 30;
const MAX_OBSERVATIONS = 30;
export const MIN_OBSERVATIONS = 3;
export const CONFIDENCE_THRESHOLD = 0.67;

/**
 * 옷차림 체감 관찰에서 더위/추위 민감 패턴을 판정한다.
 * 유효 관찰 = 최근 30일 내 thermalOutcome이 unknown/null이 아닌 기록 (최대 30건).
 */
export const detectMemoryStatus = (
  entries: DayReviewEntry[],
  today = localDateStr()
): MemoryStatus => {
  const cutoff = addDays(today, -(OBSERVATION_WINDOW_DAYS - 1));
  const valid = entries
    .filter((e) => e.date >= cutoff && e.date <= today)
    .filter((e) => e.thermalOutcome != null && e.thermalOutcome !== "unknown")
    .slice(0, MAX_OBSERVATIONS);

  if (valid.length < MIN_OBSERVATIONS) return { kind: "insufficient", validCount: valid.length };

  const count = (o: ThermalOutcome) => valid.filter((e) => e.thermalOutcome === o).length;
  const warm = count("too_warm");
  const cold = count("too_cold");
  const comfy = count("comfortable");
  const total = valid.length;

  // 지배 결과 하나만 인정 — 신뢰도 = 지배 결과 수 / 유효 관찰 수
  const top = Math.max(warm, cold, comfy);
  if (top / total < CONFIDENCE_THRESHOLD) return { kind: "inconsistent", total };
  if (top === warm && warm >= MIN_OBSERVATIONS)
    return { kind: "pattern", trait: "heat_sensitivity_observed", evidence: warm, total };
  if (top === cold && cold >= MIN_OBSERVATIONS)
    return { kind: "pattern", trait: "cold_sensitivity_observed", evidence: cold, total };
  if (top === comfy && comfy >= MIN_OBSERVATIONS) return { kind: "stable", evidence: comfy, total };
  return { kind: "inconsistent", total };
};

/**
 * Memory Status → 완료 화면 카피. 관찰 서술만 — "학습했다"/"체질" 단정 금지.
 * childName은 조사 없이 쓰이는 위치만 사용한다.
 */
export const memoryStatusCopy = (
  status: MemoryStatus,
  childName: string
): { title: string; body: string } => {
  switch (status.kind) {
    case "insufficient":
      return {
        title: "아직은 패턴을 판단하지 않아요",
        body: "몇 번의 기록이 더 쌓이면, 반복되는 경향만 조심스럽게 반영할게요.",
      };
    case "pattern":
      return status.trait === "heat_sensitivity_observed"
        ? {
            title: `${childName}의 패턴을 하나 발견했어요`,
            body: `최근 비슷한 날 ${status.total}번 중 ${status.evidence}번, 더워했다는 기록이 있었어요. 다음 판단에서 참고할게요.`,
          }
        : {
            title: `${childName}의 패턴을 하나 발견했어요`,
            body: `최근 비슷한 날 ${status.total}번 중 ${status.evidence}번, 추워했다는 기록이 있었어요. 다음 판단에서 참고할게요.`,
          };
    case "stable":
      return {
        title: "결과가 안정적이에요",
        body: `최근 ${status.total}번 중 ${status.evidence}번 적당했어요. 지금 기준을 유지할게요.`,
      };
    case "inconsistent":
      return {
        title: "아직 결과가 일정하지 않아요",
        body: "상황에 따라 달라질 수 있어, 조금 더 지켜본 뒤 반영할게요.",
      };
  }
};

/* ---------- 오늘의 한 줄 리캡 (규칙 조립 — LLM 호출 없음) ---------- */

const COMFORT_CLAUSE: Record<DayComfort, string> = {
  comfortable: "대체로 편안하게 보냈어요",
  some_discomfort: "조금 불편해한 순간이 있었어요",
  high_discomfort: "힘들어한 순간이 있었어요",
  unknown: "하루를 보냈어요",
};

/**
 * "덥고 습한 날이었지만, 얇은 옷과 여벌 상의로 대체로 편안하게 보냈어요."
 *
 * 조건절(그날 hook) + 실제로 쓴 준비물 + 컨디션을 잇는다. 조건이나 준비물이 없으면
 * 그 절을 빼고 자연스럽게 줄인다 — 없는 정보를 지어내지 않는다.
 */
export const buildRecapLine = (entry: DayReviewEntry, childName: string): string => {
  const used = (entry.actionOutcomes ?? [])
    .filter((a) => a.execution === "done")
    .map((a) => a.name);
  const comfort = COMFORT_CLAUSE[entry.dayComfort];
  const head = entry.conditionLabel ? `${entry.conditionLabel} 날이었지만, ` : "";
  // 조사는 받침에 따라 갈린다 — "여벌 상의로" / "물통으로", "얇은 옷과" / "모자와"
  const joined =
    used.length > 1
      ? `${used[0]}${hasJongseong(used[0]) ? "과" : "와"} ${used[1]}`
      : (used[0] ?? "");
  const withPrep = used.length
    ? `${joined}${used.length > 2 ? " 등" : ""}${hasJongseong(used.length > 2 ? "등" : joined) ? "으로" : "로"} `
    : "";
  if (!head && !withPrep) return `${withTopicParticle(childName)} 오늘 ${comfort}.`;
  return `${head}${withPrep}${comfort}.`;
};

/* ---------- 반응 지도 (특성별 상태 — 전역 단계가 아니다) ---------- */

/** 특성 카드 상태: 프로필 정보 / 알아보는 중 / 반복 확인·반영 */
export type TraitState = "profile" | "watching" | "confirmed";

export type TraitCard = {
  key: "heat" | "cold" | "prep" | "airway";
  title: string;
  /** 관찰 서술 — 진단·학습 단정 금지 */
  desc: string;
  state: TraitState;
};

/**
 * 특성별 반응 지도를 만든다. **전역 진행 단계를 만들지 않는다** — 더위는 반영 중인데
 * 추위는 정보가 적을 수 있고, 그 병렬 상태가 실제 데이터 구조다.
 * 확정 기준은 detectMemoryStatus와 같은 규칙(유효 관찰 ≥3 + 신뢰도 ≥0.67)을 쓴다.
 */
export const buildTraitMap = (
  entries: DayReviewEntry[],
  today = localDateStr()
): TraitCard[] => {
  const cards: TraitCard[] = [];
  const status = detectMemoryStatus(entries, today);
  const cutoff = addDays(today, -(OBSERVATION_WINDOW_DAYS - 1));
  const recent = entries.filter((e) => e.date >= cutoff && e.date <= today);

  // 1) 더위·추위 — 옷차림 체감 관찰에서
  const warm = recent.filter((e) => e.thermalOutcome === "too_warm").length;
  const cold = recent.filter((e) => e.thermalOutcome === "too_cold").length;
  if (status.kind === "pattern" && status.trait === "heat_sensitivity_observed") {
    cards.push({
      key: "heat",
      title: "더운 날 반응",
      desc: `비슷한 날 ${status.total}번 중 ${status.evidence}번 더워했어요`,
      state: "confirmed",
    });
  } else if (warm > 0) {
    cards.push({
      key: "heat",
      title: "더운 날 반응",
      desc: "비슷한 결과가 몇 번 있었어요 · 조금 더 알아보는 중",
      state: "watching",
    });
  }
  if (status.kind === "pattern" && status.trait === "cold_sensitivity_observed") {
    cards.push({
      key: "cold",
      title: "추운 날 반응",
      desc: `비슷한 날 ${status.total}번 중 ${status.evidence}번 추워했어요`,
      state: "confirmed",
    });
  } else if (cold > 0) {
    cards.push({
      key: "cold",
      title: "추운 날 반응",
      desc: "비슷한 결과가 몇 번 있었어요 · 조금 더 알아보는 중",
      state: "watching",
    });
  }

  // 2) 도움이 된 준비물 — 같은 준비물을 실제로 쓴 날이 3번 이상이면 확정
  const usedCount = new Map<string, number>();
  recent.forEach((e) =>
    (e.actionOutcomes ?? [])
      .filter((a) => a.execution === "done")
      .forEach((a) => usedCount.set(a.name, (usedCount.get(a.name) ?? 0) + 1))
  );
  const topPrep = [...usedCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topPrep) {
    const [name, n] = topPrep;
    cards.push({
      key: "prep",
      title: name,
      desc:
        n >= MIN_OBSERVATIONS
          ? `사용한 ${n}번 모두 도움이 됐어요`
          : `${n}번 사용했어요 · 조금 더 알아보는 중`,
      state: n >= MIN_OBSERVATIONS ? "confirmed" : "watching",
    });
  }

  // 3) 호흡기 반응 — 동적 질문에서 불편이 관찰된 날
  const airway = recent.filter(
    (e) => e.airwayOutcome === "rubbing" || e.airwayOutcome === "cough"
  ).length;
  if (airway > 0) {
    cards.push({
      key: "airway",
      title: "야외활동 뒤 반응",
      desc:
        airway >= MIN_OBSERVATIONS
          ? `비슷한 날 ${airway}번 코·기침 반응이 있었어요`
          : `${airway}번 관찰됐어요 · 조금 더 알아보는 중`,
      state: airway >= MIN_OBSERVATIONS ? "confirmed" : "watching",
    });
  }

  return cards;
};

/**
 * 확정된 특성이 있으면 다음 판단 예고 문장을 만든다(예고형 — 반영 완료 주장 금지).
 * 없으면 null → 화면은 예고 밴드를 그리지 않는다.
 */
export const buildNextJudgementLine = (traits: TraitCard[]): string | null => {
  const confirmed = traits.find((t) => t.state === "confirmed");
  if (!confirmed) return null;
  switch (confirmed.key) {
    case "heat":
      return "다음 비슷한 날에는 얇고 갈아입기 쉬운 옷을 먼저 안내할게요";
    case "cold":
      return "다음 비슷한 날에는 한 겹 더 챙기는 쪽으로 먼저 안내할게요";
    case "airway":
      return "다음 비슷한 날에는 야외활동 시간과 귀가 후 케어를 먼저 안내할게요";
    default:
      return `다음 비슷한 날에는 ${confirmed.title}을 먼저 안내할게요`;
  }
};

/* ---------- 유틸 ---------- */

/** YYYY-MM-DD에 일수를 더한다 (로컬 자정 기준 — 날짜 문자열 연산 전용) */
export const addDays = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
};

/**
 * 데모 시딩 — 개발 환경 전용(?seed=memory). 실제 저장 포맷 그대로 과거 2일치
 * too_warm 기록을 넣어 "3회째 패턴 발견" 상태를 연출한다(허위 데이터 형식 아님).
 * 프로덕션에서는 호출부가 NODE_ENV 가드로 차단한다.
 */
export const seedDemoEntries = (childId: string): void => {
  const today = localDateStr();
  [-2, -1].forEach((offset) => {
    saveEntry({
      childId,
      date: addDays(today, offset),
      // matched로 시딩 — 적합률(matched 비율)이 데모에서 0%로 나오지 않게.
      // 패턴 연출은 thermalOutcome(too_warm)이 담당하므로 적합도와 독립이다.
      overallFit: "matched",
      thermalOutcome: "too_warm",
      dayComfort: "some_discomfort",
      tags: ["땀을 많이 흘렸어요"],
      ts: Date.now(),
    });
  });
};
