import { describe, it, expect } from "vitest";
import { buildPrepKeywords, isCriticalPrep } from "./prep";
import type { HomeTimeSlot } from "./timeline";

// 우산 임계값 회귀 방지 — 2026-07 스크린샷 버그: 강수확률 30% 흐린 여름날
// 전 슬롯에 우산이 최우선 강조로 떠 신호가 죽던 문제(#98에서 60%→30% 완화의 부작용).
const slot = (over: Partial<HomeTimeSlot>): HomeTimeSlot => ({
  time: "등원시간",
  hour: "08:30",
  endHour: null,
  isDefault: false,
  sky: 3,
  pty: 0,
  pop: null,
  temp: 27,
  feels: 26,
  dust: "보통",
  uv: "낮음",
  pollen: "낮음",
  humidity: 55,
  wind: "약함",
  ...over,
});

describe("buildPrepKeywords — 우산", () => {
  it("강수확률 30%(여름 배경 수준)에서는 우산을 내지 않는다", () => {
    expect(buildPrepKeywords(slot({ pop: 30, popWindow: 30 }), null)).not.toContain("우산");
  });

  it("창 max 60% 이상이면 우산을 최우선으로 낸다", () => {
    expect(buildPrepKeywords(slot({ pop: 60, popWindow: 60 }), null)[0]).toBe("우산");
  });

  it("슬롯 정시값이 낮아도 창 안에 소나기 예보(rainWindow)가 있으면 우산을 낸다", () => {
    expect(buildPrepKeywords(slot({ pop: 10, popWindow: 80, rainWindow: true }), null)).toContain("우산");
  });

  it("창 max 40~50%는 예비 신호 — 한가한 슬롯에서만 노출된다", () => {
    expect(buildPrepKeywords(slot({ pop: 45, popWindow: 45 }), null)).toContain("우산");
  });

  it("창 max 40~50% 예비 신호는 더 급한 신호 2개에 밀려난다", () => {
    // 폭염(물통 90 + 모자 60) 슬롯에서는 우산(55)이 상위 2개 경쟁에서 탈락
    const kws = buildPrepKeywords(slot({ pop: 45, popWindow: 45, temp: 33, uv: "강함" }), null);
    expect(kws).toHaveLength(2);
    expect(kws).not.toContain("우산");
  });

  it("popWindow가 없는 폴백 슬롯은 정시값(pop)으로 판정한다", () => {
    expect(buildPrepKeywords(slot({ pop: 70 }), null)).toContain("우산");
    expect(buildPrepKeywords(slot({ pop: 30 }), null)).not.toContain("우산");
  });
});

// 보습제 회귀 방지 — 2026-07-20 실사용 지적: 습도 80~90% 여름 아침 등원 카드에
// 피부 민감 체질 상시 신호가 "보습제"를 띄우고(85점), 실제 유효한 여벌 옷(58)을 밀어냄.
describe("buildPrepKeywords — 보습제", () => {
  const skin = ["피부 민감 (아토피, 건조)"];

  it("습도 60% 이상이면 피부 민감 체질이라도 대표 슬롯에 보습제를 내지 않는다", () => {
    expect(buildPrepKeywords(slot({ humidity: 90 }), null, skin, true)).not.toContain("보습제");
    expect(buildPrepKeywords(slot({ humidity: 60 }), null, skin, true)).not.toContain("보습제");
  });

  it("습하지 않은 날(45~59%)엔 피부 민감 체질 대표 슬롯에 보습제를 낸다", () => {
    expect(buildPrepKeywords(slot({ humidity: 55 }), null, skin, true)).toContain("보습제");
  });

  it("체질 상시 신호는 급성 날씨 신호(여벌 옷 등)를 밀어내지 않는다", () => {
    // 고온다습(땀 신호) + 강수 예비 신호 슬롯: 우산(55)·여벌 옷(58)이 보습제 상시(52)보다 앞선다
    const kws = buildPrepKeywords(
      slot({ temp: 29, humidity: 75, pop: 45, popWindow: 45 }),
      null,
      skin,
      true
    );
    expect(kws).not.toContain("보습제");
  });

  it("건조(습도 45% 미만)는 체질과 무관한 날씨 신호로 보습제를 낸다", () => {
    expect(buildPrepKeywords(slot({ humidity: 40 }), null)).toContain("보습제");
  });
});

