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
      cold?: string;
      hot?: string;
      sweat?: string;
    };
    weather: {
      temperature: number | null;
      sky: number | null;
      pty: number | null;
      humidity: number | null;
      windSpeed: number | null;
      pop: number | null;
    };
    air: {
      pm10: number | null;
      pm25: number | null;
      pm10Grade: number | null;
      pm25Grade: number | null;
      khaiGrade: number | null;
    } | null;
  };

  // 환경 요약 구성
  const weatherSummary = [
    `기온 ${weather.temperature ?? "?"}°C`,
    `하늘 ${skyLabel(weather.sky)}`,
    weather.pty ? `강수 ${ptyLabel(weather.pty)}` : null,
    `습도 ${weather.humidity ?? "?"}%`,
    `바람 ${weather.windSpeed ?? "?"}m/s`,
    `강수확률 ${weather.pop ?? "?"}%`,
  ]
    .filter(Boolean)
    .join(", ");

  const airSummary = air
    ? `PM10 ${air.pm10 ?? "?"}μg/m³(${gradeLabel(air.pm10Grade)}), PM2.5 ${air.pm25 ?? "?"}μg/m³(${gradeLabel(air.pm25Grade)}), 통합대기 ${gradeLabel(air.khaiGrade)}`
    : "대기질 데이터 없음";

  const healthContext = child.conditions?.length
    ? `건강 특이사항: ${child.conditions.join(", ")}`
    : "특이 건강 이슈 없음";

  const tempSensitivity = [
    child.cold ? `추위 민감도: ${child.cold}` : null,
    child.hot ? `더위 민감도: ${child.hot}` : null,
    child.sweat ? `땀 흘림: ${child.sweat}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = `아이 정보:
- 이름: ${child.name} (${child.age}, ${child.gender === "male" ? "남아" : child.gender === "female" ? "여아" : "미지정"})
- ${healthContext}
- ${tempSensitivity || "체온 특이사항 없음"}

오늘 날씨: ${weatherSummary}
대기질: ${airSummary}

위 정보를 바탕으로 오늘 아침 ${child.name}의 등원/외출 준비를 위한 AI 리포트를 작성해주세요.

형식:
1. 첫 문장: 오늘 날씨와 공기 상태를 한 문장으로 자연스럽게 요약 (아이 이름 포함)
2. 핵심 주의사항 1~2가지 (건강 특이사항과 날씨 연계)
3. 옷차림 추천 1문장
4. 오늘 챙길 것 3~4개 (체크리스트 형식, 각 항목은 "이모지 내용" 형태)

응답은 **한국어**로, 따뜻하고 친근한 톤으로. 총 5~7문장. 마크다운 없이 순수 텍스트로.`;

  // 스트리밍 대신 완성된 응답을 반환 (Next.js 15 호환)
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
      system:
        "당신은 만 1~8세 아이를 둔 부모를 위한 AI 육아 비서입니다. 날씨와 아이의 건강 특성을 고려하여 오늘 아침 준비를 돕는 짧고 실용적인 리포트를 작성합니다. 항상 한국어로 답변하세요.",
    });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text : "";

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[AI report] Claude API 오류:", err);
    return NextResponse.json(
      { error: "AI 리포트를 생성하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 503 }
    );
  }
}
