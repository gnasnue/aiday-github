import { describe, it, expect } from "vitest";
import {
  hasRespiratory,
  hasAllergy,
  hasSkin,
  sensitivityPhrase,
  sweatPhrase,
} from "./child-conditions";

// 실제 어휘 표본:
// - 온보딩(app/onboarding/page.tsx)이 저장하는 라벨 전체 문자열
// - 구형/데모 프로필(lib/profile.ts)이 저장하는 짧은 문자열
const ONBOARDING = {
  resp: "호흡기 민감 (비염, 천식·기관지)",
  allergy: "알레르기 체질 (꽃가루·먼지)",
  skin: "민감 피부 (아토피·건조·자외선)",
  none: "해당없음",
};
const DEMO = { rhinitis: "비염", atopy: "아토피", sensSkin: "피부 민감" };

describe("hasRespiratory", () => {
  it("온보딩 호흡기 라벨을 매칭한다 (버그 A 회귀 방지)", () => {
    expect(hasRespiratory([ONBOARDING.resp])).toBe(true);
  });
  it("데모/구형 짧은 문자열도 매칭한다", () => {
    expect(hasRespiratory([DEMO.rhinitis])).toBe(true);
  });
  it("무관한 항목·빈 입력은 false", () => {
    expect(hasRespiratory([ONBOARDING.skin])).toBe(false);
    expect(hasRespiratory([ONBOARDING.none])).toBe(false);
    expect(hasRespiratory([])).toBe(false);
    expect(hasRespiratory()).toBe(false);
  });
});

describe("hasAllergy", () => {
  it("알레르기 라벨만 매칭한다 (호흡기·피부와 분리)", () => {
    expect(hasAllergy([ONBOARDING.allergy])).toBe(true);
    expect(hasAllergy([ONBOARDING.resp])).toBe(false);
    expect(hasAllergy([ONBOARDING.skin])).toBe(false);
  });
});

describe("hasSkin", () => {
  it("온보딩 민감 피부 라벨을 매칭한다 (어순 뒤집힘 대응)", () => {
    expect(hasSkin([ONBOARDING.skin])).toBe(true);
  });
  it("데모 '아토피'·'피부 민감'을 매칭한다 (넓은 기준)", () => {
    expect(hasSkin([DEMO.atopy])).toBe(true);
    expect(hasSkin([DEMO.sensSkin])).toBe(true);
  });
  it("무관한 항목은 false", () => {
    expect(hasSkin([ONBOARDING.resp])).toBe(false);
    expect(hasSkin([ONBOARDING.none])).toBe(false);
  });
});

describe("데모-1 복합 프로필 (아토피 + 비염)", () => {
  // 수정 전엔 아토피가 '피부 민감' 정확일치에 걸리지 않아 보습 안내가 누락됐었다.
  const demo1 = [DEMO.atopy, DEMO.rhinitis];
  it("호흡기·피부 신호가 둘 다 켜진다", () => {
    expect(hasRespiratory(demo1)).toBe(true);
    expect(hasSkin(demo1)).toBe(true);
  });
});

describe("sensitivityPhrase", () => {
  it("코드를 한국어로 변환한다", () => {
    expect(sensitivityPhrase("normal")).toBe("보통");
    expect(sensitivityPhrase("very-much")).toBe("매우 많이 탐");
    expect(sensitivityPhrase("very-less")).toBe("매우 덜 탐");
  });
  it("맵에 없는 값(데모/구형 한국어)은 원문 그대로 통과한다 (버그 B fallback)", () => {
    expect(sensitivityPhrase("보통이에요")).toBe("보통이에요");
    expect(sensitivityPhrase("더위를 많이 타요")).toBe("더위를 많이 타요");
  });
  it("빈 값은 undefined", () => {
    expect(sensitivityPhrase(undefined)).toBeUndefined();
    expect(sensitivityPhrase("")).toBeUndefined();
  });
});

describe("sweatPhrase", () => {
  it("코드를 한국어로 변환한다", () => {
    expect(sweatPhrase("much")).toBe("조금 많음");
    expect(sweatPhrase("less")).toBe("적은 편");
  });
  it("맵에 없는 값은 원문 그대로 통과한다", () => {
    expect(sweatPhrase("많아요")).toBe("많아요");
  });
  it("빈 값은 undefined", () => {
    expect(sweatPhrase(undefined)).toBeUndefined();
  });
});
