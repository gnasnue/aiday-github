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

/* ---------- 타입 ---------- */

/** Step 1 필수 — 아침 판단 전체 적합도 (PRD S-003 라벨의 분리 개정판) */
export type OverallFit = "matched" | "partly_matched" | "not_matched" | "not_executed";

/** Step 1 조건부 — 옷차림 체감 (의류계 준비물이 있던 날만 수집) */
export type ThermalOutcome = "too_warm" | "comfortable" | "too_cold" | "unknown";

/** Step 2 필수 — 아이 하루 컨디션 */
export type DayComfort = "comfortable" | "some_discomfort" | "high_discomfort" | "unknown";

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
