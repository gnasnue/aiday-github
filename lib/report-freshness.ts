/**
 * AI 리포트 데이터 세대(잠정/완성) 판정.
 *
 * 리포트 재료가 모두 "오늘 것"이 되는 경계는 06시다:
 *  - 기상청 단기예보 당일 첫 발표본: 02시 (그 전엔 전날 23시 발표본)
 *  - 기상청 생활기상지수(자외선) 당일분 발행: 06시 (그 전엔 전날 발표본 fallback)
 * 따라서 자정~06시에 생성된 리포트는 전날 밤 예보 기준의 "잠정본"이고,
 * 06시 이후 첫 방문에서 당일 발표본으로 조용히 재생성한다.
 *
 * 시각 기준은 기기 로컬 — 리포트 당일 캐시 키(localDateStr)와 같은 규칙을 쓴다.
 * freemium 선제 알림의 두 시점(전날 밤 예고편 / 등원 전 확정판)도 이 경계를 공유한다
 * (docs/PRODUCT-DECISIONS.md §3-7).
 */

export const REPORT_COMPLETE_HOUR = 6;

/** 생성 시각(epoch ms)이 새벽(00~06시)이면 잠정본 — 전날 밤 발표본 재료로 만든 리포트 */
export const isProvisionalReport = (ts: number): boolean =>
  new Date(ts).getHours() < REPORT_COMPLETE_HOUR;

/**
 * 잠정본을 당일 발표본으로 교체해야 하는가.
 * 같은 날 06시 이후에 다시 봤을 때만 true — 캐시 키가 이미 날짜별이라 날짜 비교는
 * 이중 안전장치다(기기 시계 이동 등 경계 사례에서 어제 잠정본을 오늘 재생성 근거로 삼지 않게).
 */
export const needsMorningRefresh = (ts: number, now: Date = new Date()): boolean => {
  if (!isProvisionalReport(ts)) return false;
  if (now.getHours() < REPORT_COMPLETE_HOUR) return false;
  const gen = new Date(ts);
  return (
    gen.getFullYear() === now.getFullYear() &&
    gen.getMonth() === now.getMonth() &&
    gen.getDate() === now.getDate()
  );
};
