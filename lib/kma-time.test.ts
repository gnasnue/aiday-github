import { describe, it, expect } from "vitest";
import { getNcstBaseDateTime, recentFcstBases, ymd } from "./kma-time";

// 초단기실황 base_time 계산 회귀 방지 — 정각~14분 구간의 직전 시각 롤백과
// 자정 경계(날짜까지 넘어가는 롤백)가 하루 15분씩 조용히 틀릴 수 있는 지점이다.
// 인자는 KST 벽시계로 보정된 Date(UTC 게터로 읽는 프로젝트 관례).
const kst = (iso: string) => new Date(iso + "Z");

describe("getNcstBaseDateTime", () => {
  it("분 15 이상이면 현재 시각 정각 발표본", () => {
    expect(getNcstBaseDateTime(kst("2026-07-18T22:23:00"))).toEqual({
      base_date: "20260718",
      base_time: "2200",
    });
  });

  it("분 14 이하면 직전 시각으로 롤백", () => {
    expect(getNcstBaseDateTime(kst("2026-07-18T22:10:00"))).toEqual({
      base_date: "20260718",
      base_time: "2100",
    });
  });

  it("자정 직후(00:00~00:14)는 전날 2300으로 날짜까지 롤백", () => {
    expect(getNcstBaseDateTime(kst("2026-08-01T00:10:00"))).toEqual({
      base_date: "20260731",
      base_time: "2300",
    });
  });

  it("연 경계(1/1 00:05)도 전년 12/31 2300으로 롤백", () => {
    expect(getNcstBaseDateTime(kst("2027-01-01T00:05:00"))).toEqual({
      base_date: "20261231",
      base_time: "2300",
    });
  });
});

describe("recentFcstBases", () => {
  it("자기 자신을 첫 원소로, 발표본을 최신→과거 순으로 반환한다", () => {
    expect(recentFcstBases("20260723", "1100", 3)).toEqual([
      { base_date: "20260723", base_time: "1100" },
      { base_date: "20260723", base_time: "0800" },
      { base_date: "20260723", base_time: "0500" },
    ]);
  });

  it("발표 목록 앞을 넘어가면 전날 2300으로 이어진다", () => {
    expect(recentFcstBases("20260723", "0500", 3)).toEqual([
      { base_date: "20260723", base_time: "0500" },
      { base_date: "20260723", base_time: "0200" },
      { base_date: "20260722", base_time: "2300" },
    ]);
  });

  it("월 경계도 전달 말일로 롤백한다", () => {
    expect(recentFcstBases("20260801", "0200", 2)).toEqual([
      { base_date: "20260801", base_time: "0200" },
      { base_date: "20260731", base_time: "2300" },
    ]);
  });

  it("목록에 없는 base_time은 마지막 발표본(2300)으로 간주한다", () => {
    expect(recentFcstBases("20260723", "0000", 1)).toEqual([
      { base_date: "20260723", base_time: "2300" },
    ]);
  });
});

describe("ymd", () => {
  it("한 자리 월·일을 0 패딩한다", () => {
    expect(ymd(kst("2026-01-05T09:00:00"))).toBe("20260105");
  });
});
