import { canonicalPrep } from "./prep-vocab";

// 홈 히어로 "Decision Brief"의 순수 로직 — 렌더와 분리해 유닛 테스트로 고정한다.
// 시안·명세: docs/reviews/2026-07-25-home-decision-brief-design.html
// 제작 지시서: docs/reviews/2026-07-25-home-decision-brief-figma-handoff.md
//
// 이 모듈이 존재하는 이유: 히어로가 표시하는 4개 요소(조건·결론·개인 근거·판단 근거)는
// 새 AI 필드가 아니라 **기존 리포트 계약에서 파생**된다. 파생 규칙이 화면 JSX 안에 있으면
// 검증할 수 없고 다른 화면(공유 이미지 등)에서 재사용도 안 된다.

/* ============================================================
   1. hook → 조건(context) + 결론(headline)
   ============================================================ */

/**
 * AI hook을 두 절로 나눈다 — "조건 — 행동" 또는 "조건, 행동".
 * 프롬프트 규칙상 hook은 "[공감] — [행동]" 구조라 대시가 1차 구분자다(lib/prompts/report.ts).
 * 행동절에 쉼표가 섞여도(예: "자외선 매우강함 — 땀도 많은 날, 대비하세요") 대시에서
 * 갈리도록 대시를 먼저 본다. 대시가 없을 때만 쉼표를 폴백 구분자로 쓴다.
 *
 * 주의: 현재 홈(app/(main)/home/page.tsx)에도 같은 이름의 로컬 함수가 있다. 히어로를
 * 이 모듈로 교체할 때 그 로컬 사본을 지우고 여기로 통합한다(Phase 1).
 */
export const splitHook = (hook: string): string[] => {
  const dash = hook.match(/\s+[—–-]\s+/);
  if (dash && dash.index != null) {
    return [hook.slice(0, dash.index).trim(), hook.slice(dash.index + dash[0].length).trim()];
  }
  const comma = hook.search(/[,，]/);
  if (comma > 0 && comma < hook.length - 1) {
    return [hook.slice(0, comma + 1).trim(), hook.slice(comma + 1).trim()];
  }
  return [hook];
};

export type Brief = {
  /** 조건절 — context pill에 들어간다. 절이 하나뿐인 hook에서는 null */
  context: string | null;
  /** 행동절 — 화면 유일의 display 타입(28/800)으로 렌더된다 */
  headline: string;
};

/**
 * hook을 히어로 구조로 파생한다. 프롬프트·캐시 스키마 변경이 필요 없다.
 *
 * 조건절 끝의 구분 문자(쉼표·중점·대시)는 떼어낸다 — pill 안에서 "비 소식," 처럼
 * 매달린 쉼표는 문장이 끊긴 것처럼 보인다.
 */
export function toBrief(hook: string): Brief {
  const parts = splitHook(hook.trim()).filter(Boolean);
  if (parts.length < 2) return { context: null, headline: parts[0] ?? "" };
  const context = parts[0].replace(/[,，·—–-]\s*$/, "").trim();
  return { context: context || null, headline: parts.slice(1).join(" ").trim() };
}

/* ============================================================
   2. 헤드라인 강조 구간 (하이라이트 밴드)
   ============================================================ */

export type HeadlineSegment = { text: string; emphasis: boolean };

/**
 * 준비물 이름 하나에서 hook 안에서 찾을 후보 문자열을 만든다.
 *
 * 세 가지를 넣는다.
 *  1) 원본 표기 — hook은 표준화되지 않는다
 *  2) 표준명(canonicalPrep) — 체크리스트는 표준화되어 있다
 *  3) **핵심 명사(마지막 어절)** — 한국어 준비물은 수식어가 붙은 복합명사가 많고
 *     hook은 짧아서(25자 제한) 수식어를 떨군다. 체크리스트 "얇은 겉옷" ↔ hook "겉옷"이
 *     대표 사례다. 이 확장이 없으면 헤드라인 강조와 accent 타일이 서로 다른 항목을
 *     가리켜 "결론과 실행이 같은 단어"라는 설계 전제가 깨진다.
 *
 * 한 글자 후보는 버린다 — "물"이 "물놀이"를, "옷"이 "옷차림"을 오염시킨다.
 */
