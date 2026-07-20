import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ageBand, sendFeedback, track } from "./analytics";

// insert 경로 검증용 supabase 목 — 실제 네트워크·env 없이 페이로드만 캡처한다
const inserted: { table: string; row: Record<string, unknown> }[] = [];
// events는 beta_analytics 동의 뒤에만 동작한다(lib/consent.ts 게이트) — 기본은 동의 상태
let analyticsConsent = true;
vi.mock("./consent", () => ({ hasAnalyticsConsent: () => analyticsConsent }));
vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        return { error: null };
      },
    }),
  },
}));

// 연령군 매핑은 PRODUCT-DECISIONS §3-6(1~2 / 3~6 / 7~8)과 지표 집계의 근거 —
// 경계가 어긋나면 연령군별 유용성·정확도 분석이 통째로 오염된다.
describe("ageBand", () => {
  it("만 나이 문자열을 연령군으로 매핑한다", () => {
    expect(ageBand("만 1세")).toBe("1-2");
    expect(ageBand("만 2세")).toBe("1-2");
    expect(ageBand("만 3세")).toBe("3-6");
    expect(ageBand("만 6세")).toBe("3-6");
    expect(ageBand("만 7세")).toBe("7-8");
    expect(ageBand("만 8세")).toBe("7-8");
  });

  it("만 0세는 1-2 군으로 흡수한다 (배제하지 않는다)", () => {
    expect(ageBand("만 0세")).toBe("1-2");
  });

  it("상한 초과 나이도 배제하지 않고 7-8로 집계한다", () => {
    expect(ageBand("만 9세")).toBe("7-8");
  });

  it("파싱 불가 값은 null — 무연령군으로 집계한다", () => {
    expect(ageBand(undefined)).toBeNull();
    expect(ageBand("")).toBeNull();
    expect(ageBand("나이 미상")).toBeNull();
  });

  it("숫자만 있는 구형 포맷도 허용한다", () => {
    expect(ageBand("4")).toBe("3-6");
    expect(ageBand("4세")).toBe("3-6");
  });
});

// 브라우저 전역 스텁 — track/sendFeedback은 window·sessionStorage·location을 요구한다
const stubBrowserGlobals = () => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", { location: { pathname: "/home" } });
  vi.stubGlobal("location", { pathname: "/home" });
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
};

describe("sendFeedback / track (supabase 목)", () => {
  beforeEach(() => {
    inserted.length = 0;
    analyticsConsent = true;
    stubBrowserGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("공백뿐인 message는 null로 정규화한다 (feedback_has_content 제약과 정합)", async () => {
    const ok = await sendFeedback({ kind: "report", rating: "up", message: "   " });
    expect(ok).toBe(true);
    expect(inserted[0].table).toBe("feedback");
    expect(inserted[0].row.message).toBeNull();
    expect(inserted[0].row.rating).toBe("up");
  });

  it("message는 상한(2000자)에서 절단한다", async () => {
    await sendFeedback({ kind: "general", message: "가".repeat(3000) });
    expect((inserted[0].row.message as string).length).toBe(2000);
  });

  it("게스트(세션 없음)는 user_id null로 적재한다", async () => {
    await sendFeedback({ kind: "general", message: "의견" });
    expect(inserted[0].row.user_id).toBeNull();
  });

  it("분석 동의가 없어도 자발 제출인 feedback은 전송된다", async () => {
    analyticsConsent = false;
    const ok = await sendFeedback({ kind: "report", rating: "down" });
    expect(ok).toBe(true);
    expect(inserted[0].table).toBe("feedback");
  });

  it("분석 동의가 없으면 events는 전송하지 않는다", async () => {
    analyticsConsent = false;
    track("page_view");
    // fire-and-forget이라 완료 신호가 없다 — 마이크로태스크를 비운 뒤 미적재를 확인
    await new Promise((r) => setTimeout(r, 20));
    expect(inserted.length).toBe(0);
  });

  it("track은 세션 ID를 이벤트마다 재사용한다", async () => {
    track("page_view");
    await vi.waitFor(() => expect(inserted.length).toBe(1));
    track("checklist_toggled", { item: "ai-0", checked: true });
    await vi.waitFor(() => expect(inserted.length).toBe(2));
    expect(inserted[0].row.session_id).toBe(inserted[1].row.session_id);
    expect(inserted[1].row.props).toEqual({ item: "ai-0", checked: true });
  });
});
