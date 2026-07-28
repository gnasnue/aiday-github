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
};

/**
 * 상한 2 — 명세는 "2~3개"를 허용하고 목표치를 3으로 썼지만, 그 계산("3개 합 285px, 310 안에
 * 1줄 수납")은 **근거 행이 칩만 쓰던 시절**의 것이다. 2026-07-26에 `자세히 ⌄`가 같은 행으로
 * 들어오면서(DESIGN.md) 칩 가용 폭이 310 → 234px로 줄었는데 아무도 재계산하지 않았다.
 *
 * 빌드된 Tailwind CSS + Chromium 390px 실측:
 *   3개(자외선 강함 92.4 + 일교차 78.3 + 강수 없음 79.5 + gap 16) = 266px > 234 → 2줄로 밀림
 *   2개(자외선 강함 + 일교차) = 178.7px → 1줄 ✓
 * 즉 상한 3을 유지하면 **거의 모든 caution 날에 칩이 2줄로 흘러** 카드가 35px 늘어난다.
 * 라벨이 둘 다 긴 예외(미세먼지 매우나쁨 131 + 자외선 매우강함 118 = 257)는 2개여도 밀리는데,
 * 명세가 오버플로 동작으로 허용한 flex-wrap에 맡긴다(드물다).
 */
export const EVIDENCE_MAX = 2;
export const EVIDENCE_MIN = 2;
/** caution(이슈 있음)일 때의 하한 — 아래 buildHeroEvidence 주석의 "하한이 갈리는 이유" 참고 */
export const EVIDENCE_MIN_CAUTION = 1;

/**
 * 근거 chip을 고른다.
 *
 * - **결측 지표는 칩을 만들지 않는다.** 무근거를 데이터처럼 보이게 하는 것이 가장 나쁘다.
 * - 이슈 지표(warn/good)를 먼저, 그다음 priority 순.
 * - 같은 라벨은 하나만 남긴다 — 1순위 승격이 후보를 복제하면 같은 칩이 두 개 그려진다.
 * - 최대 3개. 4개 이상 나열은 "아직 판단하지 않았다"는 신호라 규칙으로 막는다.
 * - 살아남은 칩이 `min`개 미만이면 **빈 배열** — 호출부가 칩 행을 그리지 않는다
 *   (명세: "칩이 2개 미만이면 근거 행 자체를 숨기고 근거 진입 행만 남긴다").
 *   `min`을 호출부가 정하는 이유는 buildHeroEvidence 주석 참고.
 */
export function pickEvidence(
  candidates: EvidenceCandidate[],
  min: number = EVIDENCE_MIN
): Evidence[] {
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
    }));

  const ranked = alive.sort((a, b) => {
    const aIssue = a.tone === "neutral" ? 1 : 0;
    const bIssue = b.tone === "neutral" ? 1 : 0;
    if (aIssue !== bIssue) return aIssue - bIssue;
    return a.priority - b.priority;
  });

  const seen = new Set<string>();
  const deduped = ranked.filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true)));

  const picked = deduped.slice(0, EVIDENCE_MAX);
  return picked.length >= min
    ? picked.map(({ label, value, tone }) => ({ label, value, tone }))
    : [];
}

/* ------------------------------------------------------------
   4-1. 근거 chip 후보 생성 — 화면의 단일 진실
   ------------------------------------------------------------ */

/** 근거 계산에 필요한 슬롯 필드만 (lib/timeline.ts HomeTimeSlot의 부분집합) */
export type EvidenceSlot = {
  pty?: number | null;
  pop?: number | null;
  popWindow?: number | null;
  dust: string;
  pollen: string;
  uv: string;
  wind: string;
  humidity: number;
  /**
   * 슬롯 기온(°C). 더위·추위 판정에 쓴다 — **선택 필드로 두지 않는다**: 빠뜨리면 신호가
   * 조용히 사라져 "이슈를 말하는 pill + 뉴트럴 카드"가 다시 만들어진다(2026-07-27).
   * 체감이 아니라 기온을 받는다 — 습도 몫은 아래 불쾌지수가 담당하므로 체감을 쓰면 이중 계산이다.
   */
  temp: number | null;
};

export type HeroEvidenceInput = {
  /** 판단 기준 슬롯. null이면 근거를 만들지 않는다(예보 결측) */
  slot: EvidenceSlot | null;
  /** 오늘 3시간 예보 기온(06·09·12·15·18·21시). 일교차 계산 표본 */
  hourlyTemps?: readonly (number | null | undefined)[];
  /** AI hook 조건절이 지목한 1순위 지표 라벨. 그 칩을 맨 앞으로 올린다 */
  ctxIssue?: string | null;
  hasAiHook: boolean;
};

