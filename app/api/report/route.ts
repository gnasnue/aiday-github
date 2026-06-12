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

오늘 ${child.name}의 하루를 준비하는 부모에게 AI 리포트를 작성해주세요.

출력 형식 — 아래 JSON만 반환 (코드블록 없이):
{"message":"...","checklist":["이모지 항목1","이모지 항목2","이모지 항목3"]}

message 작성 기준:
- 오늘 ${child.name}에게 가장 중요한 한 가지를 첫 문장에 바로 꺼낼 것 (날씨 개요로 시작 금지)
- 건강 특이사항(${conditions})과 오늘 날씨·일정의 교차점을 반드시 짚을 것
- 부모가 바로 행동할 수 있는 구체적인 준비 사항 포함
- 전체 2~3문장. 문장마다 \\n 구분. 중요 키워드는 **단어** 형식으로 강조
- ${child.name}는/${child.name}이는 형태로 3인칭 지칭. 2인칭("${child.name}야", "너는") 절대 금지

checklist: 오늘 일정과 건강 상태를 고려해 반드시 챙길 물건 3~4개. "이모지 짧은이름" 형식 (예: "☂️ 우산", "🧴 보습크림")`;

  // 스트리밍 대신 완성된 응답을 반환 (Next.js 15 호환)
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
      temperature: 1.0,
      system:
        "당신은 아이를 키우는 부모의 든든한 육아 친구입니다. 매일 아침 카카오톡처럼 따뜻하고 자연스럽게, 오늘 이 아이에게 꼭 필요한 이야기만 전해주세요. 핵심 원칙: 첫 문장부터 아이의 건강 특이사항과 오늘 환경의 교차점을 짚을 것. 날씨 개요로 시작하지 말 것. 아이는 항상 3인칭으로만 지칭할 것. 응답은 반드시 순수 JSON 한 줄만 반환하세요. 코드블록(```)이나 줄바꿈, 설명 텍스트 없이 JSON 객체 하나만.",
    });

    const raw =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";

    // 코드블록으로 감싸인 경우 내용 추출 후 파싱
    try {
      const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : raw;
      const parsed = JSON.parse(jsonStr) as { message?: string; checklist?: string[] };
      return NextResponse.json({
        message: parsed.message ?? "",
        checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
      });
    } catch {
      // JSON 파싱 실패 → { } 블록 직접 추출 시도
      const braceMatch = raw.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          const parsed = JSON.parse(braceMatch[0]) as { message?: string; checklist?: string[] };
          return NextResponse.json({
            message: parsed.message ?? "",
            checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
          });
        } catch {}
      }
      // 최후 fallback: 빈 응답 반환 → 클라이언트가 recommendation-engine 사용
      return NextResponse.json({ message: "", checklist: [] });
    }
  } catch (err) {
    console.error("[AI report] Claude API 오류:", err);
    return NextResponse.json(
      { error: "AI 리포트를 생성하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 503 }
    );
  }
}
