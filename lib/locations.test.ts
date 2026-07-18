import { describe, it, expect } from "vitest";
import { nearestSeoulGu, distanceKm } from "./locations";

describe("nearestSeoulGu", () => {
  it("강남역 좌표는 강남구 또는 서초구(경계 인접)로 매핑된다", () => {
    // 강남역(37.4979, 127.0276)은 강남구·서초구 경계 — 어느 쪽이든 인접 구면 유효
    const gu = nearestSeoulGu(37.4979, 127.0276);
    expect(["강남구", "서초구"]).toContain(gu?.name);
  });

  it("서울시청 좌표는 중구 또는 종로구(경계 인접 — 구청 중심점 매칭 특성)", () => {
    expect(["중구", "종로구"]).toContain(nearestSeoulGu(37.5665, 126.978)?.name);
  });

  it("노원역 인근은 노원구", () => {
    expect(nearestSeoulGu(37.6552, 127.0615)?.name).toBe("노원구");
  });

  it("부산(서울 밖)은 null — 미지원을 정직하게 알린다", () => {
    expect(nearestSeoulGu(35.1796, 129.0756)).toBeNull();
  });

  it("대전도 null", () => {
    expect(nearestSeoulGu(36.3504, 127.3845)).toBeNull();
  });
});

describe("distanceKm", () => {
  it("같은 지점은 0", () => {
    expect(distanceKm(37.5, 127, 37.5, 127)).toBe(0);
  });

  it("서울시청~부산시청은 약 320km", () => {
    const d = distanceKm(37.5665, 126.978, 35.1796, 129.0756);
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(340);
  });
});
