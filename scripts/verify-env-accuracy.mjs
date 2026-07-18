#!/usr/bin/env node
/**
 * 홈 환경 지표 정합성 검증 — 앱 API 응답을 기상청 실황·에어코리아 원본과 직접 비교한다.
 *
 * 배경: 2026-07-18 조사 — 지표 부정확이 에러 없이 조용히 발생(체감온도 공식 오류,
 * 예보를 현재로 표시, 무표기 폴백)해 재현·추적이 불가능했다. 이 스크립트가 매일
 * "겉으로 멀쩡한 오답"을 수치로 잡는다.
 *
 * 사용법:
 *   node scripts/verify-env-accuracy.mjs                     # 프로덕션 대상
 *   node scripts/verify-env-accuracy.mjs --base http://localhost:3000
 *
 * 키: KMA_API_KEY·AIRKOREA_API_KEY (env 또는 .env.local)
 * 종료 코드: 0=전 항목 정합, 1=임계값 초과 항목 존재, 2=실행 실패
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = (baseIdx >= 0 && args[baseIdx + 1]) || "https://aiday-demo.vercel.app";
if (baseIdx >= 0 && !args[baseIdx + 1]) {
  console.error("FAIL(setup): --base 뒤에 URL이 필요합니다 (예: --base http://localhost:3000)");
  process.exit(2);
}

// 앱 하드코딩 기준지: 서울시청 좌표(격자 60,127) + 종로구 측정소
const LAT = 37.5665, LON = 126.978, NX = 60, NY = 127, STATION = "종로구";

// 임계값 — 초과 시 FAIL. 실황 대비 캐시 지연(최대 1시간)을 감안한 허용 폭.
const THRESHOLDS = { tempC: 1.5, humidityPct: 15, windMps: 2.5 };

function loadKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const raw = env.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim() ?? null;
    return raw ? raw.replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

// KMA 결측 센티널(±900대) 방어 — 라우트(app/api/weather/route.ts)와 동일 규칙.
// 센티널끼리 비교하면 차이 0으로 PASS가 나 '감시자가 오염을 인증'하게 되므로 결측 처리한다.
const validNum = (v, min, max) => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isNaN(n) || n < min || n > max ? null : n;
};

const kmaKey = loadKey("KMA_API_KEY");
const airKey = loadKey("AIRKOREA_API_KEY");
if (!kmaKey || !airKey) {
  console.error("FAIL(setup): KMA_API_KEY/AIRKOREA_API_KEY를 찾을 수 없습니다.");
  process.exit(2);
}

const ymd = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

async function fetchJson(url, label) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.json();
}

// 1) 기상청 초단기실황 원본 (정답지)
// 주의: base_time 규칙(정각 발표·15분 여유)은 lib/kma-time.ts의 getNcstBaseDateTime과
// 동일해야 한다(.mjs라 TS import 불가 — 규칙 변경 시 두 곳을 함께 수정).
async function fetchKmaObs() {
  const kst = new Date(Date.now() + 9 * 3600e3);
  if (kst.getUTCMinutes() < 15) kst.setUTCHours(kst.getUTCHours() - 1);
  const baseDate = ymd(kst);
  const baseTime = String(kst.getUTCHours()).padStart(2, "0") + "00";
  const params = new URLSearchParams({
    serviceKey: kmaKey, numOfRows: "10", pageNo: "1", dataType: "JSON",
    base_date: baseDate, base_time: baseTime,
    nx: String(NX), ny: String(NY),
  });
  const data = await fetchJson(
    `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?${params}`,
    "기상청 실황"
  );
  const obs = {};
  for (const it of data?.response?.body?.items?.item ?? []) obs[it.category] = it.obsrValue;
  return { obs, baseTimeStr: `${baseDate} ${baseTime}` };
}

// 2) 에어코리아 원본 (정답지)
async function fetchAirObs() {
  const params = new URLSearchParams({
    serviceKey: airKey, returnType: "json", numOfRows: "1", pageNo: "1",
    stationName: STATION, dataTerm: "DAILY", ver: "1.3",
  });
  const data = await fetchJson(
    `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?${params}`,
    "에어코리아"
  );
  return data?.response?.body?.items?.[0] ?? null;
}

const results = [];
const check = (name, appVal, srcVal, tolerance, unit = "") => {
  if (appVal == null || srcVal == null) {
    results.push({ name, status: "SKIP", detail: `app=${appVal} src=${srcVal} (데이터 없음)` });
    return;
  }
  const diff = Math.abs(Number(appVal) - Number(srcVal));
  const ok = diff <= tolerance;
  results.push({
    name,
    status: ok ? "PASS" : "FAIL",
    detail: `app=${appVal}${unit} vs 원본=${srcVal}${unit} (차이 ${diff.toFixed(1)}, 허용 ${tolerance})`,
  });
};

try {
  const [appWeather, appAir, kma, airObs] = await Promise.all([
    fetchJson(`${BASE}/api/weather?lat=${LAT}&lon=${LON}`, "앱 weather"),
    fetchJson(`${BASE}/api/air?station=${encodeURIComponent(STATION)}`, "앱 air"),
    fetchKmaObs(),
    fetchAirObs(),
  ]);
  const kmaObs = kma.obs;
  // 앱 응답은 최대 30분 캐시 — 기준시각이 스크립트와 다르면 불일치는 전이 순간의 정상
  // 시차일 수 있다. 스칼라는 허용 폭을 넓히고(아침 기온 램프 ~1.5°C/h 감안), 상태값(PTY·등급)은
  // FAIL 대신 WARN으로 낮춰 오탐이 리포트 신뢰를 깎지 않게 한다.
  const sameBase = appWeather.currentBaseTime == null || appWeather.currentBaseTime === kma.baseTimeStr;
  const tempTol = sameBase ? THRESHOLDS.tempC : 2.5;
  const humTol = sameBase ? THRESHOLDS.humidityPct : 20;
  const windTol = sameBase ? THRESHOLDS.windMps : 3.5;
  if (!sameBase) {
    results.push({
      name: "기준시각",
      status: "WARN",
      detail: `app=${appWeather.currentBaseTime} vs 스크립트=${kma.baseTimeStr} — 캐시 시차, 스칼라 허용 폭 확대 적용`,
    });
  }

  check("현재 기온", appWeather.temperature, validNum(kmaObs.T1H, -50, 50), tempTol, "°C");
  check("현재 습도", appWeather.humidity, validNum(kmaObs.REH, 0, 100), humTol, "%");
  check("현재 풍속", appWeather.windSpeed, validNum(kmaObs.WSD, 0, 70), windTol, "m/s");
  // 실황 PTY(0~7)를 앱과 동일 규칙으로 예보 코드(0~4)로 정규화한 뒤 비교
  const srcPtyRaw = validNum(kmaObs.PTY, 0, 7);
  const srcPty =
    srcPtyRaw == null ? null : srcPtyRaw === 5 ? 1 : srcPtyRaw === 6 ? 2 : srcPtyRaw === 7 ? 3 : srcPtyRaw;
  if (appWeather.pty != null && srcPty != null && Number(appWeather.pty) !== srcPty && !sameBase) {
    results.push({
      name: "강수형태(PTY)",
      status: "WARN",
      detail: `app=${appWeather.pty} vs 원본=${srcPty} — 기준시각 상이, 캐시 시차 가능`,
    });
  } else {
    check("강수형태(PTY)", appWeather.pty, srcPty, 0);
  }
  const srcDust = airObs?.pm10Grade1h !== "-" ? airObs?.pm10Grade1h : null;
  if (appAir.dataTime && airObs?.dataTime && appAir.dataTime !== airObs.dataTime) {
    results.push({
      name: "미세먼지 등급",
      status: "SKIP",
      detail: `측정시각 상이(app ${appAir.dataTime} vs 원본 ${airObs.dataTime}) — 캐시 시차, 비교 생략`,
    });
  } else {
    check("미세먼지 등급", appAir.pm10Grade, srcDust, 0);
  }

  // 체감온도: 여름(5~9월) 방향성 검사 — 습도 60% 이상인데 체감<기온이면 공식 회귀
  const month = new Date(Date.now() + 9 * 3600e3).getUTCMonth() + 1;
  if (month >= 5 && month <= 9 && appWeather.feelsLike != null && appWeather.temperature != null) {
    const regressed = Number(appWeather.humidity) >= 60 && appWeather.feelsLike < appWeather.temperature;
    results.push({
      name: "체감온도 방향(여름)",
      status: regressed ? "FAIL" : "PASS",
      detail: `기온 ${appWeather.temperature}°C·습도 ${appWeather.humidity}% → 체감 ${appWeather.feelsLike}°C`,
    });
  }

  // 현재값 출처 — 실황이어야 정상 (fcst면 실황 API 실패가 지속 중이라는 신호)
  if (appWeather.currentSource) {
    results.push({
      name: "현재값 출처",
      status: appWeather.currentSource === "ncst" ? "PASS" : "WARN",
      detail: `${appWeather.currentSource} (기준 ${appWeather.currentBaseTime ?? "?"})`,
    });
  }

  const kstNow = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  console.log(`\n환경 지표 정합성 리포트 — ${kstNow} KST | 대상: ${BASE}\n`);
  for (const r of results) console.log(`  [${r.status}] ${r.name} — ${r.detail}`);
  const fails = results.filter((r) => r.status === "FAIL");
  console.log(
    `\n결과: PASS ${results.filter((r) => r.status === "PASS").length} / FAIL ${fails.length} / ` +
      `WARN·SKIP ${results.filter((r) => r.status === "WARN" || r.status === "SKIP").length}`
  );
  if (fails.length) {
    console.log("→ FAIL 항목은 '겉으로 멀쩡한 오답'입니다. /investigate로 원인 추적을 시작하세요.");
    process.exit(1);
  }
} catch (err) {
  console.error(`FAIL(실행): ${err.message}`);
  process.exit(2);
}
