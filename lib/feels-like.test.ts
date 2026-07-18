import { describe, it, expect, vi, afterEach } from "vitest";
import { feelsLikeC } from "./feels-like";

// 체감온도 공식 회귀 방지 — 2026-07 조사: 종전 `기온 − 0.7×풍속` 근사는 겨울용
// 감산식이라 여름 습한 날 체감이 기온보다 낮게(방향 반대) 표시됐다.
// 실측 검증값: 25°C·습도 85% → 기상청 여름 공식 27.3°C (앱 종전 표시 24°C).
const summer = new Date(Date.UTC(2026, 6, 18, 22)); // 7월 (KST 보정 가정)
const winter = new Date(Date.UTC(2026, 0, 15, 9)); // 1월

describe("feelsLikeC — 여름철(5~9월) 습구온도 기반", () => {
  it("습한 여름 저녁(25°C·85%)은 기온보다 높은 27°C", () => {
    expect(feelsLikeC(25, 85, 1.9, summer)).toBe(27);
  });

  it("습도가 높으면 체감이 기온 이상이다 (종전 공식은 항상 미만이었다)", () => {
    const feels = feelsLikeC(30, 80, 3, summer);
    expect(feels).toBeGreaterThanOrEqual(30);
  });

  it("건조하면 체감이 기온보다 낮아질 수 있다", () => {
    expect(feelsLikeC(25, 30, 3, summer)).toBeLessThan(25);
  });

  it("습도 미상이면 그럴듯한 오답 대신 기온을 그대로 반환한다", () => {
    expect(feelsLikeC(25, null, 5, summer)).toBe(25);
  });
});

describe("feelsLikeC — 겨울철 풍속 기반 wind chill", () => {
  it("0°C·풍속 5m/s는 -5°C", () => {
    expect(feelsLikeC(0, 50, 5, winter)).toBe(-5);
  });

  it("기온 10°C 초과에는 wind chill을 적용하지 않는다", () => {
    expect(feelsLikeC(15, 50, 8, winter)).toBe(15);
  });

  it("풍속 1.3m/s 미만에는 wind chill을 적용하지 않는다", () => {
    expect(feelsLikeC(0, 50, 1, winter)).toBe(0);
  });

  it("풍속 미상이면 기온을 그대로 반환한다", () => {
    expect(feelsLikeC(0, 50, null, winter)).toBe(0);
  });
});

describe("feelsLikeC — 계절·임계값 경계", () => {
  afterEach(() => vi.useRealTimers());

  it("5월과 9월은 여름(습구) 공식, 4월과 10월은 겨울 경로", () => {
    const may = new Date(Date.UTC(2026, 4, 15));
    const sep = new Date(Date.UTC(2026, 8, 15));
    const apr = new Date(Date.UTC(2026, 3, 15));
    const oct = new Date(Date.UTC(2026, 9, 15));
    expect(feelsLikeC(25, 85, 1.9, may)).toBe(27); // 습구 공식
    expect(feelsLikeC(25, 85, 1.9, sep)).toBe(27);
    expect(feelsLikeC(0, 50, 5, apr)).toBe(-5); // wind chill
    expect(feelsLikeC(0, 50, 5, oct)).toBe(-5);
  });

  it("wind chill 임계 경계: 기온 10°C·강풍에는 적용, 풍속 4.8km/h 직전에는 미적용", () => {
    expect(feelsLikeC(10, 50, 8, winter)).toBe(7); // 10°C 포함(>10만 제외)
    expect(feelsLikeC(0, 50, 4.8 / 3.6, winter)).toBe(-1); // 정확히 4.8km/h → 적용
    expect(feelsLikeC(0, 50, 4.79 / 3.6, winter)).toBe(0); // 미만 → 미적용
  });

  it("기본 when 인자는 KST 벽시계 기준으로 계절을 고른다", () => {
    vi.useFakeTimers();
    // UTC 9/30 16:00 = KST 10/1 01:00 → 겨울(wind chill) 경로여야 한다
    vi.setSystemTime(new Date("2026-09-30T16:00:00Z"));
    expect(feelsLikeC(0, 50, 5)).toBe(-5);
  });
});
