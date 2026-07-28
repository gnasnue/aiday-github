import { describe, it, expect } from "vitest";
import {
  addDays,
  buildNextJudgementLine,
  buildRecapLine,
  buildTraitMap,
  daysLogged,
  detectMemoryStatus,
  fitRate7d,
  memoryStatusCopy,
  pickDynamicAxis,
  MIN_OBSERVATIONS,
  type DayReviewEntry,
  type OverallFit,
  type ThermalOutcome,
} from "./day-review";

const TODAY = "2026-07-28";

const entry = (
  daysAgo: number,
  thermal: ThermalOutcome | null,
  fit: OverallFit = "matched"
): DayReviewEntry => ({
  childId: "c1",
  date: addDays(TODAY, -daysAgo),
  overallFit: fit,
  thermalOutcome: thermal,
  dayComfort: "comfortable",
  tags: [],
  ts: 0,
});

describe("addDays", () => {
  it("월 경계를 넘는다", () => {
    expect(addDays("2026-08-01", -2)).toBe("2026-07-30");
    expect(addDays("2026-07-28", 4)).toBe("2026-08-01");
  });
});

describe("detectMemoryStatus — 관찰 3회 + 신뢰도 0.67 규칙", () => {
  it("유효 관찰 2회 이하 → insufficient (패턴을 주장하지 않는다)", () => {
    const s = detectMemoryStatus([entry(0, "too_warm"), entry(1, "too_warm")], TODAY);
    expect(s).toEqual({ kind: "insufficient", validCount: 2 });
  });

  it("unknown·null 체감은 유효 관찰로 세지 않는다", () => {
    const s = detectMemoryStatus(
      [entry(0, "too_warm"), entry(1, "too_warm"), entry(2, "unknown"), entry(3, null)],
      TODAY
    );
    expect(s.kind).toBe("insufficient");
  });

  it("더움 3/3 → heat 패턴", () => {
    const s = detectMemoryStatus(
      [entry(0, "too_warm"), entry(1, "too_warm"), entry(2, "too_warm")],
      TODAY
    );
    expect(s).toEqual({
      kind: "pattern",
      trait: "heat_sensitivity_observed",
      evidence: 3,
      total: 3,
    });
  });

  it("더움 3/4 (0.75 ≥ 0.67) → heat 패턴, 근거 수 보존", () => {
    const s = detectMemoryStatus(
      [entry(0, "too_warm"), entry(1, "comfortable"), entry(2, "too_warm"), entry(3, "too_warm")],
      TODAY
    );
    expect(s).toEqual({
      kind: "pattern",
      trait: "heat_sensitivity_observed",
      evidence: 3,
      total: 4,
    });
  });

  it("더움 2/3 (0.66 < 0.67) → inconsistent (경계값)", () => {
    const s = detectMemoryStatus(
      [entry(0, "too_warm"), entry(1, "too_warm"), entry(2, "comfortable")],
      TODAY
    );
    expect(s).toEqual({ kind: "inconsistent", total: 3 });
  });

  it("더움·적당·추움 1:1:1 → inconsistent", () => {
    const s = detectMemoryStatus(
      [entry(0, "too_warm"), entry(1, "comfortable"), entry(2, "too_cold")],
      TODAY
    );
    expect(s).toEqual({ kind: "inconsistent", total: 3 });
  });

  it("추움 지배 → cold 패턴", () => {
    const s = detectMemoryStatus(
      [entry(0, "too_cold"), entry(1, "too_cold"), entry(2, "too_cold"), entry(3, "comfortable")],
      TODAY
    );
    expect(s).toMatchObject({ kind: "pattern", trait: "cold_sensitivity_observed" });
  });

  it("적당 지배 → stable (민감 trait를 만들지 않는다)", () => {
    const s = detectMemoryStatus(
      [entry(0, "comfortable"), entry(1, "comfortable"), entry(2, "comfortable")],
      TODAY
    );
    expect(s).toEqual({ kind: "stable", evidence: 3, total: 3 });
  });

  it("30일 밖 관찰은 제외한다", () => {
    const s = detectMemoryStatus(
      [entry(0, "too_warm"), entry(1, "too_warm"), entry(35, "too_warm")],
      TODAY
    );
    expect(s.kind).toBe("insufficient");
  });

  it("MIN_OBSERVATIONS 상수가 계획서 값(3)과 동기화돼 있다", () => {
    expect(MIN_OBSERVATIONS).toBe(3);
  });
});

describe("memoryStatusCopy — 어휘 가드", () => {
  it("패턴 문구는 관찰 서술만 — 학습·체질 단정 금지", () => {
    const copy = memoryStatusCopy(
      { kind: "pattern", trait: "heat_sensitivity_observed", evidence: 3, total: 4 },
      "지우"
    );
    const text = copy.title + copy.body;
    expect(text).toContain("기록");
    expect(text).not.toMatch(/학습|체질|원래|완전히 이해/);
    expect(copy.body).toContain("4번 중 3번");
  });

  it("insufficient는 패턴을 주장하지 않는다", () => {
    const copy = memoryStatusCopy({ kind: "insufficient", validCount: 1 }, "지우");
    expect(copy.title).toContain("판단하지 않아요");
  });
});

describe("fitRate7d — 최근 7일 결과 적합률", () => {
  it("표본 2건 미만이면 null (1건짜리 100%는 소음)", () => {
    expect(fitRate7d([entry(0, null, "matched")], TODAY)).toBeNull();
  });

  it("matched 비율을 반올림 %로 낸다", () => {
    const entries = [
      entry(0, null, "matched"),
      entry(1, null, "matched"),
      entry(2, null, "partly_matched"),
    ];
    expect(fitRate7d(entries, TODAY)).toBe(67);
  });

  it("7일 밖 기록은 제외한다", () => {
    const entries = [entry(0, null, "matched"), entry(1, null, "matched"), entry(10, null, "not_matched")];
    expect(fitRate7d(entries, TODAY)).toBe(100);
  });
});

