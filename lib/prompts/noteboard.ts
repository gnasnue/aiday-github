// 알림장 → 저녁 대화 거리 프롬프트.
//
// 이 프롬프트가 하는 일: 교사가 쓴 알림장 한 건에서 **아이에게 그대로 물어볼 수 있는 질문**
// 2~3개를 뽑는다. 요약이 아니다 — 부모는 알림장을 이미 읽었다. 필요한 건 "그래서 저녁에
// 뭐라고 말을 걸까"다.
//
// 어휘 계약 (report.ts v21 원칙 상속 — 지시로 안 잡히는 위반은 입력에서 제거한다):
//   - 진단·질병명 단정 금지. 알림장에 적힌 관찰은 관찰로만 인용한다.
//   - **타 아동 이름 인용 절대 금지.** 클라이언트가 1차로 마스킹하지만(lib/noteboard.ts
//     maskOtherNames) 탐지 실패를 허용하는 간이 규칙이므로, 프롬프트 지시가 2차 방어다.
//   - 부모를 평가하지 않는다("더 관심을 가져주세요" 류 금지).
//   - 아이가 못 한 것을 문제로 지목하지 않는다. 알림장의 부정적 서술은 질문으로 바꿀 때
//     중립·호기심 어휘로만 옮긴다.
//
// few-shot을 두는 이유: 규칙만 주면 모델이 "오늘 뭐가 재미있었어?" 같은 무맥락 질문으로
// 회귀한다. 알림장의 구체 대목을 인용해야 부모가 쓸 수 있다는 걸 예시로 시연한다.
// (report.ts 학습: 예시가 규칙을 어기면 모델은 예시를 따른다 — 예시도 규칙을 지킨다.)

export const NOTEBOARD_SYSTEM_PROMPT = `당신은 아이의 어린이집·유치원 알림장을 읽고, 부모가 저녁에 아이와 나눌 대화 거리를 찾아주는 조력자입니다.

절대 규칙:
1. 알림장에 **실제로 적힌 내용**만 씁니다. 없는 활동·감정·증상을 지어내지 않습니다.
2. 우리 아이 외의 **다른 아이 이름은 어떤 형태로도 출력하지 않습니다**. 이미 "친구"로 바뀌어 있으면 그대로 "친구"라고 씁니다.
3. 질병명·진단 표현을 쓰지 않습니다. 알림장의 관찰은 관찰로만 옮깁니다("콧물이 있었다" ⭕ / "감기에 걸렸다" ❌).
4. 부모를 평가하거나 훈계하지 않습니다.
5. 아이가 못 한 일을 문제로 지목하지 않습니다. 망설임·실패는 시도와 변화의 언어로 옮깁니다.
6. 질문은 부모가 아이에게 **그대로 소리내어 물어볼 수 있는 한 문장**이어야 합니다. 아이 눈높이의 반말로 씁니다.

출력은 아래 JSON만. 설명·코드펜스 없이 JSON 객체 하나만 출력합니다.
{
  "headline": "오늘 하루를 한 줄로 (12~20자, 부모가 보는 제목. 예: '얼음을 처음 만진 날이었어요')",
  "summary": "그 한 줄을 고른 이유 (25~45자, 알림장에서 무엇을 봤는지)",
  "talks": [
    { "question": "아이에게 물어볼 질문 (반말 한 문장, 30자 이내)", "why": "이 질문을 고른 이유 (25~45자, 부모에게 하는 설명)" }
  ],
  "findings": [
    { "kind": "health" 또는 "first", "label": "관찰 어휘 2~8자" }
  ]
}

talks는 2~3개. findings는 해당하는 것이 있을 때만 넣고, 없으면 빈 배열입니다.
- kind "health": 알림장에 컨디션·신체 관찰이 적힌 경우의 관찰 어휘 (예: "콧물", "기침", "식사량", "낮잠").
- kind "first": 아이가 처음 해본 것·새로 해낸 것이 적힌 경우의 활동 이름 (예: "얼음 감각놀이").`;

export type NoteboardPromptInput = {
  childName: string;
  /** 마스킹된 알림장 원문 */
  note: string;
  /** 프롬프트 입력용 체질 문구 (질병명 없는 표현 — conditionsForPrompt 산출물) */
  conditions?: string;
};

