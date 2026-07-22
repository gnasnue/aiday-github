import { describe, it, expect } from "vitest";
import {
  ageInMonths,
  canRecommendMask,
  conditionsForPrompt,
  hasRespiratory,
  hasAllergy,
  hasSkin,
  sensitivityPhrase,
  sweatPhrase,
} from "./child-conditions";
import { canonicalPrep, canonicalPrepList } from "../prep-vocab";

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

// 프롬프트 입력 변환 — 질병명이 출력에 진단 단정("비염 있는 ○○")으로 복사되는 것을
// 입력 단계에서 차단한다 (2026-07-21).
describe("conditionsForPrompt", () => {
  it("온보딩 라벨을 질병명 없는 민감 체질 표현으로 변환한다", () => {
    const out = conditionsForPrompt([ONBOARDING.resp, ONBOARDING.skin]);
    expect(out).toBe("호흡기·기관지가 민감한 편, 피부가 민감하고 예민한 편");
    expect(out).not.toMatch(/비염|천식|아토피/);
  });

  it("구형/데모 키워드('비염'·'아토피')도 같은 표현으로 수렴한다", () => {
    expect(conditionsForPrompt([DEMO.rhinitis])).toBe("호흡기·기관지가 민감한 편");
    expect(conditionsForPrompt([DEMO.atopy])).toBe("피부가 민감하고 예민한 편");
  });

  it("알레르기 체질을 변환한다", () => {
    expect(conditionsForPrompt([ONBOARDING.allergy])).toBe(
      "알레르기(꽃가루·먼지)에 민감한 편"
    );
  });

  it("'해당없음'·'기타'·빈 입력은 '없음'", () => {
    expect(conditionsForPrompt([ONBOARDING.none])).toBe("없음");
    expect(conditionsForPrompt(["기타"])).toBe("없음");
    expect(conditionsForPrompt([])).toBe("없음");
    expect(conditionsForPrompt()).toBe("없음");
  });

  it("기타(etc)는 부모가 직접 쓴 문장이므로 원문 그대로 덧붙인다", () => {
    expect(conditionsForPrompt([ONBOARDING.resp], "달걀 알레르기")).toBe(
      "호흡기·기관지가 민감한 편, 달걀 알레르기"
    );
    expect(conditionsForPrompt([], "  땀띠가 잘 나요  ")).toBe("땀띠가 잘 나요");
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

// 마스크 연령 규칙(R1)의 기반 — birth(연·월) 우선, age 문자열 폴백, 보수적(나이 낮게) 판정.
describe("ageInMonths", () => {
  const now = new Date(2026, 6, 20); // 2026-07-20 (month는 0-base)

  it("birth 연·월이 있으면 정확한 개월 수를 낸다", () => {
    expect(ageInMonths(undefined, { year: "2025", month: "3" }, now)).toBe(16);
    expect(ageInMonths(undefined, { year: "2022", month: "3" }, now)).toBe(52);
  });

  it("생월 미상이면 연말 출생으로 간주해 나이를 낮게 잡는다 (보수적 — calcAge와 동일 원칙)", () => {
    expect(ageInMonths(undefined, { year: "2024" }, now)).toBe(19); // 12월생 가정
  });

  it("birth가 없으면 age 문자열을 파싱한다 — '만 N세'·'N개월'·'N살'", () => {
    expect(ageInMonths("만 4세", undefined, now)).toBe(48);
    expect(ageInMonths("16개월", undefined, now)).toBe(16);
    expect(ageInMonths("3살", undefined, now)).toBe(36);
  });

  it("판정 불가면 null", () => {
    expect(ageInMonths("", undefined, now)).toBeNull();
    expect(ageInMonths(undefined, undefined, now)).toBeNull();
  });
});

describe("canRecommendMask", () => {
  it("24개월 미만은 마스크 비권장, 이상은 권장", () => {
    expect(canRecommendMask(16)).toBe(false);
    expect(canRecommendMask(23)).toBe(false);
    expect(canRecommendMask(24)).toBe(true);
    expect(canRecommendMask(48)).toBe(true);
  });

  it("나이 미상(null)은 기존 동작 유지 — 권장 허용", () => {
    expect(canRecommendMask(null)).toBe(true);
  });
});

// 준비물 어휘 사전(R2) — 별칭이 표준명으로 수렴하는지.
describe("canonicalPrep", () => {
  it("별칭을 표준명으로 통일한다", () => {
    expect(canonicalPrep("물병")).toBe("물통");
    expect(canonicalPrep("자외선차단제")).toBe("선크림");
    expect(canonicalPrep("실내 놀이거리")).toBe("실내놀이");
    expect(canonicalPrep("여벌옷")).toBe("여벌 옷");
  });

  it("미등록 이름은 trim만 하고 그대로 통과한다", () => {
    expect(canonicalPrep(" 우산 ")).toBe("우산");
    expect(canonicalPrep("바람막이")).toBe("바람막이");
  });

  it("목록 정규화는 별칭 중복을 제거한다", () => {
    expect(canonicalPrepList(["물병", "물통", "선크림"])).toEqual(["물통", "선크림"]);
  });
});
