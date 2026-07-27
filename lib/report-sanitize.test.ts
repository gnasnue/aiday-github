import { describe, it, expect } from "vitest";
import {
  applyTextStyleGates,
  isMaskJustified,
  sanitizeReportPayload,
  stripMetaComparison,
  type ReportPayload,
} from "./report-sanitize";

const payload = (over: Partial<ReportPayload> = {}): ReportPayload => ({
  hook: "",
  message: "",
  checklist: [],
  prep: {},
  ...over,
});

describe("isMaskJustified — 근거 게이트", () => {
  const clean = { pm10Grade: 1, pm25Grade: 1, khaiGrade: 1, pollenGrades: [0, 0, 0] };

  it("미세먼지 나쁨(등급 3)/매우나쁨(4)이면 정당", () => {
    expect(isMaskJustified({ ...clean, pm10Grade: 3 })).toBe(true);
    expect(isMaskJustified({ ...clean, pm25Grade: 4 })).toBe(true);
    expect(isMaskJustified({ ...clean, khaiGrade: 3 })).toBe(true);
  });

  it("꽃가루 높음(지수 2)/매우높음(3)이면 정당", () => {
    expect(isMaskJustified({ ...clean, pollenGrades: [0, 2, 0] })).toBe(true);
    expect(isMaskJustified({ ...clean, pollenGrades: [3] })).toBe(true);
  });

  it("미세먼지 좋음·보통 + 꽃가루 보통 이하면 정당하지 않다", () => {
    expect(isMaskJustified(clean)).toBe(false);
    expect(isMaskJustified({ ...clean, pm10Grade: 2, pollenGrades: [1, 1] })).toBe(false);
  });

  it("데이터 결측(null)은 정당화 근거로 쓰지 않는다", () => {
    expect(isMaskJustified({ pm10Grade: null, pm25Grade: null, khaiGrade: null, pollenGrades: [] })).toBe(false);
    expect(isMaskJustified({ pm10Grade: null, pm25Grade: null, khaiGrade: null, pollenGrades: [null] })).toBe(false);
  });
});

// 두 게이트 조합
const OK = { maskJustified: true, maskAllowedForAge: true };
const NO_REASON = { maskJustified: false, maskAllowedForAge: true };
const INFANT = { maskJustified: true, maskAllowedForAge: false };

describe("sanitizeReportPayload — ① 마스크 정책", () => {
  it("근거 O + 나이 O → 마스크 유지", () => {
    const p = payload({ checklist: ["😷 마스크", "💧 물통"], prep: { 등원: ["마스크"] } });
    const out = sanitizeReportPayload(p, OK);
    expect(out.maskAction).toBe("none");
    expect(out.payload.checklist).toEqual(["😷 마스크", "💧 물통"]);
    expect(out.payload.prep).toEqual({ 등원: ["마스크"] });
  });

  it("근거 X → checklist·prep에서 마스크 제거", () => {
    const p = payload({
      checklist: ["☂️ 우산", "😷 마스크", "👕 여벌 옷"],
      prep: { 등원: ["우산", "마스크"], 야외활동: ["여벌 옷"] },
    });
    const out = sanitizeReportPayload(p, NO_REASON);
    expect(out.maskAction).toBe("removed");
    expect(out.payload.checklist).toEqual(["☂️ 우산", "👕 여벌 옷"]);
    expect(out.payload.prep).toEqual({ 등원: ["우산"], 야외활동: ["여벌 옷"] });
  });

  it("근거 O + 만 2세 미만 → 마스크를 실내놀이로 대체(경고 유지)", () => {
    const p = payload({
      checklist: ["😷 마스크", "💧 물통"],
      prep: { 등원: ["마스크"], 야외활동: ["마스크", "물통"] },
    });
    const out = sanitizeReportPayload(p, INFANT);
    expect(out.maskAction).toBe("downgraded");
    expect(out.payload.checklist).toEqual(["🧸 실내놀이", "💧 물통"]);
    expect(out.payload.prep).toEqual({ 등원: ["실내놀이"], 야외활동: ["실내놀이", "물통"] });
  });

  it("근거 X면 나이가 어려도 실내놀이가 아니라 제거(위험 자체가 없음)", () => {
    const out = sanitizeReportPayload(payload({ checklist: ["😷 마스크", "💧 물통"] }), {
      maskJustified: false,
      maskAllowedForAge: false,
    });
    expect(out.maskAction).toBe("removed");
    expect(out.payload.checklist).toEqual(["💧 물통"]);
  });
});

