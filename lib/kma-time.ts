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

// 단기예보(getVilageFcst) 발표 시각(KST): 02·05·08·11·14·17·20·23시.
export const FCST_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23] as const;

/**
 * 주어진 발표본(base_date·base_time)을 최신으로 하여, 과거 발표본을 최신→과거 순으로 count개 반환한다.
 * (자기 자신이 첫 원소.) 최신 발표본이 NO_DATA·장애로 비었을 때 직전 발표본으로 폴백하기 위한 후보 목록.
 * 발표 목록의 앞을 넘어가면 전날 마지막 발표본(2300)으로 이어진다. Date.now() 미사용(순수 함수).
 */
export function recentFcstBases(
  baseDate: string,
  baseTime: string,
  count: number
): { base_date: string; base_time: string }[] {
  let idx = FCST_BASE_HOURS.indexOf(parseInt(baseTime.slice(0, 2), 10) as (typeof FCST_BASE_HOURS)[number]);
  if (idx < 0) idx = FCST_BASE_HOURS.length - 1;
  let y = parseInt(baseDate.slice(0, 4), 10);
  let mo = parseInt(baseDate.slice(4, 6), 10) - 1;
  let d = parseInt(baseDate.slice(6, 8), 10);
  const out: { base_date: string; base_time: string }[] = [];
  for (let k = 0; k < count; k++) {
    out.push({
      base_date: ymd(new Date(Date.UTC(y, mo, d))),
      base_time: String(FCST_BASE_HOURS[idx]).padStart(2, "0") + "00",
    });
    idx--;
    if (idx < 0) {
      idx = FCST_BASE_HOURS.length - 1;
      const prev = new Date(Date.UTC(y, mo, d - 1));
      y = prev.getUTCFullYear();
      mo = prev.getUTCMonth();
      d = prev.getUTCDate();
    }
  }
  return out;
}
