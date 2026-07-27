import { canonicalPrep } from "./prep-vocab";

/**
 * AI 리포트 준비물 런타임 새니타이저 — 실사용 출력 정합성의 결정적(deterministic) 강제.
 *
 * 배경: PR #131(2026-07-20)이 마스크 규칙·prep⊆checklist·hook⊆checklist 등 정합성 규칙을
 * 세웠지만, 그 강제는 ①프롬프트(확률적 지시)와 ②오프라인 eval(scripts/eval-report.mjs,
 * 12 시나리오, dev 전용)에만 있었다. 실사용자의 /api/report 응답 경로엔 런타임 가드가
 * 없어서, 12 시나리오 밖 입력(여름 습도 93%·비염/천식·미세먼지 좋음)에서 모델이 규칙을
 * 어기면(눅눅한 공기→마스크) 그대로 화면·캐시로 샜다. 이 모듈이 그 빠진 런타임 층이다.
 *
 * 강제 대상: 구조 필드(checklist·prep)는 항목 단위로, 본문(hook·message)은 문장(줄)
 * 단위로 강제한다. 자유 문장은 재작성이 불가능하지만 제거는 결정적으로 가능하다 —
 * 2026-07-27 실사용 사고에서 히어로 support(=message 둘째 줄)에 "마스크를 씌우면 오히려
 * 열과 습기가 …" 부정 언급이 노출됐다(폭염·습도 70%·미세먼지 좋음). 원인은 few-shot
 * 예시가 같은 조합에서 마스크 부정 문장을 시연한 것. 프롬프트는 고쳤지만 확률적이므로,
 * 근거 없는 마스크 언급 줄은 여기서 결정적으로 걷어낸다.
 *
 * 네 가지 규칙:
 *  ① 마스크 정책(checklist·prep) — 규칙 엔진(lib/prep.ts)·프롬프트와 같은 정책.
 *     · 근거(미세먼지 나쁨/꽃가루 높음) 없음 → 제거(위험 없음, 습도·더위는 마스크 사유 아님)
 *     · 근거 있으나 만 2세 미만 → "실내놀이"로 대체(질식 위험, 경고는 유지)
 *  ② 마스크 본문 언급 게이트(hook·message) — 근거가 없으면 부정·안심 형태의 언급도 금지.
 *     · message: \n 구분 3문장 계약을 이용해 마스크 포함 줄만 제거. 홈 supportLine은 이름
 *       줄이 사라지면 다음 줄로 폴백한다(app/(main)/home/page.tsx).
 *     · hook: 한 줄이라 부분 제거가 불가능 → 통째로 비운다. 홈 히어로는 hook이 비면
 *       message 첫 줄을 헤드라인으로 쓴다.
 *     · 근거가 있으면 영아여도 언급은 허용 — "쓰기 어려운 나이라" 설명은 정당한 문장이다.
 *  ③ 본문 스타일 게이트 — 메타 비교 부가어("자체보다") 제거 + hook 행동을 되풀이하는
 *     message 줄 절삭(히어로가 hook과 message를 한 카드에 렌더하므로 반복=같은 말 두 번).
 *  ④ prep ⊆ checklist — 케어 플랜 칩(prep)이 "오늘 챙길 것"(checklist)에 없는 아이템을
 *     내보내면 화면이 자기모순된다. checklist를 진실원으로 삼아 어긋난 칩을 제거한다(#131 R4).
 */

export type ReportPayload = {
  hook: string;
  message: string;
  checklist: string[];
  prep: Record<string, string[]>;
};

/**
 * 마스크 근거 게이트 — 미세먼지 나쁨(등급 3·4) 이상 또는 꽃가루 높음(지수 2·3) 이상일 때만 true.
 * lib/prep.ts의 dustBad·pollenHigh, 프롬프트 마스크 규칙과 같은 임계값.
 * 데이터 결측(등급 null)은 근거로 삼지 않는다 — 모르는 것을 정당화 근거로 쓰지 않는다.
 */
export function isMaskJustified(env: {
  pm10Grade: number | null;
  pm25Grade: number | null;
  khaiGrade: number | null;
  /** 참나무·소나무·잡초 등 꽃가루 위험지수(0~3) 목록. 최댓값 기준으로 판정. */
  pollenGrades: Array<number | null>;
}): boolean {
  const dustBad = [env.pm10Grade, env.pm25Grade, env.khaiGrade].some(
    (g) => g != null && g >= 3
  );
  const pollenHigh = env.pollenGrades.some((g) => g != null && g >= 2);
  return dustBad || pollenHigh;
}

// 라우트의 스트리밍 방출 게이트(app/api/report/route.ts)도 같은 패턴을 쓴다.
export const MASK_PATTERN = /마스크/;
// 영아 대체 신호 — 규칙 엔진(lib/prep.ts)·recommendation-engine과 같은 "실내놀이" 어휘.
// checklist는 "이모지 이름" 형식이라 이모지를 붙이고, prep 키워드는 명사만 쓴다.
const INDOOR_CHECKLIST_ITEM = "🧸 실내놀이";
const INDOOR_PREP_KEYWORD = "실내놀이";

