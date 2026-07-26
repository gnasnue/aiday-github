import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildReportPrompt, buildSystemPrompt, REPORT_SYSTEM_PROMPT } from "@/lib/prompts/report";
import { ageInMonths, canRecommendMask, conditionsForPrompt, sensitivityPhrase, sweatPhrase } from "@/lib/domain/child-conditions";
import { kstNow } from "@/lib/kma-time";
import { checkReportRateLimit } from "@/lib/rate-limit";
import { pollenLevelOf } from "@/lib/timeline";
import { isMaskJustified, sanitizeReportPayload, type ReportPayload } from "@/lib/report-sanitize";

// 이 라우트는 Claude 생성을 SSE로 스트리밍한다. 콜드 스타트 + 게이트웨이 연결 +
// 생성 완료까지 걸리는 시간이 Vercel 함수 기본 타임아웃에 근접하면, done 이벤트가
// 나가기 전에 함수가 종료돼 스트림이 잘린다 → 클라이언트가 빈 응답으로 받아 규칙 기반
// "기본 추천" 폴백에 갇힌다(특히 하루 첫 진입=콜드인 아침). 스트리밍 생성에 넉넉한
// 상한을 명시해 정상 생성이 중간에 절단되지 않게 한다. (Hobby 상한 60s 이내)
export const maxDuration = 60;

/**
 * 요청 쿠키의 Supabase 세션에서 user_id를 읽는다. 게스트면 null.
 * 레이트리밋 버킷을 가르는 용도라, 실패 시 게스트로 취급(더 낮은 한도)해도 안전하다.
 */
async function currentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          // 이 라우트는 세션을 갱신하지 않는다(읽기 전용) — 쓰기는 무시한다.
          setAll: () => {},
        },
      }
    );
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

// SKY 코드 → 텍스트
const skyLabel = (sky: number | null) => {
  if (sky === 1) return "맑음";
  if (sky === 3) return "구름많음";
  if (sky === 4) return "흐림";
  return "알 수 없음";
};

// PTY 코드 → 텍스트
const ptyLabel = (pty: number | null) => {
  if (!pty || pty === 0) return null;
  if (pty === 1) return "비";
  if (pty === 2) return "비/눈";
  if (pty === 3) return "눈";
  if (pty === 4) return "소나기";
  return null;
};

// 강수 신호 — 프롬프트에 넣을 표기. 자외선·미세먼지를 등급으로만 넣는 원칙과 동일하게,
// 40~59% 강수확률은 수치를 빼고 정성 신호로만 준다. 수치가 입력에 있으면 규칙("hook에 절대
// 올리지 않기")이 있어도 hook으로 새기 때문(2026-07-20 eval S04, 페르소나·모델 전반 재발).
//  · 비/소나기 예보(pty>0) 또는 확률 60% 이상 → 확정 신호, 수치 유지(hook·message에 그대로 다룸)
//  · 40~59% → "비 올 수도"(무수치) — message에서 '혹시 몰라 우산' 수준으로만
//  · 40% 미만 → 생략(배경 잡음)
const rainSignal = (pty: number | null, pop: number | null): string => {
  const ptyText = ptyLabel(pty);
  if (ptyText) return pop != null && pop >= 60 ? ` / ${ptyText} (강수확률 ${pop}%)` : ` / ${ptyText}`;
  if (pop == null) return "";
  if (pop >= 60) return ` (강수확률 ${pop}%)`;
  if (pop >= 40) return " (비 올 수도)";
  return "";
};

// 에어코리아 등급 → 텍스트
const gradeLabel = (grade: number | null) => {
  if (grade === 1) return "좋음";
  if (grade === 2) return "보통";
  if (grade === 3) return "나쁨";
  if (grade === 4) return "매우나쁨";
  return "알 수 없음";
};

