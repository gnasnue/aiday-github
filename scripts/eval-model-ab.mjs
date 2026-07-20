#!/usr/bin/env node
/**
 * 리포트 생성 모델 A/B — 같은 시나리오 세트(eval-report.mjs 12개)를 모델별로 돌려
 * ① 자동 체크 통과율(규칙 준수, 특히 S04류 흔들림) ② hook 지연(첫 가시 콘텐츠) ③ 완료 지연을 대조한다.
 *
 * dev 서버의 dev 전용 modelOverride 훅(app/api/report/route.ts)을 사용한다.
 * 지연 노이즈를 줄이기 위해 모델은 순차 블록으로, 블록 안에서만 동시 2로 실행한다.
 *
 * 사용법: node scripts/eval-model-ab.mjs [--base http://localhost:3000] [--reps 2]
 * 산출: docs/report-eval/model-ab.json + 콘솔 요약표
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS, parseSse, runChecks } from "./eval-report.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "report-eval");

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const BASE = argOf("base") ?? "http://localhost:3000";
const REPS = parseInt(argOf("reps") ?? "2", 10);
const MODELS = ["claude-sonnet-5", "claude-opus-4-8"];

// SSE 증분 읽기 — hook 이벤트가 스트림에 나타나는 시점을 잰다 (홈 히어로 노출 시점의 근사)
const runOne = async (model, s, rep) => {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s.payload, modelOverride: model }),
    });
    if (!res.ok || !res.body) return { model, scenario: s.id, rep, error: `HTTP ${res.status}` };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    let hookMs = null;
    let messageMs = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      if (hookMs == null && acc.includes("event: hook")) hookMs = Date.now() - t0;
      if (messageMs == null && acc.includes("event: message")) messageMs = Date.now() - t0;
    }
    const doneMs = Date.now() - t0;
    const events = parseSse(acc);
    if (events.error) return { model, scenario: s.id, rep, error: events.error.error };
    if (!events.done?.message) return { model, scenario: s.id, rep, error: "message 없음" };
    const checks = runChecks(s, events.done);
    return {
      model,
      scenario: s.id,
      rep,
      hookMs,
      messageMs,
      doneMs,
      output: events.done,
      checkFails: checks.filter((c) => c.result === "FAIL").map((c) => `${c.name}(${c.detail})`),
    };
  } catch (e) {
    return { model, scenario: s.id, rep, error: String(e).slice(0, 200) };
  }
};

const inBatches = async (items, n, fn) => {
  const out = [];
  for (let i = 0; i < items.length; i += n) {
    out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
    console.log(`  ${out.length}/${items.length}`);
  }
  return out;
};

const pct = (arr, p) => {
  const v = arr.filter((x) => x != null).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))] : null;
};

const main = async () => {
  const results = [];
  for (const model of MODELS) {
    const jobs = [];
    for (const s of SCENARIOS) for (let rep = 0; rep < REPS; rep++) jobs.push({ s, rep });
    console.log(`${model}: ${jobs.length}건`);
    results.push(...(await inBatches(jobs, 2, ({ s, rep }) => runOne(model, s, rep))));
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "model-ab.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, reps: REPS, results }, null, 2),
    "utf8"
  );

  // ── 요약 ─────────────────────────────────────────────────────
  console.log("\n| 모델 | 성공 | 체크 FAIL 건수(응답 수) | hook p50 | hook p90 | done p50 |");
  console.log("|---|---|---|---|---|---|");
  for (const model of MODELS) {
    const mine = results.filter((r) => r.model === model);
    const ok = mine.filter((r) => !r.error);
    const failResp = ok.filter((r) => r.checkFails.length);
    const totalFails = ok.reduce((n, r) => n + r.checkFails.length, 0);
    const hooks = ok.map((r) => r.hookMs);
    const dones = ok.map((r) => r.doneMs);
    console.log(
      `| ${model} | ${ok.length}/${mine.length} | ${totalFails}건(${failResp.length}개 응답) | ${pct(hooks, 50)}ms | ${pct(hooks, 90)}ms | ${pct(dones, 50)}ms |`
    );
  }
  console.log("\nFAIL 상세:");
  for (const r of results.filter((r) => r.checkFails?.length)) {
    console.log(`- [${r.model}] ${r.scenario}#${r.rep}: ${r.checkFails.join(" / ")}`);
  }
  const errs = results.filter((r) => r.error);
  if (errs.length) {
    console.log("\n오류:");
    errs.forEach((r) => console.log(`- [${r.model}] ${r.scenario}#${r.rep}: ${r.error}`));
  }
};

main().catch((e) => {
  console.error("FAIL(run):", e);
  process.exit(2);
});
