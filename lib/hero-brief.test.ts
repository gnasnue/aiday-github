import { describe, it, expect } from "vitest";
import {
  toBrief,
  splitHook,
  highlightHeadline,
  pickPrimaryPrep,
  pickEvidence,
  heroState,
  splitPrepText,
  prepNeedles,
} from "./hero-brief";

// 히어로 Decision Brief 파생 규칙 회귀 방지.
// 입력 문구는 실제 프롬프트 few-shot(lib/prompts/report.ts)에서 가져왔다 — 화면이
// 받는 hook의 실제 형태에서 검증해야 "구조가 성립한다"고 말할 수 있다.

describe("toBrief — hook을 조건 + 결론으로", () => {
  it("대시를 1차 구분자로 쓴다", () => {
    expect(toBrief("꽃가루 매우높음 — 마스크 필수")).toEqual({
      context: "꽃가루 매우높음",
      headline: "마스크 필수",
    });
  });

  it("행동절에 쉼표가 섞여도 대시에서 갈린다", () => {
    expect(toBrief("자외선 매우강함 — 땀도 많은 날, 대비하세요")).toEqual({
      context: "자외선 매우강함",
      headline: "땀도 많은 날, 대비하세요",
    });
  });

  it("대시가 없으면 쉼표를 폴백 구분자로 쓰고, 매달린 쉼표는 떼어낸다", () => {
    expect(toBrief("비 소식, 우산과 여벌 옷 챙기세요")).toEqual({
      context: "비 소식",
      headline: "우산과 여벌 옷 챙기세요",
    });
  });

  it("절이 하나뿐이면 context는 null — pill을 만들지 않는다", () => {
    expect(toBrief("모처럼 무난한 날")).toEqual({ context: null, headline: "모처럼 무난한 날" });
  });

  it("빈 문자열에도 깨지지 않는다", () => {
    expect(toBrief("")).toEqual({ context: null, headline: "" });
  });

  it("splitHook은 현행 홈과 동일하게 동작한다(통합 시 로컬 사본 제거용 기준)", () => {
    expect(splitHook("34도 폭염 — 오늘은 더위가 1순위")).toEqual([
      "34도 폭염",
      "오늘은 더위가 1순위",
    ]);
    expect(splitHook("모처럼 무난한 날")).toEqual(["모처럼 무난한 날"]);
  });
});

describe("highlightHeadline — 강조 구간은 준비물 명사 매칭으로만", () => {
  it("긴 이름을 먼저 매칭한다 — '얇은 겉옷'이 '겉옷'을 이긴다", () => {
    const segs = highlightHeadline("얇은 겉옷 챙겨주세요", ["겉옷", "얇은 겉옷"]);
    expect(segs.filter((s) => s.emphasis).map((s) => s.text)).toEqual(["얇은 겉옷"]);
  });

  it("표준 어휘로 정규화해서 매칭한다 — 별칭 '여벌옷' → '여벌 옷'", () => {
    const segs = highlightHeadline("여벌 옷도 챙겨주세요", ["여벌옷"]);
    expect(segs.filter((s) => s.emphasis).map((s) => s.text)).toEqual(["여벌 옷"]);
  });

  it("앞뒤 텍스트를 보존하며 3조각으로 쪼갠다", () => {
    expect(highlightHeadline("우산 꼭 챙겨요", ["우산"])).toEqual([
      { text: "우산", emphasis: true },
      { text: " 꼭 챙겨요", emphasis: false },
    ]);
  });

  it("매칭이 없으면 강조를 만들지 않는다", () => {
    const segs = highlightHeadline("오늘은 실내가 좋아요", ["우산", "물통"]);
    expect(segs).toEqual([{ text: "오늘은 실내가 좋아요", emphasis: false }]);
  });

  it("한 글자 후보로는 강조하지 않는다 — '물'이 '물통'·'물수건'을 오염시키지 않게", () => {
    const segs = highlightHeadline("물놀이 하기 좋은 날", ["물"]);
    expect(segs.every((s) => !s.emphasis)).toBe(true);
  });

  it("hook이 수식어를 떨궈도 핵심 명사로 매칭한다 — 체크리스트 '얇은 겉옷' ↔ hook '겉옷'", () => {
    const segs = highlightHeadline("얇게 입히고 겉옷을 챙겨주세요", ["얇은 겉옷", "물통"]);
    expect(segs.filter((s) => s.emphasis).map((s) => s.text)).toEqual(["겉옷"]);
  });
});

describe("prepNeedles — 매칭 후보 생성", () => {
  it("원본·표준명·핵심 명사를 모두 만들고 한 글자는 버린다", () => {
    expect(prepNeedles("얇은 겉옷").sort()).toEqual(["겉옷", "얇은 겉옷"]);
    expect(prepNeedles("여벌옷").sort()).toEqual(["여벌 옷", "여벌옷"]); // '옷'은 한 글자라 제외
    expect(prepNeedles("마스크")).toEqual(["마스크"]);
  });
});

