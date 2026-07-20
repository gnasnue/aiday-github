/**
 * 케어 플랜 칩 A/B — 규칙 엔진(현행 기본) vs AI prep(?prep=ai 실험) 비교.
 *
 * 칩은 클라이언트 병합 레이어(home/page.tsx slotPrep)에서 생성되므로 eval-report(API 출력)로는
 * 커버되지 않는다. 이 하네스는 실제 규칙 엔진(lib/prep.ts)과 AI 리포트의 prep 필드를 같은
 * 12개 시나리오에 대해 슬롯별로 대조해, "칩 엔진을 AI로 단일화할지 규칙으로 유지할지"를
 * 데이터로 판단하게 한다 (2026-07-20 제품 결정 입력).
 *
 * CI(npm test)에서는 skip — 실행: CHIP_AB=1 npx vitest run scripts/chip-ab.test.ts
 * (dev 서버 필요: http://localhost:3000, CHIP_AB_BASE로 변경 가능)
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { buildTimeline, type EnvRaw, type HomeTimeSlot } from "../lib/timeline";
import { buildPrepKeywords } from "../lib/prep";
import { canonicalPrepList } from "../lib/prep-vocab";
import { ageInMonths, canRecommendMask, isSweatProne } from "../lib/domain/child-conditions";

const BASE = process.env.CHIP_AB_BASE ?? "http://localhost:3000";
const AI_PREP_KEY: Record<string, string> = { 등원시간: "등원", 야외활동: "야외활동", 하원시간: "하원", 저녁: "저녁" };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Payload = {
  child: { name: string; age: string; birth?: { year: string; month: string }; conditions?: string[]; hot?: string; sweat?: string; schedule?: Record<string, string> };
  weather: { hourlyForecast?: any[] } | null;
  air: { pm10Grade?: number | null } | null;
  uv: { uvi?: number | null; hourly?: Record<string, number | null> } | null;
  pollen: { oak?: number | null; pine?: number | null; weed?: number | null } | null;
};

const envFromPayload = (p: Payload): EnvRaw =>
  ({
    weather: p.weather ? { hourlyForecast: p.weather.hourlyForecast } : null,
    air: p.air ?? null,
    uv: p.uv ?? null,
    pollen: p.pollen ?? null,
  }) as EnvRaw;

// 슬롯 환경이 "튀는가" — 칩이 있어야 마땅한 슬롯 판정 (커버리지 갭 탐지용)
const slotHasSpike = (s: HomeTimeSlot, conditions: string[]): boolean => {
  const dustBad = s.dust === "나쁨" || s.dust === "매우나쁨";
  const uvHigh = s.uv === "강함" || s.uv === "매우강함";
  const pollenHigh = s.pollen === "높음" || s.pollen === "매우높음";
  const windowPop = s.popWindow ?? s.pop;
  const rain = s.rainWindow || (s.pty != null && s.pty > 0) || (windowPop != null && windowPop >= 60);
  const heat = s.temp >= 31;
  const cold = s.temp <= 0;
  const dry = s.humidity > 0 && s.humidity < 45;
  const hasCond = conditions.length > 0;
  return dustBad || uvHigh || (pollenHigh && hasCond) || rain || heat || cold || dry;
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

describe.skipIf(!process.env.CHIP_AB)("케어 플랜 칩 A/B — 규칙 vs AI", () => {
  it("12 시나리오 슬롯별 대조 + 커버리지·결정성·괴리 집계", async () => {
    // eval-report.mjs를 vitest가 트랜스폼하면 깨진다 — node 하위 프로세스로 시나리오를 JSON에
    // 덤프(매 실행 재생성 → 드리프트 없음)한 뒤 읽는다. 산출 JSON은 gitignore(빌드 아티팩트).
    const scenariosFile = join(process.cwd(), "scripts", "__chip-ab-scenarios.json");
    execSync(
      `node -e "import('./scripts/eval-report.mjs').then(m=>require('fs').writeFileSync('scripts/__chip-ab-scenarios.json',JSON.stringify(m.SCENARIOS.map(s=>({id:s.id,title:s.title,payload:s.payload})))))"`,
      { cwd: process.cwd(), stdio: "ignore" }
    );
    const SCENARIOS = JSON.parse(readFileSync(scenariosFile, "utf8")) as {
      id: string;
      title: string;
      payload: Payload;
    }[];
    // 최종 done 이벤트의 prep만 필요 — 간이 SSE 파싱
    const fetchAiPrep = async (payload: unknown): Promise<Record<string, string[]>> => {
      const res = await fetch(`${BASE}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      const m = text.match(/event: done\ndata: (.+)/);
      if (!m) return {};
      try {
        const prep = (JSON.parse(m[1]) as { prep?: Record<string, string[]> }).prep;
        return prep && typeof prep === "object" ? prep : {};
      } catch {
        return {};
      }
    };

    const lines: string[] = [
      "# 케어 플랜 칩 A/B — 규칙 엔진 vs AI prep",
      "",
      `대상: ${BASE} · ${SCENARIOS.length} 시나리오 · AI는 2회 반복(결정성 확인) · 규칙은 결정적`,
      "",
    ];
    let ruleGap = 0, aiGap = 0, aiNondet = 0, divergentSlots = 0, totalSlots = 0;
    let ruleMaskViol = 0, aiMaskViol = 0;

    for (const sc of SCENARIOS) {
      const p = sc.payload as Payload;
      const conditions = p.child.conditions ?? [];
      const maskOk = canRecommendMask(ageInMonths(p.child.age, p.child.birth));
      const sweatProne = isSweatProne(p.child.hot, p.child.sweat);
      const slots = buildTimeline(p.child.schedule, envFromPayload(p)) ?? [];

      // 규칙 칩 (결정적)
      const ruleChips: Record<string, string[]> = {};
      slots.forEach((s, i) => {
        ruleChips[s.time] = canonicalPrepList(
          buildPrepKeywords(s, i > 0 ? slots[i - 1] : null, conditions, i === 0, sweatProne, maskOk)
        ).slice(0, 2);
      });

      // AI 칩 2회
      const ai1 = await fetchAiPrep(sc.payload);
      const ai2 = await fetchAiPrep(sc.payload);
      const aiChips = (run: Record<string, string[]>, time: string): string[] =>
        canonicalPrepList(run[AI_PREP_KEY[time] ?? time] ?? []).slice(0, 2);

      lines.push(`## ${sc.id} — ${sc.title}`, "", "| 슬롯 | 규칙 칩 | AI 칩(run1) | AI 칩(run2) | 비고 |", "|---|---|---|---|---|");
      for (const s of slots) {
        totalSlots++;
        const r = ruleChips[s.time];
        const a1 = aiChips(ai1, s.time);
        const a2 = aiChips(ai2, s.time);
        const spike = slotHasSpike(s, conditions);
        const notes: string[] = [];
        if (spike && r.length === 0) { notes.push("규칙 빈칸(환경 튐)"); ruleGap++; }
        if (spike && a1.length === 0 && a2.length === 0) { notes.push("AI 빈칸(환경 튐)"); aiGap++; }
        if (!same(a1, a2)) { notes.push("AI 비결정"); aiNondet++; }
        if (!same(r, a1)) divergentSlots++;
        if (!maskOk && r.includes("마스크")) { notes.push("⚠규칙 마스크 위반"); ruleMaskViol++; }
        if (!maskOk && (a1.includes("마스크") || a2.includes("마스크"))) { notes.push("⚠AI 마스크 위반"); aiMaskViol++; }
        lines.push(`| ${s.hour} ${s.time} | ${r.join(", ") || "—"} | ${a1.join(", ") || "—"} | ${a2.join(", ") || "—"} | ${notes.join("; ")} |`);
      }
      lines.push("");
    }

    lines.push(
      "## 집계",
      "",
      `- 총 슬롯: ${totalSlots}`,
      `- 규칙 vs AI(run1) 칩셋 상이 슬롯: ${divergentSlots}`,
      `- 커버리지 갭(환경 튐인데 빈칸): 규칙 ${ruleGap} · AI ${aiGap}`,
      `- AI 비결정 슬롯(run1≠run2): ${aiNondet} (규칙은 0 — 결정적)`,
      `- 마스크 연령 위반: 규칙 ${ruleMaskViol} · AI ${aiMaskViol}`,
      ""
    );

    const out = join(process.cwd(), "docs", "report-eval");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "chip-ab.md"), lines.join("\n"), "utf8");
    console.log(lines.join("\n"));
    console.log(`\n저장: docs/report-eval/chip-ab.md`);

    // 안전 게이트: 어느 엔진도 마스크 연령 규칙을 위반하면 안 된다
    expect(ruleMaskViol).toBe(0);
    expect(aiMaskViol).toBe(0);
  }, 600_000);
});
