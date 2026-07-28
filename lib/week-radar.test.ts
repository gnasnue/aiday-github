import { describe, it, expect } from "vitest";
import {
  buildEvidence,
  buildWeekRadar,
  type RadarWeekDay,
  type WeekRadarInput,
} from "./week-radar";
import { buildEnvDigest, type DayReviewEntry, type EnvDigest } from "./memory/day-review";

/* ---------- 헬퍼 ---------- */

const day = (
  label: string,
  high: number | null,
  low: number | null,
  rain = 0
): RadarWeekDay => ({ day: label, date: `7/${label.length + 20}`, high, low, rain });

// 무난한 여름날 — 어떤 임계에도 안 걸린다 (일교차 4°, 낮 29°)
const calmDay = (label: string, date: string): RadarWeekDay => ({
  day: label,
  date,
  high: 29,
  low: 25,
  rain: 10,
});

const calmWeek = (): RadarWeekDay[] => [
  { day: "오늘", date: "7/29", high: 30, low: 25, rain: 10 },
  calmDay("수", "7/30"),
  calmDay("목", "7/31"),
  calmDay("금", "8/1"),
  calmDay("토", "8/2"),
  calmDay("일", "8/3"),
  calmDay("월", "8/4"),
];

const radarInput = (week: RadarWeekDay[], extra?: Partial<WeekRadarInput>): WeekRadarInput => ({
  week,
  childName: "지우",
  ...extra,
});

const entryWith = (
  digest: EnvDigest | undefined,
  obs?: Partial<DayReviewEntry>
): DayReviewEntry => ({
  childId: "c1",
  date: "2026-07-20",
  overallFit: "matched",
  thermalOutcome: null,
  dayComfort: "comfortable",
  tags: [],
  ts: 0,
  envDigest: digest,
  ...obs,
});

/* ---------- 신호 판정 (임계값은 전부 차용 값) ---------- */

describe("buildWeekRadar — 신호 판정", () => {
  it("일교차 8° 이상만 신호가 된다 (hero-brief 임계 정렬)", () => {
    const week = calmWeek();
    week[2] = { ...week[2], high: 30, low: 22 }; // 일교차 8
    week[3] = { ...week[3], high: 30, low: 23 }; // 일교차 7 — 미달
    const r = buildWeekRadar(radarInput(week));
    expect(r.days[1].signals.map((s) => s.key)).toEqual(["diurnal"]);
    expect(r.days[1].signals[0].label).toBe("일교차 8°");
    expect(r.days[2].signals).toHaveLength(0);
  });

  it("더위 33°·추위 0°·강수 60% 경계 (outdoor-index·확정 강수 정렬)", () => {
    const week = calmWeek();
    week[1] = { ...week[1], high: 33, low: 27 };
    week[2] = { ...week[2], high: 5, low: 0 };
    week[3] = { ...week[3], rain: 60 };
    week[4] = { ...week[4], high: 32, low: 27, rain: 59 }; // 전부 미달
    const r = buildWeekRadar(radarInput(week));
    expect(r.days[0].signals.map((s) => s.key)).toEqual(["heat"]);
    expect(r.days[1].signals.map((s) => s.key)).toEqual(["cold"]);
    expect(r.days[2].signals.map((s) => s.key)).toEqual(["rain"]);
    expect(r.days[3].signals).toHaveLength(0);
  });

  it("오늘은 제외하고, 기온이 아예 없는 날은 스트립에서 버린다", () => {
    const week = calmWeek();
    week[0] = { ...week[0], high: 40, low: 20, rain: 90 }; // 오늘이 아무리 극단이어도 제외
    week[6] = { ...week[6], high: null, low: null }; // 중기 결측
    const r = buildWeekRadar(radarInput(week));
    expect(r.days).toHaveLength(5);
    expect(r.days.every((d) => d.day !== "오늘")).toBe(true);
  });

  it("첫 날만 isTomorrow — 제목이 '내일'을 호명한다", () => {
    const week = calmWeek();
    week[1] = { ...week[1], high: 34 };
    const r = buildWeekRadar(radarInput(week));
    expect(r.days[0].isTomorrow).toBe(true);
    expect(r.days[1].isTomorrow).toBe(false);
    expect(r.peak?.title).toBe("내일을 먼저 챙겨주세요");
  });

  it("신호가 하나도 없으면 peak는 null (평온 주간)", () => {
    const r = buildWeekRadar(radarInput(calmWeek()));
    expect(r.peak).toBeNull();
    expect(r.days).toHaveLength(6);
  });
});

/* ---------- 대표일 선정 (체질 가중) ---------- */