describe("sanitizeReportPayload — ② 마스크 본문 언급 게이트", () => {
  it("근거 X → message에서 마스크 언급 줄만 제거한다 (부정 언급 포함)", () => {
    const p = payload({
      message:
        "오늘 **31°C**에 습도 **70%**라 땀이 옷에 그대로 남는 날이에요.\n" +
        "땀이 매우 많은 도준이는 호흡기가 민감해 마스크를 씌우면 오히려 답답해할 수 있으니 통풍이 우선이에요.\n" +
        "**야외활동** 뒤 **여벌 상의**로 갈아입혀 주세요.",
    });
    const out = sanitizeReportPayload(p, NO_REASON);
    expect(out.maskTextDropped).toEqual(["message-line"]);
    expect(out.payload.message).toBe(
      "오늘 **31°C**에 습도 **70%**라 땀이 옷에 그대로 남는 날이에요.\n**야외활동** 뒤 **여벌 상의**로 갈아입혀 주세요."
    );
  });

  it("근거 X → hook의 마스크 언급은 hook을 통째로 비운다 (홈이 message 첫 줄로 폴백)", () => {
    const out = sanitizeReportPayload(
      payload({ hook: "습도 90% — 마스크 대신 통풍 우선이에요", message: "본문이에요.\n둘째 줄." }),
      NO_REASON
    );
    expect(out.maskTextDropped).toEqual(["hook"]);
    expect(out.payload.hook).toBe("");
    expect(out.payload.message).toBe("본문이에요.\n둘째 줄.");
  });

  it("근거 O면 본문 언급을 건드리지 않는다 (영아의 '쓰기 어려운 나이라' 설명 포함)", () => {
    const msg = "미세먼지가 나빠요.\n서아는 아직 마스크를 쓰기 어려운 나이라 실내 놀이로 바꿔주세요.\n물도 자주요.";
    const out = sanitizeReportPayload(payload({ message: msg }), INFANT);
    expect(out.maskTextDropped).toEqual([]);
    expect(out.payload.message).toBe(msg);
  });

  it("전 줄이 마스크 언급이면 빈 본문 대신 원문을 유지한다 (과삭제 방지)", () => {
    const msg = "마스크 이야기뿐인 줄.";
    const out = sanitizeReportPayload(payload({ message: msg }), NO_REASON);
    expect(out.maskTextDropped).toEqual([]);
    expect(out.payload.message).toBe(msg);
  });
});

describe("sanitizeReportPayload — ③ prep ⊆ checklist", () => {
  it("checklist에 없는 준비물 칩을 제거한다", () => {
    const p = payload({
      checklist: ["☂️ 우산", "💧 물통"],
      prep: { 등원: ["우산", "모자"], 야외활동: ["선크림"] },
    });
    const out = sanitizeReportPayload(p, OK);
    expect(out.payload.prep).toEqual({ 등원: ["우산"] });
    expect(out.droppedPrep.sort()).toEqual(["등원:모자", "야외활동:선크림"].sort());
  });

  it("어휘 별칭은 표준화해 매칭한다 (checklist '자외선차단제' ↔ prep '선크림')", () => {
    const p = payload({
      checklist: ["🧴 자외선차단제", "💧 물통"],
      prep: { 야외활동: ["선크림", "물병"] },
    });
    const out = sanitizeReportPayload(p, OK);
    // 선크림≡자외선차단제, 물병≡물통 → 둘 다 유지
    expect(out.payload.prep).toEqual({ 야외활동: ["선크림", "물병"] });
    expect(out.droppedPrep).toEqual([]);
  });

  it("checklist가 비면 prep을 통째로 지우지 않는다 (과삭제 방지)", () => {
    const out = sanitizeReportPayload(payload({ checklist: [], prep: { 등원: ["우산"] } }), OK);
    expect(out.payload.prep).toEqual({ 등원: ["우산"] });
  });
});

