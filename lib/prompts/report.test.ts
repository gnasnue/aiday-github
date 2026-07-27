import { describe, it, expect } from "vitest";
import { buildReportPrompt } from "./report";
import { sanitizeReportPayload, type ReportPayload } from "../report-sanitize";

/**
 * few-shot 정적 린트 — 프롬프트 예시가 프롬프트 자신의 규칙을 어기지 않는지 npm test에서
 * 결정적으로 검사한다.
 *
 * 배경(2026-07-27 사고): 예시 문구는 출력으로 복사된다(report.ts 상단 주석). PR #153이
 * 여름 마스크 오권장을 막으며 넣은 예시 8이 "마스크를 챙길 필요는 없어요 — 오히려 호흡만
 * 답답하게 해요"라는 마스크 부정 언급을 모범답안으로 시연했고, 폭염·습도 70%·미세먼지 좋음
 * 날 실사용 히어로 support에 그 패턴이 그대로 복사돼 나갔다. 규칙("무정보 안심 문장 금지")과
 * 예시가 모순되면 모델은 예시를 따른다 — 이 린트는 그 모순을 커밋 단계에서 막는다.
 *
 * 핵심 아이디어: 각 예시 출력은 런타임 새니타이저(lib/report-sanitize.ts)의 고정점이어야
 * 한다 — 프로덕션 최후 방어선이 예시를 고쳐야 한다면, 그 예시는 애초에 모델에게 보여줄
 * 자격이 없다.
 */

const PROMPT = buildReportPrompt({
  name: "지우",
  age: "5세",
  genderLabel: "여아",
  conditions: "특이사항 없음",
  tempSensitivity: "특이사항 없음",
  dateLabel: "7월 21일 화요일",
  scheduleSummary: "- 등원 08:30: 기온 25°C, 맑음, 습도 60%",
  airSummary: "미세먼지 좋음",
  uvSummary: "자외선 특이사항 없음",
  pollenSummary: "꽃가루 낮음",
});

type Example = { label: string; input: string; output: ReportPayload };

/** "[좋은 리포트 예시]" 섹션에서 (예시 라벨, 입력 줄, 출력 JSON) 트리플을 뽑는다. 예시 4처럼 입력/출력 A·B 쌍도 각각 하나의 예시로 센다. */
const parseExamples = (): Example[] => {
  const section = PROMPT.split("[좋은 리포트 예시]")[1]?.split("\n---")[0] ?? "";
  const examples: Example[] = [];
  let current = "?";
  let input = "";
  for (const line of section.split("\n")) {
    const ex = line.match(/^예시 (\d+)/);
    if (ex) current = ex[1];
    const inp = line.match(/^입력( [AB])?: (.*)$/);
    // "같은 날씨"는 직전 입력(예시 4의 A)의 환경을 상속한다 — 근거 판정에 그 환경을 합친다.
    if (inp) input = /같은 날씨/.test(inp[2]) ? `${inp[2]} // ${input}` : inp[2];
    const out = line.match(/^출력( [AB])?: (\{.*\})\s*$/);
    if (out) {
      examples.push({
        label: `예시 ${current}${out[1] ?? ""}`,
        input,
        output: JSON.parse(out[2]) as ReportPayload,
      });
    }
  }
  return examples;
};

// 마스크 근거 판정 — 예시 입력 줄의 텍스트 기준. 런타임(isMaskJustified)의 등급 임계값
// (미세먼지 나쁨≥3, 꽃가루 높음≥2)을 입력 표기("나쁨"/"높음")로 옮긴 것.
const maskJustifiedOf = (input: string): boolean =>
  /미세먼지[^/\n]*(나쁨|매우나쁨)/.test(input) || /꽃가루[^/\n]*(높음|매우높음)/.test(input);

const infantOf = (input: string): boolean => {
  const m = input.match(/(\d+)개월/);
  return m != null && parseInt(m[1], 10) < 24;
};

const EXAMPLES = parseExamples();