describe("buildWeekRadar — 대표일 선정", () => {
  it("점수 최고일이 대표일, 동점이면 가까운 날", () => {
    const week = calmWeek();
    week[2] = { ...week[2], high: 33 }; // 목
    week[4] = { ...week[4], high: 33 }; // 토 — 같은 점수
    const r = buildWeekRadar(radarInput(week));
    expect(r.peak?.day.day).toBe("목");
    expect(r.peak?.title).toBe("목요일을 먼저 챙겨주세요");
  });

  it("호흡기 체질은 일교차가 폭염을 이긴다 (가중 1.5)", () => {
    const week = calmWeek();
    week[2] = { ...week[2], high: 35, low: 28 }; // 더위 점수 3 (일교차 7이라 미발화)
    week[3] = { ...week[3], high: 30, low: 21 }; // 일교차 9 — 기본 2.5, 호흡기 ×1.5 = 3.75
    const plain = buildWeekRadar(radarInput(week));
    const resp = buildWeekRadar(radarInput(week, { conditions: ["비염"] }));
    expect(plain.peak?.day.signals[0].key).toBe("heat"); // 3 > 2.5
    expect(resp.peak?.day.signals[0].key).toBe("diurnal");
    expect(resp.peak?.why).toContain("호흡기가 민감한 지우");
    expect(resp.peak?.actions).toContain("얇은 겉옷");
  });

  it("땀 체질은 폭염 문구·준비물이 달라진다", () => {
    const week = calmWeek();
    week[2] = { ...week[2], high: 34 };
    const r = buildWeekRadar(radarInput(week, { hot: "much" }));
    expect(r.peak?.why).toContain("땀이 많은 지우");
    expect(r.peak?.actions).toEqual(["물통", "여벌 상의"]);
  });
});

/* ---------- 개인 근거 (관찰 서술까지만) ---------- */

describe("buildEvidence", () => {
  const hot = (obs?: Partial<DayReviewEntry>) =>
    entryWith({ tMin: 26, tMax: 34, rainy: false }, obs);

  it("비슷한 날 3건 미만이면 인용하지 않는다", () => {
    expect(buildEvidence([hot(), hot()], "heat")).toBeNull();
  });

  it("관찰 2건 미만이면 인용하지 않는다 — 근거를 지어내지 않는다", () => {
    expect(
      buildEvidence([hot({ thermalOutcome: "too_warm" }), hot(), hot()], "heat")
    ).toBeNull();
  });

  it("더위 신호는 더워함 관찰을 센다", () => {
    const ev = buildEvidence(
      [hot({ thermalOutcome: "too_warm" }), hot({ tags: ["땀을 많이 흘렸어요"] }), hot()],
      "heat"
    );
    expect(ev).toEqual({
      total: 3,
      hits: 2,
      line: "비슷한 날 3번 중 2번, 더워했다는 기록이 있었어요.",
    });
  });

  it("일교차 신호는 기침·콧물 관찰을 세고, 미달이면 불편 관찰로 폴백", () => {
    const wide = (obs?: Partial<DayReviewEntry>) =>
      entryWith({ tMin: 18, tMax: 28, rainy: false }, obs);
    const airway = buildEvidence(
      [wide({ airwayOutcome: "cough" }), wide({ tags: ["기침·콧물이 있었어요"] }), wide()],
      "diurnal"
    );
    expect(airway?.line).toBe("비슷한 날 3번 중 2번, 기침·콧물 기록이 있었어요.");
    const fallback = buildEvidence(
      [
        wide({ dayComfort: "some_discomfort" }),
        wide({ dayComfort: "high_discomfort" }),
        wide(),
      ],
      "diurnal"
    );
    expect(fallback?.line).toBe("비슷한 날 3번 중 2번, 불편해했다는 기록이 있었어요.");
  });

  it("envDigest 없는 기록은 매칭에서 빠진다", () => {
    const noDigest = entryWith(undefined, { thermalOutcome: "too_warm" });
    expect(buildEvidence([noDigest, noDigest, noDigest], "heat")).toBeNull();
  });

  it("peak에 근거가 실린다", () => {
    const week = calmWeek();
    week[2] = { ...week[2], high: 34, low: 27 }; // 폭염 단독(일교차 7 — 미발화)
    const entries = [
      entryWith({ tMin: 26, tMax: 34, rainy: false }, { thermalOutcome: "too_warm" }),
      entryWith({ tMin: 25, tMax: 33, rainy: false }, { thermalOutcome: "too_warm" }),
      entryWith({ tMin: 26, tMax: 35, rainy: false }),
    ];
    const r = buildWeekRadar(radarInput(week, { entries }));
    expect(r.peak?.evidence?.hits).toBe(2);
  });
});

/* ---------- envDigest 파생 ---------- */

describe("buildEnvDigest", () => {
  it("시간대별 예보의 최저/최고와 강수 여부를 요약한다", () => {
    const env = {
      weather: {
        hourlyForecast: [
          { temp: 24, pty: 0, pop: 20 },
          { temp: 31, pty: 0, pop: 30 },
          { temp: 28, pty: 0, pop: 60 }, // 확정 강수 경계
        ],
      },
    };
    expect(buildEnvDigest(env)).toEqual({ tMin: 24, tMax: 31, rainy: true });
  });

  it("PTY>0도 강수로 본다", () => {
    const env = {
      weather: { hourlyForecast: [{ temp: 20, pty: 1, pop: 30 }] },
    };
    expect(buildEnvDigest(env)?.rainy).toBe(true);
  });

  it("예보가 없으면 null — digest를 지어내지 않는다", () => {
    expect(buildEnvDigest(null)).toBeNull();
    expect(buildEnvDigest({ weather: null })).toBeNull();
    expect(
      buildEnvDigest({ weather: { hourlyForecast: [{ temp: null, pty: 0, pop: 0 }] } })
    ).toBeNull();
  });
});