describe("pickPrimaryPrep — accent 타일 1개", () => {
  const items = [
    { key: "얇은 겉옷", title: "얇은 겉옷" },
    { key: "여벌 옷", title: "여벌 옷" },
    { key: "마스크", title: "마스크", critical: true },
    { key: "물통", title: "물통" },
  ];

  it("헤드라인이 지시한 준비물을 1순위로 고른다", () => {
    expect(pickPrimaryPrep("얇게 입히고 겉옷을 챙겨주세요", items)).toBe("얇은 겉옷");
  });

  it("헤드라인이 물건을 지목하지 않으면 긴급(critical) 항목으로 폴백한다", () => {
    expect(pickPrimaryPrep("오늘은 실내가 좋아요", items)).toBe("마스크");
  });

  it("헤드라인·긴급 신호가 모두 없으면 null — 강조를 억지로 만들지 않는다", () => {
    const plain = items.filter((i) => !i.critical);
    expect(pickPrimaryPrep("오늘은 실내가 좋아요", plain)).toBeNull();
  });

  it("두 규칙이 어긋나면 결론 일치를 우선한다", () => {
    // 마스크가 critical이지만 헤드라인이 우산을 지목한 경우
    const withUmbrella = [...items, { key: "우산", title: "우산" }];
    expect(pickPrimaryPrep("강수확률 60% 우산 챙겨요", withUmbrella)).toBe("우산");
  });
});

describe("pickEvidence — 근거 chip 2~3개", () => {
  it("이슈 지표를 먼저, 그다음 priority 순으로 최대 3개", () => {
    const picked = pickEvidence([
      { label: "현재", value: "19°C", priority: 1 },
      { label: "일교차", value: "9°C", tone: "warn", priority: 2 },
      { label: "꽃가루", value: "높음", tone: "warn", priority: 3 },
      { label: "습도", value: "60%", priority: 4 },
    ]);
    expect(picked.map((e) => e.label)).toEqual(["일교차", "꽃가루", "현재"]);
    expect(picked).toHaveLength(3);
  });

  it("결측 지표는 칩을 만들지 않는다", () => {
    const picked = pickEvidence([
      { label: "일교차", value: "9°C", tone: "warn", priority: 1 },
      { label: "꽃가루", value: null, tone: "warn", priority: 2 },
      { label: "현재", value: "19°C", priority: 3 },
      { label: "자외선", value: "  ", priority: 4 },
      { label: "미세먼지", value: "—", priority: 5 },
    ]);
    expect(picked.map((e) => e.label)).toEqual(["일교차", "현재"]);
  });

  it("살아남은 칩이 2개 미만이면 빈 배열 — 근거 행 자체를 숨긴다", () => {
    expect(pickEvidence([{ label: "현재", value: "19°C", priority: 1 }])).toEqual([]);
    expect(pickEvidence([{ label: "현재", value: null, priority: 1 }])).toEqual([]);
  });

  it("tone을 지정하지 않으면 neutral", () => {
    const picked = pickEvidence([
      { label: "현재", value: "21°C", priority: 1 },
      { label: "일교차", value: "5°C", priority: 2 },
    ]);
    expect(picked.every((e) => e.tone === "neutral")).toBe(true);
  });
});

describe("heroState", () => {
  it("AI hook이 없으면 fallback — display 타입을 빌려주지 않는다", () => {
    expect(heroState({ hasAiHook: false, issueCount: 2 })).toBe("fallback");
  });

  it("주의 지표가 있으면 caution", () => {
    expect(heroState({ hasAiHook: true, issueCount: 1 })).toBe("caution");
  });

  it("주의 지표가 없고 야외활동이 좋으면 safe", () => {
    expect(heroState({ hasAiHook: true, issueCount: 0, outdoorGood: true })).toBe("safe");
  });

  it("그 외는 normal — tint 없이 뉴트럴", () => {
    expect(heroState({ hasAiHook: true, issueCount: 0 })).toBe("normal");
  });
});

describe("splitPrepText", () => {
  it("'제목 (사유)'를 나눈다", () => {
    expect(splitPrepText("여벌 옷 (산책 후 땀 갈아입기)")).toEqual({
      title: "여벌 옷",
      reason: "산책 후 땀 갈아입기",
    });
  });

  it("전각 괄호도 받는다", () => {
    expect(splitPrepText("물통（수분 보충）")).toEqual({ title: "물통", reason: "수분 보충" });
  });

  it("괄호가 없으면 제목만", () => {
    expect(splitPrepText("마스크")).toEqual({ title: "마스크", reason: "" });
  });
});
