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

  const client = new Anthropic({ apiKey });

  const body = await req.json();
  const { child, weather, air, pollen, uv } = body as {
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
    pollen?: {
      oak: number | null;
      pine: number | null;
    } | null;
    uv?: {
      uvi: number | null;
    } | null;
  };

  // ── 환경 요약 ──────────────────────────────────────────────
  const airSummary = air
    ? `PM10 ${air.pm10 ?? "?"}μg/m³(${gradeLabel(air.pm10Grade)}), PM2.5 ${air.pm25 ?? "?"}μg/m³(${gradeLabel(air.pm25Grade)}), 통합대기 ${gradeLabel(air.khaiGrade)}`
    : "대기질 데이터 없음";

  // 기상청 꽃가루 위험지수(0~4) → 라벨
  const pollenLabel = (g: number | null | undefined) =>
    g == null ? null : g >= 4 ? "매우높음" : g >= 3 ? "높음" : g >= 2 ? "보통" : "낮음";
  const uvLabel = (v: number) =>
    v >= 11 ? "위험" : v >= 8 ? "매우높음" : v >= 6 ? "높음" : v >= 3 ? "보통" : "낮음";

  const pollenParts = [
    pollenLabel(pollen?.oak) ? `참나무 꽃가루 ${pollenLabel(pollen?.oak)}` : null,
    pollenLabel(pollen?.pine) ? `소나무 꽃가루 ${pollenLabel(pollen?.pine)}` : null,
    uv?.uvi != null ? `자외선지수 ${uv.uvi}(${uvLabel(uv.uvi)})` : null,
  ].filter(Boolean);
  const pollenUvSummary = pollenParts.length ? pollenParts.join(", ") : "데이터 없음";

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
    pollenUvSummary,
  });

  try {
    // structured outputs — 응답이 스키마에 맞는 JSON임을 API 레벨에서 보장
    // (글자 수·항목 개수 제한은 스키마가 지원하지 않으므로 프롬프트 규칙으로 유지)
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
      temperature: 1.0,
      system: REPORT_SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              hook: { type: "string" },
              message: { type: "string" },
              checklist: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    emoji: { type: "string" },
                    name: { type: "string" },
                  },
                  required: ["emoji", "name"],
                  additionalProperties: false,
                },
              },
            },
            required: ["hook", "message", "checklist"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    try {
      const parsed = JSON.parse(raw) as {
        hook?: string;
        message?: string;
        checklist?: Array<{ emoji?: string; name?: string }>;
      };
      return NextResponse.json({
        hook: parsed.hook ?? "",
        message: parsed.message ?? "",
        checklist: Array.isArray(parsed.checklist)
          ? parsed.checklist.filter((c) => typeof c?.name === "string" && c.name)
          : [],
      });
    } catch {
      // max_tokens 도달·거부 등 스키마 보장이 깨지는 예외 상황 →
      // 빈 응답을 돌려 클라이언트가 recommendation-engine fallback 사용
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
