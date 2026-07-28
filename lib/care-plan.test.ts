import { describe, it, expect } from "vitest";
import { applyPastOutcome, buildCarePlan, type CarePlanInput } from "./care-plan";
import type { HomeTimeSlot } from "./timeline";

const slot = (over: Partial<HomeTimeSlot> & { time: string; hour: string }): HomeTimeSlot => ({
  endHour: null,
  isDefault: false,
  sky: 1,
  pty: 0,
  pop: 10,
  temp: 24,
  feels: 24,
  dust: "좋음",
  uv: "보통",
  pollen: "낮음",
  humidity: 55,
  wind: "약함",
  ...over,
});

/** 문제정의 v2 §8-2 대표 실패 시나리오: 등원 20° → 산책 28° → 하원 17° */
const goldenCase = (): CarePlanInput => ({
  slots: [
    slot({ time: "등원시간", hour: "08:30", temp: 20, feels: 20 }),
    slot({ time: "야외활동", hour: "11:00", temp: 28, feels: 30, humidity: 75 }),
    slot({ time: "하원시간", hour: "17:00", temp: 17, feels: 16 }),
  ],
  childName: "지우",
  hot: "많이 타요",
  sweat: "많아요",
});

describe("buildCarePlan — 골든 케이스", () => {
  it("젖은 옷 → 체온 저하 전이를 잡아 실행문을 만든다", () => {
    const plan = buildCarePlan(goldenCase())!;
    expect(plan.kind).toBe("sweat_change");
    // 실행문은 시각·행동·전달을 담는다 (준비물 나열이 아니다)
    expect(plan.action).toContain("11:00");
    expect(plan.action).toContain("갈아입혀");
    expect(plan.prep).toEqual(["여벌 상의"]);
  });

  it("근거 2행이 원인·결과 슬롯과 실제 수치를 가리킨다 (입력 출처 추적)", () => {
    const plan = buildCarePlan(goldenCase())!;
    expect(plan.evidence[0].slot).toBe("야외활동 11:00");
    expect(plan.evidence[0].value).toContain("28°");
    expect(plan.evidence[1].slot).toBe("하원 17:00");
    expect(plan.evidence[1].why).toContain("11°"); // 28→17 = 11도 하락
  });

  it("땀 많은 체질이면 근거 문장이 그 아이를 지목한다", () => {
    const plan = buildCarePlan(goldenCase())!;
    expect(plan.evidence[0].why).toContain("지우");
    const generic = buildCarePlan({ ...goldenCase(), hot: "보통이에요", sweat: "보통이에요" })!;
    expect(generic.evidence[0].why).not.toContain("지우");
  });

  it("전달 문구에 시각·행동·이유가 모두 있다", () => {
    const { handoff } = buildCarePlan(goldenCase())!;
    expect(handoff).toContain("11:00");
    expect(handoff).toContain("여벌 상의");
    expect(handoff).toContain("17:00");
  });

  it("어린이집 일과가 있으면 atDaycare — 전달 대상 라벨의 근거", () => {
    expect(buildCarePlan(goldenCase())!.atDaycare).toBe(true);
    const home = buildCarePlan({
      ...goldenCase(),
      slots: [
        slot({ time: "야외활동", hour: "11:00", temp: 28, feels: 30, humidity: 75 }),
        slot({ time: "저녁", hour: "18:00", temp: 17 }),
      ],
    })!;
    expect(home.atDaycare).toBe(false);
  });
});

describe("buildCarePlan — 규칙 우선순위(안전 순서)", () => {
  it("일교차만 크면 겉옷 시점 실행문", () => {
    const plan = buildCarePlan({
      ...goldenCase(),
      slots: [
        slot({ time: "야외활동", hour: "11:00", temp: 18, feels: 18 }),
        slot({ time: "하원시간", hour: "17:00", temp: 8, feels: 6 }),
      ],
    })!;
    expect(plan.kind).toBe("layer_gap");
    expect(plan.prep).toEqual(["얇은 겉옷"]);
  });

  it("이후 시점 비 소식은 우산 실행문", () => {
    const plan = buildCarePlan({
      ...goldenCase(),
      hot: "보통이에요",
      sweat: "보통이에요",
      slots: [
        slot({ time: "야외활동", hour: "11:00", temp: 22, feels: 22 }),
        slot({ time: "하원시간", hour: "17:00", temp: 21, pop: 80 }),
      ],
    })!;
    expect(plan.kind).toBe("rain_pickup");
  });

  it("활동 시점 미세먼지 나쁨은 실내 위주 실행문", () => {
    const plan = buildCarePlan({
      ...goldenCase(),
      hot: "보통이에요",
      sweat: "보통이에요",
      slots: [
        slot({ time: "야외활동", hour: "11:00", temp: 22, feels: 22, dust: "나쁨" }),
        slot({ time: "하원시간", hour: "17:00", temp: 21 }),
      ],
    })!;
    expect(plan.kind).toBe("air_indoor");
  });

  it("더위와 일교차가 함께면 안전 순서상 젖은 옷이 먼저", () => {
    const plan = buildCarePlan(goldenCase())!; // 28→17 = 11도 갭이자 더운 활동
    expect(plan.kind).toBe("sweat_change");
  });
});

