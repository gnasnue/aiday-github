#!/usr/bin/env node
/**
 * 홈 화면 로딩 지연 측정 — 각 외부 API 프록시 라우트와 Claude 리포트 호출을
 * 라우트별로 실측한다. 브라우저가 겪는 그대로(같은 쿼리·같은 페이로드)를 잰다.
 *
 * 사용법:
 *   1) 다른 터미널에서  npm run dev   (localhost:3000, .env.local 필요)
 *   2) node scripts/measure-home-latency.mjs
 *      (옵션)  BASE=http://localhost:3000  RUNS=5  node scripts/measure-home-latency.mjs
 *
 * 출력: 각 엔드포인트의 min / median / max (ms)와, 홈처럼 4개 병렬 후 리포트를
 *       순차 실행했을 때의 총 벽시계 시간.
 * 의존성 없음 (Node 18+ 전역 fetch 사용).
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const RUNS = Number(process.env.RUNS ?? 5);

// 홈이 실제로 호출하는 쿼리 (app/(main)/home/page.tsx의 fetchEnv와 동일)
const ENV_ENDPOINTS = {
  weather: "/api/weather?lat=37.5665&lon=126.9780",
  air: "/api/air?station=%EC%A2%85%EB%A1%9C%EA%B5%AC",
  uv: "/api/uv?region=서울",
  pollen: "/api/pollen?region=서울",
};

// 리포트 호출용 샘플 페이로드 (route.ts가 기대하는 형태)
const REPORT_BODY = {
  child: {
    name: "도준",
    age: "만 4세",
    gender: "male",
    conditions: ["비염", "아토피"],
    conditionEtc: "",
    cold: "잘 탐",
    hot: "보통",
    sweat: "많음",
    schedule: { goSchool: "08:00", outdoorStart: "11:00", outdoorEnd: "13:00", leaveSchool: "16:00" },
  },
  weather: {
    temperature: 24, sky: 3, pty: 0, humidity: 45, windSpeed: 2, pop: 20,
    hourlyForecast: [
      { hour: "09:00", temp: 20, sky: 1, pty: 0, humidity: 55, windSpeed: 2, pop: 0 },
      { hour: "12:00", temp: 24, sky: 3, pty: 0, humidity: 45, windSpeed: 3, pop: 20 },
      { hour: "15:00", temp: 26, sky: 1, pty: 0, humidity: 40, windSpeed: 2, pop: 10 },
    ],
  },
  air: { pm10: 45, pm25: 22, pm10Grade: 2, pm25Grade: 2, khaiGrade: 2 },
};

const now = () => Number(process.hrtime.bigint() / 1000000n);

async function timeOnce(fn) {
  const t0 = now();
  let ok = false, status = 0, note = "";
  try {
    const res = await fn();
    status = res.status;
    ok = res.ok;
    const text = await res.text(); // 본문 소비까지 포함(파싱 전 전송 완료 시점)
    if (!ok) note = text.slice(0, 120).replace(/\s+/g, " ");
  } catch (e) {
    note = String(e?.message ?? e);
  }
  return { ms: now() - t0, ok, status, note };
}

const stats = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const med = s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
  return { min: s[0], med, max: s[s.length - 1] };
};

async function measureEndpoint(label, fn) {
  const runs = [];
  let lastNote = "", lastStatus = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = await timeOnce(fn);
    runs.push(r.ms);
    lastStatus = r.status; lastNote = r.note;
  }
  const { min, med, max } = stats(runs);
  const flag = lastStatus >= 200 && lastStatus < 300 ? "" : `  ⚠️ HTTP ${lastStatus} ${lastNote}`;
  console.log(
    `  ${label.padEnd(9)}  median ${String(med).padStart(6)}ms   (min ${min} / max ${max})${flag}`
  );
  return med;
}

async function main() {
  console.log(`\n대상: ${BASE}   측정 횟수: ${RUNS}회/엔드포인트\n`);

  console.log("① 외부 API 프록시 라우트 (개별)");
  const medians = {};
  for (const [name, path] of Object.entries(ENV_ENDPOINTS)) {
    medians[name] = await measureEndpoint(name, () => fetch(BASE + path));
  }

  console.log("\n② Claude 리포트 (POST /api/report) — 서버 캐시 없음, 매 호출이 실제 생성");
  const reportMed = await measureEndpoint("report", () =>
    fetch(BASE + "/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REPORT_BODY),
    })
  );

  console.log("\n③ 홈 로딩 구조 재현 (4개 병렬 → 완료 후 리포트 순차)");
  const safe = (fn) => fn().catch(() => null);
  const t0 = now();
  await Promise.allSettled(
    Object.values(ENV_ENDPOINTS).map((p) => safe(() => fetch(BASE + p).then((r) => r.text())))
  );
  const envWall = now() - t0;
  const t1 = now();
  await safe(() =>
    fetch(BASE + "/api/report", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(REPORT_BODY),
    }).then((r) => r.text())
  );
  const reportWall = now() - t1;
  console.log(`  1단계 env 4개 병렬 완료 : ${envWall}ms`);
  console.log(`  2단계 리포트           : ${reportWall}ms`);
  console.log(`  ─────────────────────────────`);
  console.log(`  체감 총 로딩 (직렬 합)  : ${envWall + reportWall}ms\n`);

  const slowestEnv = Object.entries(medians).sort((a, b) => b[1] - a[1])[0];
  console.log("요약:");
  console.log(`  · env 최대 병목: ${slowestEnv[0]} (~${slowestEnv[1]}ms)`);
  console.log(`  · Claude 리포트: ~${reportMed}ms`);
  console.log(`  · 리포트는 uv·pollen까지 4개가 다 끝나야 착수됨 → env 병렬의 '가장 느린' 것에 종속\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
