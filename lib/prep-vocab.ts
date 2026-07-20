// 준비물 어휘 단일 소스 — 표준명과 별칭 매핑.
//
// 같은 물건이 화면에서 이름이 갈리는 문제(R2)의 해결책: 준비물 이름을 쓰는 모든
// 레이어(AI 출력 표시, 규칙 엔진 키워드, 칩 긴급 강조 isCriticalPrep, 아이콘 매핑)가
// 표시·판정 전에 canonicalPrep을 거친다. AI는 자유 생성이라 "물통/물병",
// "선크림/자외선차단제"처럼 별칭이 섞여 나오는데, 종전에는 isCriticalPrep의 switch가
// 규칙 어휘만 알아서 AI 칩 "물통"이 폭염에도 강조되지 않는 구멍이 있었다.
//
// 표준명 선정 기준: 부모에게 자연스러운 쪽(육아 맥락 "물통"), AI few-shot·규칙 엔진이
// 공유하는 쪽. 새 준비물을 추가할 때는 여기 별칭부터 등록한다.
const PREP_ALIASES: Record<string, string> = {
  // 수분
  물병: "물통",
  물: "물통",
  // 자외선
  자외선차단제: "선크림",
  썬크림: "선크림",
  선쿠션: "선크림",
  // 실내 대체 (24개월 미만 마스크 금지 시 대체 신호 — AI few-shot 어휘와 정렬)
  "실내 놀이": "실내놀이",
  실내놀이거리: "실내놀이",
  "실내 놀이거리": "실내놀이",
  // 여벌 옷 표기 변형
  여벌옷: "여벌 옷",
  // 겉옷 계열 표기 변형
  얇은겉옷: "얇은 겉옷",
};

/** 준비물 이름 → 표준명. 미등록 이름은 trim만 해서 그대로 통과. */
export const canonicalPrep = (keyword: string): string => {
  const t = keyword.trim();
  return PREP_ALIASES[t] ?? t;
};

/** 목록 정규화 — 표준화 후 중복 제거(별칭이 표준명과 함께 온 경우). */
export const canonicalPrepList = (keywords: string[]): string[] => [
  ...new Set(keywords.map(canonicalPrep)),
];