describe("buildCarePlan — 한여름(기온 하락 없음)", () => {
  /** 2026-07-29 실측 회귀: 30°·습도 85%가 하루 종일 이어지면 하락이 없다 */
  const summer = (over: Partial<CarePlanInput> = {}): CarePlanInput => ({
    slots: [
      slot({ time: "야외활동", hour: "11:00", temp: 30, feels: 32, humidity: 85 }),
      slot({ time: "하원시간", hour: "18:00", temp: 29, feels: 31, humidity: 80 }),
    ],
    childName: "지우",
    hot: "많이 타요",
    sweat: "많아요",
    ...over,
  });

  it("땀 많은 아이는 기온이 안 떨어져도 갈아입히기 실행이 나온다", () => {
    const plan = buildCarePlan(summer())!;
    expect(plan.kind).toBe("sweat_change");
    // 없는 기온 하락을 주장하지 않는다
    expect(plan.evidence[1].why).not.toContain("떨어져요");
    expect(plan.handoff).not.toMatch(/°까지 내려가요/);
  });

  it("피부 민감 아이도 같은 실행 — 근거 문장은 피부로", () => {
    const plan = buildCarePlan(
      summer({ hot: "보통이에요", sweat: "보통이에요", conditions: ["아토피"] })
    )!;
    expect(plan.kind).toBe("sweat_change");
    expect(plan.evidence[1].why).toContain("피부");
  });

  it("땀·피부 이슈가 없으면 더워도 갈아입히기를 강요하지 않는다", () => {
    const plan = buildCarePlan(summer({ hot: "보통이에요", sweat: "보통이에요", conditions: [] }));
    expect(plan?.kind).not.toBe("sweat_change");
  });
});

describe("buildCarePlan — 없는 위험은 지어내지 않는다", () => {
  it("무난한 날은 null", () => {
    const plan = buildCarePlan({
      ...goldenCase(),
      hot: "보통이에요",
      sweat: "보통이에요",
      slots: [
        slot({ time: "야외활동", hour: "11:00", temp: 21, feels: 21 }),
        slot({ time: "하원시간", hour: "17:00", temp: 20 }),
      ],
    });
    expect(plan).toBeNull();
  });

  it("활동 이후 슬롯이 없으면 null (전이를 볼 수 없다)", () => {
    expect(
      buildCarePlan({ ...goldenCase(), slots: [slot({ time: "야외활동", hour: "11:00", temp: 30 })] })
    ).toBeNull();
  });

  it("실행문에 순위 주장 어휘가 없다", () => {
    const plan = buildCarePlan(goldenCase())!;
    expect(plan.action).not.toMatch(/가장|1순위|한 가지|놓치/);
  });
});

describe("applyPastOutcome — 순서·표현만 바꾼다", () => {
  it("과거 결과가 없으면 null (엔진에 안 들어간 개인화 설명 금지)", () => {
    expect(applyPastOutcome(buildCarePlan(goldenCase())!, null)).toBeNull();
  });

  it("더워했던 이력은 여벌 상의를 앞으로 + 근거 문장", () => {
    const base = buildCarePlan(goldenCase())!;
    const res = applyPastOutcome(base, "too_warm")!;
    expect(res.plan.prep[0]).toBe("여벌 상의");
    expect(res.note).toContain("지난번");
    expect(res.note).not.toMatch(/학습|체질/);
  });

  it("준비물을 빼지 않는다", () => {
    const base = buildCarePlan(goldenCase())!;
    const res = applyPastOutcome(base, "too_cold")!;
    base.prep.forEach((p) => expect(res.plan.prep).toContain(p));
  });
});
