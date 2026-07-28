import { describe, it, expect } from "vitest";
import { buildMorningMessage } from "./morning-message";

const base = {
  childName: "지우",
  hook: "낮 34도 고습 — 놀이 뒤 여벌 상의로 갈아입혀 주세요",
  preps: ["여벌 상의", "물통", "모자"],
  handoff:
    "11:00 야외활동 뒤 지우가 땀에 젖으면 가방의 여벌 상의로 갈아입혀 주세요. 오늘은 습해서 땀이 잘 마르지 않아요.",
  atDaycare: true,
};

describe("buildMorningMessage", () => {
  it("인사 → 조건 → 부탁 → 준비물 → 맺음말 순서로 조립한다", () => {
    const msg = buildMorningMessage(base)!;
    expect(msg.lines[0]).toBe("안녕하세요, 지우 보호자입니다.");
    expect(msg.lines[1]).toBe("오늘은 낮 34도 고습 예보예요.");
    expect(msg.lines[2]).toBe(base.handoff);
    expect(msg.lines[3]).toBe("가방에는 여벌 상의, 물통, 모자를 챙겼어요.");
    expect(msg.lines[4]).toBe("선생님, 오늘도 잘 부탁드립니다.");
    expect(msg.body).toBe(msg.lines.join("\n"));
  });

  it("조건절 끝이 기호·숫자·받침 어느 쪽이어도 조사가 깨지지 않는다", () => {
    // 실측 회귀(2026-07-29): "습도 75%이라고 해요"로 깨졌다. 조건절은 AI 자유 문구라
    // 받침 판정으로 기호·숫자를 가릴 수 없어, 고정 명사를 사이에 둔다.
    const pct = buildMorningMessage({ ...base, hook: "낮 30도·습도 75% — 그늘 위주로" })!;
    expect(pct.lines[1]).toBe("오늘은 낮 30도·습도 75% 예보예요.");
    const jong = buildMorningMessage({ ...base, hook: "미세먼지 나쁨 — 마스크 챙겨주세요" })!;
    expect(jong.lines[1]).toBe("오늘은 미세먼지 나쁨 예보예요.");
    // 조사 오용 패턴이 어떤 조건절에서도 나오지 않는다
    for (const m of [pct, jong]) expect(m.body).not.toMatch(/%이라고|나쁨라고/);
  });

  it("조건절만 쓰고 결론절은 반복하지 않는다 (부탁 문단과 중복 방지)", () => {
    const msg = buildMorningMessage(base)!;
    expect(msg.body).not.toContain("놀이 뒤 여벌 상의로 갈아입혀 주세요\n");
    expect(msg.body).toContain("낮 34도 고습");
  });

  it("handoff가 없는 날은 그 문단을 빼고 조립한다 (지어내지 않는다)", () => {
    const msg = buildMorningMessage({ ...base, handoff: null })!;
    expect(msg.lines).toHaveLength(4);
    expect(msg.body).toContain("오늘은 낮 34도 고습 예보예요.");
    expect(msg.body).toContain("가방에는");
  });

  it("재료가 하나도 없으면 null — 인사말만 있는 메시지는 만들지 않는다", () => {
    expect(buildMorningMessage({ childName: "지우", hook: "", preps: [] })).toBeNull();
    // 조건절 없는 단절 hook + 준비물·부탁 없음도 동일
    expect(buildMorningMessage({ childName: "지우", hook: "오늘은 무난해요", preps: [] })).toBeNull();
  });

  it("준비물만 있어도 성립한다", () => {
    const msg = buildMorningMessage({ childName: "지우", hook: "", preps: ["우산"] })!;
    expect(msg.lines).toEqual([
      "안녕하세요, 지우 보호자입니다.",
      "가방에는 우산을 챙겼어요.",
      "돌봄 선생님, 오늘도 잘 부탁드립니다.",
    ]);
  });

  it("준비물 조사가 받침을 따른다", () => {
    const two = buildMorningMessage({ childName: "지우", hook: "", preps: ["모자", "물통"] })!;
    expect(two.body).toContain("모자와 물통을 챙겼어요");
    const jong = buildMorningMessage({ childName: "지우", hook: "", preps: ["여벌 상의", "우산"] })!;
    // "상의"는 받침 없음 → "와", 마지막 "우산"은 받침 있음 → "을"
    expect(jong.body).toContain("여벌 상의와 우산을 챙겼어요");
  });

  it("준비물 별칭을 표준명으로 정규화하고 중복을 없앤다", () => {
    const msg = buildMorningMessage({
      childName: "지우",
      hook: "",
      preps: ["물병", "물통", "자외선차단제"],
    })!;
    expect(msg.body).toContain("물통과 선크림을 챙겼어요");
  });

  it("기관 재원이 아니면 호칭이 '돌봄 선생님'", () => {
    const msg = buildMorningMessage({ ...base, atDaycare: false })!;
    expect(msg.body).toContain("돌봄 선생님, 오늘도 잘 부탁드립니다.");
  });

  it("진단·단정 어휘를 새로 만들지 않는다", () => {
    const msg = buildMorningMessage(base)!;
    expect(msg.body).not.toMatch(/비염|아토피|천식|진단|질환/);
  });
});