export function prepNeedles(name: string): string[] {
  const set = new Set<string>([name.trim(), canonicalPrep(name).trim()]);
  for (const n of [...set]) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length > 1) set.add(parts[parts.length - 1]);
  }
  return [...set].filter((n) => n.length >= 2);
}

/**
 * hook이 준비물 이름 대신 쓰는 **행동 목적어**.
 *
 * hook은 25자 제한이라 물건 이름을 행동으로 압축하는 일이 잦다 — "선크림·모자 챙기세요"가
 * "그늘 필수예요"가 되는 식이다. 준비물 명사만 찾으면 이런 hook에서는 강조가 사라져,
 * 화면의 시그니처(결론 안의 행동 토큰)가 대부분의 날에 보이지 않는다.
 *
 * 다만 아무 단어나 강조하면 "없는 행동"을 강조하게 되므로, **대응 준비물이 체크리스트에
 * 실제로 있을 때만** 그 목적어를 후보로 인정한다(requires).
 */
const ACTION_ALIAS: { object: string; requires: RegExp }[] = [
  { object: "그늘", requires: /선크림|모자/ },
  { object: "실내", requires: /실내놀이|마스크/ },
  { object: "여벌", requires: /여벌 옷/ },
  { object: "한 겹", requires: /겉옷|가디건|바람막이/ },
  { object: "코 세척", requires: /마스크/ },
];

/**
 * 헤드라인에서 강조할 준비물 구간을 찾아 세그먼트로 쪼갠다.
 *
 * hook은 마크업 없는 평문이라(report.ts 출력 규칙) 강조 구간을 AI가 주지 않는다.
 * 그래서 체크리스트의 준비물 명사를 hook 안에서 부분 문자열로 매칭한다.
 * - 긴 이름을 먼저 시도한다: "얇은 겉옷"이 있으면 "겉옷"보다 우선(부분 겹침 방지)
 * - 표준명(canonicalPrep)과 원본 표기를 모두 후보로 넣는다 — hook은 표준화되지 않는다
 * - 준비물 이름이 없으면 **행동 목적어**(ACTION_ALIAS)도 본다 — 대응 준비물이 목록에 있을 때만
 * - 그래도 매칭이 없으면 강조 없이 전체를 한 세그먼트로 돌려준다(억지 강조 금지).
 *   "야외활동 짧게 해요"처럼 목적어가 아예 없는 결론도 있고, 그때는 강조하지 않는 것이 맞다
 */
export function highlightHeadline(headline: string, prepNames: string[]): HeadlineSegment[] {
  const canon = prepNames.map((n) => canonicalPrep(n)).join(" ");
  const aliases = ACTION_ALIAS.filter((a) => a.requires.test(canon)).map((a) => a.object);
  const candidates = Array.from(new Set([...prepNames.flatMap(prepNeedles), ...aliases])).sort(
    (a, b) => b.length - a.length
  );

  for (const c of candidates) {
    const at = headline.indexOf(c);
    if (at < 0) continue;
    const segs: HeadlineSegment[] = [];
    if (at > 0) segs.push({ text: headline.slice(0, at), emphasis: false });
    segs.push({ text: c, emphasis: true });
    if (at + c.length < headline.length) {
      segs.push({ text: headline.slice(at + c.length), emphasis: false });
    }
    return segs;
  }
  return [{ text: headline, emphasis: false }];
}

/**
 * 결론을 **2줄로 고정**해서 렌더하기 위해 어절 경계에서 쪼갠다.
 *
 * 왜 고정하는가: 28px/800은 화면에서 유일한 대형 타입인데, AI 문구 길이에 따라 1줄과
 * 2줄이 오가면 히어로 높이가 매일 달라지고 결론의 무게감도 흔들린다. 2줄로 고정하면
 * 카드 높이가 일정해지고 대형 타입이 제 몫(두 줄)을 채운다.
 *
 * 규칙
 *  - 공백(어절) 경계에서만 자른다 — 한국어를 어절 중간에서 끊지 않는다.
 *  - **강조 구간을 가르지 않는다.** 하이라이트 밴드가 두 줄로 쪼개지면 형태가 무너진다.
 *  - 두 줄 길이 차가 가장 작은 지점을 고른다. 한 글자만 남는 분할은 버린다.
 *  - 어절이 하나뿐이면 1줄로 둔다 — 공백이 없으면 쪼갤 수가 없다(구조적 예외).
 */
