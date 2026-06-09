import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// createBrowserClient: @supabase/ssr의 쿠키 기반 클라이언트
// - OAuth 콜백이 설정한 auth 쿠키를 올바르게 읽음
// - createClient(@supabase/supabase-js)는 localStorage만 사용 → 서버 쿠키 무시
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