describe("본문 스타일 게이트 — ③", () => {
  it("메타 비교 부가어를 제거해도 문장이 성립한다 (2026-07-27 실사례)", () => {
    expect(stripMetaComparison("놀이 후 갈아입히는 게 더위 자체보다 중요해요.")).toBe(
      "놀이 후 갈아입히는 게 중요해요."
    );
    expect(stripMetaComparison("특이사항 없는 하은이는 비 자체보다 젖은 신발이 문제예요.")).toBe(
      "특이사항 없는 하은이는 젖은 신발이 문제예요."
    );
    expect(stripMetaComparison("더위 자체가 아니라 젖은 옷이 문제예요.")).toBe("젖은 옷이 문제예요.");
  });

  it("hook 행동을 되풀이하는 줄은 꼬리절만 남긴다 (S06 실사례)", () => {
    const { message, actions } = applyTextStyleGates(
      "미세먼지 매우나쁨 — 야외활동은 실내 놀이로 바꿔주세요",
      "오늘 초미세먼지가 **매우나쁨**까지 올라요.\n16개월 서아는 아직 마스크로 막아주기 어려운 나이예요.\n**11시** 야외활동은 실내 놀이로 바꾸고, 꼭 나가야 하면 아주 짧게만 다녀오세요."
    );
    expect(actions).toContain("hook-echo:clause-trimmed");
    expect(message.split("\n")[2]).toBe("꼭 나가야 하면 아주 짧게만 다녀오세요.");
  });

  it("꼬리절이 없으면 줄을 제거한다 (다른 줄이 남을 때만)", () => {
    const { message, actions } = applyTextStyleGates(
      "낮 32도 — 야외활동 뒤 옷 갈아입혀 주세요",
      "오늘 습도가 높은 날이에요.\n야외활동 뒤엔 옷을 꼭 갈아입혀 주세요.",
    );
    expect(actions).toContain("hook-echo:line-dropped");
    expect(message).toBe("오늘 습도가 높은 날이에요.");
  });

  it("알림장 인용문 안의 행동 반복은 정당한 위임 장치로 허용한다", () => {
    const line = "여벌은 상의 1장이면 충분해요 — 알림장에 '야외활동 뒤 옷 갈아입혀 주세요' 한 줄 남겨주세요.";
    const { message, actions } = applyTextStyleGates("낮 32도 — 야외활동 뒤 옷 갈아입혀 주세요", line);
    expect(actions).toEqual([]);
    expect(message).toBe(line);
  });

  it("좋음 등급 부가절을 지워도 문장이 성립한다 (E-AHA-4 실사례)", () => {
    const { message, actions } = applyTextStyleGates(
      "모처럼 무난한 날 — 가볍게 반팔로 보내주세요",
      "오늘은 **22~26°C**를 오가는 **맑음**에 미세먼지도 **좋음**이라 걱정할 환경이 없는 날이에요.\n특이사항 없는 다온이는 여벌을 챙기면 짐만 늘어요.\n**야외활동** 전에 **물통**만 챙겨 보내면 충분해요."
    );
    expect(actions).toContain("grade-mention:clause-trimmed");
    expect(message).not.toMatch(/좋음/);
    expect(message).toMatch(/걱정할 환경이 없는 날이에요/);
  });

  it("등급이 서술어라 수술 불가한 줄은 제거한다 (다른 줄이 남을 때만)", () => {
    const { message, actions } = applyTextStyleGates(
      "모처럼 무난한 날 — 가볍게 보내주세요",
      "자외선은 **보통**이에요.\n다온이는 가볍게 입어도 충분한 날이에요."
    );
    expect(actions).toContain("grade-mention:line-dropped");
    expect(message).toBe("다온이는 가볍게 입어도 충분한 날이에요.");
  });

  it("나쁨·높음 등 문제 등급 언급은 건드리지 않는다", () => {
    const msg = "오늘 **미세먼지**가 **나쁨**까지 올라요.\n하준이는 같은 공기도 크게 와닿아요.\n**물**도 자주 마시게 해주세요.";
    const out = applyTextStyleGates("미세먼지 나쁨 — 등원길 마스크 챙겨주세요", msg);
    expect(out.actions).toEqual([]);
    expect(out.message).toBe(msg);
  });

  it("위반이 없으면 아무것도 바꾸지 않는다", () => {
    const msg = "오늘 **32°C**에 습도 **85%**예요.\n지우는 야외활동 뒤가 문제예요.\n여벌은 상의 1장이면 충분해요.";
    const out = applyTextStyleGates("낮 32도 — 땀 젖은 옷은 바로 갈아입혀 주세요", msg);
    expect(out.actions).toEqual([]);
    expect(out.message).toBe(msg);
  });
});

