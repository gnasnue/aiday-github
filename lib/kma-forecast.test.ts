import { describe, it, expect } from "vitest";
import {
  buildHourlyForecast,
  extractFcstItems,
  kmaNum,
  KMA_RANGE,
  type FcstItem,
} from "./kma-forecast";

// KMA는 결측을 ±900대 센티널(-998/-999 등)로 표기한다. 검증 없이 통과시키면
// 홈 시간대 카드에 "-999°C", 리포트 프롬프트에 습도 -999%가 실린다.

const DATE = "20260722";

/** { TMP: "24", REH: "-999" } → 해당 시각 FcstItem 배열 */
const items = (time: string, cats: Record<string, string>, date = DATE): FcstItem[] =>
  Object.entries(cats).map(([category, fcstValue]) => ({
    category,
    fcstValue,
    fcstDate: date,
    fcstTime: time,
  }));

const full = (time: string, over: Record<string, string> = {}, date = DATE) =>
  items(time, { TMP: "24", SKY: "1", PTY: "0", REH: "50", WSD: "2", POP: "10", ...over }, date);

describe("extractFcstItems", () => {
  const item: FcstItem = { category: "TMP", fcstValue: "24", fcstDate: DATE, fcstTime: "1200" };

  it("정상(resultCode 00) 응답에서 item 배열을 뽑는다", () => {
    const json = {
      response: { header: { resultCode: "00" }, body: { items: { item: [item] } } },
    };
    expect(extractFcstItems(json)).toEqual([item]);
  });

  it("NO_DATA(resultCode 03)는 빈 배열 — 성공을 가장한 실패를 데이터로 오인하지 않는다", () => {
    const json = { response: { header: { resultCode: "03", resultMsg: "NO_DATA" }, body: {} } };
    expect(extractFcstItems(json)).toEqual([]);
  });

  it("resultCode 없이 item만 있으면 그대로 통과(일부 응답 형태 호환)", () => {
    const json = { response: { body: { items: { item: [item] } } } };
    expect(extractFcstItems(json)).toEqual([item]);
  });

  it("item이 배열이 아니거나(단일 객체·빈 문자열) 구조가 없으면 빈 배열", () => {
    expect(extractFcstItems({ response: { body: { items: { item: "" } } } })).toEqual([]);
    expect(extractFcstItems({ response: { body: {} } })).toEqual([]);
    expect(extractFcstItems(null)).toEqual([]);
    expect(extractFcstItems(undefined)).toEqual([]);
  });
});

describe("kmaNum", () => {
  it("범위 안의 값만 통과시킨다", () => {
    expect(kmaNum("24", KMA_RANGE.TMP)).toBe(24);
    expect(kmaNum("0", KMA_RANGE.POP)).toBe(0); // 0은 결측이 아니다
    expect(kmaNum("-999", KMA_RANGE.TMP)).toBeNull();
    expect(kmaNum("-998", KMA_RANGE.REH)).toBeNull();
    expect(kmaNum("900", KMA_RANGE.WSD)).toBeNull();
    expect(kmaNum("", KMA_RANGE.TMP)).toBeNull();
    expect(kmaNum(undefined, KMA_RANGE.TMP)).toBeNull();
    expect(kmaNum("강수없음", KMA_RANGE.POP)).toBeNull();
  });
});

describe("buildHourlyForecast", () => {
  it("정상 응답은 6슬롯을 그대로 만든다", () => {
    const src = ["0600", "0900", "1200", "1500", "1800", "2100"].flatMap((t) => full(t));
    const out = buildHourlyForecast(src, [], DATE);
    expect(out.map((s) => s.hour)).toEqual([
      "06:00",
      "09:00",
      "12:00",
      "15:00",
      "18:00",
      "21:00",
    ]);
    expect(out[0]).toEqual({
      hour: "06:00",
      temp: 24,
      sky: 1,
      pty: 0,
      humidity: 50,
      windSpeed: 2,
      pop: 10,
    });
  });

  it("센티널 보조 필드는 null로 떨어지고 슬롯은 유지된다", () => {
    const src = full("0900", { REH: "-999", WSD: "-998", POP: "-999", SKY: "-999", PTY: "-999" });
    const [slot] = buildHourlyForecast(src, [], DATE);
    expect(slot.temp).toBe(24);
    expect(slot.humidity).toBeNull();
    expect(slot.windSpeed).toBeNull();
    expect(slot.pop).toBeNull();
    expect(slot.sky).toBeNull();
    expect(slot.pty).toBeNull();
  });

  it("센티널 기온 슬롯은 제외한다 (소비처가 temp를 non-null로 다룬다)", () => {
    const src = [...full("0600", { TMP: "-999" }), ...full("0900")];
    const out = buildHourlyForecast(src, [], DATE);
    expect(out.map((s) => s.hour)).toEqual(["09:00"]);
    expect(out.every((s) => s.temp > -50 && s.temp < 50)).toBe(true);
  });

  it("센티널 기온은 0200 발표본으로 채운다", () => {
    const src = full("0600", { TMP: "-999" });
    const fill = full("0600", { TMP: "18", REH: "70" });
    const [slot] = buildHourlyForecast(src, fill, DATE);
    expect(slot.temp).toBe(18);
    expect(slot.humidity).toBe(70);
  });

  it("0200 발표본까지 센티널이면 슬롯을 버린다", () => {
    const src = full("0600", { TMP: "-999" });
    const fill = full("0600", { TMP: "-998" });
    expect(buildHourlyForecast(src, fill, DATE)).toEqual([]);
  });

  it("다른 날짜 항목은 섞이지 않는다", () => {
    const src = full("0600", {}).map((it) => ({ ...it, fcstDate: "20260723" }));
    expect(buildHourlyForecast(src, [], DATE)).toEqual([]);
  });

  // 단기예보 발표본은 +3일치를 담고 있어, 같은 items에서 날짜만 바꿔 내일분을 뽑는다
  // (홈 "오늘|내일" 세그먼트 — buildTomorrowTimeline 입력).
  it("같은 발표본에서 날짜별로 오늘·내일을 분리해 뽑는다", () => {
    const TOMORROW = "20260723";
    const src = [
      ...full("0900", { TMP: "26" }),
      ...full("0900", { TMP: "31", POP: "80" }, TOMORROW),
    ];
    const today = buildHourlyForecast(src, [], DATE);
    const tomorrow = buildHourlyForecast(src, [], TOMORROW);
    expect(today).toHaveLength(1);
    expect(today[0].temp).toBe(26);
    expect(today[0].pop).toBe(10);
    expect(tomorrow).toHaveLength(1);
    expect(tomorrow[0].temp).toBe(31);
    expect(tomorrow[0].pop).toBe(80);
  });

  it("내일분 센티널도 오늘과 동일하게 걸러진다", () => {
    const TOMORROW = "20260723";
    const src = [
      ...full("0600", { TMP: "-999" }, TOMORROW),
      ...full("0900", { REH: "-999" }, TOMORROW),
    ];
    const out = buildHourlyForecast(src, [], TOMORROW);
    expect(out.map((s) => s.hour)).toEqual(["09:00"]);
    expect(out[0].humidity).toBeNull();
  });
});
