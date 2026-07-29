/**
 * 알림장 30일 누적 — "오늘 하나"를 "요즘 이 아이"로 바꾸는 층.
 *
 * 왜 만드나: `NoteboardCard`는 오늘 한 건만 다룬다(그 카드의 주석이 말하는
 * "축적 레이어의 씨앗"이 이 파일이다). 부모가 알림장을 붙여넣는 행동을 계속할
 * 이유는 오늘의 대화 거리 하나가 아니라, **쌓였을 때만 보이는 변화**다.
 *
 * 데이터 한계를 지어내지 않는다:
 *   - 원문(`raw`)은 7일 롤링 삭제다. 그래서 근거로 원문을 쓰지 않고
 *     `result.summary`(그 한 줄의 근거)를 쓴다 — 30건 내내 남는다.
 *   - "이번 달 달라진 한 가지" 같은 **엔트리 간 추론 문장은 만들지 않는다.**
 *     로컬 데이터로 파생할 수 없고, 규칙으로 흉내내면 AI 판단인 척하는 문장이 된다.
 *   - 환경(꽃가루·미세먼지)과의 교차는 `EnvDigest`에 해당 값이 없어 하지 않는다.
 *
 * 즉 이 모듈은 **집계만** 한다. 해석은 하지 않는다.
 */

import { localDateStr } from "./date";
import type { NoteFinding, NoteboardEntry } from "./noteboard";

/** 누적 뷰가 의미를 갖는 최소 알림장 수. 이보다 적으면 아예 렌더하지 않는다. */
export const MIN_ENTRIES_FOR_GROWTH = 3;

/** 집계 기간(오늘 포함). `MAX_ENTRIES_PER_CHILD`(30)와 같은 지평. */
export const GROWTH_PERIOD_DAYS = 30;

/** "반복"으로 볼 최소 등장 횟수 — 1번은 반복이 아니다. */
const MIN_REPEAT_COUNT = 2;

const MAX_TIMELINE_ROWS = 5;
const MAX_REPEATED_ROWS = 4;

export type GrowthMoment = {
  /** YYYY-MM-DD */
  date: string;
  /** 그날 한 줄 (`result.headline`) */
  headline: string;
  /** 그 한 줄의 근거 (`result.summary`) — 원문이 지워진 날도 남는다 */
  basis: string;
  /** 그날 기록된 "처음 해본 것" 라벨 (없을 수 있다) */
  firstLabels: string[];
};

export type RepeatedSignal = {
  kind: NoteFinding["kind"];
  label: string;
  /** 기간 내 등장한 알림장 수 */
  count: number;
};

export type GrowthNoteSummary = {
  /** 집계에 쓴 알림장 수 = 모든 분수의 분모 */
  notesCount: number;
  periodDays: number;
  /** 첫 기록 → 최근 순(오래된 것부터). 변화의 방향을 읽게 하려면 시간순이어야 한다 */
  moments: GrowthMoment[];
  /** moments에 담지 못하고 생략된 성장 장면 수 */
  momentsOmitted: number;
  repeated: RepeatedSignal[];
  /** 기간 내 "처음 해본 것"으로 기록된 서로 다른 라벨 수 */
  firstsCount: number;
};

const addDays = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const labelsOfKind = (entry: NoteboardEntry, kind: NoteFinding["kind"]): string[] =>
  entry.result.findings.filter((f) => f.kind === kind).map((f) => f.label);

/**
 * 기간 내 알림장을 누적 요약으로 접는다. 데이터가 부족하면 `null` —
 * 빈 카드를 렌더해 "곧 채워질 자리"를 보여주는 것보다 아예 없는 편이 낫다.
 */
export function buildGrowthNote(
  entries: NoteboardEntry[],
  today = localDateStr()
): GrowthNoteSummary | null {
  const cutoff = addDays(today, -(GROWTH_PERIOD_DAYS - 1));
  const inPeriod = entries
    .filter((e) => e.date >= cutoff && e.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (inPeriod.length < MIN_ENTRIES_FOR_GROWTH) {
    return null;
  }

  // 성장 장면 = "처음 해본 것"이 기록된 날. 그런 날이 없으면 변화를 지어내지 않고
  // 최근 기록으로 대신한다(그 경우 firstLabels는 빈 배열이라 UI가 구분할 수 있다).
  const withFirsts = inPeriod.filter((e) => labelsOfKind(e, "first").length > 0);
  const source = withFirsts.length > 0 ? withFirsts : inPeriod.slice(-MAX_TIMELINE_ROWS);

  const picked = source.slice(-MAX_TIMELINE_ROWS);
  const moments: GrowthMoment[] = picked.map((e) => ({
    date: e.date,
    headline: e.result.headline,
    basis: e.result.summary,
    firstLabels: labelsOfKind(e, "first"),
  }));

  const counts = new Map<string, RepeatedSignal>();
  for (const entry of inPeriod) {
    // 한 알림장에 같은 라벨이 두 번 있어도 "알림장 수"로 세야 분모와 단위가 맞는다.
    const seen = new Set<string>();
    for (const finding of entry.result.findings) {
      const key = `${finding.kind} ${finding.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const prev = counts.get(key);
      if (prev) prev.count += 1;
      else counts.set(key, { kind: finding.kind, label: finding.label, count: 1 });
    }
  }

  const repeated = [...counts.values()]
    .filter((s) => s.count >= MIN_REPEAT_COUNT)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"))
    .slice(0, MAX_REPEATED_ROWS);

  const firstLabels = new Set<string>();
  for (const entry of inPeriod) {
    for (const label of labelsOfKind(entry, "first")) firstLabels.add(label);
  }

  return {
    notesCount: inPeriod.length,
    periodDays: GROWTH_PERIOD_DAYS,
    moments,
    momentsOmitted: Math.max(0, source.length - picked.length),
    repeated,
    firstsCount: firstLabels.size,
  };
}