export async function POST(req: NextRequest) {
  // 홈 지연 계측 — route 진입~스트림 각 시점을 분해해, 첫 hook까지의 시간이
  // 콜드스타트/prefill/게이트웨이 연결(received→first_delta)에서 오는지
  // 모델 생성(first_delta→hook)에서 오는지 가른다. (2026-07 홈 지연 조사, T4)
  const tReceived = Date.now();
  // 클라이언트 계측 요청만 로그를 남기고(운영 노이즈 방지), 같은 id로 클라이언트/서버 로그를 잇는다.
  const perfId = req.headers.get("x-perf-id");
  const perfLog = (outcome: string, extra = "") => {
    if (perfId) console.log(`[perf/report] [${perfId}] ${outcome} · +${Date.now() - tReceived}ms${extra}`);
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your_anthropic_api_key_here") {
    perfLog("config_error", " · apiKey 미설정");
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  // ANTHROPIC_BASE_URL 설정 시 AI 게이트웨이 등 프록시 엔드포인트로 요청 (미설정 시 Anthropic 기본 주소).
  // 게이트웨이는 Anthropic Messages API 호환(패스스루)이어야 한다.
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
  if (baseURL) {
    try {
      const url = new URL(baseURL);
      // 붙여넣기 사고로 스킴이 이어붙은 값(예: https://gw.letsur.aihttps)은 URL 파싱을
      // 통과한 뒤 DNS에서 실패한다(2026-07-12 프로덕션 장애). 호스트명 자체를 검증해 즉시 잡는다.
      if (/https?$/.test(url.hostname)) {
        console.error(`[AI report] ANTHROPIC_BASE_URL 호스트명이 비정상입니다: ${url.hostname}`);
        perfLog("config_error", " · baseURL 호스트명 비정상");
        return NextResponse.json(
          { error: `ANTHROPIC_BASE_URL 호스트명이 잘못되었습니다 (${url.hostname}). 환경 변수에 URL이 중복 입력되지 않았는지 확인하세요.` },
          { status: 503 }
        );
      }
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        console.warn(`ANTHROPIC_BASE_URL이 HTTPS가 아님 — API 키가 평문으로 전송될 수 있습니다: ${url.host}`);
      }
    } catch {
      perfLog("config_error", " · baseURL 형식 오류");
      return NextResponse.json(
        { error: "ANTHROPIC_BASE_URL 형식이 잘못되었습니다. 프로토콜을 포함한 전체 URL을 설정하세요 (예: https://gateway.example.com)." },
        { status: 503 }
      );
    }
  }

  const client = new Anthropic({ apiKey, baseURL });

  // 잘못된 JSON body는 여기서 던져 500으로 끝나며 계측에 안 잡힌다 — 파싱·검증 실패도 기록한다.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    perfLog("input_error", " · req.json 파싱 실패");
    return NextResponse.json({ error: "요청 본문을 해석하지 못했습니다." }, { status: 400 });
  }
  const { child, weather, air, uv, pollen } = (body ?? {}) as {
    child: {
      name: string;
      age: string;
      // 마스크 연령 게이트(만 2세 미만 금지)를 서버가 정확히 판정하려면 birth(연·월)가 필요하다.
      // age 문자열만으로도 폴백 판정되지만(ageInMonths), birth가 오면 우선한다.
      birth?: { year?: string; month?: string };
      gender: "male" | "female" | "unknown";
      conditions?: string[];
      conditionEtc?: string;
      cold?: string;
      hot?: string;
      sweat?: string;
      schedule?: {
        goSchool?: string;
        outdoorStart?: string;
        outdoorEnd?: string;
        leaveSchool?: string;
        eveningStart?: string;
        eveningEnd?: string;
      };
    };
    weather: {
      temperature: number | null;
      sky: number | null;
      pty: number | null;
      humidity: number | null;
      windSpeed: number | null;
      pop: number | null;
      hourlyForecast?: Array<{
        hour: string;
        temp: number;
        sky: number | null;
        pty: number | null;
        humidity: number | null;
        windSpeed: number | null;
        pop: number | null;
      }>;
    };
    air: {
      pm10: number | null;
      pm25: number | null;
      pm10Grade: number | null;
      pm25Grade: number | null;
      khaiGrade: number | null;
    } | null;
    uv: { uvi: number | null; hourly?: Record<string, number | null> } | null;
    pollen: { oak: number | null; pine: number | null; weed: number | null } | null;
  };

  // 필수 입력 검증 — 누락 시 프롬프트 구성 중 예외로 500이 나기 전에 400으로 명확히 끝낸다.
  if (!child || !weather) {
    perfLog("input_error", " · child/weather 누락");
    return NextResponse.json({ error: "필수 입력(child, weather)이 없습니다." }, { status: 400 });
  }

  // 마스크 안전망 — 준비물의 마스크는 두 게이트를 모두 통과해야 한다(lib/report-sanitize.ts).
  // 프롬프트·규칙 엔진(lib/prep.ts)이 같은 규칙을 두지만 프롬프트는 확률적이라 모델이 어길 수
  // 있고, 그 검증은 오프라인 eval에만 있었다. 실사용 출력의 결정적 최후 방어선을 여기 둔다.
  //  ① 근거: 미세먼지 나쁨(등급≥3) 또는 꽃가루 높음(지수≥2) — 습도·더위는 마스크 사유가 아니다.
  //  ② 연령: 만 2세(24개월) 이상 — 영아는 질식 위험으로 마스크 대신 "실내놀이"로 대체한다.
  const maskJustified = isMaskJustified({
    pm10Grade: air?.pm10Grade ?? null,
    pm25Grade: air?.pm25Grade ?? null,
    khaiGrade: air?.khaiGrade ?? null,
    pollenGrades: pollen ? [pollen.oak, pollen.pine, pollen.weed] : [],
  });
  const maskAllowedForAge = canRecommendMask(ageInMonths(child.age, child.birth));

  // 레이트리밋 — 인증 없이 열린 엔드포인트라 호출당 Claude 비용이 그대로 노출된다.
  // 입력 검증 뒤에 두는 이유: 비용은 이 지점 이후에만 발생하고, 잘못된 요청(400)으로
  // 정상 사용자의 하루 한도가 깎이지 않는다. 형식만 맞춘 스크립트 남용은 그대로 막힌다.
  const tRateStart = Date.now();
  const userId = await currentUserId();
  const tAuthDone = Date.now();
  const rate = await checkReportRateLimit(req.headers, userId);
  if (!rate.allowed) {
    perfLog("rate_limited", ` · ${rate.used}/${rate.limit}회`);
    // 게스트/로그인 문구를 분기한다 — 게스트는 가입 전환 유도, 로그인은 한도 안내만
    // (홈 화면의 영구 배너·CTA는 isGuest 플래그로 분기, app/(main)/home/page.tsx 참조).
    const isGuest = !userId;
    return NextResponse.json(
      {
        error: isGuest
          ? "오늘의 체험 횟수를 모두 사용했어요. 가입하면 계속 이용할 수 있어요."
          : "오늘의 브리핑 생성 한도에 도달했어요. 내일 다시 이용할 수 있어요.",
        limit: rate.limit,
        isGuest,
      },
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }
  // 레이트리밋이 홈 지연에 얹는 몫(인증 쿠키 조회 + DB 왕복)을 따로 남긴다 —
  // 홈 지연 조사(docs/perf-home-latency.md) 때 이 구간을 분리해서 볼 수 있어야 한다.
  perfLog(
    "rate_ok",
    ` · rate ${Date.now() - tRateStart}ms (auth ${tAuthDone - tRateStart} · store ${Date.now() - tAuthDone})${rate.skipped ? ` · skipped=${rate.skipped}` : ` · ${rate.used}/${rate.limit}회`}`
  );

  // 프롬프트 구성 전체를 감싼다 — 잘못된 shape(예: hourlyForecast 항목에 hour 누락)으로
  // 필드 접근·파싱이 던지면, 로그 없이 500으로 끝나지 않고 outcome을 기록하고 400으로 끝낸다.
  let prompt: string;
  try {
  // ── 환경 요약 ──────────────────────────────────────────────
  // 수치(μg/m³)는 프롬프트에 넣지 않는다 — 등급이 판단 정보의 전부이고,
  // 입력에 숫자가 있으면 hook/message로 샐 위험만 있다 (자외선과 동일 원칙).
  const airSummary = air
    ? `미세먼지(PM10) ${gradeLabel(air.pm10Grade)}, 초미세먼지(PM2.5) ${gradeLabel(air.pm25Grade)}, 통합대기 ${gradeLabel(air.khaiGrade)}`
    : "대기질 데이터 없음";

  // 자외선지수(UVI) → 라벨 (홈 시간대 카드와 동일 임계값). 하루 최고값은 피크 시각과
  // 함께 요약하고, 일정별 줄에도 해당 시각 등급을 넣는다 — 최고값 숫자만 주면 모델이
  // 임의 시간대(하원 등)에 붙이는 오귀속이 발생한다 (2026-07-19 "하원 자외선 매우강함" 버그).
  const uvLabel = (v: number | null) =>
    v == null ? null : v >= 8 ? "매우강함" : v >= 6 ? "강함" : v >= 3 ? "보통" : "낮음";
  const uvEntries = uv?.hourly
    ? Object.entries(uv.hourly)
        .map(([h, v]) => ({ hour: Number(h), value: v }))
        .filter((e): e is { hour: number; value: number } => !Number.isNaN(e.hour) && e.value != null)
    : [];
  const uvPeakEntry = uvEntries.length
    ? uvEntries.reduce((a, b) => (b.value > a.value ? b : a))
    : null;
  // 프롬프트에는 수치(UVI 숫자)를 넣지 않는다 — hook/message 수치 금지 규칙이 있어도
  // 입력에 숫자가 있으면 출력으로 샐 위험이 있다. 등급 계산은 서버가 이미 했으므로 등급만 전달.
  // 같은 원리로 강함 미만이면 등급 자체를 넣지 않는다 — 입력에 "보통"이 있으면 "자외선은
  // 보통이라 괜찮아요" 류 안심문장으로 샌다 (2026-07-20 eval S03·S12에서 반복 확인).
  const uvPeak = uvPeakEntry ? uvPeakEntry.value : uv?.uvi ?? null;
  const uvSummary =
    uvPeak != null
      ? uvPeak >= 6
        ? `자외선 오늘 최고 ${uvLabel(uvPeak)}${uvPeakEntry ? ` (${uvPeakEntry.hour}시경)` : ""}`
        : "자외선 특이사항 없음"
      : "자외선 데이터 없음";

  // 일정 시각의 자외선 값 — 3시간 해상도라 가장 가까운 시각 값 사용 (홈 카드 nearestUv와 동일 방식)
  const uvAtHour = (target: number): number | null => {
    if (Number.isNaN(target) || !uvEntries.length) return null;
    const best = uvEntries.reduce((a, b) =>
      Math.abs(b.hour - target) < Math.abs(a.hour - target) ? b : a
    );
    return best.value;
  };

  // 꽃가루농도위험지수(0~3) → 라벨. 참나무·소나무·잡초 중 최댓값 기준.
  // 단계 매핑은 lib/timeline.ts pollenLevelOf 단일 출처를 쓴다(홈 칩·env 행과 표기 일치).
  const pollenVals = pollen
    ? [pollen.oak, pollen.pine, pollen.weed].filter((v): v is number => v != null)
    : [];
  const pollenMax = pollenVals.length ? Math.max(...pollenVals) : null;
  const pollenSummary =
    pollenMax != null ? `꽃가루 오늘 최고 ${pollenLevelOf(pollenMax)}` : "꽃가루 데이터 없음";

  // ── 아이 프로필 ─────────────────────────────────────────────
  const genderLabel = child.gender === "male" ? "남아" : child.gender === "female" ? "여아" : "미지정";
  // 온보딩 라벨·구형 키워드의 질병명(비염·천식·아토피)이 출력에 진단 단정("비염 있는 ○○")으로
  // 복사되지 않도록 민감 체질 표현으로 변환해 넣는다(conditionsForPrompt 주석 참조).
  const conditions = conditionsForPrompt(child.conditions, child.conditionEtc);
  // cold/hot/sweat는 온보딩에서 코드값("normal" 등)으로 저장되므로 한국어 문구로
  // 변환해 프롬프트에 넣는다(버그 B). 데모/구형 한국어 문자열은 그대로 통과한다.
  const tempSensitivity = [
    child.cold ? `추위: ${sensitivityPhrase(child.cold)}` : null,
    child.hot ? `더위: ${sensitivityPhrase(child.hot)}` : null,
    child.sweat ? `땀: ${sweatPhrase(child.sweat)}` : null,
  ].filter(Boolean).join(", ") || "특이사항 없음";

  // ── 오늘 날짜·요일 (KST) ────────────────────────────────────
  // 프롬프트에 날짜·요일이 없으면 환경이 비슷한 이틀 연속 리포트가 사실상 복붙이 되고,
  // 일요일에 등원 안내를 하는 요일 무지가 생긴다. 서버는 UTC일 수 있으므로 KST 보정
  // (kstNow + getUTC* 게터 — 프로젝트 관례, lib/kma-time.ts 참조).
  // dev 전용 평가 훅: scripts/eval-report.mjs가 요일 의존 로직(주말 등원 제외)을
  // 임의 날짜로 검증하기 위한 override. 프로덕션 빌드에선 무시된다.
  const evalDateRaw = (body as { evalDate?: unknown }).evalDate;
  const kst =
    process.env.NODE_ENV !== "production" &&
    typeof evalDateRaw === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(evalDateRaw)
      ? new Date(`${evalDateRaw}T12:00:00Z`)
      : kstNow();
  const weekdayIdx = kst.getUTCDay();
  const dateLabel = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${
    ["일", "월", "화", "수", "목", "금", "토"][weekdayIdx]
  }요일`;
  // 주말엔 등원·하원 줄을 프롬프트에서 제외한다 — "언급하지 마" 지시보다 입력에서 빼는
  // 것이 확실하다. 홈 시간대별 환경 카드는 그대로 둔다(그 시각 날씨 자체는 주말에도
  // 유효한 정보 + 매일 같은 레이아웃 유지, 2026-07-20 사용자 결정).
  const isWeekend = weekdayIdx === 0 || weekdayIdx === 6;

  // ── 시간대별 날씨 → 일정 매핑 ──────────────────────────────
  const hourly = weather.hourlyForecast ?? [];

  const findSlot = (time?: string) => {
    if (!time || !hourly.length) return null;
    const [hh] = time.split(":");
    const targetH = parseInt(hh, 10);
    const best = hourly.reduce((a, s) => {
      const sh = parseInt(s.hour.split(":")[0], 10);
      const bh = parseInt(a.hour.split(":")[0], 10);
      return Math.abs(sh - targetH) < Math.abs(bh - targetH) ? s : a;
    });
    // 예보는 3시간 해상도 — 2시간 넘게 떨어진 예보를 해당 일정의 날씨인 것처럼
    // 프롬프트에 넣지 않는다 (해당 줄은 생략됨)
    const bestH = parseInt(best.hour.split(":")[0], 10);
    return Math.abs(bestH - targetH) > 2 ? null : best;
  };

  const slotLine = (label: string, time?: string, endTime?: string) => {
    const s = findSlot(time);
    if (!s) return null;
    const timeStr = endTime ? `${time}~${endTime}` : time;
    const sky = skyLabel(s.sky);
    const rain = rainSignal(s.pty, s.pop); // pty·강수확률 통합 신호 (40~59%는 무수치)
    // 강함(6) 이상일 때만 일정 줄에 표기 — 보통·낮음이 입력에 있으면 출력으로 샌다 (uvSummary와 동일 원칙)
    const uvV = uvAtHour(parseInt((time ?? "").split(":")[0], 10));
    const uvStr = uvV != null && uvV >= 6 ? `, 자외선 ${uvLabel(uvV)}` : "";
    return `- ${label} ${timeStr}: 기온 ${s.temp}°C, ${sky}${rain}, 습도 ${s.humidity ?? "?"}%${uvStr}`;
  };

  const scheduleLines = [
    isWeekend ? null : slotLine("등원", child.schedule?.goSchool),
    child.schedule?.outdoorStart
      ? slotLine("야외활동", child.schedule.outdoorStart, child.schedule.outdoorEnd)
      : null,
    isWeekend ? null : slotLine("하원", child.schedule?.leaveSchool),
    child.schedule?.eveningStart
      ? slotLine("저녁 외출", child.schedule.eveningStart, child.schedule.eveningEnd)
      : null,
  ].filter(Boolean);

  // 일과 미입력이면 데이터 첫 줄에 명시한다 — "등원·하원을 지어내지 마라"는 규칙·예시만으로는
  // 모델이 하원 등을 계속 발화했다(2026-07-20 eval S12). 주말 처리와 같은 원칙: 지시보다 입력.
  // 헤더에 "등원·하원" 단어 자체를 두지 않는다 — v25의 근거 문장(문장2) 압력이 이 문구를
  // "등원·하원 시각이 없어서"로 되읽는 회귀를 만들었다 (2026-07-27 eval S12).
  const scheduleSummary = scheduleLines.length
    ? scheduleLines.join("\n")
    : hourly.length
      ? "(일과 미입력 — 아침/낮/저녁 시간대로만 안내)\n" +
        hourly.map((s) => `- ${s.hour}: ${s.temp}°C, ${skyLabel(s.sky)}${rainSignal(s.pty, s.pop)}`).join("\n")
      : `기온 ${weather.temperature ?? "?"}°C, ${skyLabel(weather.sky)}, 습도 ${weather.humidity ?? "?"}%${rainSignal(weather.pty, weather.pop)}`;

  prompt = buildReportPrompt({
    name: child.name,
    age: child.age,
    genderLabel,
    conditions,
    tempSensitivity,
    dateLabel,
    scheduleSummary,
    airSummary,
    uvSummary,
    pollenSummary,
  });
  } catch (err) {
    perfLog("build_error", ` · ${err instanceof Error ? err.message : "프롬프트 구성 실패"}`);
    return NextResponse.json({ error: "리포트 입력 처리 중 오류가 발생했습니다." }, { status: 500 });
  }

  // 파싱 결과 → 응답 페이로드 (prep: 시간대별 준비물 키워드, 슬롯명 → 키워드[])
  type Parsed = { hook?: string; message?: string; checklist?: string[]; prep?: Record<string, string[]> };
  const toPayload = (parsed: Parsed): ReportPayload => {
    const base: ReportPayload = {
      hook: parsed.hook ?? "",
      message: parsed.message ?? "",
      checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
      prep: parsed.prep && typeof parsed.prep === "object" && !Array.isArray(parsed.prep) ? parsed.prep : {},
    };
    // 구조 필드(checklist·prep) 정합성을 결정적으로 강제한다(lib/report-sanitize.ts):
    // 마스크 정책(근거·연령) + prep⊆checklist. 프롬프트 강화 후에도 모델이 규칙을 어기는지
    // 추적하도록 사유별 관측 로그를 남긴다.
    const { payload, maskAction, droppedPrep } = sanitizeReportPayload(base, {
      maskJustified,
      maskAllowedForAge,
    });
    if (maskAction === "removed") perfLog("mask_stripped", " · 미세먼지·꽃가루 정상인데 AI가 마스크 권함 → 제거");
    else if (maskAction === "downgraded") perfLog("mask_to_indoor", " · 만 2세 미만인데 AI가 마스크 권함 → 실내놀이 대체");
    if (droppedPrep.length > 0) perfLog("prep_dropped", ` · checklist에 없는 준비물 칩 제거: ${droppedPrep.join(", ")}`);
    // 본문(hook)에 마스크가 남았는데 checklist엔 없으면 프롬프트가 샌 것 — 관측만(문장은 프롬프트 담당).
    if (/마스크/.test(payload.hook) && !payload.checklist.some((c) => /마스크/.test(c))) {
      perfLog("hook_mask_orphan", " · hook에 마스크가 있으나 checklist엔 없음(프롬프트 규칙 누수)");
    }
    return payload;
  };

  // 모델 원문(전체) → 최종 페이로드. 코드블록 제거 → 직접 파싱 → { } 블록 추출 순으로 시도.
  const parseFinal = (raw: string) => {
    const trimmed = raw.trim();
    try {
      const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;
      return toPayload(JSON.parse(jsonStr) as Parsed);
    } catch {
      const braceMatch = trimmed.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          return toPayload(JSON.parse(braceMatch[0]) as Parsed);
        } catch {}
      }
      console.error("[AI report] JSON 파싱 실패 — 모델 원문(앞 500자):", trimmed.slice(0, 500));
      return { hook: "", message: "", checklist: [], prep: {} };
    }
  };

  // 완성된 JSON 문자열 필드만 추출 — 스트리밍 중 닫는 따옴표가 도착했을 때만 매치된다.
  // 값은 이스케이프를 포함한 원문이므로 따옴표로 감싸 JSON.parse로 디코딩한다.
  const extractField = (acc: string, field: string): string | null => {
    const m = acc.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (!m) return null;
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return null;
    }
  };

  const endpoint = baseURL ?? "https://api.anthropic.com";
  const encoder = new TextEncoder();

  // dev 전용 평가 훅: scripts/eval-personas.mjs가 시스템 프롬프트의 페르소나 문단만 교체해
  // 톤 베이크오프를 돌린다. 가치 문장·금지 목록은 buildSystemPrompt가 공통 고정. 프로덕션 무시.
  const personaRaw = (body as { personaOverride?: unknown }).personaOverride;
  const systemPrompt =
    process.env.NODE_ENV !== "production" && typeof personaRaw === "string" && personaRaw.trim()
      ? buildSystemPrompt(personaRaw.trim())
      : REPORT_SYSTEM_PROMPT;

  // dev 전용 평가 훅: 생성 모델 A/B (scripts/eval-model-ab.mjs) — 규칙 준수율·hook 지연을
  // 모델별로 대조한다. 프로덕션은 항상 기본 모델.
  const modelRaw = (body as { modelOverride?: unknown }).modelOverride;
  const model =
    process.env.NODE_ENV !== "production" && typeof modelRaw === "string" && /^claude-[a-z0-9.-]+$/.test(modelRaw)
      ? modelRaw
      : "claude-sonnet-5";

  // SSE 스트림 — hook·message가 완성되는 즉시 내려보내 히어로를 ~2초에 노출하고,
  // 완료 시 done 이벤트로 전체 페이로드(checklist·prep)를 전달한다. 클라이언트는
  // done의 페이로드를 당일 캐시에 저장한다.
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        // 클라이언트가 연결을 끊으면 controller가 닫혀 enqueue가 throw한다 — 무시(상류는 req.signal로 취소됨)
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };
      let acc = "";
      let sentHook = false;
      let sentMessage = false;
      // 계측 마커 (epoch ms) — received는 상위 스코프. 미도달 시점은 0.
      let tStreamStart = 0;
      let tFirstDelta = 0;
      let tHook = 0;
      let streamOutcome = "incomplete"; // finally에서 성공/오류 구분 기록
      try {
        const modelStream = client.messages.stream(
          {
            model,
            max_tokens: 1000,
            // Sonnet 5는 기본 thinking 활성 — 리포트는 저지연이 우선이므로 비활성화.
            // thinking 비활성 시 temperature 지정 불가(기본값 사용). Opus 4.8도 disabled 허용.
            thinking: { type: "disabled" },
            messages: [{ role: "user", content: prompt }],
            system: systemPrompt,
          },
          // 클라이언트가 연결을 끊으면(프로필 전환·언마운트로 fetch abort) req.signal이 발화해
          // 진행 중인 Anthropic 스트림을 취소한다 → superseded 요청의 토큰 생성·비용 차단.
          { signal: req.signal }
        );
        tStreamStart = Date.now(); // SDK 스트림 객체 생성 직후 (요청 전송 준비 완료)

        for await (const event of modelStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            if (!tFirstDelta) tFirstDelta = Date.now(); // 모델 첫 텍스트 토큰 도착
            acc += event.delta.text;
            if (!sentHook) {
              const hook = extractField(acc, "hook");
              if (hook !== null) {
                sentHook = true;
                tHook = Date.now(); // 완성된 hook 추출·전송 시점
                send("hook", hook);
              }
            }
            if (!sentMessage) {
              const message = extractField(acc, "message");
              if (message !== null) {
                sentMessage = true;
                send("message", message);
              }
            }
          }
        }

        send("done", parseFinal(acc));
        streamOutcome = "done";
      } catch (err) {
        // 클라이언트가 취소해 상류(Anthropic)까지 abort된 경우는 오류가 아니다 — 비용도 멈춘 상태.
        if (req.signal.aborted) {
          streamOutcome = "client_aborted";
        } else {
          console.error(`[AI report] Claude API 오류 (endpoint: ${endpoint}):`, err);
          const isConnectionError = err instanceof Anthropic.APIConnectionError;
          streamOutcome = isConnectionError ? "connection_error" : "api_error";
          send("error", {
            error: isConnectionError
              ? `AI 서버(${endpoint})에 연결하지 못했습니다. ANTHROPIC_BASE_URL 설정과 네트워크를 확인해주세요.`
              : "AI 리포트를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.",
          });
        }
      } finally {
        // 성공·실패 모두 타이밍 분해 기록(생존자 편향 방지) — 첫 hook까지의 시간이
        // received→firstDelta(콜드스타트/prefill/게이트웨이)에서 오는지 firstDelta→hook(생성)에서
        // 오는지 가른다. 미도달 시점은 -1. Vercel 로그에서 perfId로 클라이언트와 매칭.
        const rel = (t: number) => (t ? t - tReceived : -1);
        perfLog(
          streamOutcome,
          ` · streamStart ${rel(tStreamStart)} · firstDelta ${rel(tFirstDelta)} · hook ${rel(tHook)} · done ${Date.now() - tReceived}ms · (firstDelta→hook ${tHook && tFirstDelta ? tHook - tFirstDelta : -1}ms) · endpoint=${endpoint}`
        );
        try { controller.close(); } catch {} // 이미 취소·종료됐으면 무시
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
