#!/usr/bin/env node
/**
 * AI 리포트 페르소나 베이크오프 — 시스템 프롬프트의 페르소나 문단만 교체한 변형들을
 * 같은 시나리오 세트(eval-report.mjs의 12개)에 돌리고, 블라인드 LLM 심사로 비교한다.
 *
 * 변인 통제: 판단 순서·출력 규칙·few-shot·가치 문장·금지 목록은 전 변형 공통
 * (lib/prompts/report.ts buildSystemPrompt). 페르소나 문단만 dev 전용 personaOverride로 교체.
 *
 * 사용법 (dev 서버 필요):
 *   node scripts/eval-personas.mjs --stage generate   # 5 페르소나 × 12 시나리오 × 2회 생성
 *   node scripts/eval-personas.mjs --stage judge      # P0 대비 양방향 블라인드 페어 심사
 *   node scripts/eval-personas.mjs --stage report     # 승률 집계 + MD 요약
 *
 * 산출: docs/report-eval/persona-bakeoff.json (단계별 누적), persona-bakeoff.md
 * 종료 코드: 0=성공, 2=실행 실패
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS, parseSse, runChecks } from "./eval-report.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "report-eval");
const OUT_JSON = join(OUT_DIR, "persona-bakeoff.json");
const OUT_MD = join(OUT_DIR, "persona-bakeoff.md");

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const BASE = argOf("base") ?? "http://localhost:3000";
const STAGE = argOf("stage") ?? "all";
const REPS = 2;

// ── 페르소나 정의 ──────────────────────────────────────────────
// identity 문단만 다르다. P0은 현행(REPORT_PERSONA_DEFAULT와 동일 문구 — 같은 실행 조건에서
// 공정 비교하기 위해 여기서도 명시적으로 보낸다).
const PERSONAS = [
  {
    id: "P0",
    name: "든든한 육아 친구 (현행)",
    identity:
      "당신은 아이를 키우는 부모의 든든한 육아 친구입니다. 매일 아침 카카오톡처럼 따뜻하게, 오늘 이 아이에게 꼭 필요한 이야기만 전해주세요.",
  },
  {
    id: "P1",
    name: "10년차 어린이집 담임 선생님",
    identity:
      "당신은 10년차 어린이집 담임 선생님입니다. 매일 아침 우리 반 아이의 부모에게 알림장을 쓰듯, 아이들을 매일 돌보는 사람의 실무 감각으로 오늘 이 아이에게 꼭 필요한 준비를 짚어주세요.",
  },
  {
    id: "P2",
    name: "소아과 진료실 간호사 이모",
    identity:
      "당신은 소아과 진료실에서 오래 일한 간호사 이모입니다. 아이 건강을 차분하고 정확하게 챙겨온 사람으로서, 호들갑 없이 믿음직하게 오늘 이 아이에게 꼭 필요한 이야기만 전해주세요.",
  },
  {
    id: "P3",
    name: "두 아이 키운 옆집 육아 선배",
    identity:
      "당신은 두 아이를 먼저 키워본 옆집 육아 선배입니다. 같은 아침을 먼저 겪어본 사람의 공감으로, 오늘 이 아이의 부모에게 꼭 필요한 한마디를 건네주세요.",
  },
  {
    id: "P4",
    name: "미니멀 브리퍼",
    identity:
      "당신은 바쁜 아침의 부모를 위한 간결한 브리퍼입니다. 감탄사나 수식 없이 담백하고 정확하게, 오늘 이 아이에게 꼭 필요한 판단과 행동만 전해주세요.",
  },
];

// ── 공용: .env.local 키 로딩 ───────────────────────────────────
// .env.local을 process.env보다 우선한다 — 이 앱은 게이트웨이 키+BASE_URL 쌍을 .env.local에
// 두는데, 실행 셸에 ANTHROPIC_BASE_URL 등이 따로 주입돼 있으면 키/엔드포인트가 어긋나
// 401이 난다 (2026-07-20 심사 단계에서 실제 발생).
const loadEnv = (name) => {
  try {
    const env = readFileSync(join(ROOT, ".env.local"), "utf8");
    const raw = env.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim() ?? null;
    if (raw) return raw.replace(/^["']|["']$/g, "");
  } catch {}
  return process.env[name] ?? null;
};

const loadState = () => {
  try {
    return JSON.parse(readFileSync(OUT_JSON, "utf8"));
  } catch {
    return { generations: [], judgments: [] };
  }
};
const saveState = (state) => {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(state, null, 2), "utf8");
};

// 배치 실행 (동시 N)
const inBatches = async (items, n, fn, onDone) => {
  const out = [];
  for (let i = 0; i < items.length; i += n) {
    const batch = await Promise.all(items.slice(i, i + n).map(fn));
    out.push(...batch);
    if (onDone) batch.forEach(onDone);
  }
  return out;
};

// ── 1) 생성 ────────────────────────────────────────────────────
const generate = async () => {
  const jobs = [];
  for (const p of PERSONAS)
    for (const s of SCENARIOS)
      for (let rep = 0; rep < REPS; rep++) jobs.push({ p, s, rep });
  console.log(`generate: ${jobs.length}건 (${PERSONAS.length} 페르소나 × ${SCENARIOS.length} 시나리오 × ${REPS}회) → ${BASE}`);

  const runOne = async ({ p, s, rep }) => {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...s.payload, personaOverride: p.identity }),
      });
      if (!res.ok) return { persona: p.id, scenario: s.id, rep, error: `HTTP ${res.status}` };
      const events = parseSse(await res.text());
      if (events.error) return { persona: p.id, scenario: s.id, rep, error: events.error.error };
      const done = events.done;
      if (!done?.message) return { persona: p.id, scenario: s.id, rep, error: "message 없음" };
      const checks = runChecks(s, done);
      return {
        persona: p.id,
        scenario: s.id,
        rep,
        latencyMs: Date.now() - t0,
        output: done,
        checkFails: checks.filter((c) => c.result === "FAIL").map((c) => `${c.name}(${c.detail})`),
      };
    } catch (e) {
      return { persona: p.id, scenario: s.id, rep, error: String(e).slice(0, 200) };
    }
  };

  let done = 0;
  const results = await inBatches(jobs, 3, runOne, (r) => {
    done++;
    if (done % 10 === 0 || r.error) console.log(`  ${done}/${jobs.length}${r.error ? ` · ${r.persona}/${r.scenario}#${r.rep} ERROR: ${r.error}` : ""}`);
  });

  const state = loadState();
  state.generations = results;
  state.generatedAt = new Date().toISOString();
  saveState(state);
  const errs = results.filter((r) => r.error).length;
  const gateFails = results.filter((r) => r.checkFails?.length).length;
  console.log(`완료: 성공 ${results.length - errs}, 오류 ${errs}, 자동체크 FAIL ${gateFails} → ${OUT_JSON}`);
};

// ── 2) 블라인드 심사 ───────────────────────────────────────────
// P0 rep0 vs Px rep0을 A/B 순서 양방향으로 심사한다. 페르소나 라벨은 심사자에게 숨긴다.
const RUBRIC = ["판단력(오늘 1순위 이슈를 정확히 짚고 이유가 전달되는가)", "개인화(이 아이 고유의 근거가 체감되는가)", "신뢰감(과장·호들갑 없이 믿음이 가는가)", "아침 가독성(바쁜 아침에 읽기 쉽고 행동으로 이어지는가)", "포지셔닝(부모의 오늘 첫 판단을 대신 정리해주는가)"];

const judgePair = async (apiKey, apiBase, scenario, reportA, reportB) => {
  const fmt = (r) => `hook: ${r.hook}\nmessage: ${r.message}\nchecklist: ${(r.checklist ?? []).join(", ")}`;
  const c = scenario.payload.child;
  const prompt = `당신은 육아 앱의 AI 아침 리포트 품질 심사위원입니다. 같은 입력으로 생성된 두 리포트 중 어느 쪽이 나은지 축별로 판정하세요.

[상황]
${scenario.title} — ${scenario.focus}
아이: ${c.name} (${c.age}), 특이사항: ${(c.conditions ?? []).join(",") || "없음"}, 민감도: 추위 ${c.cold}/더위 ${c.hot}/땀 ${c.sweat}

[리포트 A]
${fmt(reportA)}

[리포트 B]
${fmt(reportB)}

[심사 축]
${RUBRIC.map((r, i) => `${i + 1}. ${r}`).join("\n")}

JSON 한 줄로만 답하세요 (코드블록 금지):
{"axes":{"판단력":"A|B|tie","개인화":"A|B|tie","신뢰감":"A|B|tie","아침가독성":"A|B|tie","포지셔닝":"A|B|tie"},"overall":"A|B|tie","reason":"한 문장"}`;

  // 심사자는 오프라인 배치라 지연 제약이 없다 — Opus 4.8 + adaptive thinking으로
  // 판정 일관성(양방향 순서 뒤집힘)을 줄인다. thinking 토큰이 max_tokens에 포함되므로 여유 확보.
  // (Opus 4.8은 thinking 미지정 시 비활성 — adaptive를 명시해야 켜진다)
  const res = await fetch(`${apiBase}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`judge HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = await res.json();
  const text = data.content?.find((b) => b.type === "text")?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text);
};

const judge = async () => {
  const apiKey = loadEnv("ANTHROPIC_API_KEY");
  const apiBase = (loadEnv("ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com").replace(/\/$/, "");
  if (!apiKey) {
    console.error("FAIL(setup): ANTHROPIC_API_KEY 없음");
    process.exit(2);
  }
  const state = loadState();
  if (!state.generations?.length) {
    console.error("FAIL(setup): 생성 결과 없음 — --stage generate 먼저");
    process.exit(2);
  }
  const get = (pid, sid) => state.generations.find((g) => g.persona === pid && g.scenario === sid && g.rep === 0 && !g.error);

  const pairs = [];
  for (const p of PERSONAS.filter((p) => p.id !== "P0"))
    for (const s of SCENARIOS) {
      const base = get("P0", s.id);
      const cand = get(p.id, s.id);
      if (!base || !cand) continue;
      // 양방향 — 순서 편향 상쇄. blind: 심사자는 A/B만 본다.
      pairs.push({ persona: p.id, scenario: s.id, order: "P0-first", A: base.output, B: cand.output, s });
      pairs.push({ persona: p.id, scenario: s.id, order: "Px-first", A: cand.output, B: base.output, s });
    }
  console.log(`judge: ${pairs.length}페어 (양방향) → ${apiBase}`);

  let done = 0;
  const judgments = await inBatches(pairs, 4, async (pair) => {
    try {
      const v = await judgePair(apiKey, apiBase, pair.s, pair.A, pair.B);
      // 정규화: 후보(Px) 관점 승패로 변환
      const toCand = (ab) => (ab === "tie" ? "tie" : pair.order === "P0-first" ? (ab === "B" ? "win" : "lose") : ab === "A" ? "win" : "lose");
      return {
        persona: pair.persona,
        scenario: pair.scenario,
        order: pair.order,
        overall: toCand(v.overall),
        axes: Object.fromEntries(Object.entries(v.axes ?? {}).map(([k, ab]) => [k, toCand(ab)])),
        reason: v.reason ?? "",
      };
    } catch (e) {
      return { persona: pair.persona, scenario: pair.scenario, order: pair.order, error: String(e).slice(0, 200) };
    }
  }, () => {
    done++;
    if (done % 12 === 0) console.log(`  ${done}/${pairs.length}`);
  });

  state.judgments = judgments;
  state.judgedAt = new Date().toISOString();
  saveState(state);
  console.log(`완료: ${judgments.filter((j) => !j.error).length}/${judgments.length} 심사 → ${OUT_JSON}`);
};

// ── 3) 집계 + MD ───────────────────────────────────────────────
const report = () => {
  const state = loadState();
  const js = (state.judgments ?? []).filter((j) => !j.error);
  const gens = state.generations ?? [];
  const personaName = (id) => PERSONAS.find((p) => p.id === id)?.name ?? id;

  const lines = [`# 페르소나 베이크오프 — P0(현행) 대비 승률`, "", `생성 ${state.generatedAt ?? "?"} · 심사 ${state.judgedAt ?? "?"} · 심사 ${js.length}건(양방향), 심사자: claude-opus-4-8(adaptive thinking) 블라인드`, ""];

  lines.push(`| 페르소나 | overall 승-무-패 | 판단력 | 개인화 | 신뢰감 | 아침가독성 | 포지셔닝 | 자동체크 FAIL |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const p of PERSONAS.filter((p) => p.id !== "P0")) {
    const mine = js.filter((j) => j.persona === p.id);
    const tally = (get) => {
      const w = mine.filter((j) => get(j) === "win").length;
      const t = mine.filter((j) => get(j) === "tie").length;
      const l = mine.filter((j) => get(j) === "lose").length;
      return `${w}-${t}-${l}`;
    };
    const axisCols = ["판단력", "개인화", "신뢰감", "아침가독성", "포지셔닝"].map((ax) => tally((j) => j.axes?.[ax])).join(" | ");
    const gateFails = gens.filter((g) => g.persona === p.id && g.checkFails?.length).length;
    lines.push(`| ${p.id} ${personaName(p.id)} | ${tally((j) => j.overall)} | ${axisCols} | ${gateFails} |`);
  }
  const p0Fails = gens.filter((g) => g.persona === "P0" && g.checkFails?.length).length;
  lines.push("", `P0 자동체크 FAIL: ${p0Fails}건 / 순서 편향 점검: 같은 페어의 양방향 판정이 일치하지 않으면 실질 tie로 해석할 것`, "");

  // 시나리오별 상세 (심사 이유 샘플)
  lines.push(`## 페르소나별 판정 이유 샘플`);
  for (const p of PERSONAS.filter((p) => p.id !== "P0")) {
    lines.push("", `### ${p.id} ${personaName(p.id)}`);
    js.filter((j) => j.persona === p.id && j.reason).slice(0, 6).forEach((j) => lines.push(`- [${j.scenario}/${j.order}/${j.overall}] ${j.reason}`));
  }

  writeFileSync(OUT_MD, lines.join("\n"), "utf8");
  console.log(lines.slice(0, 14).join("\n"));
  console.log(`\n저장: ${OUT_MD}`);
};

const main = async () => {
  if (STAGE === "generate" || STAGE === "all") await generate();
  if (STAGE === "judge" || STAGE === "all") await judge();
  if (STAGE === "report" || STAGE === "all") report();
};

main().catch((e) => {
  console.error("FAIL(run):", e);
  process.exit(2);
});
