/**
 * 기상청(KMA) 단기예보 값 검증·시간대별 슬롯 구성.
 *
 * 값 검증: KMA는 결측을 ±900대 센티널(-998/-999 등)로 표기한다 — 범위 밖은 결측 처리해
 * 센티널이 실측인 척 화면과 검증 스크립트에 흘러가지 않게 한다.
 */

export type FcstItem = {
  category: string;
  fcstValue: string;
  fcstDate: string;
  fcstTime: string;
};

export type HourlyForecastSlot = {
  hour: string;
  temp: number;
  sky: number | null;
  pty: number | null;
  humidity: number | null;
  windSpeed: number | null;
  pop: number | null;
};

/**
 * 카테고리별 유효 범위. 현재값 스칼라와 시간대별 배열이 같은 표를 참조해
 * 한쪽만 검증이 빠지거나 임계값이 어긋나는 일이 없게 한다.
 * PTY_OBS는 실황 전용(5=빗방울 6=빗방울눈날림 7=눈날림) — 예보 PTY는 0~4.
 */
export const KMA_RANGE = {
  TMP: [-50, 50],
  SKY: [1, 4],
  PTY: [0, 4],
  PTY_OBS: [0, 7],
  REH: [0, 100],
  WSD: [0, 70],
  POP: [0, 100],
} as const;

/** 값 검증 — 결측·비수치·범위 밖(센티널)은 null */
export function kmaNum(
  v: string | undefined,
  [min, max]: readonly [number, number]
): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) || n < min || n > max ? null : n;
}

/** 시간대별 예보 슬롯: 3시간 간격 06~21시 */
export const HOUR_SLOTS = ["0600", "0900", "1200", "1500", "1800", "2100"];

/**
 * 하루치 시간대별 예보를 구성한다.
 *
 * @param items 최신 발표본 항목
 * @param fillItems 당일 0200 발표본 항목 — 최신 발표본에서 빠진 지나간 시각을 채운다
 * @param dateStr 대상 날짜 "YYYYMMDD"
 */
export function buildHourlyForecast(
  items: FcstItem[],
  fillItems: FcstItem[],
  dateStr: string
): HourlyForecastSlot[] {
  const slots: HourlyForecastSlot[] = [];
  for (const slot of HOUR_SLOTS) {
    const d: Record<string, string> = {};
    for (const item of items) {
      if (item.fcstDate === dateStr && item.fcstTime === slot) d[item.category] = item.fcstValue;
    }
    // 최신 발표본에 없거나 센티널인 지나간 시각은 당일 0200 발표본 값으로 채운다
    if (kmaNum(d["TMP"], KMA_RANGE.TMP) == null) {
      for (const item of fillItems) {
        if (item.fcstDate === dateStr && item.fcstTime === slot) d[item.category] = item.fcstValue;
      }
    }
    const temp = kmaNum(d["TMP"], KMA_RANGE.TMP);
    // 기온이 결측이면 슬롯 자체를 뺀다 — 소비처(buildTimeline·리포트 프롬프트·홈 환경 시그니처)가
    // temp를 non-null number로 다뤄, null이나 센티널을 실으면 "-999°C"가 그대로 화면에 뜬다.
    // 나머지 필드는 null을 허용하므로(소비처가 결측을 처리) 슬롯을 유지한다.
    if (temp == null) continue;
    slots.push({
      hour: slot.slice(0, 2) + ":" + slot.slice(2),
      temp,
      sky: kmaNum(d["SKY"], KMA_RANGE.SKY),
      pty: kmaNum(d["PTY"], KMA_RANGE.PTY),
      humidity: kmaNum(d["REH"], KMA_RANGE.REH),
      windSpeed: kmaNum(d["WSD"], KMA_RANGE.WSD),
      pop: kmaNum(d["POP"], KMA_RANGE.POP),
    });
  }
  return slots;
}
