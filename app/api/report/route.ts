import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

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

  // HH:MM 기준으로 가장 가까운 시간대 예보 찾기
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

  // ── 프롬프트 ────────────────────────────────────────────────
  const prompt = `[아이 정보]
이름: ${child.name} (${child.age}, ${genderLabel})
건강 특이사항: ${conditions}
체온 민감도: ${tempSensitivity}

[오늘 일정별 날씨]
${scheduleSummary}

[현재 대기질]
${airSummary}

위 정보를 바탕으로 ${child.name}의 오늘 하루 준비를 위한 AI 리포트를 부모에게 전달하는 문장으로 작성해주세요.

반드시 아래 JSON 형식으로만 응답하세요:

{
  "message": "문장1: 오늘 날씨·대기질 핵심 요약 (일정 중 가장 주의가 필요한 시간대 언급).\n문장2: 건강 특이사항과 연계한 구체적 주의사항.\n문장3: 옷차림 또는 준비물 추천.",
  "checklist": ["이모지 항목1", "이모지 항목2", "이모지 항목3"]
}

규칙:
- message: 반드시 부모에게 전달하는 3인칭 문장. "${child.name}야/아", "너는", "네가" 같은 2인칭 절대 금지. 아이는 "${child.name}는/${child.name}이" 형태로 지칭. 문장마다 \\n 구분. 중요 키워드는 **단어** 형식 강조.
- checklist: 오늘 반드시 챙길 물건 3~4개. "이모지 짧은이름" 형식 (예: "☂️ 우산", "🧴 보습크림"). 일정과 건강 상태를 고려해 선정.
- 전체 응답은 파싱 가능한 JSON만. 따뜻하고 친근한 한국어 톤.`;

  // 스트리밍 대신 완성된 응답을 반환 (Next.js 15 호환)
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
      temperature: 1.0,
      system:
        "당신은 아이를 키우는 부모의 든든한 육아 친구입니다. 오늘 날씨와 아이 특성을 바탕으로 따뜻하고 자연스러운 말투로 아침 준비를 도와주세요. 마치 매일 아침 친한 친구가 카톡으로 보내주는 것처럼 편안하고 공감 가는 톤으로 써주세요. 딱딱한 보고서 문체나 나열식 표현은 절대 피하세요. 중요: 리포트는 반드시 부모에게 전달하는 문장으로 작성하세요. 아이에게 직접 말 거는 2인칭 표현('지우야', '너는', '네가' 등)은 절대 사용하지 마세요. 아이는 항상 3인칭으로 지칭하세요. 항상 한국어로 답변하세요. 응답은 반드시 순수 JSON 객체만 반환하세요. 코드블록(```)이나 설명 텍스트를 절대 포함하지 마세요.",
    });

    const raw =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

    // JSON 파싱 시도 → 실패 시 legacy 텍스트로 fallback
    try {
      // ```json ... ``` 감싸기 제거 (Claude가 마크다운 코드블록으로 감쌀 때 대비)
      const jsonStr = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(jsonStr) as { message?: string; checklist?: string[] };
      return NextResponse.json({
        message: parsed.message ?? "",
        checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
      });
    } catch {
      // JSON 파싱 실패 → 텍스트에서 이모지 줄을 체크리스트로 분리
      const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
      const emojiLineRe = /^(\p{Emoji_Presentation}|\p{Emoji}️|[\u{1F300}-\u{1FFFF}])/u;
      const checklistItems = lines.filter((l) => emojiLineRe.test(l));
      const messageLines = lines.filter((l) => !emojiLineRe.test(l));
      return NextResponse.json({
        message: messageLines.join("\n"),
        checklist: checklistItems.length > 0 ? checklistItems : [],
      });
    }
  } catch (err) {
    console.error("[AI report] Claude API 오류:", err);
    return NextResponse.json(
      { error: "AI 리포트를 생성하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 503 }
    );
  }
}
