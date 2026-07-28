import { describe, it, expect } from "vitest";
import {
  buildNoteboardPrompt,
  NOTEBOARD_SYSTEM_PROMPT,
  parseNoteboardOutput,
} from "./noteboard";

const ok = {
  headline: "얼음을 처음 만진 날이었어요",
  summary: "망설였지만 스스로 용기를 낸 순간이 적혀 있어요.",
  talks: [
    { question: "얼음 처음 만졌을 때 어땠어?", why: "스스로 해낸 순간이에요." },
    { question: "누가 먼저 만졌어?", why: "친구를 보고 따라 한 장면이에요." },
  ],
  findings: [{ kind: "health", label: "콧물" }],
};

describe("NOTEBOARD_SYSTEM_PROMPT — 어휘 계약", () => {
  it("타 아동 이름 금지·진단 금지·부모 평가 금지를 명시한다", () => {
    expect(NOTEBOARD_SYSTEM_PROMPT).toContain("다른 아이 이름은 어떤 형태로도 출력하지 않습니다");
    expect(NOTEBOARD_SYSTEM_PROMPT).toContain("질병명·진단 표현을 쓰지 않습니다");
    expect(NOTEBOARD_SYSTEM_PROMPT).toContain("부모를 평가하거나 훈계하지 않습니다");
  });

  it("few-shot 예시가 규칙을 어기지 않는다 (예시가 규칙을 이긴다는 학습 반영)", () => {
    const prompt = buildNoteboardPrompt({ childName: "지우", note: "테스트" });
    // 예시 안에 진단 어휘가 없고, 타 아동 이름 대신 "친구"만 등장한다
    expect(prompt).not.toMatch(/감기|비염|천식|아토피/);
    expect(prompt).toContain("친구가 먼저 만지는 걸 보고");
    // 예시 출력의 findings label이 관찰 어휘("콧물")이지 진단명이 아니다
    expect(prompt).toContain('"label":"콧물"');
  });
});

describe("buildNoteboardPrompt", () => {
  it("아이 이름과 알림장을 담고, 체질은 있을 때만 넣는다", () => {
    const withCond = buildNoteboardPrompt({
      childName: "지우",
      note: "오늘 물놀이를 했어요",
      conditions: "피부가 민감하고 예민한 편",
    });
    expect(withCond).toContain("아이 이름: 지우");
    expect(withCond).toContain("오늘 물놀이를 했어요");
    expect(withCond).toContain("피부가 민감하고 예민한 편");
    expect(withCond).toContain("출력에 체질을 언급하지 마세요");

    const none = buildNoteboardPrompt({ childName: "지우", note: "x", conditions: "없음" });
    expect(none).not.toContain("체질 참고");
  });
});

describe("parseNoteboardOutput", () => {
  it("정상 JSON을 파싱한다", () => {
    const res = parseNoteboardOutput(JSON.stringify(ok))!;
    expect(res.headline).toBe(ok.headline);
    expect(res.talks).toHaveLength(2);
    expect(res.findings).toEqual([{ kind: "health", label: "콧물" }]);
  });

  it("코드펜스·앞뒤 설명이 섞여도 JSON을 건져낸다", () => {
    const raw = "```json\n" + JSON.stringify(ok) + "\n```\n위와 같습니다.";
    expect(parseNoteboardOutput(raw)?.headline).toBe(ok.headline);
  });

  it("진단 어휘가 든 질문은 그 항목만 버린다", () => {
    const res = parseNoteboardOutput(
      JSON.stringify({
        ...ok,
        talks: [
          { question: "감기 걸린 것 같아?", why: "콧물이 있었어요." },
          ok.talks[0],
        ],
      })
    )!;
    expect(res.talks).toHaveLength(1);
    expect(res.talks[0].question).toBe(ok.talks[0].question);
  });

  it("근거(why)에 진단 어휘가 있어도 그 항목을 버린다", () => {
    const res = parseNoteboardOutput(
      JSON.stringify({ ...ok, talks: [{ question: "코 답답했어?", why: "비염 증상이에요." }, ok.talks[0]] })
    )!;
    expect(res.talks).toHaveLength(1);
  });

  it("진단형 제목·요약은 버리지 않고 중립 문구로 다운그레이드한다", () => {
    const res = parseNoteboardOutput(
      JSON.stringify({ ...ok, headline: "감기 기운이 있던 날" })
    )!;
    expect(res.headline).toBe("오늘 알림장을 읽었어요");
    expect(res.talks).toHaveLength(2); // 질문은 살아남는다
  });

  it("진단형 label은 findings에서 제거한다", () => {
    const res = parseNoteboardOutput(
      JSON.stringify({ ...ok, findings: [{ kind: "health", label: "감기" }, { kind: "first", label: "얼음놀이" }] })
    )!;
    expect(res.findings).toEqual([{ kind: "first", label: "얼음놀이" }]);
  });

  it("talks가 없으면 null — 빈 결과를 성공으로 위장하지 않는다", () => {
    expect(parseNoteboardOutput(JSON.stringify({ ...ok, talks: [] }))).toBeNull();
    expect(parseNoteboardOutput("JSON이 아닌 답변")).toBeNull();
    expect(parseNoteboardOutput("{깨진 json")).toBeNull();
  });

  it("talks는 최대 3개로 자른다", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ question: `질문${i}`, why: `근거${i}` }));
    expect(parseNoteboardOutput(JSON.stringify({ ...ok, talks: many }))!.talks).toHaveLength(3);
  });

  it("알 수 없는 kind는 버린다", () => {
    const res = parseNoteboardOutput(
      JSON.stringify({ ...ok, findings: [{ kind: "mood", label: "기분" }] })
    )!;
    expect(res.findings).toEqual([]);
  });

  it("제목·요약이 비면 중립 기본값을 채운다(화면 제목이 사라지지 않게)", () => {
    const res = parseNoteboardOutput(JSON.stringify({ ...ok, headline: "", summary: "" }))!;
    expect(res.headline).toBe("오늘 알림장을 읽었어요");
    expect(res.summary).toContain("대화 거리를 찾았어요");
  });
});