export type HeroEvidenceResult = {
  evidence: Evidence[];
  /** warn 신호 라벨 — heroState의 issueCount와 **같은 배열**에서 나온다 */
  issueLabels: string[];
  state: HeroState;
};

/**
 * 오늘 3시간 예보 기온의 최고−최저. 표본이 2점 미만이면 null(칩을 만들지 않는다).
 *
 * 기상청 정의의 일 최고/최저(TMX·TMN)는 홈이 호출하지 않는 주간예보에만 있어 쓸 수 없다.
 * 06~21시 6점의 근사이며 **새벽(00~05시)이 빠져 실제보다 작게 나온다** — 그래도 이 표본을
 * 쓰는 이유는 AI 리포트가 일과 미입력 사용자에게 보는 표본과 같기 때문이다
 * (app/api/report/route.ts의 hourlyForecast 투입). 슬롯 기온(displaySlots)으로 계산하면
 * 하루 최저가 흔한 06시가 빠져 AI가 말한 일교차와 수 도(度) 단위로 어긋난다.
 */
export function tempRangeOf(temps: readonly (number | null | undefined)[] = []): number | null {
  const t = temps.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (t.length < 2) return null;
  return Math.round(Math.max(...t) - Math.min(...t));
}

/**
 * 히어로의 근거 chip과 상태를 **한 곳에서** 만든다.
 *
 * ## 왜 한 함수인가
 * 칩과 카드 색이 서로 다른 곳에서 계산되던 동안 "주의색 카드 + 근거 칩 0개"가 구조적으로
 * 발생했다(2026-07-26 결함). 이제 `issueLabels`가 warn 칩의 소스이자 `heroState`의
 * `issueCount`라서 **칩에 warn이 없는데 카드가 주의색인 모순이 타입 수준에서 불가능**하다.
 * 이 불변식은 lib/hero-brief.test.ts가 양방향으로 고정한다 — 깨면 테스트가 죽는다.
 *
 * ## 후보 규칙 (이걸 바꾸려면 DESIGN.md Decisions Log부터 고쳐라)
 * - **등급 지표**(미세먼지·꽃가루·자외선·바람·건조) = **warn일 때만** 칩이 된다.
 *   "좋음·보통"을 칩으로 만들면 없는 문제를 만들거나 무의미한 안심을 준다.
 * - **계량 지표**(일교차·강수) = 등급이 아니라 수치·사실이므로 **등급 없이 뉴트럴 칩**이 된다.
 *   이 부류가 있어야 무난한 날에도 칩이 뜬다(명세의 `일교차 5°C`·`강수 없음`이 이것).
 * - **현재·체감 기온은 칩으로 만들지 않는다.** 우상단 기준값 블록이 이미 그 두 값을 말하고,
 *   같은 지표가 한 카드에 다른 값으로 두 번 나오면 어느 게 지금인지 흐려진다(2026-07-26 결정).
 *   일교차는 "기온의 폭"이라 절대 기온과 다른 지표다 — 중복이 아니다.
 *
 * ## 하한이 갈리는 이유
 * 명세의 "칩 2개 미만이면 행을 숨긴다"는 **지표 결측(API 장애)** 문맥의 규칙이다. 지표가
 * 멀쩡한데 warn만 1개인 날까지 행을 통째로 숨기면 주의색 카드에 근거가 사라진다. 그래서
 * caution에서만 하한을 1로 둔다. 결측·평상·폴백은 명세대로 2를 유지한다.
 */
/* ---- 더위·추위·일교차 임계 ------------------------------------------------
   전부 **이미 앱에 있던 값을 차용**한다. 새 숫자를 만들지 않는 이유: 이 카드의 warn 어휘가
   다른 화면과 어긋난 것이 애초의 결함이었다(2026-07-27 — 히어로만 더위·고습을 몰라서
   pill이 "낮 31도 고습"이라 말하는데 카드는 뉴트럴, 즉 "특이사항 없음"이었다).
     · DI_WARN 76 / DI_SEVERE 80 / HEAT_SEVERE_TEMP 33 / COLD_SEVERE_TEMP 0
       → lib/outdoor-index.ts decisiveDeterrent가 "좋음" 라벨을 막는 데 쓰는 것과 같은 값
     · TEMP_RANGE_WARN 8 → DESIGN.md 2026-07-26이 임계까지 적어두고 보류한 값
   임계를 바꿀 때는 outdoor-index·slotNotables와 **함께** 바꿔야 한다. */
