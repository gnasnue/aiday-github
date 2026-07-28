import { describe, it, expect } from "vitest";
import {
  toBrief,
  splitHook,
  highlightHeadline,
  pickPrimaryPrep,
  pickEvidence,
  EVIDENCE_MAX,
  buildHeroEvidence,
  pickSupportLine,
  tempRangeOf,
  type EvidenceSlot,
  heroState,
  splitPrepText,
  parseAiPrepItem,
  buildAiChecklist,
  prepNeedles,
  headlineLines,
  discomfortIndex,
  TEMP_RANGE_WARN,
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
   parseAiPrepItem / buildAiChecklist
   2026-07-27 결함 회귀 고정: 이모지가 없으면 첫 단어를 아이콘으로 먹어
   "여벌 상의"가 "상의"로 렌더됐다(홈 page.tsx 인라인 정규식의 `\S+` 대안).
   ============================================================ */

describe("parseAiPrepItem", () => {
  it("계약대로 '이모지 짧은이름'을 아이콘과 이름으로 나눈다", () => {
    expect(parseAiPrepItem("👕 여벌 상의")).toEqual({ icon: "👕", name: "여벌 상의" });
    expect(parseAiPrepItem("🧸 실내 놀이거리")).toEqual({ icon: "🧸", name: "실내 놀이거리" });
    expect(parseAiPrepItem("🧥 지퍼 겉옷")).toEqual({ icon: "🧥", name: "지퍼 겉옷" });
  });

  it("변이 선택자(FE0F)가 붙은 이모지도 한 덩어리로 떼어낸다", () => {
    // "☂️"는 U+2602 + U+FE0F 두 코드포인트다. 앞 한 글자만 떼면 FE0F가 이름 앞에 남는다.
    expect(parseAiPrepItem("☂️ 우산")).toEqual({ icon: "☂️", name: "우산" });
  });

  it("피부톤 수식자가 붙어도 이름을 침범하지 않는다", () => {
    expect(parseAiPrepItem("👍🏽 물통")).toEqual({ icon: "👍🏽", name: "물통" });
  });

  it("**이모지가 없으면 전체가 이름이다 — 첫 단어를 먹지 않는다** (2026-07-27 결함)", () => {
    expect(parseAiPrepItem("여벌 상의")).toEqual({ icon: "✅", name: "여벌 상의" });
    expect(parseAiPrepItem("실내 놀이거리")).toEqual({ icon: "✅", name: "실내 놀이거리" });
    expect(parseAiPrepItem("얇은 목수건")).toEqual({ icon: "✅", name: "얇은 목수건" });
  });

  it("한 단어 항목은 이모지 유무와 무관하게 그대로", () => {
    expect(parseAiPrepItem("마스크")).toEqual({ icon: "✅", name: "마스크" });
    expect(parseAiPrepItem("😷 마스크")).toEqual({ icon: "😷", name: "마스크" });
  });

  it("이모지와 이름 사이 공백이 없어도 분리한다", () => {
    expect(parseAiPrepItem("👕여벌 상의")).toEqual({ icon: "👕", name: "여벌 상의" });
  });
});

describe("buildAiChecklist", () => {
  it("이름을 표준명으로 통일하고 key를 표준명 기반으로 만든다", () => {
    const out = buildAiChecklist(["💧 물병", "😷 마스크"]);
    expect(out.map((o) => o.text)).toEqual(["물통", "마스크"]);
    expect(out.map((o) => o.key)).toEqual(["물통", "마스크"]);
  });

  it("여벌 상의는 여벌 옷과 합쳐지지 않는다 (서로 다른 처방 — prep-vocab 계약)", () => {
    const out = buildAiChecklist(["👕 여벌 상의", "👕 여벌 옷"]);
    expect(out.map((o) => o.text)).toEqual(["여벌 상의", "여벌 옷"]);
  });

  it("이모지 없는 두 단어 항목도 이름이 온전하다 (결함 회귀)", () => {
    const out = buildAiChecklist(["여벌 상의", "물통"]);
    expect(out.map((o) => o.text)).toEqual(["여벌 상의", "물통"]);
    // 아이콘 폴백이어도 PrepIcon은 `icon + title`을 함께 보므로 셔츠 아이콘에 도달한다.
    expect(out[0].icon).toBe("✅");
  });

  it("같은 이름이 중복되면 key 충돌을 막는다", () => {
    const out = buildAiChecklist(["💧 물통", "💧 물병"]);
    expect(out.map((o) => o.key)).toEqual(["물통", "물통-1"]);
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
  // 22°는 더위(불쾌지수 계산 하한 24°)·추위(0°) 어느 쪽도 발동하지 않는 중립 기온이다.
  temp: 22,
  ...over,
});

/** 06~21시 3시간 예보 기온 6점 */
const TEMPS = [24, 27, 30, 31, 29, 26];

/* ============================================================
   더위·추위·일교차 warn 승격
   2026-07-27 결함 회귀 고정: pill이 "낮 31도 고습"이라 그날의 1순위 조건을 말하는데
   카드는 뉴트럴(= DESIGN.md 정의상 "특이사항 없음")로 렌더됐다. 더위·고습이 히어로 warn
   어휘에 아예 없었기 때문 — 시간대별 환경 카드·outdoor-index·건강팁은 모두 이상 신호로
   다루던 지표였다. 임계는 outdoor-index decisiveDeterrent에서 차용했다.
   ============================================================ */

describe("discomfortIndex — 기상청 불쾌지수", () => {
  it("기온 24° 미만에서는 계산하지 않는다 — 서늘하고 습한 날을 더위로 오인하지 않는다", () => {
    expect(discomfortIndex(20, 90)).toBeNull();
    expect(discomfortIndex(23.9, 100)).toBeNull();
  });

  it("결측(기온·습도 없음)이면 null", () => {
    expect(discomfortIndex(null, 70)).toBeNull();
    expect(discomfortIndex(30, null)).toBeNull();
    expect(discomfortIndex(30, 0)).toBeNull();
  });

  it("공식대로 계산한다 — outdoor-index와 같은 식", () => {
    // 0.81·30 + 0.01·70·(0.99·30 − 14.3) + 46.3 = 24.3 + 0.7·15.4 + 46.3 = 81.38
    expect(discomfortIndex(30, 70)).toBeCloseTo(81.38, 2);
  });
});

describe("buildHeroEvidence — 더위·추위", () => {
  it("2026-07-27 제보 재현: 32°·고습이면 caution + 더위 칩 (종전엔 normal + 뉴트럴 pill)", () => {
    const r = buildHeroEvidence({
      slot: slot({ temp: 32, humidity: 70 }),
      hourlyTemps: TEMPS,
      hasAiHook: true,
    });
    expect(r.state).toBe("caution");
    expect(r.issueLabels).toContain("더위");
    expect(r.evidence.find((e) => e.label === "더위")).toMatchObject({
      value: "매우 심함",
      tone: "warn",
    });
  });

  it("습도가 낮아도 기온 33°↑는 더위 매우 심함 (폭염 단독 경로)", () => {
    const r = buildHeroEvidence({
      slot: slot({ temp: 34, humidity: 30 }),
      hourlyTemps: TEMPS,
      hasAiHook: true,
    });
    expect(r.evidence.find((e) => e.label === "더위")?.value).toBe("매우 심함");
    expect(r.state).toBe("caution");
  });

  it("불쾌지수 76~79는 '심함' 한 단계 아래", () => {
    // 28°·65% → 0.81·28 + 0.01·65·(0.99·28 − 14.3) + 46.3 = 22.68 + 0.65·13.42 + 46.3 = 77.7
    const r = buildHeroEvidence({
      slot: slot({ temp: 28, humidity: 65 }),
      hourlyTemps: TEMPS,
      hasAiHook: true,
    });
    expect(r.evidence.find((e) => e.label === "더위")?.value).toBe("심함");
  });

  it("서늘하고 습한 날은 더위가 아니다 — 습도 ≥80% 무조건 warn을 택하지 않은 이유", () => {
    const r = buildHeroEvidence({
      slot: slot({ temp: 19, humidity: 92 }),
      hourlyTemps: TEMPS,
      hasAiHook: true,
    });
    expect(r.issueLabels).not.toContain("더위");
  });

  it("더위는 칩 하나로만 센다 — 폭염과 고온다습이 겹쳐도 issueCount가 부풀지 않는다", () => {
    const r = buildHeroEvidence({
      slot: slot({ temp: 35, humidity: 85 }),
      hourlyTemps: TEMPS,
      hasAiHook: true,
    });
    expect(r.issueLabels.filter((l) => l === "더위")).toHaveLength(1);
  });

  it("기온 0°↓는 추위 심함", () => {
    const r = buildHeroEvidence({
      slot: slot({ temp: -3, humidity: 55 }),
      hourlyTemps: [-5, -3, 0, 1, -1, -4],
      hasAiHook: true,
    });
    expect(r.issueLabels).toContain("추위");
    expect(r.state).toBe("caution");
  });

  it("기온이 결측이면 더위·추위를 만들지 않는다 — 결측을 판정으로 위장하지 않는다", () => {
    const r = buildHeroEvidence({
      slot: slot({ temp: null, humidity: 90 }),
      hourlyTemps: TEMPS,
      hasAiHook: true,
    });
    expect(r.issueLabels).not.toContain("더위");
    expect(r.issueLabels).not.toContain("추위");
  });
});

describe("buildHeroEvidence — 일교차 warn 승격", () => {
  it(`일교차 ${TEMP_RANGE_WARN}°↑는 warn 칩이 되고 카드가 caution이 된다`, () => {
    const r = buildHeroEvidence({
      slot: slot(),
      hourlyTemps: [18, 22, 26, 27, 24, 19], // 27 − 18 = 9
      hasAiHook: true,
    });
    expect(r.evidence.find((e) => e.label === "일교차")).toMatchObject({
      value: "9°",
      tone: "warn",
    });
    expect(r.state).toBe("caution");
  });

  it("임계 미달(7°)은 뉴트럴 칩 그대로 — 무난한 날 칩 공급이 끊기지 않는다", () => {
    const r = buildHeroEvidence({ slot: slot(), hourlyTemps: TEMPS, hasAiHook: true });
    expect(r.evidence.find((e) => e.label === "일교차")).toMatchObject({
      value: "7°",
      tone: "neutral",
    });
    expect(r.state).toBe("normal");
  });
});

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
      // 2026-07-27 승격분 — 새 신호도 같은 불변식 아래 둔다. 이게 빠지면 "이슈를 말하는
      // pill + 뉴트럴 카드"가 다시 생긴다.
      slot({ temp: 32, humidity: 70 }), // 고온다습
      slot({ temp: 34, humidity: 30 }), // 폭염 단독
      slot({ temp: -3 }), // 한파
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

/* ---- pickSupportLine — 근거 문장은 AI 본문에서만 --------------------------
   2026-07-28 회귀 고정: 랜딩 직후(hook 도착 ~ message 도착 창)에 규칙 엔진 폴백 문장이
   히어로 근거 자리에 뜨던 결함. PR #94가 "오늘 챙길 것"에서 고친 같은 결함이 PR #167의
   새 표면(support)에 다시 열렸다 — 인라인 로직이라 테스트가 없었던 것이 재발의 조건이었다. */
describe("pickSupportLine — 근거 문장 발췌", () => {
  const AI_MESSAGE =
    "오늘 **야외활동**(**11시**)은 **31°C**·습도 **70%**예요.\n" +
    "땀이 매우 많은 도준이는 땀이 마르지 못해 체온이 쉽게 올라요.\n" +
    "**여벌 상의**를 챙겨 활동 뒤 갈아입혀 주세요.";
  // 규칙 엔진(lib/recommendation-engine.ts)이 만드는 폴백 문장 — 한 줄에 두 문장.
  const RULE_FALLBACK =
    "도준이에게는 오늘 __덥고 습함__이에요. 호흡기가 예민하니 **여벌 상의**를 꼭 챙겨주세요.";

  it("이름이 든 줄(문장2)을 고른다", () => {
    expect(
      pickSupportLine({ aiMessage: AI_MESSAGE, childName: "도준", hasHeadline: true })
    ).toBe("땀이 매우 많은 도준이는 땀이 마르지 못해 체온이 쉽게 올라요.");
  });

  it("스트리밍 중(본문 미도착)엔 null — 규칙 폴백을 대신 쓰지 않는다", () => {
    expect(pickSupportLine({ aiMessage: "", childName: "도준", hasHeadline: true })).toBeNull();
  });

  it("규칙 폴백 문장은 어떤 경로로도 근거가 되지 않는다 (2026-07-28 실사례)", () => {
    // 폴백 문장을 넘겨도(=종전 코드가 하던 일) 이름 줄이 곧 첫 줄이라 헤드라인과 중복 판정에
    // 걸린다. 애초에 화면은 폴백 문장을 이 함수에 넘기지 않는다 — 이중 방어.
    const line = pickSupportLine({
      aiMessage: RULE_FALLBACK,
      childName: "도준",
      hasHeadline: false,
      firstPlainLine: RULE_FALLBACK.replace(/\*\*|__/g, "").trim(),
    });
    expect(line).toBeNull();
  });

  it("이름 줄이 없으면 둘째 줄로 폴백한다", () => {
    const msg = "첫 줄 이슈 서술.\n둘째 줄 근거.\n셋째 줄 실행.";
    expect(pickSupportLine({ aiMessage: msg, childName: "도준", hasHeadline: true })).toBe(
      "둘째 줄 근거."
    );
  });

  it("hook이 없어 본문 첫 줄이 헤드라인이 된 경우, 같은 문장을 근거로 되풀이하지 않는다", () => {
    const msg = "**도준이**는 오늘 더위가 문제예요.\n둘째 줄.";
    expect(
      pickSupportLine({
        aiMessage: msg,
        childName: "도준",
        hasHeadline: false,
        firstPlainLine: "도준이는 오늘 더위가 문제예요.",
      })
    ).toBeNull();
  });

  it("hook이 있으면 첫 줄과 같아도 숨기지 않는다 (헤드라인은 hook에서 오므로 중복이 아니다)", () => {
    const msg = "**도준이**는 오늘 더위가 문제예요.\n둘째 줄.";
    expect(
      pickSupportLine({
        aiMessage: msg,
        childName: "도준",
        hasHeadline: true,
        firstPlainLine: "도준이는 오늘 더위가 문제예요.",
      })
    ).toBe("**도준이**는 오늘 더위가 문제예요.");
  });

  it("본문이 한 줄뿐이고 이름이 없으면 근거가 없다", () => {
    expect(
      pickSupportLine({ aiMessage: "한 줄뿐인 본문.", childName: "도준", hasHeadline: true })
    ).toBeNull();
  });
});
