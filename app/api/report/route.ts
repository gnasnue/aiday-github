import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { buildReportPrompt, REPORT_SYSTEM_PROMPT } from "@/lib/prompts/report";
import { sensitivityPhrase, sweatPhrase } from "@/lib/domain/child-conditions";

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

  // 프롬프트 구성 전체를 감싼다 — 잘못된 shape(예: hourlyForecast 항목에 hour 누락)으로
  // 필드 접근·파싱이 던지면, 로그 없이 500으로 끝나지 않고 outcome을 기록하고 400으로 끝낸다.
  let prompt: string;
  try {
  // ── 환경 요약 ──────────────────────────────────────────────
  const airSummary = air
    ? `PM10 ${air.pm10 ?? "?"}μg/m³(${gradeLabel(air.pm10Grade)}), PM2.5 ${air.pm25 ?? "?"}μg/m³(${gradeLabel(air.pm25Grade)}), 통합대기 ${gradeLabel(air.khaiGrade)}`
    : "대기질 데이터 없음";

  // 자외선지수(UVI) → 라벨 (홈 시간대 카드와 동일 임계값). 오늘 최댓값 기준으로 요약해
  // "야외활동 시간에 강해지는지"를 리포트가 판단할 수 있게 한다.
  const uvLabel = (v: number | null) =>
    v == null ? null : v >= 8 ? "매우강함" : v >= 6 ? "강함" : v >= 3 ? "보통" : "낮음";
  const uvHourly = uv?.hourly ? Object.values(uv.hourly).filter((v): v is number => v != null) : [];
  const uvPeak = uvHourly.length ? Math.max(...uvHourly) : uv?.uvi ?? null;
  const uvSummary =
    uvPeak != null ? `자외선지수 ${uvPeak} (${uvLabel(uvPeak)})` : "자외선 데이터 없음";

  // 꽃가루 위험지수(0~4) → 라벨. 참나무·소나무·잡초 중 최댓값 기준.
  const pollenLabel = (g: number | null) =>
    g == null ? null : g >= 4 ? "매우높음" : g >= 3 ? "높음" : g >= 2 ? "보통" : "낮음";
  const pollenVals = pollen
    ? [pollen.oak, pollen.pine, pollen.weed].filter((v): v is number => v != null)
    : [];
  const pollenMax = pollenVals.length ? Math.max(...pollenVals) : null;
  const pollenSummary =
    pollenMax != null ? `꽃가루 위험지수 ${pollenMax} (${pollenLabel(pollenMax)})` : "꽃가루 데이터 없음";

  // ── 아이 프로필 ─────────────────────────────────────────────
  const genderLabel = child.gender === "male" ? "남아" : child.gender === "female" ? "여아" : "미지정";
  const conditions = child.conditions?.length
    ? child.conditions.join(", ") + (child.conditionEtc ? `, ${child.conditionEtc}` : "")
    : child.conditionEtc || "없음";
  // cold/hot/sweat는 온보딩에서 코드값("normal" 등)으로 저장되므로 한국어 문구로
  // 변환해 프롬프트에 넣는다(버그 B). 데모/구형 한국어 문자열은 그대로 통과한다.
  const tempSensitivity = [
    child.cold ? `추위: ${sensitivityPhrase(child.cold)}` : null,
    child.hot ? `더위: ${sensitivityPhrase(child.hot)}` : null,
    child.sweat ? `땀: ${sweatPhrase(child.sweat)}` : null,
  ].filter(Boolean).join(", ") || "특이사항 없음";

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
    const rain = s.pty ? ` / ${ptyLabel(s.pty)}` : "";
    const pop = s.pop != null ? ` (강수확률 ${s.pop}%)` : "";
    return `- ${label} ${timeStr}: 기온 ${s.temp}°C, ${sky}${rain}${pop}, 습도 ${s.humidity ?? "?"}%`;
  };

  const scheduleLines = [
    slotLine("등원", child.schedule?.goSchool),
    child.schedule?.outdoorStart
      ? slotLine("야외활동", child.schedule.outdoorStart, child.schedule.outdoorEnd)
      : null,
    slotLine("하원", child.schedule?.leaveSchool),
    child.schedule?.eveningStart
      ? slotLine("저녁 외출", child.schedule.eveningStart, child.schedule.eveningEnd)
      : null,
  ].filter(Boolean);

  const scheduleSummary = scheduleLines.length
    ? scheduleLines.join("\n")
    : hourly.length
      ? hourly.map((s) => `- ${s.hour}: ${s.temp}°C, ${skyLabel(s.sky)}${s.pty ? ` / ${ptyLabel(s.pty)}` : ""}${s.pop != null ? ` (강수 ${s.pop}%)` : ""}`).join("\n")
      : `기온 ${weather.temperature ?? "?"}°C, ${skyLabel(weather.sky)}, 습도 ${weather.humidity ?? "?"}%, 강수확률 ${weather.pop ?? "?"}%`;

  prompt = buildReportPrompt({
    name: child.name,
    age: child.age,
    genderLabel,
    conditions,
    tempSensitivity,
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
  const toPayload = (parsed: Parsed) => ({
    hook: parsed.hook ?? "",
    message: parsed.message ?? "",
    checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
    prep: parsed.prep && typeof parsed.prep === "object" && !Array.isArray(parsed.prep) ? parsed.prep : {},
  });

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
            model: "claude-sonnet-5",
            max_tokens: 1000,
            // Sonnet 5는 기본 thinking 활성 — 리포트는 저지연이 우선이므로 비활성화.
            // thinking 비활성 시 temperature 지정 불가(기본값 사용).
            thinking: { type: "disabled" },
            messages: [{ role: "user", content: prompt }],
            system: REPORT_SYSTEM_PROMPT,
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
