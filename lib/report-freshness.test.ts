import { describe, expect, it } from "vitest";
import { isProvisionalReport, needsMorningRefresh } from "./report-freshness";

// 로컬 타임존 기준 시각 생성 헬퍼 — 판정 로직이 기기 로컬 시각을 쓰므로 테스트도 로컬로 만든다
const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(y, mo - 1, d, h, mi);

describe("isProvisionalReport", () => {
  it("자정~06시 생성본은 잠정본", () => {
    expect(isProvisionalReport(at(2026, 7, 20, 0, 26).getTime())).toBe(true);
    expect(isProvisionalReport(at(2026, 7, 20, 5, 59).getTime())).toBe(true);
  });

  it("06시 이후 생성본은 완성본", () => {
    expect(isProvisionalReport(at(2026, 7, 20, 6, 0).getTime())).toBe(false);
    expect(isProvisionalReport(at(2026, 7, 20, 7, 30).getTime())).toBe(false);
    expect(isProvisionalReport(at(2026, 7, 20, 23, 59).getTime())).toBe(false);
  });
});

describe("needsMorningRefresh", () => {
  it("새벽 생성본을 같은 날 06시 이후에 보면 재생성", () => {
    const ts = at(2026, 7, 20, 0, 26).getTime();
    expect(needsMorningRefresh(ts, at(2026, 7, 20, 6, 0))).toBe(true);
    expect(needsMorningRefresh(ts, at(2026, 7, 20, 7, 15))).toBe(true);
    expect(needsMorningRefresh(ts, at(2026, 7, 20, 22, 0))).toBe(true);
  });

  it("아직 06시 전이면 잠정본 유지 (그 시점의 최선 데이터)", () => {
    const ts = at(2026, 7, 20, 0, 26).getTime();
    expect(needsMorningRefresh(ts, at(2026, 7, 20, 3, 0))).toBe(false);
    expect(needsMorningRefresh(ts, at(2026, 7, 20, 5, 59))).toBe(false);
  });

  it("완성본(06시 이후 생성)은 언제 봐도 재생성하지 않음", () => {
    const ts = at(2026, 7, 20, 7, 0).getTime();
    expect(needsMorningRefresh(ts, at(2026, 7, 20, 21, 0))).toBe(false);
  });

  it("날짜가 다르면 재생성 근거로 삼지 않음 (캐시 키 날짜 스코프의 이중 안전장치)", () => {
    const ts = at(2026, 7, 19, 0, 30).getTime();
    expect(needsMorningRefresh(ts, at(2026, 7, 20, 8, 0))).toBe(false);
  });
});