describe("few-shot 파서 자기 검증", () => {
  it("예시 출력이 10개 이상 파싱되고 전부 완전한 페이로드다", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(10);
    for (const { label, output } of EXAMPLES) {
      expect(output.hook, label).toBeTruthy();
      expect(output.message, label).toBeTruthy();
      expect(Array.isArray(output.checklist), label).toBe(true);
      expect(typeof output.prep, label).toBe("object");
    }
  });
});

describe.each(EXAMPLES)("few-shot 정적 린트 — $label", ({ label, input, output }) => {
  const maskJustified = maskJustifiedOf(input);
  const maskAllowedForAge = !infantOf(input);

  it("런타임 새니타이저의 고정점이다 (마스크 정책 + prep⊆checklist)", () => {
    const { payload, maskAction, maskTextDropped, styleTextActions, droppedPrep } = sanitizeReportPayload(
      structuredClone(output),
      { maskJustified, maskAllowedForAge }
    );
    expect(maskAction, `${label}: checklist·prep 마스크 정책 위반`).toBe("none");
    expect(maskTextDropped, `${label}: 근거 없는 본문 마스크 언급`).toEqual([]);
    expect(styleTextActions, `${label}: 본문 스타일 게이트 위반(메타 비교·hook 반복)`).toEqual([]);
    expect(droppedPrep, `${label}: checklist에 없는 prep 칩`).toEqual([]);
    expect(payload).toEqual(output);
  });

  it("근거 없으면 마스크가 어떤 표면·형태로도 등장하지 않는다", () => {
    if (maskJustified) return; // 근거 있는 날은 권유·영아 설명 모두 정당
    expect(JSON.stringify(output), `${label}: 마스크 언급(부정·안심 포함) 금지`).not.toMatch(/마스크/);
  });

  it("무정보 안심 문장이 없다 (scripts/eval-report.mjs '안심문장 없음'과 같은 목록)", () => {
    expect(output.message).not.toMatch(/괜찮아요|필수는 아니|걱정 없어도|나쁘지 않아|필요[는가]? 없/);
  });

  it("메타 비교 구문이 없다 — '더위 자체보다 중요해요'류 AI 말투 (2026-07-27 사용자 피드백)", () => {
    expect(`${output.hook}\n${output.message}`).not.toMatch(/자체보다|자체가 아니라|보다 (더 )?중요/);
  });

  it("message 3문장 구조를 지킨다 (홈 supportLine 발췌 계약 — eval이 실제 출력에 강제하는 것과 동일)", () => {
    const lines = output.message.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines.length, `${label}: 3줄이어야 함`).toBe(3);
  });

  it("hook 행동절을 message가 되풀이하지 않는다 (한 카드 동시 렌더 — eval 'hook↔message 반복 없음'과 동일 지표)", () => {
    // 정규화 후 문자 bigram containment ≥ 0.7 — scripts/eval-report.mjs와 같은 임계값·가드
    // (누적 산출물 978줄 소급 캘리브레이션, 오탐 0). 변경 시 함께 갱신.
    const norm = (t: string) => t.replace(/\*\*|__/g, "").replace(/[\s,.'"“”‘’()!?~·—–-]/g, "");
    const bigrams = (t: string) => {
      const set = new Set<string>();
      for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
      return set;
    };
    const parts = output.hook.split(/\s+[—–-]\s+/, 2);
    const act = bigrams(norm(parts.length === 2 ? parts[1] : output.hook));
    if (act.size < 8) return; // 짧은 행동절은 판정 불가
    for (const line of output.message.split("\n")) {
      const lineBigrams = bigrams(norm(line.replace(/'[^']*'|‘[^’]*’/g, "")));
      let hit = 0;
      for (const g of act) if (lineBigrams.has(g)) hit++;
      expect(hit / act.size, `${label}: hook 반복 줄 "${line.slice(0, 50)}"`).toBeLessThan(0.7);
    }
  });

  it("질병명·입력에 없는 기간 비교를 지어내지 않는다", () => {
    const all = JSON.stringify(output);
    expect(all).not.toMatch(/비염|천식|아토피/);
    expect(all).not.toMatch(/이번 주|올여름|이번 달/);
  });
});