export function headlineLines(headline: string, prepNames: string[] = []): HeadlineSegment[][] {
  const segs = highlightHeadline(headline, prepNames);

  // 강조 구간의 문자 오프셋 범위
  let acc = 0;
  let emStart = -1;
  let emEnd = -1;
  for (const s of segs) {
    if (s.emphasis) {
      emStart = acc;
      emEnd = acc + s.text.length;
    }
    acc += s.text.length;
  }

  // 공백 위치 후보
  const candidates: number[] = [];
  for (let i = 0; i < headline.length; i++) {
    if (!/\s/.test(headline[i])) continue;
    if (emStart >= 0 && i > emStart && i < emEnd) continue; // 강조 구간 내부 금지
    const left = headline.slice(0, i).trim().length;
    const right = headline.slice(i + 1).trim().length;
    if (left < 2 || right < 2) continue; // 한 글자만 남는 분할은 버린다
    candidates.push(i);
  }
  if (!candidates.length) return [segs];

  const best = candidates.reduce((a, b) => {
    const d = (i: number) =>
      Math.abs(headline.slice(0, i).trim().length - headline.slice(i + 1).trim().length);
    return d(b) < d(a) ? b : a;
  });

  // 세그먼트를 오프셋 기준으로 두 줄로 나눈다
  const lines: HeadlineSegment[][] = [[], []];
  let pos = 0;
  for (const s of segs) {
    const start = pos;
    const end = pos + s.text.length;
    pos = end;
    if (end <= best) {
      lines[0].push(s);
    } else if (start >= best + 1) {
      lines[1].push(s);
    } else {
      // 분할점이 이 세그먼트 안 — 강조 구간은 후보에서 제외했으므로 항상 평문이다
      const head = s.text.slice(0, best - start).trimEnd();
      const tail = s.text.slice(best - start + 1).trimStart();
      if (head) lines[0].push({ text: head, emphasis: s.emphasis });
      if (tail) lines[1].push({ text: tail, emphasis: s.emphasis });
    }
  }
  return lines[1].length ? lines : [lines[0]];
}

/* ============================================================
   3. 강조 준비물 1개 선정
   ============================================================ */

export type PrepCandidate = {
  /** 체크 상태 저장 키(표준화된 준비물명 기반) */
  key: string;
  /** 표시 이름 */
  title: string;
  /** lib/prep.ts isCriticalPrep 판정 결과 */
  critical?: boolean;
};

/**
 * 체크리스트에서 accent tint를 줄 항목 1개를 고른다.
 *
 * 1순위: **헤드라인이 지시한 준비물** — 결론과 실행이 같은 단어·같은 색으로 이어져
 *        시선이 끊기지 않는다. 프롬프트 규칙 5(hook은 1순위 이슈로 쓴다)가 있어
 *        이 항목은 사실상 "오늘의 1순위 준비물"과 같다.
 * 2순위: `isCriticalPrep`이 true인 첫 항목 — 헤드라인이 물건을 지목하지 않은 경우.
 * 없으면 null — 강조를 억지로 만들지 않는다(폴백 상태가 여기에 해당한다).
 */
export function pickPrimaryPrep(headline: string, items: PrepCandidate[]): string | null {
  // (항목, 후보 문자열) 쌍을 후보 길이 내림차순으로 본다 — 전체 이름 매칭이
  // 핵심 명사 매칭을 이긴다("얇은 겉옷" > "겉옷").
  const pairs = items
    .flatMap((it) => prepNeedles(it.title).map((needle) => ({ key: it.key, needle })))
    .sort((a, b) => b.needle.length - a.needle.length);

  for (const { key, needle } of pairs) {
    if (headline.includes(needle)) return key;
  }
  return items.find((it) => it.critical)?.key ?? null;
}

/* ============================================================
   4. 판단 근거 chip 2~3개
   ============================================================ */