describe("sanitizeReportPayload — 공통", () => {
  it("근거 O + 나이 O면 hook·message를 건드리지 않는다", () => {
    const p = payload({ hook: "미세먼지 나쁨 — 마스크 챙겨주세요", message: "마스크 챙겨주세요.\n둘째 줄.", checklist: ["😷 마스크"], prep: {} });
    const out = sanitizeReportPayload(p, OK);
    expect(out.payload.hook).toBe("미세먼지 나쁨 — 마스크 챙겨주세요");
    expect(out.payload.message).toBe("마스크 챙겨주세요.\n둘째 줄.");
    expect(out.maskTextDropped).toEqual([]);
  });
});

// 회귀 1: 스크린샷 — 여름 습도 93%·미세먼지 좋음·비염/천식인데 AI가 마스크 권함.
describe("회귀 — 고습 여름 + 미세먼지 좋음", () => {
  it("마스크를 checklist·prep에서 걷어낸다", () => {
    const maskJustified = isMaskJustified({ pm10Grade: 1, pm25Grade: 1, khaiGrade: 1, pollenGrades: [0, 0, 0] });
    expect(maskJustified).toBe(false);
    const ai = payload({
      hook: "강수확률 60% 우산과 마스크 함께",
      checklist: ["☂️ 우산", "😷 마스크", "👕 여벌 옷"],
      prep: { 등원: ["우산"], 야외활동: ["마스크", "여벌 옷"] },
    });
    const out = sanitizeReportPayload(ai, { maskJustified, maskAllowedForAge: true });
    expect(out.payload.checklist).toEqual(["☂️ 우산", "👕 여벌 옷"]);
    expect(out.payload.prep).toEqual({ 등원: ["우산"], 야외활동: ["여벌 옷"] });
  });
});

// 회귀 2: 미세먼지 나쁜 날 만 2세 미만 — 근거는 있으나 마스크 대신 실내놀이.
describe("회귀 — 미세먼지 나쁨 + 만 2세 미만", () => {
  it("마스크가 아니라 실내놀이로 나간다", () => {
    const maskJustified = isMaskJustified({ pm10Grade: 3, pm25Grade: 3, khaiGrade: 3, pollenGrades: [0] });
    expect(maskJustified).toBe(true);
    const ai = payload({ checklist: ["😷 마스크", "💧 물통"], prep: { 등원: ["마스크"] } });
    const out = sanitizeReportPayload(ai, { maskJustified, maskAllowedForAge: false });
    expect(out.maskAction).toBe("downgraded");
    expect(out.payload.checklist).toEqual(["🧸 실내놀이", "💧 물통"]);
    expect(out.payload.prep).toEqual({ 등원: ["실내놀이"] });
  });
});
