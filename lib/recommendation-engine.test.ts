import { describe, it, expect } from "vitest";
import { buildRecommendation } from "./recommendation-engine";
import type { ChildProfile } from "./profile";
import type { WeatherData } from "./weather-api";

// 폴백 메시지 템플릿 회귀 방지 — 2026-07-27 실사용 버그: 환경 사유가 하나도 발동하지
// 않는 날(32° 폭염이지만 습도가 땀 임계 미달, 꽃가루·미세먼지·바람 양호)에 envPart가
// 빈 문자열이 되어 "도준이에게는 오늘 이에요."로 깨진 채 홈 히어로에 노출됐다.
// 준비물까지 없으면 "를 꼭 챙겨주세요."로 조사만 남는 두 번째 깨짐도 있었다.

const child = (over: Partial<ChildProfile> = {}): ChildProfile => ({
  id: "test",
  name: "도준",
  emoji: "🦁",
  age: "만 4세",
  gender: "male",
  conditions: [],
  hot: "normal",
  sweat: "normal",
  createdAt: 0,
  ...over,
});

const weather = (over: Partial<WeatherData> = {}): WeatherData => ({
  temp: 32,
  dustLevel: "좋음",
  pollenLevel: "낮음",
  uvIndex: 8,
  humidity: 55,
  windSpeed: "약함",
  timeline: [],
  ...over,
});

// 사유가 발동하지 않는 무난한 슬롯 — 바람·꽃가루·미세먼지 양호, 습도는 건조(45) 이상.
const calmSlots = [
  { wind: "약함", pollen: "낮음", dust: "좋음", humidity: 58 },
  { wind: "약함", pollen: "낮음", dust: "좋음", humidity: 52 },
  { wind: "약함", pollen: "낮음", dust: "좋음", humidity: 50 },
  { wind: "약함", pollen: "낮음", dust: "좋음", humidity: 55 },
] as const;

describe("buildRecommendation — 메시지 템플릿", () => {
  it("사유 0 + 체질 준비물: '무난한 날' 문장으로 시작하고 '오늘 이에요'로 깨지지 않는다", () => {
    // 2026-07-27 재현 조건: 땀 체질이지만 습도 55 < 완화 임계 60 → 덥고 습함 미발동,
    // 피부 민감 체질로 보습제만 발동(사유 없음), 호흡기 민감으로 conditionNote 존재.
    const { message } = buildRecommendation(
      child({
        conditions: ["호흡기 민감 (비염, 천식·기관지)", "피부 민감 (아토피, 건조)"],
        hot: "much",
        sweat: "very-much",
      }),
      weather(),
      calmSlots
    );
    expect(message).not.toMatch(/오늘 이에요/);
    expect(message).toContain("오늘 무난한 날이에요");
    expect(message).toContain("호흡기가 예민하니");
    expect(message).toContain("**보습제**");
  });

  it("사유 0 + 준비물 0: 조사만 남지 않고 '평소대로'로 끝난다", () => {
    const { message } = buildRecommendation(
      child(),
      weather({ temp: 22 }),
      calmSlots
    );
    expect(message).not.toMatch(/오늘 이에요/);
    expect(message).not.toMatch(/(^|\s)[을를] 꼭/);
    expect(message).toBe("도준이에게는 오늘 무난한 날이에요. 평소대로 준비하면 충분해요.");
  });

  it("사유가 있으면 기존 문장 구조를 유지한다 (덥고 습함 + 여벌 상의)", () => {
    // 습도 65 ≥ 땀 체질 완화 임계 60 → 덥고 습함 발동, 비 신호 없음 → 여벌 상의.
    const { message } = buildRecommendation(
      child({
        conditions: ["피부 민감 (아토피, 건조)"],
        hot: "much",
        sweat: "very-much",
      }),
      weather({ humidity: 65 }),
      calmSlots
    );
    expect(message).toContain("오늘 __덥고 습함__이에요");
    expect(message).toContain("**여벌 상의**");
    expect(message).not.toContain("무난한 날");
  });

  it("추운 날 경로 보존 (기온이 낮음 + 외투)", () => {
    const { message, checklist } = buildRecommendation(
      child(),
      weather({ temp: 5 }),
      calmSlots
    );
    expect(message).toContain("오늘 __기온이 낮음__이에요");
    expect(message).toContain("**외투**");
    expect(checklist.map((c) => c.key)).toContain("외투");
  });
});
