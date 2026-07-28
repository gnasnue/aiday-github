// 알림장 → 대화 거리 프롬프트 eval.
//
// 왜 필요한가: 이 저장소의 관행은 **프롬프트 변경 시 before/after 대조 필수**다
// (project 메모리 report_prompt_eval). 지시로 안 잡히는 위반은 입력·예시에서 제거해야
// 하는데, 그걸 알려면 실제 출력을 봐야 한다.
//
// 이 스크립트는 라우트를 거치지 않고(로그인 게이트 우회) Anthropic을 직접 호출해
// 프롬프트만 검증한다. 검사 항목은 lib/prompts/noteboard.ts의 어휘 계약과 1:1이다.
//
// 사용법:
//   node scripts/eval-noteboard.mjs            # 전체 케이스
//   node scripts/eval-noteboard.mjs --case 2   # 한 케이스만
//
// 셸에 ANTHROPIC_BASE_URL이 export돼 있으면 .env.local 게이트웨이를 덮어 401이 난다
// (project 메모리) — 그럴 때는 `env -u ANTHROPIC_BASE_URL node scripts/eval-noteboard.mjs`.

import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

// .env.local 로드 (dotenv 의존 없이 최소 파싱)
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const { NOTEBOARD_SYSTEM_PROMPT, buildNoteboardPrompt, parseNoteboardOutput } = await import(
  "../lib/prompts/noteboard.ts"
).catch(async () => {
  // .ts를 직접 import할 수 없는 런타임(순수 node)에서는 프롬프트를 소스에서 읽어 평가한다.
  console.error(
    "lib/prompts/noteboard.ts를 직접 import할 수 없습니다. `npx tsx scripts/eval-noteboard.mjs`로 실행하세요."
  );
  process.exit(1);
});

/** 실제 알림장에 가까운 케이스 — 마스킹 후 형태(다른 아이는 이미 "친구")로 넣는다. */
const CASES = [
  {
    name: "감각놀이 + 콧물 관찰",
    child: "지우",
    note: "오늘은 실내에서 얼음 감각놀이를 했어요. 지우가 처음에는 얼음을 만지기 망설였지만, 친구가 먼저 만지는 걸 보고 용기를 냈어요. 오후에는 콧물이 조금 있어서 자주 닦아주었습니다. 점심은 밥과 된장국을 잘 먹었어요.",
  },
  {
    name: "부정적 서술(다툼·거부) — 문제 지목 금지 검증",
    child: "지우",
    note: "오늘 바깥놀이 중에 친구와 장난감을 두고 다툼이 있었어요. 지우가 속상해서 한참 울었습니다. 낮잠은 자지 않으려고 해서 조용히 책을 보며 쉬었어요. 간식은 절반만 먹었습니다.",
  },
  {
    name: "무난한 날 — 지어내기 금지 검증",
    child: "지우",
    note: "오늘은 특별한 일 없이 즐겁게 보냈어요. 블록으로 큰 탑을 쌓았고 노래 부르기를 좋아했습니다. 밥도 잘 먹고 낮잠도 푹 잤어요.",
  },
];

const DIAGNOSIS = /감기|비염|천식|아토피|장염|독감|폐렴|중이염|진단|질환|증후군/;
const BLAME = /관심을 가져|노력해 주세요|부모님이 더|신경 써 주세요|부족합니다/;

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY가 없습니다.");
  process.exit(1);
}
const client = new Anthropic({
  apiKey,
  baseURL: process.env.ANTHROPIC_BASE_URL?.trim() || undefined,
});

const only = process.argv.indexOf("--case");
const cases = only > -1 ? [CASES[Number(process.argv[only + 1]) - 1]] : CASES;

let fails = 0;
for (const [i, c] of cases.entries()) {
  const res = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 900,
    thinking: { type: "disabled" },
    system: NOTEBOARD_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildNoteboardPrompt({ childName: c.child, note: c.note }) }],
  });
  const raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const parsed = parseNoteboardOutput(raw);

  console.log(`\n${"=".repeat(70)}\n[${i + 1}] ${c.name}`);
  if (!parsed) {
    console.log("  ❌ 파싱 실패\n  raw:", raw.slice(0, 300));
    fails++;
    continue;
  }
  console.log(`  제목: ${parsed.headline}`);
  console.log(`  요약: ${parsed.summary}`);
  parsed.talks.forEach((t, n) => console.log(`  ${n + 1}. ${t.question}\n     └ ${t.why}`));
  console.log(`  발견: ${JSON.stringify(parsed.findings, null, 0)}`);

  const all = JSON.stringify(parsed);
  const checks = [
    ["대화 거리 2~3개", parsed.talks.length >= 2 && parsed.talks.length <= 3],
    ["진단 어휘 없음", !DIAGNOSIS.test(all)],
    ["부모 평가 없음", !BLAME.test(all)],
    ["타 아동 실명 없음(친구로만)", !/[가-힣]{2,3}(이가|이는|이랑)\s/.test(all.replace(/친구/g, ""))],
    ["질문이 반말 한 문장", parsed.talks.every((t) => t.question.length <= 40 && !/습니다|하십시오/.test(t.question))],
    ["아이 이름 오용 없음", !new RegExp(`${c.child}(님|씨)`).test(all)],
  ];
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? "✅" : "❌"} ${label}`);
    if (!pass) fails++;
  }
}

console.log(`\n${"=".repeat(70)}\n${fails === 0 ? "✅ 전부 통과" : `❌ 위반 ${fails}건`}`);
process.exit(fails === 0 ? 0 : 1);