/** 불쾌지수 warn — 기상청 기준 75~80이 "다수 불쾌"이며, env 습도 '매우습함'(>75%) 경계와 맞물린다. */
export const DI_WARN = 76;
/** 불쾌지수 severe — 80↑ "전원 불쾌". */
export const DI_SEVERE = 80;
export const HEAT_SEVERE_TEMP = 33;
export const COLD_SEVERE_TEMP = 0;
/** 일교차 warn(°C). */
export const TEMP_RANGE_WARN = 8;

/**
 * 기상청 불쾌지수 — `DI = 0.81T + 0.01·RH·(0.99T − 14.3) + 46.3`.
 * `lib/outdoor-index.ts`와 같은 식·같은 임계를 쓴다(그 화면과 판정이 갈리지 않게).
 *
 * **기온 24°C 미만에서는 계산하지 않는다.** 그래서 "고습"은 더운 날에만 신호가 된다 —
 * 서늘하고 습한 날(가을 비 온 뒤 습도 85% 등)을 더위로 오인하지 않기 위함이고, 이것이
 * 습도 ≥80%를 무조건 warn으로 칠하는 시간대별 환경 카드 대신 불쾌지수를 택한 이유다.
 */
export function discomfortIndex(temp: number | null, humidity: number | null): number | null {
  if (temp == null || humidity == null || humidity <= 0 || temp < 24) return null;
  return 0.81 * temp + 0.01 * humidity * (0.99 * temp - 14.3) + 46.3;
}