describe("daysLogged", () => {
  it("누적 일수 = 기록 수 (아이·날짜당 1건 전제)", () => {
    expect(daysLogged([entry(0, null), entry(1, null), entry(5, null)])).toBe(3);
  });
});

describe("pickDynamicAxis — 그날 1순위 이슈만 묻는다", () => {
  it("대기질·꽃가루 경고일이면 호흡기 축 (의류가 있어도 우선)", () => {
    expect(pickDynamicAxis({ preps: ["여벌 상의"], airwayAlert: true })).toBe("airway");
  });

  it("의류계 준비물이 있으면 옷차림 축", () => {
    expect(pickDynamicAxis({ preps: ["여벌 상의", "물통"], airwayAlert: false })).toBe("thermal");
  });

  it("의류도 경고도 없으면 3번째 질문을 만들지 않는다", () => {
    expect(pickDynamicAxis({ preps: ["물통"], airwayAlert: false })).toBeNull();
  });
});

describe("buildRecapLine — 규칙 조립(없는 정보는 지어내지 않는다)", () => {
  const base: DayReviewEntry = {
    childId: "c1",
    date: TODAY,
    overallFit: "partly_matched",
    thermalOutcome: "too_warm",
    dayComfort: "comfortable",
    tags: [],
    ts: 0,
  };

  it("조건 + 사용한 준비물 + 컨디션을 잇는다", () => {
    const line = buildRecapLine(
      {
        ...base,
        conditionLabel: "덥고 습한",
        actionOutcomes: [
          { name: "얇은 옷", execution: "done" },
          { name: "여벌 상의", execution: "done" },
          { name: "선크림", execution: "not_needed" },
        ],
      },
      "지우"
    );
    expect(line).toBe("덥고 습한 날이었지만, 얇은 옷과 여벌 상의로 대체로 편안하게 보냈어요.");
    expect(line).not.toContain("선크림"); // 안 쓴 준비물은 리캡에 넣지 않는다
  });

  it("받침에 따라 조사가 갈린다 — 물통으로 / 상의로", () => {
    const line = buildRecapLine(
      { ...base, actionOutcomes: [{ name: "물통", execution: "done" }] },
      "지우"
    );
    expect(line).toContain("물통으로");
  });

  it("조건·준비물이 모두 없으면 컨디션만으로 짧게", () => {
    expect(buildRecapLine({ ...base, dayComfort: "some_discomfort" }, "지우")).toBe(
      "지우는 오늘 조금 불편해한 순간이 있었어요."
    );
  });
});

describe("buildTraitMap — 특성별 병렬 상태(전역 단계 아님)", () => {
  const withPrep = (daysAgo: number, thermal: ThermalOutcome, prep: string): DayReviewEntry => ({
    ...entry(daysAgo, thermal),
    actionOutcomes: [{ name: prep, execution: "done" }],
  });

  it("더위는 확정, 준비물은 관찰 중 — 서로 다른 상태가 공존한다", () => {
    const entries = [
      withPrep(0, "too_warm", "여벌 상의"),
      withPrep(1, "too_warm", "여벌 상의"),
      entry(2, "too_warm"),
    ];
    const map = buildTraitMap(entries, TODAY);
    const heat = map.find((t) => t.key === "heat");
    const prep = map.find((t) => t.key === "prep");
    expect(heat).toMatchObject({ state: "confirmed" });
    expect(heat?.desc).toContain("3번 중 3번");
    expect(prep).toMatchObject({ state: "watching" });
  });

  it("같은 준비물을 3번 이상 실제로 썼으면 확정", () => {
    const entries = [
      withPrep(0, "comfortable", "여벌 상의"),
      withPrep(1, "comfortable", "여벌 상의"),
      withPrep(2, "comfortable", "여벌 상의"),
    ];
    const prep = buildTraitMap(entries, TODAY).find((t) => t.key === "prep");
    expect(prep).toMatchObject({ state: "confirmed" });
    expect(prep?.desc).toContain("3번 모두");
  });

  it("호흡기 반응은 동적 질문 응답에서만 만들어진다", () => {
    const entries: DayReviewEntry[] = [
      { ...entry(0, null), airwayOutcome: "cough" },
      { ...entry(1, null), airwayOutcome: "none" },
    ];
    const airway = buildTraitMap(entries, TODAY).find((t) => t.key === "airway");
    expect(airway).toMatchObject({ state: "watching" });
    expect(airway?.desc).toContain("1번");
  });

  it("관찰이 없으면 카드를 만들지 않는다(빈 지도)", () => {
    expect(buildTraitMap([], TODAY)).toEqual([]);
  });

  it("카드 문구에 학습·체질 단정이 없다", () => {
    const map = buildTraitMap(
      [entry(0, "too_warm"), entry(1, "too_warm"), entry(2, "too_warm")],
      TODAY
    );
    map.forEach((t) => expect(t.desc + t.title).not.toMatch(/학습|체질|원래/));
  });
});

describe("buildNextJudgementLine — 예고형만", () => {
  it("확정 특성이 있으면 예고 문장", () => {
    const line = buildNextJudgementLine([
      { key: "heat", title: "더운 날 반응", desc: "", state: "confirmed" },
    ]);
    expect(line).toContain("안내할게요");
    expect(line).not.toMatch(/반영했어요|학습/);
  });

  it("확정이 없으면 null — 예고 밴드를 그리지 않는다", () => {
    expect(
      buildNextJudgementLine([{ key: "heat", title: "더운 날 반응", desc: "", state: "watching" }])
    ).toBeNull();
  });
});
