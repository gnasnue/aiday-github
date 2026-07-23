import { describe, it, expect } from "vitest";
import { isWeatherUnavailable } from "./weather-response";

// #154 회귀 방지: 단기예보 전면 실패를 성공(200)으로 오인하지 않는다는 라우트 계약.
// 파서 절반(NO_DATA→빈 배열)은 kma-forecast.test.ts가 담당하고, 여기서는 라우트가
// 502 vs 200(부분/완전)을 가르는 경계만 핀한다.
describe("isWeatherUnavailable (#154 라우트 계약)", () => {
  it("현재값도 시간대별도 없으면 전면 실패(502 대상)", () => {
    expect(isWeatherUnavailable(null, 0)).toBe(true);
  });

  it("현재값만 있으면 부분 성공 — 502로 처리하지 않는다(상단 칩 유지)", () => {
    expect(isWeatherUnavailable(24, 0)).toBe(false);
  });

  it("시간대별만 있으면 부분 성공 — 502로 처리하지 않는다(시간대 카드 유지)", () => {
    expect(isWeatherUnavailable(null, 6)).toBe(false);
  });

  it("둘 다 있으면 완전 성공", () => {
    expect(isWeatherUnavailable(24, 6)).toBe(false);
  });

  it("기온 0°C는 결측이 아니다 — 유효한 현재값으로 취급", () => {
    expect(isWeatherUnavailable(0, 0)).toBe(false);
  });
});
