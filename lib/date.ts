// 로컬(기기) 기준 YYYY-MM-DD — toISOString()은 UTC 기준이라 KST 자정~09시 사이에
// 어제 날짜가 되어 "당일" 키가 오전 9시에 엉뚱하게 갈리는 문제를 피한다.
// 홈 AI 리포트 당일 캐시 키와 리포트 피드백 1일 1회 키가 같은 구현을 공유한다
// (한쪽만 고치는 회귀 방지 — 2026-07-19 리뷰에서 중복 발견 후 추출).
export const localDateStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
