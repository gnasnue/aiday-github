import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  buildNoteboardPrompt,
  NOTEBOARD_SYSTEM_PROMPT,
  parseNoteboardOutput,
} from "@/lib/prompts/noteboard";
import { NOTE_DAILY_LIMIT, NOTE_MAX_LEN } from "@/lib/noteboard";
import { checkNoteboardRateLimit } from "@/lib/rate-limit";

/**
 * 알림장 → 저녁 대화 거리 (승인 설계안 2026-07-29, Approach A).
 *
 * /api/report와 다른 점:
 *   - **로그인 필수.** 게스트 체험 대상이 아니다(알림장은 실사용자만 가진 입력이고,
 *     자유 텍스트 LLM 엔드포인트를 익명에 열면 비용 남용 통로가 된다).
 *   - 스트리밍하지 않는다. 출력이 JSON 한 덩이라 조기 방출 이득이 없고, 부분 JSON을
 *     화면에 흘리면 파싱 실패 상태를 사용자가 보게 된다.
 *   - 원문을 **저장하지 않는다.** 요청 처리 중에만 메모리에 있고 응답 후 사라진다.
 *     보관은 클라이언트 localStorage가 7일 롤링으로 한다(lib/noteboard.ts).
 *
 * maxDuration을 명시하는 이유: 미설정 상태에서 함수가 기본 상한에 잘려 클라이언트가 빈
 * 응답을 받고 폴백에 갇히는 사고가 이 저장소에 있었다(홈 리포트 "기본 추천" 사건).
 */
export const maxDuration = 30;

async function currentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your_anthropic_api_key_here") {
    return NextResponse.json(
      { error: "대화 거리를 만들 수 없어요. 잠시 후 다시 시도해주세요." },
      { status: 503 }
    );
  }

  // 로그인 확인이 먼저다 — 레이트리밋 버킷도 user_id 기준이고, 게스트는 아예 대상이 아니다.
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "로그인이 필요한 기능이에요." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청을 해석하지 못했어요." }, { status: 400 });
  }
  const { note, childName, conditions } = (body ?? {}) as {
    note?: unknown;
    childName?: unknown;
    conditions?: unknown;
  };

  const text = typeof note === "string" ? note.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "알림장 내용을 붙여넣어 주세요." }, { status: 400 });
  }
  // 상한은 클라이언트 maxLength와 같은 값(lib/noteboard.ts)이지만 서버도 검증한다 —
  // 상한이 한쪽에만 있으면 토큰 비용 상한이 사실상 없다.
  if (text.length > NOTE_MAX_LEN) {
    return NextResponse.json(
      { error: `알림장이 너무 길어요. ${NOTE_MAX_LEN}자 이내로 붙여넣어 주세요.` },
      { status: 400 }
    );
  }

  const rate = await checkNoteboardRateLimit(userId);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `오늘은 ${NOTE_DAILY_LIMIT}번까지 만들 수 있어요. 내일 다시 시도해주세요.`,
      },
      { status: 429 }
    );
  }

  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
  const client = new Anthropic({ apiKey, baseURL });

  try {
    const res = await client.messages.create(
      {
        model: "claude-sonnet-5",
        max_tokens: 900,
        // 리포트와 같은 이유로 thinking 비활성 — 저지연 우선(부모는 저녁에 30초를 쓴다).
        thinking: { type: "disabled" },
        system: NOTEBOARD_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildNoteboardPrompt({
              childName: typeof childName === "string" && childName.trim() ? childName.trim() : "아이",
              note: text,
              conditions: typeof conditions === "string" ? conditions : undefined,
            }),
          },
        ],
      },
      { signal: req.signal }
    );

    const raw = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const parsed = parseNoteboardOutput(raw);
    if (!parsed) {
      console.error("[noteboard] 출력 파싱 실패", raw.slice(0, 300));
      return NextResponse.json(
        { error: "대화 거리를 만들지 못했어요. 알림장을 다시 붙여넣어 주세요." },
        { status: 502 }
      );
    }
    return NextResponse.json(parsed);
  } catch (err) {
    // 사용자가 화면을 벗어나 요청을 끊은 것은 오류가 아니다.
    if (err instanceof Error && err.name === "AbortError") {
      return new NextResponse(null, { status: 499 });
    }
    console.error("[noteboard]", err);
    return NextResponse.json(
      { error: "대화 거리를 만들지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 502 }
    );
  }
}
