// 베타 테스트 행동 계측 — Supabase events/feedback 테이블에 직접 INSERT (RLS insert-only).
//
// 원칙:
//   1) 민감정보 배제 — 아이 이름·건강정보(conditions 등)는 절대 props에 넣지 않는다.
//      아이 식별이 필요하면 연령군(ageBand)만 넣는다.
//   2) fire-and-forget — 계측 실패가 사용자 경험에 어떤 영향도 주면 안 된다.
//      모든 오류는 삼키고(await 하지 않음), 콘솔에도 dev에서만 남긴다.
//   3) 이벤트 이름은 아래 유니온으로 고정 — 자유 문자열 적재로 분석이 오염되는 것을 막는다.
//      새 이벤트가 필요하면 여기에 추가하고 docs의 지표 정의와 함께 관리한다.

// ⚠️ 이 유니온은 DB의 events_event_whitelist CHECK 제약(006_analytics_hardening.sql)과
// 1:1 동기화되어야 한다 — 여기만 추가하면 INSERT가 조용히 실패한다(제약 위반).
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

// dev 센티널 — 005/006 뷰의 `app_version is distinct from 'dev'` 필터와
// docs/beta-metrics.md 규칙 1의 근거. 이 문자열을 바꾸면 지표 뷰가 dev 트래픽으로 오염된다.
export const DEV_APP_VERSION = "dev";

// 자유 의견 길이 상한 — feedback.message의 DB CHECK(char_length <= 2000)와 동기화.
// UI maxLength와 저장 절단(slice)이 같은 값을 쓰도록 여기서만 정의한다.
export const FEEDBACK_MESSAGE_MAX = 2000;

const SESSION_KEY = "aiday:sid";
const SESSION_STARTED_KEY = "aiday:sid-started";

// 탭 세션 단위 ID. sessionStorage라 탭을 닫으면 새 세션 — "리포트 노출 세션 중
// 체크 발생" 같은 세션 단위 지표의 분모/분자를 같은 키로 묶는다.
// 스토리지 차단 환경(사파리 프라이빗 등)은 모듈 수명 동안 유지되는 메모리 ID로 폴백 —
// 고정 문자열을 쓰면 그런 사용자 전원이 한 세션으로 합쳐져 세션 지표가 오염된다.
let memSid: string | null = null;
const sessionId = (): string => {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    if (!memSid) memSid = crypto.randomUUID();
    return memSid;
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
  // 자동 수집(events)만 분석 동의로 게이트한다. feedback은 사용자가 직접 버튼을
  // 눌러 제출하는 자발 제공이라 동의 상태와 무관하게 전송한다 (새 기기 로그인 등
  // 로컬 동의 기록이 없는 상태에서도 👍/👎가 조용히 실패하지 않도록).
  if (table === "events") {
    const { hasAnalyticsConsent } = await import("./consent");
    if (!hasAnalyticsConsent()) return false;
  }
  // supabase 클라이언트는 모듈 로드 시점에 env(NEXT_PUBLIC_*)를 요구하므로 지연 로드 —
  // 브라우저 밖(vitest 등)에서 ageBand 같은 순수 로직만 임포트해도 안전하게 한다.
  const { supabase } = await import("./supabase");
  const { data } = await supabase.auth.getSession();
  const { error } = await supabase.from(table).insert({
    user_id: data.session?.user?.id ?? null,
    path: window.location.pathname.slice(0, 200),
    app_version: process.env.NEXT_PUBLIC_BUILD_ID ?? DEV_APP_VERSION,
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
  // 동의 전에는 세션 표시도 남기지 않는다. 동의 직후 AnalyticsTracker가 다시 호출한다.
  void import("./consent").then(({ hasAnalyticsConsent }) => {
    if (!hasAnalyticsConsent()) return;
    try {
      if (sessionStorage.getItem(SESSION_STARTED_KEY)) return;
      sessionStorage.setItem(SESSION_STARTED_KEY, "1");
    } catch {}
    track("session_start");
  });
};

// 리포트 👍/👎 · 자유 의견 — events가 아닌 feedback 테이블로 (텍스트는 삭제 정책이 다름)
// 전송 UI(보내는 중…)가 이 결과를 기다리므로, 네트워크가 멎어도 8초 안에는 실패로
// 확정해 버튼이 무한정 잠기지 않게 한다.
const SEND_TIMEOUT_MS = 8000;

export const sendFeedback = (input: {
  kind: "report" | "general";
  rating?: "up" | "down";
  message?: string;
  props?: Props;
}): Promise<boolean> => {
  if (typeof window === "undefined") return Promise.resolve(false);
  const send = insert("feedback", {
    kind: input.kind,
    rating: input.rating ?? null,
    message: input.message?.trim().slice(0, FEEDBACK_MESSAGE_MAX) || null,
    props: input.props ?? {},
  }).catch(() => false);
  const timeout = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), SEND_TIMEOUT_MS)
  );
  return Promise.race([send, timeout]);
};
