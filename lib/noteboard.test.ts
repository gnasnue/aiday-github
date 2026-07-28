import { describe, it, expect, beforeEach } from "vitest";
import {
  healthMentionCount,
  maskOtherNames,
  pruneRaw,
  NOTE_RAW_RETENTION_DAYS,
  type NoteboardEntry,
} from "./noteboard";

const TODAY = "2026-07-29";

const entry = (date: string, raw: string | undefined, findings: NoteboardEntry["result"]["findings"] = []): NoteboardEntry => ({
  childId: "c1",
  date,
  raw,
  result: { headline: "h", summary: "s", talks: [], findings },
  ts: 0,
});

/* ---------- 마스킹 ---------- */

describe("maskOtherNames", () => {
  it("우리 아이 이름은 보존하고 다른 아이 이름만 가린다", () => {
    const out = maskOtherNames("지우가 얼음을 만졌어요. 민서도 함께 놀았어요.", "지우");
    expect(out).toContain("지우가");
    expect(out).not.toContain("민서");
    expect(out).toContain("친구도");
  });

  it("'○○이' 형태의 우리 아이 이름도 보존한다", () => {
    // 프로필 이름이 "지우"인데 알림장은 "지우이가"가 아니라 "지우가"로 쓴다.
    expect(maskOtherNames("지우가 웃었어요", "지우")).toContain("지우가");
    // 반대로 프로필이 "지훈이"처럼 저장된 경우도 보존
    expect(maskOtherNames("지훈이가 웃었어요", "지훈이")).toContain("지훈이가");
  });

  it("흔한 일반 명사는 이름으로 오인하지 않는다", () => {
    const text = "오늘은 실내에서 놀이를 했어요. 점심도 잘 먹었어요. 친구와 함께였어요.";
    expect(maskOtherNames(text, "지우")).toBe(text);
  });

  it("여러 아이 이름을 각각 가린다", () => {
    const out = maskOtherNames("민서가 먼저 만지고 하준이도 따라 했어요.", "지우");
    expect(out).not.toMatch(/민서|하준/);
    expect(out).toContain("친구가");
    expect(out).toContain("친구도");
  });

  it("아이 이름이 비어 있어도 터지지 않는다", () => {
    expect(() => maskOtherNames("민서가 놀았어요", "")).not.toThrow();
  });

  it("문장 구조를 유지한다 (조사를 그대로 살린다)", () => {
    expect(maskOtherNames("민서랑 블록을 쌓았어요", "지우")).toBe("친구랑 블록을 쌓았어요");
  });
});

/* ---------- 보존 정책 ---------- */

describe("pruneRaw", () => {
  it(`${NOTE_RAW_RETENTION_DAYS}일이 지난 항목의 원문만 비우고 결과는 남긴다`, () => {
    const old = entry("2026-07-20", "옛 알림장 원문"); // 9일 전
    const recent = entry("2026-07-27", "최근 알림장 원문"); // 2일 전
    const [a, b] = pruneRaw([old, recent], TODAY);
    expect(a.raw).toBeUndefined();
    expect(a.result).toEqual(old.result); // 추출 결과는 보존
    expect(b.raw).toBe("최근 알림장 원문");
  });

  it("보존 경계일(7일째)은 아직 남긴다", () => {
    // 오늘 포함 7일 = 2026-07-23 ~ 07-29
    expect(pruneRaw([entry("2026-07-23", "경계")], TODAY)[0].raw).toBe("경계");
    expect(pruneRaw([entry("2026-07-22", "경계 밖")], TODAY)[0].raw).toBeUndefined();
  });

  it("이미 비워진 항목은 그대로 둔다", () => {
    const e = entry("2026-07-01", undefined);
    expect(pruneRaw([e], TODAY)[0]).toBe(e);
  });
});

/* ---------- 파생 ---------- */

describe("healthMentionCount", () => {
  const withHealth = (date: string, label: string) =>
    entry(date, undefined, [{ kind: "health" as const, label }]);

  it("최근 7일 안의 같은 관찰 횟수를 센다", () => {
    const entries = [
      withHealth("2026-07-29", "콧물"),
      withHealth("2026-07-26", "콧물"),
      withHealth("2026-07-20", "콧물"), // 창 밖
    ];
    expect(healthMentionCount(entries, "콧물", TODAY)).toBe(2);
  });

  it("다른 라벨·다른 종류는 세지 않는다", () => {
    const entries = [
      withHealth("2026-07-29", "콧물"),
      withHealth("2026-07-28", "기침"),
      entry("2026-07-27", undefined, [{ kind: "first", label: "콧물" }]),
    ];
    expect(healthMentionCount(entries, "콧물", TODAY)).toBe(1);
  });

  it("없으면 0", () => {
    expect(healthMentionCount([], "콧물", TODAY)).toBe(0);
  });
});
