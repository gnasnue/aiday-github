/**
 * 기상청 API 시각 계산 공용 헬퍼.
 * 프로젝트 관례: KST 벽시계로 보정한 Date를 UTC 게터로 읽는다.
 *
 * 주의: scripts/verify-env-accuracy.mjs 의 fetchKmaObs가 같은 규칙을
 * 독립 구현한다(.mjs라 TS import 불가). 발표 시각 규칙이 바뀌면 두 곳을 함께 수정할 것.
 */

export const kstNow = (): Date => new Date(Date.now() + 9 * 60 * 60 * 1000);

export const ymd = (d: Date): string =>
  String(d.getUTCFullYear()) +
  String(d.getUTCMonth() + 1).padStart(2, "0") +
  String(d.getUTCDate()).padStart(2, "0");

// 초단기실황(관측값) 발표 기준: 매시 정각 생산, 약 10분 후 제공 → 15분 여유.
// 정각~14분 사이엔 직전 시각 발표본으로 롤백한다(자정 경계 포함 — setUTCHours가 날짜를 넘긴다).
export function getNcstBaseDateTime(now: Date = kstNow()): {
  base_date: string;
  base_time: string;
} {
  const kst = new Date(now.getTime());
  if (kst.getUTCMinutes() < 15) kst.setUTCHours(kst.getUTCHours() - 1);
  return { base_date: ymd(kst), base_time: String(kst.getUTCHours()).padStart(2, "0") + "00" };
}
