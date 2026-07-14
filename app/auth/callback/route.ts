import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// 인증 이메일/OAuth 콜백 공통 진입점.
// 두 가지 링크 형식을 모두 받는다:
//   - PKCE(code):        OAuth·이메일 링크가 ?code=... 로 돌아옴 → exchangeCodeForSession
//   - OTP(token_hash):   복구·가입 확인 링크가 ?token_hash=...&type=recovery|signup|email 로 돌아옴
//                        → verifyOtp (code_verifier 불필요 → 다른 기기에서 열어도 동작)
// 실패 시엔 회원가입이 아니라 로그인 화면으로 보낸다. 재설정 흐름이면 그 취지를 함께 알린다.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/auth/landing";

  // 실패 시 도착지: 복구/재설정 흐름은 그 취지를 알리는 에러 코드를 붙인다.
  const isRecovery = type === "recovery" || next.startsWith("/reset-password");
  const failureUrl = `${origin}/login?error=${isRecovery ? "recovery" : "auth"}`;

  if (code || (tokenHash && type)) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } =
      code != null
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! });

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(failureUrl);
}
