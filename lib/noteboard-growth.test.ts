import { describe, expect, it } from "vitest";
import {
  buildGrowthNote,
  GROWTH_PERIOD_DAYS,
  MIN_ENTRIES_FOR_GROWTH,
} from "./noteboard-growth";
import type { NoteFinding, NoteboardEntry } from "./noteboard";

const TODAY = "2026-07-29";

const entry = (
  date: string,
  opts: { headline?: string; summary?: string; findings?: NoteFinding[]; raw?: string } = {}
): NoteboardEntry => ({
  childId: "c1",
  date,
  raw: opts.raw,
  result: {
    headline: opts.headline ?? `${date} 한 줄`,
    summary: opts.summary ?? `${date} 근거`,
    talks: [],
    findings: opts.findings ?? [],
  },
  ts: 0,
});

describe("buildGrowthNote", () => {
  it(`알림장이 ${MIN_ENTRIES_FOR_GROWTH}건 미만이면 null — 빈 카드를 만들지 않는다`, () => {
    expect(buildGrowthNote([], TODAY)).toBeNull();
    expect(buildGrowthNote([entry("2026-07-28"), entry("2026-07-29")], TODAY)).toBeNull();
  });

  it("집계 기간을 벗어난 알림장은 분모에서 빠진다", () => {
    const old = entry("2026-06-01");
    const recent = [entry("2026-07-27"), entry("2026-07-28"), entry("2026-07-29")];
    const result = buildGrowthNote([old, ...recent], TODAY)!;

    expect(result.notesCount).toBe(3);
    expect(result.periodDays).toBe(GROWTH_PERIOD_DAYS);
    expect(result.moments.some((m) => m.date === "2026-06-01")).toBe(false);
  });

  it("성장 장면은 '처음 해본 것'이 기록된 날만 고르고 시간순으로 준다", () => {
    const result = buildGrowthNote(
      [
        entry("2026-07-20", { findings: [{ kind: "first", label: "가위질" }] }),
        entry("2026-07-22", { findings: [{ kind: "health", label: "콧물" }] }),
        entry("2026-07-25", { findings: [{ kind: "first", label: "친구에게 먼저 말하기" }] }),
      ],
      TODAY
    )!;

    expect(result.moments.map((m) => m.date)).toEqual(["2026-07-20", "2026-07-25"]);
    expect(result.moments[0].firstLabels).toEqual(["가위질"]);
    expect(result.firstsCount).toBe(2);
  });

  it("'처음 해본 것'이 하나도 없으면 변화를 지어내지 않고 최근 기록으로 대신한다", () => {
    const result = buildGrowthNote(
      [
        entry("2026-07-25", { findings: [{ kind: "health", label: "콧물" }] }),
        entry("2026-07-27", { findings: [{ kind: "health", label: "콧물" }] }),
        entry("2026-07-29", { findings: [] }),
      ],
      TODAY
    )!;

    expect(result.moments).toHaveLength(3);
    // firstLabels가 전부 비어 있어야 UI가 "성장 장면"으로 단정하지 않을 수 있다.
    expect(result.moments.every((m) => m.firstLabels.length === 0)).toBe(true);
    expect(result.firstsCount).toBe(0);
  });

  it("근거는 원문이 아니라 summary라서 7일 롤링 삭제 후에도 남는다", () => {
    const result = buildGrowthNote(
      [
        // raw 없음 = 7일이 지나 원문이 비워진 날
        entry("2026-07-05", { summary: "블록을 처음 쌓았다는 기록", findings: [{ kind: "first", label: "블록 쌓기" }] }),
        entry("2026-07-20", { summary: "친구와 함께 놀았다는 기록", findings: [{ kind: "first", label: "협동 놀이" }] }),
        entry("2026-07-29", { raw: "오늘 원문", summary: "오늘의 근거" }),
      ],
      TODAY
    )!;

    expect(result.moments.map((m) => m.basis)).toEqual([
      "블록을 처음 쌓았다는 기록",
      "친구와 함께 놀았다는 기록",
    ]);
    expect(result.moments.every((m) => m.basis.length > 0)).toBe(true);
  });

  it("반복 신호는 2번 이상만, 알림장 수 단위로 센다", () => {
    const result = buildGrowthNote(
      [
        entry("2026-07-25", { findings: [{ kind: "health", label: "콧물" }, { kind: "first", label: "가위질" }] }),
        entry("2026-07-27", { findings: [{ kind: "health", label: "콧물" }] }),
        entry("2026-07-29", { findings: [{ kind: "health", label: "콧물" }, { kind: "health", label: "기침" }] }),
      ],
      TODAY
    )!;

    expect(result.repeated).toEqual([{ kind: "health", label: "콧물", count: 3 }]);
    // 1번만 나온 기침·가위질은 "반복"이 아니다.
    expect(result.repeated.some((r) => r.label === "기침" || r.label === "가위질")).toBe(false);
  });

  it("한 알림장에 같은 라벨이 중복돼도 1건으로 센다 (분모와 단위 일치)", () => {
    const result = buildGrowthNote(
      [
        entry("2026-07-25", {
          findings: [
            { kind: "health", label: "콧물" },
            { kind: "health", label: "콧물" },
          ],
        }),
        entry("2026-07-27", { findings: [{ kind: "health", label: "콧물" }] }),
        entry("2026-07-29", { findings: [] }),
      ],
      TODAY
    )!;

    const runny = result.repeated.find((r) => r.label === "콧물")!;
    expect(runny.count).toBe(2);
    expect(runny.count).toBeLessThanOrEqual(result.notesCount);
  });

  it("성장 장면이 많으면 최근 것만 남기고 생략 수를 알린다", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      entry(`2026-07-${String(10 + i * 2).padStart(2, "0")}`, {
        findings: [{ kind: "first", label: `처음-${i}` }],
      })
    );
    const result = buildGrowthNote(many, TODAY)!;

    expect(result.moments).toHaveLength(5);
    expect(result.momentsOmitted).toBe(3);
    // 남긴 것은 가장 최근 5건이어야 한다.
    expect(result.moments[result.moments.length - 1].date).toBe("2026-07-24");
  });

  it("모든 반복 신호 수는 분모를 넘지 않는다", () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      entry(`2026-07-${String(20 + i).padStart(2, "0")}`, {
        findings: [{ kind: "health", label: "콧물" }],
      })
    );
    const result = buildGrowthNote(entries, TODAY)!;

    expect(result.repeated.every((r) => r.count <= result.notesCount)).toBe(true);
  });
});