const FEW_SHOT = `예시 입력:
아이 이름: 지우
알림장: "오늘은 실내에서 얼음 감각놀이를 했어요. 지우가 처음에는 얼음을 만지기 망설였지만, 친구가 먼저 만지는 걸 보고 용기를 냈어요. 오후에는 콧물이 조금 있어서 자주 닦아주었습니다. 점심은 밥과 된장국을 잘 먹었어요."

예시 출력:
{"headline":"얼음을 처음 만진 날이었어요","summary":"망설였지만 스스로 용기를 낸 순간이 적혀 있어요.","talks":[{"question":"얼음 처음 만졌을 때 어땠어? 많이 차가웠어?","why":"망설였다가 스스로 해낸 순간이라, 아이가 먼저 자랑하고 싶어 해요."},{"question":"누가 먼저 얼음 만졌어? 그거 보고 지우도 해보고 싶었어?","why":"친구를 보고 따라 한 장면이에요. 오늘 누구와 놀았는지로 이어져요."},{"question":"낮에 코 답답했어? 지금은 괜찮아?","why":"오후에 콧물이 있었다고 적혀 있어요. 지금 상태를 확인해 두면 좋아요."}],"findings":[{"kind":"health","label":"콧물"},{"kind":"first","label":"얼음 감각놀이"}]}`;

export function buildNoteboardPrompt(input: NoteboardPromptInput): string {
  const cond =
    input.conditions && input.conditions !== "없음"
      ? `\n아이 체질 참고(질문 어휘를 고를 때만 참고하고, 출력에 체질을 언급하지 마세요): ${input.conditions}`
      : "";
  return `${FEW_SHOT}

이제 아래 알림장으로 같은 형식의 JSON을 만들어 주세요.

아이 이름: ${input.childName}${cond}
알림장: "${input.note}"`;
}

/* ---------- 출력 검증·정제 ---------- */

const MAX_TALKS = 3;
const LABEL_MAX = 12;

/** 진단형 어휘 — 출력에서 발견되면 그 필드를 버린다(지시로 안 잡히는 위반은 제거한다). */
const DIAGNOSIS_RE = /감기|비염|천식|아토피|장염|독감|폐렴|중이염|진단|질환|증후군/;

export type ParsedNoteboard = {
  headline: string;
  summary: string;
  talks: { question: string; why: string }[];
  findings: { kind: "health" | "first"; label: string }[];
};

/**
 * 모델 출력을 검증한다. 형식이 깨졌거나 대화 거리가 하나도 남지 않으면 null —
 * 빈 결과를 성공으로 위장하지 않는다(호출부가 실패 UI를 띄운다).
 *
 * 진단 어휘가 섞인 질문·근거는 **그 항목만 버린다**. 전체를 버리면 알림장 한 줄 때문에
 * 나머지 정상 질문까지 사라진다.
 */
export function parseNoteboardOutput(raw: string): ParsedNoteboard | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const str = (v: unknown, max: number): string =>
    typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";

  const talks = (Array.isArray(o.talks) ? o.talks : [])
    .map((t) => {
      const item = (t ?? {}) as Record<string, unknown>;
      return { question: str(item.question, 80), why: str(item.why, 120) };
    })
    .filter((t) => t.question && !DIAGNOSIS_RE.test(t.question) && !DIAGNOSIS_RE.test(t.why))
    .slice(0, MAX_TALKS);

  if (!talks.length) return null;

  const findings = (Array.isArray(o.findings) ? o.findings : [])
    .map((f) => {
      const item = (f ?? {}) as Record<string, unknown>;
      const kind = item.kind === "health" || item.kind === "first" ? item.kind : null;
      const label = str(item.label, LABEL_MAX);
      return kind && label && !DIAGNOSIS_RE.test(label) ? { kind, label } : null;
    })
    .filter((f): f is { kind: "health" | "first"; label: string } => f !== null)
    .slice(0, 4);

  const headline = str(o.headline, 40);
  const summary = str(o.summary, 100);
  if (DIAGNOSIS_RE.test(headline) || DIAGNOSIS_RE.test(summary)) {
    // 제목·요약이 진단형이면 관찰 중립 문구로 대체한다(항목 삭제 대신 다운그레이드 —
    // 여기가 비면 화면 제목이 사라진다).
    return {
      headline: "오늘 알림장을 읽었어요",
      summary: "선생님이 적어주신 내용에서 대화 거리를 찾았어요.",
      talks,
      findings,
    };
  }
  return {
    headline: headline || "오늘 알림장을 읽었어요",
    summary: summary || "선생님이 적어주신 내용에서 대화 거리를 찾았어요.",
    talks,
    findings,
  };
}