/** 체크리스트 항목("😷 마스크")에서 한글 아이템명만 뽑는다. 이모지·기호·숫자는 버린다. */
const itemName = (entry: string): string =>
  entry.replace(/[^가-힣\s]/g, "").replace(/\s+/g, " ").trim();

// ── 본문 스타일 게이트 유틸 (2026-07-27 사용자 지적 2건의 결정적 강제) ────────
// 프롬프트 규칙·예시로도 확률적으로 새는 두 구문을 문장 수술로 닫는다. 임계값·정규화는
// scripts/eval-report.mjs·lib/prompts/report.test.ts와 동일(변경 시 함께 갱신).

/**
 * 메타 비교 부가어 제거 — "갈아입히는 게 더위 자체보다 중요해요" → "갈아입히는 게 중요해요".
 * "[명사] 자체보다/자체가 아니라"는 문법상 부가어라 지워도 문장이 성립하는, 안전하게 수술
 * 가능한 유일한 메타 비교 형태다("보다 중요"류 일반형은 수술 불가 — eval이 감시).
 */
export const stripMetaComparison = (text: string): string =>
  text.replace(/[가-힣0-9·%°C]{1,8} ?자체(보다|가 아니라) ?(더 )?/g, "").replace(/ {2,}/g, " ");

const dupNorm = (t: string): string =>
  t.replace(/\*\*|__/g, "").replace(/'[^']*'|‘[^’]*’/g, "").replace(/[\s,.'"“”‘’()!?~·—–-]/g, "");
const dupBigrams = (t: string): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
};

/**
 * hook 행동절 반복 판정 — 정규화(볼드·부호·알림장 인용 제거) 후 문자 bigram containment
 * |행동∩텍스트|/|행동| ≥ 0.7. 누적 산출물 978줄 소급 캘리브레이션(오탐 0). 행동절이 짧으면
 * (<8 bigram) 판정 불가로 false.
 */
export const echoesHookAction = (hookAction: string, text: string): boolean => {
  const act = dupBigrams(dupNorm(hookAction));
  if (act.size < 8) return false;
  const body = dupBigrams(dupNorm(text));
  let hit = 0;
  for (const g of act) if (body.has(g)) hit++;
  return hit / act.size >= 0.7;
};

/** hook에서 행동절만 — lib/hero-brief.ts splitHook과 같은 1차 구분자(대시). */
const hookActionOf = (hook: string): string => {
  const parts = hook.split(/\s+[—–-]\s+/, 2);
  return parts.length === 2 ? parts[1] : hook;
};

/**
 * 본문 스타일 게이트 — hook·message에 두 수술을 적용한 결과와 수행 내역을 돌려준다.
 *  · 메타 비교 부가어("자체보다") 제거
 *  · hook 행동을 되풀이하는 message 줄: 첫 쉼표 뒤 꼬리절이 반복 없이 성립하면 꼬리절만
 *    남기고("…실내 놀이로 바꾸고, 정 나가야 하면 짧게만" → 뒷절), 아니면 줄 제거(남는 줄이
 *    있을 때만 — 본문 전체를 비우지 않는다).
 * 스트리밍 조기 방출 게이트(route.ts)가 드라이런으로도 쓰므로 순수 함수로 둔다.
 */
export const applyTextStyleGates = (
  hook: string,
  message: string
): { hook: string; message: string; actions: string[] } => {
  const actions: string[] = [];
  let outHook = stripMetaComparison(hook);
  if (outHook !== hook) actions.push("meta-comparison:hook");
  let outMessage = stripMetaComparison(message);
  if (outMessage !== message) actions.push("meta-comparison:message");

  const act = hookActionOf(outHook);
  const lines = outMessage.split("\n");
  const gated: string[] = [];
  for (const line of lines) {
    if (!echoesHookAction(act, line)) {
      gated.push(line);
      continue;
    }
    const comma = line.indexOf(", ");
    const tail = comma > 0 ? line.slice(comma + 2).trim() : "";
    if (tail.length >= 12 && !echoesHookAction(act, tail)) {
      gated.push(tail);
      actions.push("hook-echo:clause-trimmed");
    } else if (lines.length > 1) {
      actions.push("hook-echo:line-dropped");
      // 줄 제거 — gated에 넣지 않는다
    } else {
      gated.push(line); // 유일한 줄이면 유지(빈 본문 방지) — 관측만
      actions.push("hook-echo:kept-sole-line");
    }
  }
  const joined = gated.filter((l) => l.trim()).length > 0 ? gated.join("\n") : outMessage;
  return { hook: outHook, message: joined, actions };
};

