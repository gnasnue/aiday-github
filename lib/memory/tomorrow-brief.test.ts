import { describe, it, expect } from "vitest";
import { buildTomorrowBrief } from "./tomorrow-brief";
import type { HomeTimeSlot } from "@/lib/timeline";
import type { DayReviewEntry } from "./day-review";

const slot = (over: Partial<HomeTimeSlot> = {}): HomeTimeSlot => ({
  time: "등원시간",
  hour: "09:00",
  endHour: null,
  isDefault: true,
  sky: 1,
  pty: 0,
  pop: 20,
  temp: 24,
  feels: 25,
  dust: "좋음",
  uv: "보통",
  pollen: "낮음",
  humidity: 60,
  wind: "약함",
  ...over,
});

const entry = (thermal: DayReviewEntry["thermalOutcome"]): DayReviewEntry => ({
  childId: "c1",
  date: "2026-07-28",
  overallFit: "partly_matched",
  thermalOutcome: thermal,
  dayComfort: "comfortable",
  tags: [],
  ts: 0,
});

describe("buildTomorrowBrief", () => {
  it("예보가 없으면 null — 없는 예보를 지어내지 않는다", () => {
    expect(buildTomorrowBrief(null, [], null)).toBeNull();
    expect(buildTomorrowBrief([], [], null)).toBeNull();
  });

  it("대표 슬롯의 조건·준비물을 낸다 (규칙 엔진 재사용)", () => {
    const b = buildTomorrowBrief([slot({ pop: 70 })], [], null);
    expect(b).toMatchObject({ slotLabel: "등원", hour: "09:00", temp: 24, rain: true });
    expect(b!.preps.length).toBeGreaterThan(0);
    expect(b!.preps).toContain("우산"); // 강수 60%↑ → 규칙 엔진의 우산
  });

  it("오늘 더워했다는 결과가 있으면 여벌 상의를 맨 앞으로 — 실반영", () => {
    const b = buildTomorrowBrief([slot({ temp: 31, humidity: 80 })], [], entry("too_warm"));
    expect(b!.preps[0]).toBe("여벌 상의");
    expect(b!.adjusted).toMatchObject({ name: "여벌 상의" });
    expect(b!.adjusted!.reason).toContain("오늘");
  });

  it("추워했으면 얇은 겉옷을 맨 앞으로", () => {
    const b = buildTomorrowBrief([slot({ temp: 10 })], [], entry("too_cold"));
    expect(b!.preps[0]).toBe("얇은 겉옷");
    expect(b!.adjusted!.name).toBe("얇은 겉옷");
  });

  it("조정은 순서·추가만 — 규칙이 낸 준비물을 빼지 않는다", () => {
    const base = buildTomorrowBrief([slot({ pop: 70 })], [], null)!;
    const adj = buildTomorrowBrief([slot({ pop: 70 })], [], entry("too_warm"))!;
    base.preps.slice(0, 3).forEach((p) => expect(adj.preps).toContain(p));
  });

  it("체감 결과가 없으면(적당/미상) 조정하지 않는다", () => {
    const b = buildTomorrowBrief([slot()], [], entry("comfortable"));
    expect(b!.adjusted).toBeNull();
  });
});