// 칩 강조(오렌지) — 아이템 화이트리스트가 아니라 신호 긴급도로 판정 (2026-07-20 확정).
describe("isCriticalPrep — 긴급도 기반 강조", () => {
  it("우산: 확정 신호(창 60%↑·비 예보)만 강조하고 예비 신호(40~50%)는 강조하지 않는다", () => {
    expect(isCriticalPrep("우산", slot({ pop: 60, popWindow: 60 }))).toBe(true);
    expect(isCriticalPrep("우산", slot({ pop: 10, rainWindow: true }))).toBe(true);
    expect(isCriticalPrep("우산", slot({ pop: 45, popWindow: 45 }))).toBe(false);
  });

  it("폭염 물통·한파 방한용품은 강조한다 (종전 화이트리스트에선 누락)", () => {
    expect(isCriticalPrep("물통", slot({ temp: 33 }))).toBe(true);
    expect(isCriticalPrep("물통", slot({ temp: 28 }))).toBe(false);
    expect(isCriticalPrep("방한용품", slot({ temp: -2 }))).toBe(true);
  });

  it("별칭 어휘도 표준화 후 판정한다 — AI가 '물병'·'자외선차단제'로 내도 강조 누락 없음", () => {
    expect(isCriticalPrep("물병", slot({ temp: 33 }))).toBe(true);
    expect(isCriticalPrep("자외선차단제", slot({ uv: "매우강함" }))).toBe(true);
  });

  it("마스크: 미세먼지 나쁨이면 강조, 꽃가루 높음은 호흡기·알레르기 체질일 때만 강조", () => {
    expect(isCriticalPrep("마스크", slot({ dust: "나쁨" }))).toBe(true);
    expect(isCriticalPrep("마스크", slot({ pollen: "높음" }))).toBe(false);
    expect(isCriticalPrep("마스크", slot({ pollen: "높음" }), ["알레르기"])).toBe(true);
  });

  it("선크림: 매우강함은 항상, 강함은 피부 민감 체질일 때만 강조한다", () => {
    expect(isCriticalPrep("선크림", slot({ uv: "매우강함" }))).toBe(true);
    expect(isCriticalPrep("선크림", slot({ uv: "강함" }))).toBe(false);
    expect(isCriticalPrep("선크림", slot({ uv: "강함" }), ["아토피"])).toBe(true);
  });

  it("쾌적·보조 준비물(보습제·여벌 옷 등)은 강조하지 않는다", () => {
    expect(isCriticalPrep("보습제", slot({ humidity: 30 }))).toBe(false);
    expect(isCriticalPrep("여벌 옷", slot({ temp: 30, humidity: 80 }))).toBe(false);
  });

  it("실내놀이(마스크 대체 신호)는 마스크와 같은 환경 근거로 강조한다", () => {
    expect(isCriticalPrep("실내놀이", slot({ dust: "나쁨" }))).toBe(true);
    expect(isCriticalPrep("실내놀이", slot({}))).toBe(false);
  });
});

// 마스크 연령 규칙(R1) — 24개월 미만이면 마스크 대신 실내놀이. AI 프롬프트의
// "만 2세 미만 마스크 금지"와 규칙 엔진이 어긋나 화면이 자기모순되던 구멍의 회귀 방지.
describe("buildPrepKeywords — 마스크 연령 규칙", () => {
  it("maskAllowed=false면 미세먼지 나쁨에 마스크 대신 실내놀이를 낸다", () => {
    const kws = buildPrepKeywords(slot({ dust: "나쁨" }), null, [], false, false, false);
    expect(kws).not.toContain("마스크");
    expect(kws).toContain("실내놀이");
  });

  it("maskAllowed=false면 약한 신호(무체질 꽃가루)는 대체 없이 생략한다", () => {
    const kws = buildPrepKeywords(slot({ pollen: "높음" }), null, [], false, false, false);
    expect(kws).not.toContain("마스크");
    expect(kws).not.toContain("실내놀이");
  });

  it("체질 아이 + 꽃가루 높음도 마스크 불가 나이면 실내놀이로 대체한다", () => {
    const kws = buildPrepKeywords(slot({ pollen: "높음" }), null, ["비염"], false, false, false);
    expect(kws).toContain("실내놀이");
  });

  it("기본값(maskAllowed 미지정)은 종전과 동일하게 마스크를 낸다", () => {
    expect(buildPrepKeywords(slot({ dust: "나쁨" }), null)).toContain("마스크");
  });
});
