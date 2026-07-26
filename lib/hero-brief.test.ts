import { describe, it, expect } from "vitest";
import {
  toBrief,
  splitHook,
  highlightHeadline,
  pickPrimaryPrep,
  pickEvidence,
  EVIDENCE_MAX,
  buildHeroEvidence,
  tempRangeOf,
  type EvidenceSlot,
  heroState,
  splitPrepText,
  prepNeedles,
  headlineLines,
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

  // hook은 25자 제한 때문에 물건 이름을 행동으로 압축한다("선크림·모자" → "그늘").
  // 이걸 인정하지 않으면 실제 hook 대부분에서 강조가 사라진다(라이브 관측: 4개 중 1개만 매칭).
  it("행동 목적어도 매칭한다 — hook '그늘' ↔ 체크리스트 선크림·모자", () => {
    const segs = highlightHeadline("그늘 위주로 짧게", ["선크림", "모자"]);
    expect(segs.filter((s) => s.emphasis).map((s) => s.text)).toEqual(["그늘"]);
  });

  it("행동 목적어는 대응 준비물이 목록에 있을 때만 인정한다 — 없는 행동을 강조하지 않는다", () => {
    const segs = highlightHeadline("그늘 위주로 짧게", ["우산", "물통"]);
    expect(segs.every((s) => !s.emphasis)).toBe(true);
  });

  it("'실내'는 실내놀이·마스크가 있을 때만", () => {
    expect(
      highlightHeadline("오늘은 실내가 좋아요", ["실내놀이"]).filter((s) => s.emphasis).map((s) => s.text)
    ).toEqual(["실내"]);
    expect(
      highlightHeadline("오늘은 실내가 좋아요", ["물통"]).every((s) => !s.emphasis)
    ).toBe(true);
  });

  it("목적어가 없는 결론은 강조하지 않는다 — 억지 강조 금지", () => {
    const segs = highlightHeadline("야외활동 짧게 해요", ["선크림", "모자", "물통"]);
    expect(segs).toEqual([{ text: "야외활동 짧게 해요", emphasis: false }]);
  });
});

