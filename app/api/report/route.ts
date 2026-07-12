import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { buildReportPrompt, REPORT_SYSTEM_PROMPT } from "@/lib/prompts/report";

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your_anthropic_api_key_here") {
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
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        console.warn(`ANTHROPIC_BASE_URL이 HTTPS가 아님 — API 키가 평문으로 전송될 수 있습니다: ${url.host}`);
      }
    } catch {
      return NextResponse.json(
        { error: "ANTHROPIC_BASE_URL 형식이 잘못되었습니다. 프로토콜을 포함한 전체 URL을 설정하세요 (예: https://gateway.example.com)." },
        { status: 503 }
      );
    }
  }

  const client = new Anthropic({ apiKey, baseURL });

  const body = await req.json();
  const { child, weather, air } = body as {
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
  };

  // ── 환경 요약 ──────────────────────────────────────────────
  const airSummary = air
    ? `PM10 ${air.pm10 ?? "?"}μg/m³(${gradeLabel(air.pm10Grade)}), PM2.5 ${air.pm25 ?? "?"}μg/m³(${gradeLabel(air.pm25Grade)}), 통합대기 ${gradeLabel(air.khaiGrade)}`
    : "대기질 데이터 없음";

  // ── 아이 프로필 ─────────────────────────────────────────────
  const genderLabel = child.gender === "male" ? "남아" : child.gender === "female" ? "여아" : "미지정";
  const conditions = child.conditions?.length
    ? child.conditions.join(", ") + (child.conditionEtc ? `, ${child.conditionEtc}` : "")
    : child.conditionEtc || "없음";
  const tempSensitivity = [
    child.cold ? `추위: ${child.cold}` : null,
    child.hot ? `더위: ${child.hot}` : null,
    child.sweat ? `땀: ${child.sweat}` : null,
  ].filter(Boolean).join(", ") || "특이사항 없음";

  // ── 시간대별 날씨 → 일정 매핑 ──────────────────────────────
  const hourly = weather.hourlyForecast ?? [];

  const findSlot = (time?: string) => {
    if (!time || !hourly.length) return null;
    const [hh] = time.split(":");
    const targetH = parseInt(hh, 10);
    return hourly.reduce((best, s) => {
      const sh = parseInt(s.hour.split(":")[0], 10);
      const bh = parseInt(best.hour.split(":")[0], 10);
      return Math.abs(sh - targetH) < Math.abs(bh - targetH) ? s : best;
    });
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

  const prompt = buildReportPrompt({
    name: child.name,
    age: child.age,
    genderLabel,
    conditions,
    tempSensitivity,
    scheduleSummary,
    airSummary,
  });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      // Sonnet 5는 기본 thinking 활성 — 리포트는 저지연이 우선이므로 비활성화.
      // thinking 비활성 시 temperature 지정 불가(기본값 사용).
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: prompt }],
      system: REPORT_SYSTEM_PROMPT,
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // 1차: 코드블록 제거 후 JSON 파싱
    try {
      const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : raw;
      const parsed = JSON.parse(jsonStr) as { hook?: string; message?: string; checklist?: string[] };
      return NextResponse.json({
        hook: parsed.hook ?? "",
        message: parsed.message ?? "",
        checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
      });
    } catch {
      // 2차: { } 블록 직접 추출
      const braceMatch = raw.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          const parsed = JSON.parse(braceMatch[0]) as { hook?: string; message?: string; checklist?: string[] };
          return NextResponse.json({
            hook: parsed.hook ?? "",
            message: parsed.message ?? "",
            checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
          });
        } catch {}
      }
      // 최후: 빈 응답 → 클라이언트가 recommendation-engine 사용
      return NextResponse.json({ hook: "", message: "", checklist: [] });
    }
  } catch (err) {
    console.error("[AI report] Claude API 오류:", err);
    return NextResponse.json(
      { error: "AI 리포트를 생성하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 503 }
    );
  }
}
