import { describe, it, expect } from "vitest";
import { ageBand } from "./analytics";

// 연령군 매핑은 PRODUCT-DECISIONS §3-6(1~2 / 3~6 / 7~8)과 지표 집계의 근거 —
// 경계가 어긋나면 연령군별 유용성·정확도 분석이 통째로 오염된다.
describe("ageBand", () => {
  it("만 나이 문자열을 연령군으로 매핑한다", () => {
    expect(ageBand("만 1세")).toBe("1-2");
    expect(ageBand("만 2세")).toBe("1-2");
    expect(ageBand("만 3세")).toBe("3-6");
    expect(ageBand("만 6세")).toBe("3-6");
    expect(ageBand("만 7세")).toBe("7-8");
    expect(ageBand("만 8세")).toBe("7-8");
  });

  it("만 0세는 1-2 군으로 흡수한다 (배제하지 않는다)", () => {
    expect(ageBand("만 0세")).toBe("1-2");
  });

  it("상한 초과 나이도 배제하지 않고 7-8로 집계한다", () => {
    expect(ageBand("만 9세")).toBe("7-8");
  });

  it("파싱 불가 값은 null — 무연령군으로 집계한다", () => {
    expect(ageBand(undefined)).toBeNull();
    expect(ageBand("")).toBeNull();
    expect(ageBand("나이 미상")).toBeNull();
  });

  it("숫자만 있는 구형 포맷도 허용한다", () => {
    expect(ageBand("4")).toBe("3-6");
    expect(ageBand("4세")).toBe("3-6");
  });
});