describe("headlineLines — 결론 2줄 고정", () => {
  const text = (ls: ReturnType<typeof headlineLines>) => ls.map((l) => l.map((s) => s.text).join(""));

  it("길이 차가 가장 작은 어절 경계에서 2줄로 쪼갠다", () => {
    expect(text(headlineLines("등원길 마스크 챙기고 야외활동 줄여주세요"))).toEqual([
      "등원길 마스크 챙기고",
      "야외활동 줄여주세요",
    ]);
  });

  it("강조 구간을 가르지 않는다 — 밴드가 두 줄로 쪼개지면 형태가 무너진다", () => {
    const ls = headlineLines("야외활동 후 물수건과 여벌 옷 챙겨주세요", ["여벌 옷", "물수건"]);
    const em = ls.flat().filter((s) => s.emphasis).map((s) => s.text);
    expect(em).toEqual(["여벌 옷"]); // 한 줄 안에 온전히 남는다
    expect(ls).toHaveLength(2);
    expect(ls.some((l) => l.some((s) => s.emphasis))).toBe(true);
  });

  it("짧은 결론도 2줄로 쪼갠다 — 키워드가 첫 줄에 올라온다", () => {
    expect(text(headlineLines("우산 챙겨주세요"))).toEqual(["우산", "챙겨주세요"]);
  });

  it("한 글자만 남는 분할은 버린다", () => {
    // "물 챙겨요" → 앞줄이 1자라 분할 후보가 없다
    expect(headlineLines("물 챙겨요")).toHaveLength(1);
  });

  it("어절이 하나뿐이면 1줄로 둔다", () => {
    expect(headlineLines("챙겨주세요")).toHaveLength(1);
  });

  it("빈 문자열에도 깨지지 않는다", () => {
    expect(headlineLines("")).toHaveLength(1);
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

describe("pickEvidence — 근거 chip 상한 2개", () => {
  it("이슈 지표를 먼저, 그다음 priority 순으로 상한까지", () => {
    const picked = pickEvidence([
      { label: "현재", value: "19°C", priority: 1 },
      { label: "일교차", value: "9°C", tone: "warn", priority: 2 },
      { label: "꽃가루", value: "높음", tone: "warn", priority: 3 },
      { label: "습도", value: "60%", priority: 4 },
    ]);
    expect(picked.map((e) => e.label)).toEqual(["일교차", "꽃가루"]);
    expect(picked).toHaveLength(EVIDENCE_MAX);
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

  it("이슈 신호는 priority 순으로 — AI가 고른 1순위(-1)가 맨 앞", () => {
    const picked = pickEvidence([
      { label: "강수", value: "60%", tone: "warn", priority: 0 },
      { label: "자외선", value: "매우강함", tone: "warn", priority: -1 },
    ]);
    expect(picked.map((e) => e.label)).toEqual(["자외선", "강수"]);
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

/* ============================================================
   buildHeroEvidence — 근거 chip + 히어로 상태의 단일 진실
   2026-07-26 결함 회귀 고정: "주의색 카드 + 근거 칩 0개"
   ============================================================ */

const slot = (over: Partial<EvidenceSlot> = {}): EvidenceSlot => ({
  pty: 0,
  pop: 0,
  dust: "좋음",
  pollen: "낮음",
  uv: "보통",
  wind: "약함",
  humidity: 55,
  ...over,
});

/** 06~21시 3시간 예보 기온 6점 */
const TEMPS = [24, 27, 30, 31, 29, 26];

describe("tempRangeOf — 일교차 표본", () => {
  it("최고−최저를 반올림해 돌려준다", () => {
    expect(tempRangeOf(TEMPS)).toBe(7);
  });

  it("표본이 2점 미만이면 null — 칩을 만들지 않는다", () => {
    expect(tempRangeOf([25])).toBeNull();
    expect(tempRangeOf([])).toBeNull();
    expect(tempRangeOf(undefined)).toBeNull();
  });

  it("결측(null·undefined·NaN)은 표본에서 뺀다 — 결측을 0도로 위장하지 않는다", () => {
    expect(tempRangeOf([20, null, undefined, NaN, 28])).toBe(8);
    expect(tempRangeOf([null, undefined])).toBeNull();
  });
});

describe("buildHeroEvidence — 불변식", () => {
  // 이 두 케이스가 2026-07-26 결함의 본체다. 깨지면 그 버그가 돌아온 것이다.
  it("caution이면 근거 칩이 반드시 1개 이상 — warn 신호가 하나뿐인 날도", () => {
    const r = buildHeroEvidence({
      slot: slot({ uv: "강함" }),
      hourlyTemps: [],
      hasAiHook: true,
    });
    expect(r.state).toBe("caution");
    expect(r.evidence.length).toBeGreaterThanOrEqual(1);
    expect(r.evidence.some((e) => e.tone === "warn")).toBe(true);
  });

  it("warn 칩이 있으면 카드는 normal일 수 없다 — 역방향", () => {
    const cases: EvidenceSlot[] = [
      slot({ uv: "강함" }),
      slot({ dust: "매우나쁨" }),
      slot({ pollen: "높음" }),
      slot({ wind: "강함" }),
      slot({ humidity: 25 }),
      slot({ pty: 1, pop: 80 }),
    ];
    for (const s of cases) {
      const r = buildHeroEvidence({ slot: s, hourlyTemps: TEMPS, hasAiHook: true });
      if (r.evidence.some((e) => e.tone !== "neutral")) expect(r.state).not.toBe("normal");
    }
  });
});

describe("buildHeroEvidence — 계량 지표(뉴트럴) 공급", () => {
  it("이슈가 하나도 없는 무난한 날에도 칩이 뜬다 — 일교차·강수", () => {
    const r = buildHeroEvidence({ slot: slot(), hourlyTemps: TEMPS, hasAiHook: true });
    expect(r.state).toBe("normal");
    expect(r.evidence.map((e) => e.label)).toEqual(["일교차", "강수"]);
    expect(r.evidence.every((e) => e.tone === "neutral")).toBe(true);
  });

  it("강수형태 0이 확인된 경우에만 '없음' — 결측은 안심으로 바꾸지 않는다", () => {
    expect(
      buildHeroEvidence({ slot: slot({ pty: 0, pop: 0 }), hourlyTemps: TEMPS, hasAiHook: true })
        .evidence.find((e) => e.label === "강수")?.value
    ).toBe("없음");
    // pty 결측 + 저확률 → 수치를 그대로 둔다
    expect(
      buildHeroEvidence({ slot: slot({ pty: null, pop: 30 }), hourlyTemps: TEMPS, hasAiHook: true })
        .evidence.find((e) => e.label === "강수")?.value
    ).toBe("30%");
  });

  it("강수 60% 이상은 뉴트럴이 아니라 warn 칩", () => {
    const r = buildHeroEvidence({
      slot: slot({ pty: 0, pop: 60 }),
      hourlyTemps: TEMPS,
      hasAiHook: true,
    });
    expect(r.evidence.find((e) => e.label === "강수")?.tone).toBe("warn");
    expect(r.state).toBe("caution");
  });

  it("현재·체감 기온은 어떤 경우에도 칩이 되지 않는다 — 우상단 블록과 중복 금지", () => {
    const r = buildHeroEvidence({ slot: slot({ uv: "강함" }), hourlyTemps: TEMPS, hasAiHook: true });
    expect(r.evidence.map((e) => e.label)).not.toContain("현재");
    expect(r.evidence.map((e) => e.label)).not.toContain("체감");
  });
});

describe("buildHeroEvidence — 정렬·중복·결측", () => {
  it("AI가 고른 1순위 이슈가 맨 앞 — 같은 라벨이 두 개가 되지 않는다", () => {
    const r = buildHeroEvidence({
      slot: slot({ pty: 1, pop: 70, uv: "매우강함" }),
      hourlyTemps: TEMPS,
      ctxIssue: "자외선",
      hasAiHook: true,
    });
    expect(r.evidence[0].label).toBe("자외선");
    expect(new Set(r.evidence.map((e) => e.label)).size).toBe(r.evidence.length);
  });

  it("warn이 뉴트럴보다 앞 — 근거가 잘려도 이슈가 먼저 남는다", () => {
    const r = buildHeroEvidence({
      slot: slot({ dust: "나쁨" }),
      hourlyTemps: TEMPS,
      hasAiHook: true,
    });
    expect(r.evidence[0].label).toBe("미세먼지");
  });

  it("슬롯이 없고 일교차만 있으면 칩 1개뿐이라 행을 숨긴다(하한 2)", () => {
    const r = buildHeroEvidence({ slot: null, hourlyTemps: TEMPS, hasAiHook: true });
    expect(r.state).toBe("normal");
    expect(r.evidence).toEqual([]);
  });

  it("데이터가 전면 결측이면 칩 없음", () => {
    expect(buildHeroEvidence({ slot: null, hasAiHook: true }).evidence).toEqual([]);
  });

  it("하한은 상태로 갈린다 — 후보가 정확히 1개일 때 caution은 살리고 fallback은 숨긴다", () => {
    // 강수 결측(pty·pop 없음) + 일교차 표본 없음 → 후보는 자외선 warn 하나뿐
    const lone = { slot: slot({ uv: "강함", pty: null, pop: null }), hourlyTemps: [] };

    const caution = buildHeroEvidence({ ...lone, hasAiHook: true });
    expect(caution.state).toBe("caution");
    expect(caution.evidence.map((e) => e.label)).toEqual(["자외선"]);

    const fallback = buildHeroEvidence({ ...lone, hasAiHook: false });
    expect(fallback.state).toBe("fallback");
    expect(fallback.evidence).toEqual([]);
  });

  it("상한(2개)을 넘지 않는다 — 자세히 버튼과 한 행을 나눠 쓰므로 3개는 2줄로 밀린다", () => {
    const r = buildHeroEvidence({
      slot: slot({ pty: 1, pop: 80, dust: "나쁨", pollen: "높음", uv: "강함", wind: "강함" }),
      hourlyTemps: TEMPS,
      hasAiHook: true,
    });
    expect(r.evidence).toHaveLength(EVIDENCE_MAX);
  });
});
