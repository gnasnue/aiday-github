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
 * 강제 대상은 "구조 필드"(checklist·prep) — 부모가 실제로 체크하는 표면이라 결정적으로
 * 보장한다. 본문(hook·message)은 자유 문장이라 재생성 없이 결정적 재작성이 불가능하므로
 * 프롬프트(lib/prompts/report.ts)가 담당하고, 여기서는 관측용 신호만 돌려준다.
 *
 * 두 가지 규칙:
 *  ① 마스크 정책 — 규칙 엔진(lib/prep.ts)·프롬프트와 같은 정책.
 *     · 근거(미세먼지 나쁨/꽃가루 높음) 없음 → 제거(위험 없음, 습도·더위는 마스크 사유 아님)
 *     · 근거 있으나 만 2세 미만 → "실내놀이"로 대체(질식 위험, 경고는 유지)
 *  ② prep ⊆ checklist — 케어 플랜 칩(prep)이 "오늘 챙길 것"(checklist)에 없는 아이템을
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

const MASK_PATTERN = /마스크/;
// 영아 대체 신호 — 규칙 엔진(lib/prep.ts)·recommendation-engine과 같은 "실내놀이" 어휘.
// checklist는 "이모지 이름" 형식이라 이모지를 붙이고, prep 키워드는 명사만 쓴다.
const INDOOR_CHECKLIST_ITEM = "🧸 실내놀이";
const INDOOR_PREP_KEYWORD = "실내놀이";

/** 체크리스트 항목("😷 마스크")에서 한글 아이템명만 뽑는다. 이모지·기호·숫자는 버린다. */
const itemName = (entry: string): string =>
  entry.replace(/[^가-힣\s]/g, "").replace(/\s+/g, " ").trim();

export type SanitizeOutcome = {
  payload: ReportPayload;
  /** 마스크에 일어난 일 — 관측 로그용. */
  maskAction: "none" | "removed" | "downgraded";
  /** prep⊆checklist로 떨어진 "슬롯:키워드" 라벨 — 관측 로그용. */
  droppedPrep: string[];
};

/**
 * 준비물 정합성 정책을 AI 출력에 결정적으로 적용한다. hook·message는 건드리지 않는다.
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

  // ── ② prep ⊆ checklist ─────────────────────────────────────
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

  return { payload: { ...payload, checklist, prep }, maskAction, droppedPrep };
}