export type SanitizeOutcome = {
  payload: ReportPayload;
  /** 마스크에 일어난 일(checklist·prep) — 관측 로그용. */
  maskAction: "none" | "removed" | "downgraded";
  /** 근거 없는 마스크 언급으로 제거된 본문 표면 — 관측 로그용. */
  maskTextDropped: Array<"hook" | "message-line">;
  /** 본문 스타일 게이트 수행 내역(메타 비교 제거·hook 반복 절삭) — 관측 로그용. */
  styleTextActions: string[];
  /** prep⊆checklist로 떨어진 "슬롯:키워드" 라벨 — 관측 로그용. */
  droppedPrep: string[];
};

/**
 * 출력 정합성 정책(마스크·본문 스타일·prep⊆checklist)을 AI 출력에 결정적으로 적용한다.
 */
export function sanitizeReportPayload(
  payload: ReportPayload,
  opts: { maskJustified: boolean; maskAllowedForAge: boolean }
): SanitizeOutcome {
  const { maskJustified, maskAllowedForAge } = opts;
  const maskOk = maskJustified && maskAllowedForAge;

  // ── ① 마스크 정책 (checklist·prep) ──────────────────────────
  let maskSeen = false;
  const applyMask = (items: string[], indoor: string): string[] => {
    const out: string[] = [];
    for (const item of items) {
      if (!MASK_PATTERN.test(item)) {
        out.push(item);
      } else {
        maskSeen = true;
        if (maskOk) out.push(item); // 근거 O + 나이 O → 유지
        else if (maskJustified) out.push(indoor); // 근거 O + 영아 → 실내놀이 대체
        // 근거 X → 제거(아무것도 넣지 않음)
      }
    }
    return [...new Set(out)]; // 대체로 생긴 중복 제거(삽입 순서 유지)
  };
  let checklist = applyMask(payload.checklist, INDOOR_CHECKLIST_ITEM);
  const afterMaskPrep: Record<string, string[]> = {};
  for (const [slot, items] of Object.entries(payload.prep)) {
    const kept = applyMask(Array.isArray(items) ? items : [], INDOOR_PREP_KEYWORD);
    if (kept.length > 0) afterMaskPrep[slot] = kept;
  }
  const maskAction: SanitizeOutcome["maskAction"] =
    !maskSeen || maskOk ? "none" : maskJustified ? "downgraded" : "removed";

  // ── ② 마스크 본문 언급 게이트 (hook·message) ─────────────────
  // 근거가 없으면 "마스크는 필요 없어요" 같은 부정·안심 언급도 화면에서 걷어낸다.
  // 나이 게이트는 여기 적용하지 않는다 — 근거 있는 날의 영아 설명(예시 5)은 정당하다.
  const maskTextDropped: SanitizeOutcome["maskTextDropped"] = [];
  let hook = payload.hook;
  let message = payload.message;
  if (!maskJustified) {
    if (MASK_PATTERN.test(hook)) {
      hook = "";
      maskTextDropped.push("hook");
    }
    if (MASK_PATTERN.test(message)) {
      const lines = message.split("\n");
      const kept = lines.filter((l) => !MASK_PATTERN.test(l));
      // 전 줄이 마스크 언급이면(파싱 이상 등 비정상) 빈 본문 대신 원문을 유지하고 관측만
      // 남긴다 — 카드 본문이 통째로 사라지는 것이 더 큰 결함이다.
      if (kept.some((l) => l.trim())) {
        message = kept.join("\n");
        maskTextDropped.push("message-line");
      }
    }
  }

  // ── ③ 본문 스타일 게이트 (메타 비교·hook 반복) ────────────────
  // 프롬프트 규칙·예시(v30)로도 확률적으로 남는 두 구문을 결정적으로 수술한다.
  const styleGate = applyTextStyleGates(hook, message);
  hook = styleGate.hook;
  message = styleGate.message;
  const styleTextActions = styleGate.actions;

  // ── ④ prep ⊆ checklist ─────────────────────────────────────
  // checklist(진실원)에 없는 준비물 칩을 제거한다. 어휘 별칭은 canonicalPrep으로 흡수해
  // "자외선차단제"(checklist) ↔ "선크림"(prep)이 어긋나 보이지 않게 양쪽을 표준화 비교.
  // checklist가 비면(모델 파싱 실패 등) prep을 통째로 지우지 않는다 — 과삭제 방지.
  const droppedPrep: string[] = [];
  let prep = afterMaskPrep;
  if (checklist.length > 0) {
    const checklistCanon = new Set(
      checklist.map((c) => canonicalPrep(itemName(c))).filter(Boolean)
    );
    const filtered: Record<string, string[]> = {};
    for (const [slot, items] of Object.entries(afterMaskPrep)) {
      const kept = items.filter((kw) => {
        const inList = checklistCanon.has(canonicalPrep(kw));
        if (!inList) droppedPrep.push(`${slot}:${kw}`);
        return inList;
      });
      if (kept.length > 0) filtered[slot] = kept;
    }
    prep = filtered;
  }

  return { payload: { ...payload, hook, message, checklist, prep }, maskAction, maskTextDropped, styleTextActions, droppedPrep };
}
