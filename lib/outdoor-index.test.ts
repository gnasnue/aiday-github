import { describe, it, expect } from "vitest";
import { computeOutdoorIndex } from "./outdoor-index";

describe("computeOutdoorIndex — 기본 동작", () => {
  it("모든 지표가 쾌적하면 100점 '좋음'", () => {
    const r = computeOutdoorIndex({
      pm10Grade: 1,
      pm25Grade: 1,
      uvi: 1,
      pollenMax: 0, // 꽃가루농도위험지수 0 = 낮음 (0~3 스케일)
      pop: 0,
      humidity: 50,
      temp: 22,
      windSpeed: 1,
    });
    expect(r.score).toBe(100);
    expect(r.label).toBe("좋음");
  });

  it("입력이 없으면 감점 없이 '좋음'", () => {
    const r = computeOutdoorIndex({});
    expect(r.score).toBe(100);
    expect(r.label).toBe("좋음");
  });
});

// 꽃가루농도위험지수는 0~3(낮음·보통·높음·매우높음). 상한을 4로 잡으면 최고 감점이
// 영원히 적용되지 않고 근거 표기도 한 칸씩 낮게 나간다 — 값별로 감점·표기를 고정한다.
describe("computeOutdoorIndex — 꽃가루 지수(0~3) 감점·근거 표기", () => {
  it.each([
    [0, 0, "꽃가루 낮음"],
    [1, 5, "꽃가루 보통"],
    [2, 15, "꽃가루 높음"],
    [3, 25, "꽃가루 매우높음"],
  ] as const)("지수 %i → 감점 %i, 근거 '%s'", (pollenMax, penalty, basis) => {
    const r = computeOutdoorIndex({ pollenMax });
    expect(r.score).toBe(100 - penalty);
    expect(r.basis).toContain(basis);
  });

  it("지수 미제공(null)이면 감점도 근거 표기도 없다", () => {
    const r = computeOutdoorIndex({ pollenMax: null });
    expect(r.score).toBe(100);
    expect(r.basis.some((b) => b.startsWith("꽃가루"))).toBe(false);
  });
});

describe("computeOutdoorIndex — 강수확률 정합(앱 전체 warn 경계 ≥60%)", () => {
  // 회귀: 2026-07-20 실측. pop 60%·습도 92%가 지수 80 "좋음" + "비 소식이 있어요…무리 없어요"로
  // 모순 출력되던 버그. 강수 ≥60%는 홈·env·prep·outfit·report·weekend 모두 warn 경계다.
  it("실측 회귀: pop 60% + 습도 92% 는 '좋음'이 아니다", () => {
    const r = computeOutdoorIndex({ pop: 60, humidity: 92, temp: 26 });
    expect(r.label).not.toBe("좋음");
    expect(r.score).toBeLessThan(80);
  });

  it("실측 회귀: 강수 사유와 '좋음' 재확신 문구가 한 코멘트에 공존하지 않는다", () => {
    const r = computeOutdoorIndex({ pop: 60, humidity: 92, temp: 26 });
    expect(r.comment).toContain("비 올 확률이 높아요");
    // 신고된 모순 문장 "대체로 야외활동에 무리 없어요"('좋음' 전용 tail)는 사라져야 한다
    expect(r.comment).not.toContain("대체로 야외활동에 무리 없어요");
  });

  it("pop 60% 단독은 '보통'으로 떨어진다", () => {
    const r = computeOutdoorIndex({ pop: 60 });
    expect(r.label).toBe("보통");
    expect(r.comment).toContain("비 올 확률이 높아요");
  });

  it("정합 불변식: pop ≥60%면 라벨은 절대 '좋음'이 될 수 없다", () => {
    for (const pop of [60, 65, 70, 80, 90, 100]) {
      const r = computeOutdoorIndex({ pop });
      expect(r.label, `pop=${pop}`).not.toBe("좋음");
    }
  });

  it("pop 40~59%는 예비 신호로만 감점한다(확정 아님)", () => {
    const r = computeOutdoorIndex({ pop: 40 });
    expect(r.comment).toContain("비 소식이 있어요");
    // 예비 신호는 결정적 차단 대상이 아님 → 다른 저해 없으면 '좋음' 유지 가능
    expect(r.score).toBe(88);
  });

  it("pop 40% 미만은 감점하지 않는다", () => {
    expect(computeOutdoorIndex({ pop: 39 }).score).toBe(100);
  });
});

