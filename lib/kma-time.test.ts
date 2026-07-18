import { describe, it, expect } from "vitest";
import { getNcstBaseDateTime, ymd } from "./kma-time";

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

describe("ymd", () => {
  it("한 자리 월·일을 0 패딩한다", () => {
    expect(ymd(kst("2026-01-05T09:00:00"))).toBe("20260105");
  });
});
