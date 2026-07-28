import { describe, it, expect } from "vitest";
import { buildCareCard, careCardToText, isCareCardEmpty } from "./care-card";
import type { ChildProfile } from "@/lib/profile";
import type { DayReviewEntry } from "./day-review";
import type { CarePlan } from "@/lib/care-plan";

const child = (over: Partial<ChildProfile> = {}): ChildProfile =>
  ({
    id: "c1",
    name: "지우",
    age: "만 4세",
    conditions: ["아토피"],
    hot: "많이 타요",
    sweat: "많아요",
    ...over,
  }) as ChildProfile;

const TODAY = new Date(2026, 6, 29); // 로컬 자정 고정 — TZ 무관
const entry = (daysAgo: number, thermal: DayReviewEntry["thermalOutcome"]): DayReviewEntry => {
  const d = new Date(2026, 6, 29 - daysAgo);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    childId: "c1",
    date: iso,
    overallFit: "matched",
    thermalOutcome: thermal,
    dayComfort: "comfortable",
    tags: [],
    ts: 0,
  };
};

const plan: CarePlan = {
  kind: "sweat_change",
  action: "11:00 야외활동 뒤, 젖은 옷을 갈아입혀 달라고 전달하세요",
  evidence: [
    { slot: "야외활동 11:00", value: "30°", why: "" },
    { slot: "하원 18:00", value: "27°", why: "" },
  ],
  prep: ["여벌 상의"],
  handoff: "11:00 야외활동 뒤 지우가 땀에 젖으면 가방의 여벌 상의로 갈아입혀 주세요.",
  atDaycare: true,
};

describe("buildCareCard — 첫날부터 건넬 수 있다", () => {
  it("기록이 0건이어도 프로필만으로 카드가 성립한다", () => {
    const card = buildCareCard({ child: child(), entries: [], now: TODAY });
    expect(card.profileLines.length).toBeGreaterThan(0);
    expect(card.observedLines).toEqual([]);
    expect(isCareCardEmpty(card)).toBe(false);
  });

  it("체질에 맞는 줄만 싣는다 (없는 특성을 지어내지 않는다)", () => {
    const card = buildCareCard({
      child: child({ conditions: [], hot: "보통이에요", sweat: "보통이에요", cold: "보통이에요" }),
      entries: [],
      now: TODAY,
    });
    expect(card.profileLines).toEqual([]);
  });

  it("땀·피부 프로필은 돌봄자가 바로 행동할 문장으로 나온다", () => {
    const card = buildCareCard({ child: child(), entries: [], now: TODAY });
    const texts = card.profileLines.map((l) => l.text).join(" ");
    expect(texts).toContain("젖었는지");
    expect(texts).toContain("젖은 옷이 오래 닿지");
  });
});

describe("buildCareCard — 관찰은 확정된 것만", () => {
  it("확정 경향(3회+신뢰도)은 근거와 함께 실린다", () => {
    const entries = [entry(0, "too_warm"), entry(1, "too_warm"), entry(2, "too_warm")];
    const card = buildCareCard({ child: child(), entries, now: TODAY });
    const heat = card.observedLines.find((l) => l.label.includes("더운"));
    expect(heat).toBeDefined();
    expect(heat!.source).toBe("기록");
    expect(heat!.evidence).toContain("3번");
  });

  it("관찰 중(미확정)은 카드에 싣지 않는다 — 남에게 건네는 문서라 문턱이 높다", () => {
    const entries = [entry(0, "too_warm"), entry(1, "too_warm")]; // 2건 = 미확정
    const card = buildCareCard({ child: child(), entries, now: TODAY });
    expect(card.observedLines).toEqual([]);
  });

  it("카드 어디에도 진단·학습 단정이 없다", () => {
    const entries = [entry(0, "too_warm"), entry(1, "too_warm"), entry(2, "too_warm")];
    const card = buildCareCard({ child: child(), entries, plan, now: TODAY });
    const all = [...card.profileLines, ...card.observedLines]
      .map((l) => l.text + (l.evidence ?? ""))
      .join(" ");
    expect(all).not.toMatch(/학습|진단|체질이 (바뀌|변)/);
  });
});

describe("buildCareCard — 오늘 부탁", () => {
  it("오늘의 실행이 있으면 전달 문구가 그대로 들어간다", () => {
    const card = buildCareCard({ child: child(), entries: [], plan, now: TODAY });
    expect(card.todayRequest).toBe(plan.handoff);
  });

  it("오늘의 실행이 없으면 그 줄을 만들지 않는다", () => {
    const card = buildCareCard({ child: child(), entries: [], plan: null, now: TODAY });
    expect(card.todayRequest).toBeNull();
  });
});

describe("careCardToText — 텍스트 폴백", () => {
  it("오늘 부탁·프로필·기록과 출처 고지를 담는다", () => {
    const entries = [entry(0, "too_warm"), entry(1, "too_warm"), entry(2, "too_warm")];
    const text = careCardToText(
      buildCareCard({ child: child(), entries, plan, now: TODAY })
    );
    expect(text).toContain("[지우 돌봄 카드]");
    expect(text).toContain("오늘 부탁:");
    expect(text).toContain("알아두면 좋은 것");
    expect(text).toContain("그동안의 기록에서");
    expect(text).toContain("진단이 아니에요");
  });

  it("실을 내용이 없으면 빈 카드로 판정된다", () => {
    const card = buildCareCard({
      child: child({ conditions: [], hot: "보통이에요", sweat: "보통이에요", cold: "보통이에요" }),
      entries: [],
      plan: null,
      now: TODAY,
    });
    expect(isCareCardEmpty(card)).toBe(true);
  });
});