export function buildHeroEvidence(input: HeroEvidenceInput): HeroEvidenceResult {
  const { slot, hourlyTemps = [], ctxIssue = null, hasAiHook } = input;

  // --- 이슈 신호(warn) — 임계값은 app/(main)/home/page.tsx slotNotables()와 같아야 한다 ---
  const issues: EvidenceCandidate[] = [];
  // --- 계량 지표(neutral) — 등급 없이 값 그대로 ---
  const measures: EvidenceCandidate[] = [];

  const range = tempRangeOf(hourlyTemps);
  if (range != null) {
    // 일교차 8°C↑는 warn — 아침에 안 입힌 옷은 낮에 입힐 수 없어서 옷 기준을 바꾸는 신호다.
    // DESIGN.md 2026-07-26이 "heroState 판정을 바꾸는 별건"으로 보류했던 승격(2026-07-27 승인).
    if (range >= TEMP_RANGE_WARN) {
      issues.push({ label: "일교차", value: `${range}°`, tone: "warn", priority: 8 });
    } else {
      measures.push({ label: "일교차", value: `${range}°`, tone: "neutral", priority: 20 });
    }
  }

  if (slot) {
    const pop = slot.popWindow ?? slot.pop ?? null;
    const raining = slot.pty != null && slot.pty > 0;
    if (raining || (pop != null && pop >= 60)) {
      issues.push({
        label: "강수",
        value: pop != null ? `${pop}%` : "예보",
        tone: "warn",
        priority: 0,
      });
    } else if (slot.pty === 0 && (pop == null || pop < 40)) {
      // "없음"은 강수형태가 0으로 **확인된** 경우에만 말한다 — 결측을 안심으로 바꾸지 않는다
      measures.push({ label: "강수", value: "없음", tone: "neutral", priority: 21 });
    } else if (pop != null) {
      measures.push({ label: "강수", value: `${pop}%`, tone: "neutral", priority: 21 });
    }

    if (slot.dust === "나쁨" || slot.dust === "매우나쁨") {
      issues.push({ label: "미세먼지", value: slot.dust, tone: "warn", priority: 1 });
    }
    if (slot.pollen === "높음" || slot.pollen === "매우높음") {
      issues.push({ label: "꽃가루", value: slot.pollen, tone: "warn", priority: 2 });
    }
    if (slot.uv === "강함" || slot.uv === "매우강함") {
      issues.push({ label: "자외선", value: slot.uv, tone: "warn", priority: 3 });
    }
    if (slot.wind === "강함") {
      issues.push({ label: "바람", value: "강함", tone: "warn", priority: 4 });
    }
    if (slot.humidity > 0 && slot.humidity <= 40) {
      issues.push({ label: "습도", value: `${slot.humidity}%`, tone: "warn", priority: 5 });
    }

    // 더위 — 기온 단독(폭염)과 고온다습(불쾌지수)을 **하나의 신호로 합친다**.
    // outdoor-index가 heatPenalty·diPenalty 중 큰 값만 적용해 중복 감점을 막는 것과 같은 이유:
    // 같은 더위를 칩 두 개로 세면 issueCount가 부풀고 칩 행(상한 2개)이 더위로 다 찬다.
    // 값은 등급 표기만 쓴다 — 기온 수치 칩은 우상단 기준값 블록과 중복이라 DESIGN.md가 금지한다.
    const di = discomfortIndex(slot.temp, slot.humidity);
    if ((di != null && di >= DI_SEVERE) || (slot.temp != null && slot.temp >= HEAT_SEVERE_TEMP)) {
      issues.push({ label: "더위", value: "매우 심함", tone: "warn", priority: 6 });
    } else if (di != null && di >= DI_WARN) {
      issues.push({ label: "더위", value: "심함", tone: "warn", priority: 6 });
    }

    // 추위 — 임계는 outdoor-index의 decisiveDeterrent와 같은 0°C.
    if (slot.temp != null && slot.temp <= COLD_SEVERE_TEMP) {
      issues.push({ label: "추위", value: "심함", tone: "warn", priority: 7 });
    }
  }

  // AI가 고른 1순위를 맨 앞으로 — **후보를 추가하지 않고 기존 후보의 priority만 낮춘다**
  // (추가하면 같은 라벨 칩이 두 개가 된다).
  const promoted = issues.map((c) => (c.label === ctxIssue ? { ...c, priority: -1 } : c));

  const issueLabels = promoted.map((c) => c.label);
  const state = heroState({ hasAiHook, issueCount: issueLabels.length });
  const min = state === "caution" ? EVIDENCE_MIN_CAUTION : EVIDENCE_MIN;

  return { evidence: pickEvidence([...promoted, ...measures], min), issueLabels, state };
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

/**
 * AI 체크리스트 항목의 선행 이모지만 아이콘으로 떼어낸다 — "👕 여벌 상의" → 👕 / "여벌 상의".
 *
 * **선행 이모지가 없으면 전체를 이름으로 본다.** 종전 정규식은 마지막 대안이 `\S+`여서
 * 이모지가 없을 때 **첫 단어를 아이콘으로 먹었다** — 프롬프트 계약(`checklist`는 "이모지
 * 짧은이름", lib/prompts/report.ts)이 지켜지는 동안엔 드러나지 않는 잠복 결함이지만, 모델
 * 출력은 확률적이고 계약의 준비물 이름 다수가 두 단어다(여벌 상의·여벌 옷·지퍼 겉옷·
 * 얇은 목수건·실내 놀이거리). 이모지 한 번 누락에 "여벌 상의"가 "상의"로, "실내 놀이거리"가
 * "놀이거리"로 렌더된다 — 부모가 가방에 넣을 물건이 달라지는 오표기다(2026-07-27 발견).
 *
 * 이모지 클러스터는 단일 코드포인트가 아니다 — 변이 선택자(️FE0F: ☂️), 피부톤 수식자,
 * 키캡(20E3), ZWJ 결합까지 한 덩어리로 받는다. 이름 쪽은 공백이 없어도 분리한다("👕여벌 상의").
 */
export function parseAiPrepItem(item: string): { icon: string; name: string } {
  // 이스케이프로만 쓴다 — FE0F·200D는 소스에 그대로 넣으면 보이지 않아 편집 사고를 부른다.
  const EMOJI_CLUSTER =
    /^(\p{Extended_Pictographic}(?:\uFE0F|\u20E3|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic}\uFE0F?)*)\s*(\S.*)$/u;
  const m = item.trim().match(EMOJI_CLUSTER);
  // 아이콘 폴백 "✅"는 화면에 raw로 렌더되지 않는다 — PrepIcon이 `icon + text`를 함께 보고
  // LineIcon/lucide로 매핑하며, 어디에도 안 걸리면 CircleCheck로 떨어진다.
  return m ? { icon: m[1], name: m[2].trim() } : { icon: "✅", name: item.trim() };
}