export type EvidenceTone = "neutral" | "warn" | "good";
export type Evidence = { label: string; value: string; tone: EvidenceTone };
export type EvidenceCandidate = {
  label: string;
  /** 결측이면 null — 지표가 없을 때 "—"·"정보 없음" 칩을 만들지 않기 위해 명시적으로 받는다 */
  value: string | null | undefined;
  tone?: EvidenceTone;
  /** 낮을수록 먼저. 같은 tone 안에서의 순서 */
  priority: number;
  /** tone과 무관하게 맨 앞에 고정한다 — "지금 몇 도"는 부모가 가장 먼저 확인하는 값이라
   *  주의 신호보다 앞에 둔다(읽는 순서 = 현재 상태 → 무엇이 문제인지). */
  pin?: boolean;
};

export const EVIDENCE_MAX = 3;
export const EVIDENCE_MIN = 2;

/**
 * 근거 chip을 고른다.
 *
 * - **결측 지표는 칩을 만들지 않는다.** 무근거를 데이터처럼 보이게 하는 것이 가장 나쁘다.
 * - 이슈 지표(warn/good)를 먼저, 그다음 priority 순.
 * - 최대 3개. 4개 이상 나열은 "아직 판단하지 않았다"는 신호라 규칙으로 막는다.
 * - 살아남은 칩이 2개 미만이면 **빈 배열** — 호출부가 근거 행 자체를 숨긴다.
 *   칩 하나만 뜬 근거 줄은 판단의 근거처럼 보이지 않는다.
 */
export function pickEvidence(candidates: EvidenceCandidate[]): Evidence[] {
  const alive = candidates
    .filter((c) => {
      const v = (c.value ?? "").trim();
      return v.length > 0 && v !== "—" && v !== "-";
    })
    .map((c) => ({
      label: c.label,
      value: (c.value as string).trim(),
      tone: c.tone ?? "neutral",
      priority: c.priority,
      pin: c.pin,
    }));

  const ranked = alive.sort((a, b) => {
    if (!!a.pin !== !!b.pin) return a.pin ? -1 : 1; // 고정 칩이 언제나 맨 앞
    const aIssue = a.tone === "neutral" ? 1 : 0;
    const bIssue = b.tone === "neutral" ? 1 : 0;
    if (aIssue !== bIssue) return aIssue - bIssue;
    return a.priority - b.priority;
  });

  const picked = ranked.slice(0, EVIDENCE_MAX);
  return picked.length >= EVIDENCE_MIN
    ? picked.map(({ label, value, tone }) => ({ label, value, tone }))
    : [];
}

/* ============================================================
   5. 히어로 상태
   ============================================================ */

export type HeroState = "normal" | "caution" | "safe" | "fallback";

/**
 * 히어로 상태를 정한다. 색·아이콘·어법이 여기서 갈린다.
 *
 * - `fallback`: AI 판단이 없다(실패·한도). 결론 타입을 display(28)에서 title(20)로 낮춰
 *   "AI가 판단했다"는 신호를 규칙 기반 추천이 빌려 쓰지 못하게 한다.
 * - `caution`: 주의 등급 지표가 하나라도 있다.
 * - `safe`: 주의 지표가 없고 야외활동을 권할 기회가 있다.
 * - `normal`: 그 외 — tint 없이 뉴트럴("색 없음이 곧 특이사항 없음").
 */
export function heroState(signals: {
  hasAiHook: boolean;
  issueCount: number;
  outdoorGood?: boolean;
}): HeroState {
  if (!signals.hasAiHook) return "fallback";
  if (signals.issueCount > 0) return "caution";
  return signals.outdoorGood ? "safe" : "normal";
}

/* ============================================================
   6. 체크리스트 텍스트 파싱
   ============================================================ */

/**
 * AI 체크리스트 항목 "제목 (사유)"를 제목/사유로 나눈다. 괄호가 없으면 제목만.
 * 전각 괄호(（）)도 받는다 — 한국어 입력기에서 섞여 들어온다.
 */
export function splitPrepText(text: string): { title: string; reason: string } {
  const m = text.match(/^(.*?)\s*[（(](.+?)[)）]\s*$/);
  return m ? { title: m[1].trim(), reason: m[2].trim() } : { title: text.trim(), reason: "" };
}
