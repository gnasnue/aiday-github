#!/usr/bin/env node
/**
 * AI 리포트 message 품질 평가 하네스 — 고정 시나리오(아이 프로필 × 환경)를
 * /api/report에 흘려 생성 결과를 수집하고, 기계 검증 가능한 규칙을 채점한다.
 *
 * 배경: 2026-07-20 message 고도화 작업. 프롬프트를 바꿀 때 "한 개 보고 만족"이 아니라
 * 같은 입력 세트에 대한 before/after 대조로 판정하기 위한 회귀 방지 장치.
 * 판단력·우선순위·개인화 같은 정성 항목은 사람이(또는 상위 모델이) 산출 MD를 읽고 판정하고,
 * 이 스크립트는 명백한 규칙 위반(길이·수치·연령·요일)만 자동 채점한다.
 *
 * 사용법:
 *   node scripts/eval-report.mjs --label baseline                # localhost:3000 대상
 *   node scripts/eval-report.mjs --label after --base http://localhost:3001
 *   node scripts/eval-report.mjs --label quick --only S01,S03    # 일부 시나리오만
 *
 * 전제: dev 서버 구동 중 + .env.local에 ANTHROPIC_API_KEY. evalDate override는
 * dev 빌드에서만 동작한다(app/api/report/route.ts 참조).
 * 산출: docs/report-eval/<label>.json, <label>.md
 * 종료 코드: 0=자동 체크 전부 통과, 1=FAIL 존재, 2=실행 실패
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "report-eval");

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const BASE = argOf("base") ?? "http://localhost:3000";
const LABEL = argOf("label") ?? `run-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}`;
const ONLY = argOf("only")?.split(",").map((s) => s.trim());

// ── 시나리오 빌더 ──────────────────────────────────────────────
// 평일(화) 고정 — 요일 의존 로직이 시나리오 의도와 어긋나지 않게 한다.
const WEEKDAY = "2026-07-21";
const SATURDAY = "2026-07-25";

/** 06~21시 3시간 간격 hourlyForecast. spec: { "06:00": {temp, sky, pty, pop, humidity} } 부분 지정 + 기본값 */
const hourly = (byHour) =>
  ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"].map((hour) => ({
    hour,
    temp: 25,
    sky: 1,
    pty: 0,
    humidity: 60,
    windSpeed: 2,
    pop: 10,
    ...(byHour[hour] ?? {}),
  }));

const weather = (byHour, current = {}) => {
  const hf = hourly(byHour);
  return {
    temperature: current.temperature ?? hf[1].temp,
    sky: current.sky ?? hf[1].sky,
    pty: current.pty ?? hf[1].pty,
    humidity: current.humidity ?? hf[1].humidity,
    windSpeed: 2,
    pop: current.pop ?? hf[1].pop,
    hourlyForecast: hf,
  };
};

/** 등급만 프롬프트에 들어가므로 수치는 등급에 맞는 대표값으로 채운다 */
const air = (pm10Grade, pm25Grade) => ({
  pm10: pm10Grade * 40,
  pm25: pm25Grade * 25,
  pm10Grade,
  pm25Grade,
  khaiGrade: Math.max(pm10Grade, pm25Grade),
});

/** uv.hourly: {"0"..."21"} — peak 시각에 peak값, 나머지는 완만한 곡선 */
const uv = (peak, peakHour = 12) => {
  const h = {};
  for (const t of [0, 3, 6, 9, 12, 15, 18, 21]) {
    const dist = Math.abs(t - peakHour);
    h[String(t)] = t < 6 || t >= 20 ? 0 : Math.max(0, Math.round(peak - dist * 1.2));
  }
  h[String(peakHour)] = peak;
  return { uvi: peak, hourly: h };
};

const pollen = (max) => ({ oak: max, pine: Math.max(0, max - 1), weed: Math.max(0, max - 2) });

const SCHEDULE_FULL = { goSchool: "08:30", outdoorStart: "11:00", outdoorEnd: "12:30", leaveSchool: "16:00" };

