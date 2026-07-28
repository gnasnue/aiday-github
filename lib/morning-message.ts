// 기관에 보낼 아침 메시지 — 부모가 알림장에 그대로 붙여넣는 한 통.
//
// 왜 만드나 (승인 설계안 2026-07-29, Approach C):
//   부모는 매일 아침 기관·시터에게 아이 정보를 손으로 써 보낸다(알림장 작성 노동).
//   AiDay는 이미 그날의 판단(hook·준비물·오늘 부탁)을 다 갖고 있는데 그 채널로 흘려보내지
//   않아서 부모가 두 번 일한다. 이 모듈은 **이미 만들어진 판단을 알림장 문체로 재조립**한다.
//
// 설계 원칙:
//   - **LLM을 쓰지 않는다.** 전부 규칙 조립이다. 새 생성은 새 검증(eval)·새 비용·새 지연을
//     부르는데, 여기서 필요한 건 "이미 정해진 결론을 존댓말로 옮기기"뿐이다.
//   - **없는 정보를 지어내지 않는다.** handoff(오늘 부탁)가 없는 날은 그 문단을 빼고,
//     리포트가 아예 없으면 메시지를 만들지 않는다(null).
//   - 어휘 가드 상속: 입력이 이미 새니타이즈된 리포트·케어플랜 산출물이므로 여기서
//     질병명·진단 표현을 새로 만들지 않는다. 받는 사람이 교사이므로 요청은 청유형으로만.
//
// 문체 결정(P0): **알림장 댓글체** — 인사 + 오늘 조건 + 부탁 + 챙긴 준비물 + 맺음말.
// 투약의뢰서 같은 양식체가 아니다(설계안 Open Q2 — 실제 입력란 확인 후 재검 예정).

import { canonicalPrepList } from "./prep-vocab";
import { hasJongseong } from "./korean";

export type MorningMessageInput = {
  childName: string;
  /** AI hook 원문 ("낮 34도 고습 — 놀이 뒤 여벌 상의로 갈아입혀 주세요") */
  hook: string;
  /** 오늘 챙길 것 표준명 목록 (히어로 체크리스트와 같은 소스) */
  preps: string[];
  /** 케어 플랜의 돌봄자 전달 문구. 없는 날은 null — 그 문단을 만들지 않는다 */
  handoff?: string | null;
  /** 어린이집·유치원 재원 추정. 호칭을 "선생님" / "돌봄 선생님"으로 가른다 */
  atDaycare?: boolean;
};

/** 조립 결과. `body`가 복사 대상이고 `lines`는 미리보기 렌더용 단락 배열이다. */
export type MorningMessage = {
  lines: string[];
  body: string;
};

/** 준비물 목록을 "A와 B" / "A, B, C" 로 잇는다 (조사는 받침을 따른다) */
const joinPreps = (names: string[]): string => {
  if (names.length === 1) return names[0];
  if (names.length === 2) {
    return `${names[0]}${hasJongseong(names[0]) ? "과" : "와"} ${names[1]}`;
  }
  const head = names.slice(0, -1).join(", ");
  const last = names[names.length - 1];
  return `${head}, ${last}`;
};

/**
 * hook의 조건절만 뽑아 "오늘 ~한 날씨예요" 문장을 만든다.
 *
 * 조건절을 쓰는 이유: 결론절("여벌 상의로 갈아입혀 주세요")은 아래 부탁 문단이 이미
 * 담당하므로 여기서 반복하면 같은 말을 두 번 한다. `toBrief`를 쓰지 않고 자체 분리하는
 * 것은 이 모듈이 히어로 렌더 계약(pill/headline)에 묶이지 않게 하기 위함이다.
 */
const conditionSentence = (hook: string): string | null => {
  const dash = hook.match(/\s+[—–-]\s+/);
  const raw = dash && dash.index != null ? hook.slice(0, dash.index) : null;
  const cond = raw?.replace(/[,，·—–-]\s*$/, "").trim();
  if (!cond) return null;
  // 조사를 조건절에 **직접 붙이지 않는다.** 조건절은 AI가 만든 자유 문구라 끝 문자가
  // 한글 받침(미세먼지 나쁨)·숫자·기호(습도 75%) 어느 쪽이든 올 수 있고, 받침 판정으로는
  // 기호·숫자를 가릴 수 없다("75%이라고 해요"처럼 깨진다 — 2026-07-29 실측에서 발견).
  // 고정 명사 "예보"를 사이에 두면 어떤 조건절에도 문법이 성립한다.
  return `오늘은 ${cond} 예보예요.`;
};

/**
 * 알림장에 붙여넣을 메시지를 만든다. 재료가 없으면(hook·준비물·부탁 전부 없음) null.
 *
 * 문단 순서는 받는 사람이 읽는 순서다: 누가 → 오늘 어떤 날 → 무엇을 부탁 → 무엇을 챙겼는지.
 */
export function buildMorningMessage(input: MorningMessageInput): MorningMessage | null {
  const name = input.childName.trim();
  const preps = canonicalPrepList(input.preps.map((p) => p.trim()).filter(Boolean));
  const handoff = input.handoff?.trim() || null;
  const condition = conditionSentence(input.hook ?? "");

  // 본문이 될 재료가 하나도 없으면 만들지 않는다 — 인사말만 있는 메시지는 노동을 줄이지 않는다.
  if (!condition && !handoff && preps.length === 0) return null;

  const teacher = input.atDaycare ? "선생님" : "돌봄 선생님";
  const lines: string[] = [`안녕하세요, ${name} 보호자입니다.`];

  if (condition) lines.push(condition);
  // 부탁 문구는 케어 플랜이 이미 돌봄자 화법으로 만들어 둔 문장이라 그대로 싣는다.
  if (handoff) lines.push(handoff);

  if (preps.length > 0) {
    lines.push(`가방에는 ${joinPreps(preps)}${hasJongseong(preps[preps.length - 1]) ? "을" : "를"} 챙겼어요.`);
  }

  lines.push(`${teacher}, 오늘도 잘 부탁드립니다.`);

  return { lines, body: lines.join("\n") };
}
