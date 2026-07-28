import { describe, it, expect } from "vitest";
import {
  addDays,
  daysLogged,
  detectMemoryStatus,
  fitRate7d,
  memoryStatusCopy,
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