// ── 시나리오 정의 ──────────────────────────────────────────────
// focus: 이 시나리오가 검증하려는 것. expects: 사람이 MD를 읽고 판정할 기대 기준.
// S01/S02, S09/S10은 같은 환경·다른 아이 쌍 — 출력이 유의미하게 달라야 개인화다.
// export: eval-personas.mjs(페르소나 베이크오프)가 같은 세트를 재사용한다.
export const SCENARIOS = [
  {
    id: "S01",
    title: "이슈 경합 — 천식 5세 (폭염+미세먼지 나쁨+자외선 강함)",
    focus: "우선순위: 호흡기 아이는 미세먼지가 1순위여야",
    expects: ["미세먼지×호흡기 민감 연결이 중심 (질병명 없이)", "야외활동 조정 또는 마스크", "폭염·자외선은 부차적"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "준호", age: "5세", gender: "male", conditions: ["천식"], cold: "normal", hot: "normal", sweat: "normal", schedule: SCHEDULE_FULL },
      weather: weather({ "06:00": { temp: 27 }, "09:00": { temp: 30 }, "12:00": { temp: 33 }, "15:00": { temp: 34 }, "18:00": { temp: 31 }, "21:00": { temp: 28 } }),
      air: air(3, 3),
      uv: uv(7, 12),
      pollen: pollen(1),
    },
  },
  {
    id: "S02",
    title: "이슈 경합 — 무특이 7세 (S01과 동일 환경)",
    focus: "개인화 쌍: 같은 환경, 특이사항 없음 → 판단이 S01과 달라야",
    expects: ["폭염·자외선 중심 (미세먼지는 무특이 아이 기준 재평가)", "S01과 다른 우선순위·행동"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "서연", age: "7세", gender: "female", conditions: [], cold: "normal", hot: "normal", sweat: "normal", schedule: SCHEDULE_FULL },
      weather: weather({ "06:00": { temp: 27 }, "09:00": { temp: 30 }, "12:00": { temp: 33 }, "15:00": { temp: 34 }, "18:00": { temp: 31 }, "21:00": { temp: 28 } }),
      air: air(3, 3),
      uv: uv(7, 12),
      pollen: pollen(1),
    },
  },
  {
    id: "S03",
    title: "무난한 날 — 무특이 4세, 이슈 없음",
    focus: "억지 이슈 생성 금지: 문제없는 날 무엇을 말하나",
    expects: ["없는 문제를 만들지 않음", "안심문장(~는 괜찮아요) 없음", "그래도 오늘 결정에 유용한 한마디"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "지우", age: "4세", gender: "female", conditions: [], cold: "normal", hot: "normal", sweat: "normal", schedule: SCHEDULE_FULL },
      weather: weather({ "06:00": { temp: 21 }, "09:00": { temp: 23 }, "12:00": { temp: 25 }, "15:00": { temp: 26 }, "18:00": { temp: 24 }, "21:00": { temp: 22 } }),
      air: air(1, 1),
      uv: uv(4, 12),
      pollen: pollen(1),
    },
  },
  {
    id: "S04",
    title: "강수확률 40% — 우산 절제",
    focus: "규칙 준수: 40~50%는 '혹시 몰라' 한마디까지만",
    expects: ["우산을 필수로 권하지 않음", "비가 리포트의 중심 이슈가 아님"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "도윤", age: "6세", gender: "male", conditions: [], cold: "normal", hot: "normal", sweat: "normal", schedule: SCHEDULE_FULL },
      weather: weather({ "09:00": { temp: 25 }, "12:00": { temp: 27, sky: 3 }, "15:00": { temp: 28, sky: 4, pop: 40 }, "18:00": { temp: 26, pop: 30 } }),
      air: air(2, 2),
      uv: uv(5, 12),
      pollen: pollen(1),
    },
  },
  {
    id: "S05",
    title: "등원 시간 소나기 80% → 오후 갬",
    focus: "시간대 정확성: 우산은 등원에, 오후는 갬을 인지",
    expects: ["등원 시간대에 우산·비 안내", "하원을 비 오는 시간처럼 말하지 않음"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "하은", age: "5세", gender: "female", conditions: [], cold: "normal", hot: "normal", sweat: "normal", schedule: SCHEDULE_FULL },
      weather: weather({ "06:00": { temp: 23, sky: 4, pty: 4, pop: 80 }, "09:00": { temp: 24, sky: 4, pty: 4, pop: 80 }, "12:00": { temp: 26, sky: 3, pop: 30 }, "15:00": { temp: 28, sky: 1, pop: 10 }, "18:00": { temp: 27, sky: 1, pop: 0 } }),
      air: air(1, 1),
      uv: uv(3, 15),
      pollen: pollen(0),
    },
  },
  {
    id: "S06",
    title: "16개월 영아 × 초미세먼지 매우나쁨",
    focus: "연령 규칙: 24개월 미만 마스크 금지 → 외출 조정으로",
    expects: ["마스크를 권하지 않음(체크리스트 포함)", "외출 자제·실내 대체·시간 단축 안내"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "서아", age: "16개월", gender: "female", conditions: [], cold: "normal", hot: "normal", sweat: "normal", schedule: { outdoorStart: "11:00", outdoorEnd: "12:00" } },
      weather: weather({ "09:00": { temp: 28 }, "12:00": { temp: 30 }, "15:00": { temp: 31 } }),
      air: air(3, 4),
      uv: uv(6, 12),
      pollen: pollen(1),
    },
  },
  {
    id: "S07",
    title: "아토피+땀 많음+더위 탐 × 폭염·고습",
    focus: "개인화: 체질(땀→피부 자극) 연결 판단",
    expects: ["땀·습도→피부 자극 연결 (질병명 없이)", "여벌 옷·씻기 등 구체 행동", "민감도(더위 탐)가 반영된 강도"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "민준", age: "3세", gender: "male", conditions: ["아토피"], cold: "normal", hot: "very-much", sweat: "very-much", schedule: SCHEDULE_FULL },
      weather: weather({ "06:00": { temp: 28, humidity: 85 }, "09:00": { temp: 30, humidity: 85 }, "12:00": { temp: 33, humidity: 80 }, "15:00": { temp: 33, humidity: 80 }, "18:00": { temp: 30, humidity: 85 } }),
      air: air(2, 2),
      uv: uv(7, 12),
      pollen: pollen(1),
    },
  },
  {
    id: "S08",
    title: "일교차 13도 × 추위 많이 타는 아이",
    focus: "개인화: 민감도가 옷차림 판단을 바꾸는가",
    expects: ["일교차 대응(겉옷) 중심", "추위 민감을 반영한 안내(남들 기준보다 따뜻하게 등)"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "윤아", age: "5세", gender: "female", conditions: [], cold: "very-much", hot: "normal", sweat: "normal", schedule: SCHEDULE_FULL },
      weather: weather({ "06:00": { temp: 13 }, "09:00": { temp: 16 }, "12:00": { temp: 23 }, "15:00": { temp: 26 }, "18:00": { temp: 21 }, "21:00": { temp: 17 } }),
      air: air(1, 1),
      uv: uv(5, 12),
      pollen: pollen(1),
    },
  },
  {
    id: "S09",
    title: "꽃가루 매우높음 × 비염 8세",
    focus: "체질×환경 직결 케이스의 완성도",
    expects: ["꽃가루×호흡기 민감 중심 (질병명 없이)", "마스크·코 세척 등 구체 행동", "등원 전 타이밍"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "지호", age: "8세", gender: "male", conditions: ["비염"], cold: "normal", hot: "normal", sweat: "normal", schedule: SCHEDULE_FULL },
      weather: weather({ "09:00": { temp: 22 }, "12:00": { temp: 24 }, "15:00": { temp: 25 } }),
      air: air(2, 2),
      uv: uv(5, 12),
      pollen: pollen(4),
    },
  },
  {
    id: "S10",
    title: "꽃가루 매우높음 × 무특이 8세 (S09 쌍)",
    focus: "개인화 쌍: 무특이 아이에게 꽃가루를 어느 강도로 다루나",
    expects: ["S09보다 낮은 강도(호흡기 민감 전제 행동 없음)", "그래도 매우높음은 무시하지 않음"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "수아", age: "8세", gender: "female", conditions: [], cold: "normal", hot: "normal", sweat: "normal", schedule: SCHEDULE_FULL },
      weather: weather({ "09:00": { temp: 22 }, "12:00": { temp: 24 }, "15:00": { temp: 25 } }),
      air: air(2, 2),
      uv: uv(5, 12),
      pollen: pollen(4),
    },
  },
  {
    id: "S11",
    title: "주말(토) × 폭염+자외선 매우강함",
    focus: "요일 인지: 등원·하원 없이 나들이 맥락",
    expects: ["등원·하원 언급 없음", "주말 나들이·외출 리듬에 맞춘 안내"],
    payload: {
      evalDate: SATURDAY,
      child: { name: "아윤", age: "4세", gender: "female", conditions: [], cold: "normal", hot: "normal", sweat: "normal", schedule: SCHEDULE_FULL },
      weather: weather({ "09:00": { temp: 30 }, "12:00": { temp: 33 }, "15:00": { temp: 34 }, "18:00": { temp: 31 } }),
      air: air(2, 2),
      uv: uv(9, 13),
      pollen: pollen(1),
    },
  },
  {
    id: "S12",
    title: "일과 미입력 × 오후 소나기 70%",
    focus: "일정 규칙: 등원 시각을 지어내지 않고 아침/낮/저녁으로",
    expects: ["등원·하원 단어 없음", "'오후' 등 시간대 표현으로 비 안내"],
    payload: {
      evalDate: WEEKDAY,
      child: { name: "이안", age: "5세", gender: "male", conditions: [], cold: "normal", hot: "normal", sweat: "normal", schedule: {} },
      weather: weather({ "09:00": { temp: 26 }, "12:00": { temp: 28, sky: 3 }, "15:00": { temp: 27, sky: 4, pty: 4, pop: 70 }, "18:00": { temp: 25, sky: 4, pop: 40 } }),
      air: air(1, 1),
      uv: uv(5, 12),
      pollen: pollen(1),
    },
  },
];