describe("computeOutdoorIndex — 고온다습(불쾌지수) 결합", () => {
  // 회귀: 다른 세션 실측(pop 30·습도 90·기온 26°C, DI≈77.7 '다수 불쾌').
  // 기온·습도를 따로 보면 둘 다 무감점이라 90점 "좋음"이 되던 결함.
  it("실측 회귀: 26°C·습도 90%는 '좋음'이 아니다(고온다습)", () => {
    const r = computeOutdoorIndex({ pop: 30, temp: 26, humidity: 90 });
    expect(r.label).not.toBe("좋음");
    expect(r.comment).toContain("무덥고 습해요");
  });

  it("쾌적한 여름날(26°C·습도 60%, DI<76)은 '좋음'을 유지한다", () => {
    const r = computeOutdoorIndex({ temp: 26, humidity: 60 });
    expect(r.label).toBe("좋음");
  });

  it("고온다습(30°C·습도 70%, DI≈83)은 '좋음'이 될 수 없다", () => {
    const r = computeOutdoorIndex({ temp: 30, humidity: 70 });
    expect(r.label).not.toBe("좋음");
  });

  it("더위·불쾌지수는 중복 감점하지 않는다(둘 중 큰 값만)", () => {
    // 35°C·70%: 기온 단독 -20, DI≈89 -28 → 합산(-48)이 아니라 큰 값 -28만 적용
    const r = computeOutdoorIndex({ temp: 35, humidity: 70 });
    expect(r.score).toBe(72);
  });

  it("점수와 라벨이 어긋나지 않는다(26°C·습도 90% → 79점 보통)", () => {
    // env가 점수·막대와 라벨을 함께 노출하므로, 라벨 차단이 점수와 괴리되면 안 된다
    const r = computeOutdoorIndex({ temp: 26, humidity: 90 });
    expect(r.score).toBe(79);
    expect(r.label).toBe("보통");
  });

  it("서늘·다습(24°C·습도 95%)은 땀띠 위험이 낮아 감점하지 않는다", () => {
    const r = computeOutdoorIndex({ temp: 24, humidity: 95 });
    expect(r.label).toBe("좋음");
  });
});

describe("computeOutdoorIndex — 습도 단독(기온 미상 fallback)", () => {
  it("기온이 없을 때 습도 90% 이상은 감점되고 근거에 표기된다", () => {
    const r = computeOutdoorIndex({ humidity: 92 });
    expect(r.score).toBe(90);
    expect(r.basis).toContain("습도 92%");
  });

  it("기온이 없을 때 습도 80~89%는 소폭 감점", () => {
    expect(computeOutdoorIndex({ humidity: 85 }).score).toBe(95);
  });

  it("습도 80% 미만은 감점하지 않고 근거에도 넣지 않는다", () => {
    const r = computeOutdoorIndex({ humidity: 70 });
    expect(r.score).toBe(100);
    expect(r.basis.some((b) => b.startsWith("습도"))).toBe(false);
  });
});

describe("computeOutdoorIndex — 결정적 저해 라벨 차단", () => {
  it("대기 매우나쁨(등급4)이면 다른 조건이 완벽해도 '좋음' 불가", () => {
    const r = computeOutdoorIndex({ pm10Grade: 4, pm25Grade: 1 });
    expect(r.label).not.toBe("좋음");
  });

  it("극단 추위(-2°C)는 '좋음'이 아니고, 감점 사유와 재확신 문구가 공존하지 않는다", () => {
    // 회귀: -2°C가 -20으로 80점 '좋음'에 안착해 "매우 추워요 + 대체로 무리 없어요"로
    // 모순 출력되던 케이스
    const r = computeOutdoorIndex({ temp: -2 });
    expect(r.label).not.toBe("좋음");
    expect(r.comment).toContain("매우 추워요");
    expect(r.comment).not.toContain("대체로 야외활동에 무리 없어요");
  });

  it("극단 더위(33°C, 습도 미상)도 '좋음'이 될 수 없다", () => {
    const r = computeOutdoorIndex({ temp: 33 });
    expect(r.label).not.toBe("좋음");
  });
});
