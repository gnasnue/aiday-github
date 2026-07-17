import { describe, it, expect } from "vitest";
import { buildPrepKeywords } from "./prep";
import type { HomeTimeSlot } from "./timeline";

// 우산 임계값 회귀 방지 — 2026-07 스크린샷 버그: 강수확률 30% 흐린 여름날
// 전 슬롯에 우산이 최우선 강조로 떠 신호가 죽던 문제(#98에서 60%→30% 완화의 부작용).
const slot = (over: Partial<HomeTimeSlot>): HomeTimeSlot => ({
  time: "등원시간",
  hour: "08:30",
  sky: 3,
  pty: 0,
  pop: null,
  temp: 27,
  feels: 26,
  dust: "보통",
  uv: "낮음",
  pollen: "낮음",
  humidity: 55,
  wind: "약함",
  ...over,
});

describe("buildPrepKeywords — 우산", () => {
  it("강수확률 30%(여름 배경 수준)에서는 우산을 내지 않는다", () => {
    expect(buildPrepKeywords(slot({ pop: 30, popWindow: 30 }), null)).not.toContain("우산");
  });

  it("창 max 60% 이상이면 우산을 최우선으로 낸다", () => {
    expect(buildPrepKeywords(slot({ pop: 60, popWindow: 60 }), null)[0]).toBe("우산");
  });

  it("슬롯 정시값이 낮아도 창 안에 소나기 예보(rainWindow)가 있으면 우산을 낸다", () => {
    expect(buildPrepKeywords(slot({ pop: 10, popWindow: 80, rainWindow: true }), null)).toContain("우산");
  });

  it("창 max 40~50%는 예비 신호 — 한가한 슬롯에서만 노출된다", () => {
    expect(buildPrepKeywords(slot({ pop: 45, popWindow: 45 }), null)).toContain("우산");
  });

  it("창 max 40~50% 예비 신호는 더 급한 신호 2개에 밀려난다", () => {
    // 폭염(물병 90 + 모자 60) 슬롯에서는 우산(55)이 상위 2개 경쟁에서 탈락
    const kws = buildPrepKeywords(slot({ pop: 45, popWindow: 45, temp: 33, uv: "강함" }), null);
    expect(kws).toHaveLength(2);
    expect(kws).not.toContain("우산");
  });

  it("popWindow가 없는 폴백 슬롯은 정시값(pop)으로 판정한다", () => {
    expect(buildPrepKeywords(slot({ pop: 70 }), null)).toContain("우산");
    expect(buildPrepKeywords(slot({ pop: 30 }), null)).not.toContain("우산");
  });
});