// ── SSE 응답 파싱 ──────────────────────────────────────────────
export const parseSse = (text) => {
  const events = {};
  for (const chunk of text.split("\n\n")) {
    const ev = chunk.match(/^event: (.+)$/m)?.[1]?.trim();
    const dt = chunk.match(/^data: (.+)$/m)?.[1];
    if (ev && dt != null) {
      try {
        events[ev] = JSON.parse(dt);
      } catch {}
    }
  }
  return events;
};

// ── 자동 체크 (기계 판정 가능한 규칙만) ────────────────────────
export const runChecks = (s, r) => {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, result: ok ? "PASS" : "FAIL", detail });
  const body = `${r.hook}\n${r.message}`;
  const isInfant = /개월/.test(s.payload.child.age) && parseInt(s.payload.child.age, 10) < 24;
  const noSchedule = !s.payload.child.schedule || Object.keys(s.payload.child.schedule).length === 0;
  const isWeekendScenario = s.payload.evalDate === SATURDAY;

  add("message 존재", !!r.message, `${r.message?.length ?? 0}자`);
  add("message ≤ 250자", (r.message?.length ?? 0) <= 250, `${r.message?.length ?? 0}자`);
  add("hook ≤ 25자", (r.hook?.length ?? 0) <= 25, `${r.hook?.length ?? 0}자: ${r.hook}`);
  add("자외선 수치 미노출", !/자외선\s*(지수)?\s*\d/.test(body));
  add(
    "안심문장 없음",
    !/(괜찮아요|필수는 아니|걱정 없어도|나쁘지 않아)/.test(r.message ?? "") ||
      /감기 걱정 없/.test(r.message ?? ""), // "감기 걱정 없어요"는 행동 뒤 결과 서술로 허용
    ""
  );
  add("checklist 3~4개", (r.checklist?.length ?? 0) >= 3 && (r.checklist?.length ?? 0) <= 4, `${r.checklist?.length ?? 0}개`);
  // 질병명 미노출 — 부모는 민감 체질을 고르는 것이지 진단명을 등록하는 게 아니다.
  // 시나리오의 구형 키워드 입력("천식" 등)은 라우트의 conditionsForPrompt가 민감 표현으로
  // 변환하므로, 출력에 질병명이 남으면 회귀다 (2026-07-21).
  const disease = `${body}\n${(r.checklist ?? []).join(" ")}`.match(/비염|천식|아토피/);
  add("질병명 미노출", !disease, disease ? disease[0] : "");
  // 문제없는 등급(보통·좋음·낮음)을 지표와 함께 언급하는 것 금지 — "자외선은 보통이라 신경 안 써도" 류
  const gradeMention = body.match(/(자외선|미세먼지|초미세먼지|꽃가루|통합대기)[^\n.!?]{0,12}(보통|좋음|낮음|적정)/);
  add("좋음·보통 등급 미언급", !gradeMention, gradeMention ? gradeMention[0] : "");
  // 강수확률 40~50%를 hook에 올리는 것 금지 (우산 절제 규칙)
  const hookPop = r.hook?.match(/(4[0-9]|5[0-9])\s*%/);
  add("hook에 40~50% 강수 미노출", !hookPop || !/비|우산|소나기|강수/.test(r.hook ?? ""), hookPop ? r.hook : "");
  // ── 표면 간 교차 정합 (R4) — hook·prep이 checklist와 어긋나면 화면이 자기모순된다.
  // 별칭 그룹은 lib/prep-vocab.ts와 정렬 (사전 갱신 시 여기도 함께).
  const ITEM_ALIASES = {
    우산: ["우산"],
    우비: ["우비"],
    마스크: ["마스크"],
    물통: ["물통", "물병"],
    선크림: ["선크림", "자외선차단제", "썬크림"],
    모자: ["모자"],
    "여벌 옷": ["여벌 옷", "여벌옷"],
    가디건: ["가디건"],
    "얇은 겉옷": ["얇은 겉옷"],
    보습제: ["보습제"],
    물수건: ["물수건"],
    실내놀이: ["실내놀이", "실내 놀이"],
    방한용품: ["방한용품"],
    바람막이: ["바람막이"],
    목수건: ["목수건"],
  };
  const checklistText = (r.checklist ?? []).join(" ");
  const inText = (canon, text) => (ITEM_ALIASES[canon] ?? [canon]).some((a) => (text ?? "").includes(a));
  // hook이 챙기라고 한 물건은 체크리스트에 있어야 한다
  const hookMissing = Object.keys(ITEM_ALIASES).filter(
    (canon) => inText(canon, r.hook) && !inText(canon, checklistText)
  );
  add("hook 아이템 ⊆ checklist", hookMissing.length === 0, hookMissing.join(", "));
  // 케어 플랜 칩(prep)은 체크리스트에 담은 준비물의 부분집합이어야 한다
  const canonOf = (kw) =>
    Object.entries(ITEM_ALIASES).find(([, as]) => as.includes(kw.trim()))?.[0] ?? kw.trim();
  const prepKws = [...new Set(Object.values(r.prep ?? {}).flat())];
  const prepMissing = prepKws.filter((kw) => !inText(canonOf(kw), checklistText));
  add("prep ⊆ checklist", prepMissing.length === 0, prepMissing.join(", "));

  if (isInfant) {
    const masked = (r.checklist ?? []).some((c) => /마스크/.test(c)) || /마스크(를|도)? (꼭 )?(착용|챙|씌|권)/.test(r.message ?? "");
    add("24개월 미만 마스크 미권장", !masked);
  }
  if (isWeekendScenario || noSchedule) {
    add(`${isWeekendScenario ? "주말" : "일과없음"}: 등원·하원 미언급`, !/등원|하원/.test(body));
  }
  return checks;
};

