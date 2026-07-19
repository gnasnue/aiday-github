// 베타 테스트 행동 계측 — Supabase events/feedback 테이블에 직접 INSERT (RLS insert-only).
//
// 원칙:
//   1) 민감정보 배제 — 아이 이름·건강정보(conditions 등)는 절대 props에 넣지 않는다.
//      아이 식별이 필요하면 연령군(ageBand)만 넣는다.
//   2) fire-and-forget — 계측 실패가 사용자 경험에 어떤 영향도 주면 안 된다.
//      모든 오류는 삼키고(await 하지 않음), 콘솔에도 dev에서만 남긴다.
//   3) 이벤트 이름은 아래 유니온으로 고정 — 자유 문자열 적재로 분석이 오염되는 것을 막는다.
//      새 이벤트가 필요하면 여기에 추가하고 docs의 지표 정의와 함께 관리한다.

import { supabase } from "@/lib/supabase";

export type AnalyticsEvent =
  | "session_start" // 탭 세션 시작 (아침 재방문율의 재료)
  | "page_view" // 라우트 이동 (탭별 사용량)
  | "signup_completed"
  | "onboarding_step" // props: { step: number }
  | "onboarding_completed"
  | "report_viewed" // props: { age_band, cached, latency_ms }
  | "report_refreshed"
  | "report_error" // props: { stage } — 베타 기간 신뢰성 감시
  | "checklist_toggled"; // props: { item, checked } — 체크리스트 인터랙션율

const SESSION_KEY = "aiday:sid";
const SESSION_STARTED_KEY = "aiday:sid-started";

// 탭 세션 단위 ID. sessionStorage라 탭을 닫으면 새 세션 — "리포트 노출 세션 중
// 체크 발생" 같은 세션 단위 지표의 분모/분자를 같은 키로 묶는다.
const sessionId = (): string => {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return "no-storage";
  }
};

// "만 4세" → "3-6". PRODUCT-DECISIONS §3-6 연령군(1~2 / 3~6 / 7~8) 기준.
// 파싱 불가(구 데이터·데모)면 null — 배제하지 않고 무연령군으로 집계한다.
export const ageBand = (age: string | undefined): string | null => {
  const n = parseInt(age?.replace(/[^0-9]/g, "") ?? "", 10);
  if (Number.isNaN(n)) return null;
  if (n <= 2) return "1-2";
  if (n <= 6) return "3-6";
  return "7-8";
};

type Props = Record<string, string | number | boolean | null>;

// 공통 컨텍스트 + INSERT. RLS가 로그인 사용자는 본인 user_id, 게스트는 null만
// 허용하므로 세션에서 읽은 값을 그대로 넣는다.
const insert = async (
  table: "events" | "feedback",
  row: Record<string, unknown>
): Promise<boolean> => {
  const { data } = await supabase.auth.getSession();
  const { error } = await supabase.from(table).insert({
    user_id: data.session?.user?.id ?? null,
    path: window.location.pathname.slice(0, 200),
    app_version: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
    ...row,
  });
  if (error && process.env.NODE_ENV === "development") {
    console.warn(`[analytics] ${table} insert 실패:`, error.message);
  }
  return !error;
};

export const track = (event: AnalyticsEvent, props: Props = {}): void => {
  if (typeof window === "undefined") return;
  insert("events", { session_id: sessionId(), event, props }).catch(() => {});
};

// session_start는 탭 세션당 1회만 — page_view와 달리 방문(visit) 단위 지표의 재료.
export const trackSessionStart = (): void => {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(SESSION_STARTED_KEY)) return;
    sessionStorage.setItem(SESSION_STARTED_KEY, "1");
  } catch {}
  track("session_start");
};

// 리포트 👍/👎 · 자유 의견 — events가 아닌 feedback 테이블로 (텍스트는 삭제 정책이 다름)
export const sendFeedback = (input: {
  kind: "report" | "general";
  rating?: "up" | "down";
  message?: string;
  props?: Props;
}): Promise<boolean> => {
  if (typeof window === "undefined") return Promise.resolve(false);
  return insert("feedback", {
    kind: input.kind,
    rating: input.rating ?? null,
    message: input.message?.trim().slice(0, 2000) || null,
    props: input.props ?? {},
  }).catch(() => false);
};
