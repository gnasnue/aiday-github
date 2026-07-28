// 아침 체크리스트 상태의 당일 영속화 — 저녁 "오늘의 마무리"가 프리필에 쓴다.
//
// 왜 필요한가: 홈의 체크 상태는 React state뿐이라 프로필을 바꾸거나 화면을 벗어나면
// 사라진다. 분석 이벤트(`checklist_toggled`)는 append-only라 클라이언트가 다시 읽을 수
// 없다. 그래서 저녁에 "오늘 뭘 실제로 챙겼는지"를 복원할 방법이 없었고, 부모에게 다시
// 물어야 했다 — 아침에 이미 답한 것을.
//
// 이 모듈이 있으면 저녁 질문이 "무엇을 챙겼나요?"(기록)가 아니라 "이렇게 보낸 게
// 맞나요?"(확인)가 된다. 서버 영속화(daily_action_states)는 P1 — P0는 마이그레이션 0.

import { localDateStr } from "@/lib/date";

const key = (childId: string, date = localDateStr()) =>
  `aiday:checked:${childId}:${date}`;

/** 오늘 체크한 준비물 key 목록 (없으면 빈 배열) */
export const loadCheckedKeys = (childId: string, date = localDateStr()): string[] => {
  try {
    const raw = localStorage.getItem(key(childId, date));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

/** 체크 상태 저장 — 저장 실패(시크릿 모드 등)는 조용히 무시한다(체크 자체는 계속 동작). */
export const saveCheckedKeys = (childId: string, keys: string[]): void => {
  try {
    localStorage.setItem(key(childId), JSON.stringify(keys));
  } catch {
    // 저장 불가여도 화면 동작은 막지 않는다 — 프리필만 못 할 뿐
  }
};