// ── 실행 ───────────────────────────────────────────────────────
const runOne = async (s) => {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s.payload),
    });
    if (!res.ok) {
      const err = await res.text();
      return { id: s.id, title: s.title, error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
    }
    const events = parseSse(await res.text());
    if (events.error) return { id: s.id, title: s.title, error: events.error.error };
    const done = events.done;
    if (!done?.message) return { id: s.id, title: s.title, error: "done 이벤트에 message 없음" };
    return {
      id: s.id,
      title: s.title,
      focus: s.focus,
      expects: s.expects,
      latencyMs: Date.now() - t0,
      output: done,
      checks: runChecks(s, done),
    };
  } catch (e) {
    return { id: s.id, title: s.title, error: String(e).slice(0, 300) };
  }
};

const main = async () => {
  const targets = ONLY ? SCENARIOS.filter((s) => ONLY.includes(s.id)) : SCENARIOS;
  if (!targets.length) {
    console.error("FAIL(setup): --only에 해당하는 시나리오가 없습니다.");
    process.exit(2);
  }
  console.log(`eval-report: ${targets.length}개 시나리오 → ${BASE} (label: ${LABEL})`);

  // 동시 3개 — API 부하·rate limit 배려
  const results = [];
  for (let i = 0; i < targets.length; i += 3) {
    const batch = await Promise.all(targets.slice(i, i + 3).map(runOne));
    for (const r of batch) {
      results.push(r);
      const mark = r.error ? "✗ ERROR" : r.checks.every((c) => c.result === "PASS") ? "✓" : "△ FAIL 있음";
      console.log(`  ${r.id} ${mark} ${r.error ?? `(${r.latencyMs}ms)`}`);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, `${LABEL}.json`);
  writeFileSync(jsonPath, JSON.stringify({ label: LABEL, base: BASE, ranAt: new Date().toISOString(), results }, null, 2), "utf8");

  // 사람이 읽는 MD — 정성 판정(판단력·우선순위·개인화)의 재료
  const md = [
    `# 리포트 eval — ${LABEL}`,
    "",
    `실행: ${new Date().toISOString()} · 대상: ${BASE} · 시나리오 ${results.length}개`,
    "",
    ...results.flatMap((r) => {
      if (r.error) return [`## ${r.id} ${r.title}`, "", `**ERROR**: ${r.error}`, ""];
      const failed = r.checks.filter((c) => c.result === "FAIL");
      return [
        `## ${r.id} ${r.title}`,
        "",
        `- 초점: ${r.focus}`,
        `- 기대: ${r.expects.join(" / ")}`,
        `- 자동 체크: ${failed.length ? `**FAIL ${failed.length}** — ${failed.map((c) => `${c.name}(${c.detail})`).join(", ")}` : "전부 PASS"}`,
        "",
        `> **hook**: ${r.output.hook}`,
        ">",
        ...r.output.message.split("\n").map((l) => `> ${l}`),
        "",
        `- checklist: ${r.output.checklist.join(" · ")}`,
        `- prep: ${JSON.stringify(r.output.prep)}`,
        "",
      ];
    }),
  ].join("\n");
  const mdPath = join(OUT_DIR, `${LABEL}.md`);
  writeFileSync(mdPath, md, "utf8");

  const failCount = results.filter((r) => r.error || r.checks?.some((c) => c.result === "FAIL")).length;
  console.log(`\n저장: ${jsonPath}\n저장: ${mdPath}`);
  console.log(failCount ? `자동 체크 FAIL/ERROR: ${failCount}개 시나리오` : "자동 체크 전부 PASS");
  process.exit(failCount ? 1 : 0);
};

// import 시(eval-personas.mjs 등)에는 실행하지 않는다 — 직접 실행일 때만.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("FAIL(run):", e);
    process.exit(2);
  });
}