/**
 * AI 체크리스트(문자열 배열) → 화면용 항목. 이름은 `canonicalPrep`으로 표준화해 케어 플랜
 * 칩과 어휘를 맞추고, key도 표준명 기반이라 목록이 교체돼도 같은 준비물의 체크가 유지된다.
 * 같은 이름이 중복으로 오면 뒤 항목에 인덱스를 붙여 key 충돌을 막는다.
 */
export function buildAiChecklist(
  items: readonly string[]
): { icon: string; text: string; key: string }[] {
  const seenKeys = new Map<string, number>();
  return items.map((item) => {
    const { icon, name } = parseAiPrepItem(item);
    const text = canonicalPrep(name);
    const n = seenKeys.get(text) ?? 0;
    seenKeys.set(text, n + 1);
    return { icon, text, key: n === 0 ? text : `${text}-${n}` };
  });
}

/* ============================================================
   5. 근거 문장(support) 발췌 — AI 본문 전용
   ============================================================ */

/**
 * 히어로 근거 자리에 넣을 문장을 **AI 본문에서만** 고른다. 규칙 엔진 폴백 문장은 절대
 * 쓰지 않는다 — 그게 이 함수가 존재하는 이유다.
 *
 * 배경(2026-07-28 사용자 제보): 랜딩 직후 히어로에 "○○에게는 오늘 덥고 습함이에요…"라는
 * 낯선 문장이 잠깐 떴다. AI 리포트가 아니라 규칙 엔진(lib/recommendation-engine.ts)의
 * 폴백 문장이 AI 근거 자리에 대입된 것. 경로는 SSE 스트리밍의 hook→message 구간이다:
 * hook 도착 즉시 `aiLoading=false`가 되어(헤드라인을 빨리 보여주려는 의도) 히어로가
 * 스켈레톤에서 빠져나오는데, 그 시점엔 `aiMessage`가 아직 비어 있어 종전 코드의
 * `aiMessage || message`(= `aiMessage || fallbackMessage`)가 규칙 문장으로 떨어졌다.
 *
 * 같은 결함을 PR #94(2026-07-15)가 "오늘 챙길 것"에서 이미 고쳤다 —
 * `aiLoading || aiStreaming`으로 게이트해 "규칙 폴백이 잠깐 노출됐다 AI 결과로 바뀌던
 * 잔상"을 없앴다. 그러나 PR #167(Decision Brief 재설계)이 같은 `message`를 읽는 **근거
 * 표면을 새로 만들면서** 그 게이트를 물려주지 않아 같은 구멍이 새 표면에 다시 열렸다.
 * 화면 JSX 안의 인라인 로직이라 유닛 테스트로 잡히지도 않았다(buildAiChecklist와 같은
 * 교훈) — 그래서 순수 함수로 분리해 여기 고정한다.
 *
 * 스트리밍 중(본문 미도착)에는 null이 돌아오고, 화면은 근거 자리에 스켈레톤을 그린다
 * (app/(main)/home/page.tsx). 규칙 폴백 상태(AI 실패)에서도 null이며, 이는 종전 동작과
 * 같다 — 폴백 메시지는 한 줄이라 헤드라인과 같은 문장이 되어 중복 가드에 걸렸었다.
 */
export function pickSupportLine(input: {
  /** AI 본문. 스트리밍 중이거나 폴백이면 빈 문자열 */
  aiMessage: string;
  childName: string;
  /** AI hook에서 뽑은 헤드라인이 있는지 — 없으면 본문 첫 줄이 헤드라인 자리로 승격된다 */
  hasHeadline: boolean;
  /** 헤드라인으로 쓰이는 본문 첫 줄(마크다운 제거본). 중복 판정에만 쓴다 */
  firstPlainLine?: string | null;
}): string | null {
  const { aiMessage, childName, hasHeadline, firstPlainLine = null } = input;
  const lines = aiMessage
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  // 프롬프트 계약상 아이 이름은 문장2(= 이 아이의 근거)에만 들어간다(lib/prompts/report.ts).
  // 이름 줄이 없으면 둘째 줄로 폴백한다 — 첫 줄은 이슈 서술이라 근거가 아니다.
  const line = lines.find((l) => l.includes(childName)) ?? lines[1] ?? null;
  // hook이 없으면 헤드라인이 본문 첫 줄을 그대로 쓴다 — 같은 문장이 근거 자리에 또 나오면
  // 제목·본문이 중복된다. 마크다운 표기만 다른 동일 문장이면 숨긴다.
  if (line && !hasHeadline && line.replace(/\*\*|__/g, "").trim() === (firstPlainLine ?? ""))
    return null;
  return line;
}
