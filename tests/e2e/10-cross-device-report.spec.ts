import { test, expect, type Route } from "@playwright/test";
import { checklistHeading, mockEnvApisSuccess, mockReportSuccess } from "./fixtures";

/**
 * 교차기기 당일 리포트 (2026-07-27) — 홈 히어로가 두 번째 기기에서 폴백에 추락하던 결함의 회귀 방지.
 *
 * 실사용 제보: 폰으로 들어온 홈 히어로가 "기본 추천"(규칙 폴백) + "생성 한도" 안내로 떨어졌다.
 * 원인은 리포트 캐시가 브라우저 localStorage 전용이었던 것 — PC에서 아침에 만든 리포트가 폰에는
 * 없으니 폰은 새로 생성해야 했고, 하루 한도를 이미 쓴 상태에서는 되살릴 것이 없어 폴백이 됐다.
 * 수정: 생성 시 서버(daily_reports)에도 사본을 올리고, 캐시가 없으면 거기서 먼저 읽는다.
 *
 * 이 스펙은 "같은 계정의 다른 기기"를 **앱 자신이 만든 데이터로** 재현한다 — 리포트 캐시 키와
 * profileSig·envSignature는 페이지 내부 구현이라 손으로 시드할 수 없다. 그래서 1) 성공 모킹으로
 * 앱이 스스로 서버 사본을 업서트하게 하고 그 본문을 가로채 보관한 뒤, 2) 로컬 리포트 캐시만
 * 지워 "캐시 없는 기기"를 만들고, 3) 보관한 행을 조회 응답으로 돌려준다.
 *
 * mobile 프로젝트 전용(playwright.config.ts testIgnore와 같은 이유 — 홈 리포트 흐름 중복 실행 방지).
 */

// 프로젝트 ref — 브라우저에 그대로 노출되는 공개 값(NEXT_PUBLIC_SUPABASE_URL)이다.
// @supabase/ssr은 세션을 `sb-<ref>-auth-token` 쿠키에 `base64-` 접두 JSON으로 저장한다.
const PROJECT_REF = process.env.E2E_SUPABASE_REF || "nzcgbtqdvyixiuxbcghz";
const FAKE_USER_ID = "00000000-0000-4000-8000-000000000abc";

/**
 * 로그인 계정의 아이 프로필 1건(lib/profile.ts rowToProfile 스키마).
 * 로그인 상태에서 아이가 없으면 홈 가드가 온보딩으로 보내므로 실제 계정처럼 1명을 돌려준다.
 * 두 "기기"가 같은 프로필을 받으므로 profileSig도 같고, 서버 사본의 신선도 판정이
 * 실제와 같은 조건으로 돌아간다.
 */
const CHILD_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: FAKE_USER_ID,
  name: "지우",
  emoji: "🐣",
  gender: "female",
  birth_year: 2022,
  birth_month: 3,
  birth_day: null,
  conditions: ["피부 민감 (아토피, 건조)"],
  condition_etc: null,
  cold_sensitivity: "normal",
  hot_sensitivity: "much",
  sweat_level: "very-much",
  schedule: {},
  notif: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

/**
 * 로그인 상태를 만든다. Supabase REST는 전부 모킹하므로 토큰이 유효할 필요는 없다 —
 * `getSession()`이 네트워크 없이 세션을 돌려주도록 만료 시각만 미래로 둔다.
 */
async function seedFakeSession(page: import("@playwright/test").Page, baseURL: string) {
  const session = {
    access_token: "e2e-fake-access-token",
    refresh_token: "e2e-fake-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    // 초 단위 epoch. 넉넉히 미래로 두어 자동 갱신(네트워크) 경로를 타지 않게 한다.
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    user: {
      id: FAKE_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "aiday-qa-cross-device@example.com",
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: "2026-01-01T00:00:00.000Z",
    },
  };
  const value =
    "base64-" + Buffer.from(JSON.stringify(session), "utf-8").toString("base64url");
  const { hostname } = new URL(baseURL);
  await page.context().addCookies([
    { name: `sb-${PROJECT_REF}-auth-token`, value, domain: hostname, path: "/" },
  ]);
}

test("TC-XDEV-01(모킹): 같은 계정의 다른 기기는 서버 사본으로 같은 리포트를 보여준다 — 재생성 없음·기본 추천 아님", async ({
  page,
  baseURL,
}) => {
  await seedFakeSession(page, baseURL!);
  await mockEnvApisSuccess(page);

  await page.route("**/rest/v1/children**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([CHILD_ROW]) })
  );

  // daily_reports — 업서트(POST)는 본문을 가로채 보관하고, 조회(GET)는 보관한 행을 돌려준다.
  let storedRow: Record<string, unknown> | null = null;
  await page.route("**/rest/v1/daily_reports**", (route: Route) => {
    const req = route.request();
    if (req.method() === "POST") {
      try {
        const body = req.postDataJSON();
        storedRow = Array.isArray(body) ? body[0] : body;
      } catch {}
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(storedRow ? [storedRow] : []),
    });
  });

  let reportCalls = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/report")) reportCalls++;
  });

  // ── 1단계: 첫 기기 — 리포트를 생성하고 서버 사본이 올라간다 ──
  await mockReportSuccess(page, "[QA 모킹] 오늘은 맑아요");
  await page.goto("/home");
  await expect(page.getByText("오늘은 맑아요", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(checklistHeading(page)).toBeVisible({ timeout: 15_000 });
  expect(reportCalls, "첫 기기에서는 생성 1회").toBe(1);
  await expect
    .poll(() => (storedRow ? Object.keys(storedRow).length : 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  expect(storedRow, "서버 사본에 message가 올라가야 한다").toHaveProperty("message");

  // ── 2단계: "다른 기기" — 로컬 리포트 캐시만 지운다(프로필·환경 캐시는 그대로) ──
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("aiday:report:")) localStorage.removeItem(k);
    }
  });

  // 새 기기가 생성을 시도하면 하루 한도를 태우게 된다 — 그래서 이 단계에서 /api/report가
  // 호출되면 그 자체가 결함이다. 호출 시 즉시 실패하도록 429로 바꿔 두고 호출 수로도 검증한다.
  await page.unroute("**/api/report");
  await page.route("**/api/report", (route: Route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: "오늘의 브리핑 생성 한도에 도달했어요. 내일 다시 이용할 수 있어요.",
        limit: 20,
        isGuest: false,
      }),
    })
  );
  reportCalls = 0;
  await page.reload();

  // ── 3단계: 서버 사본이 그대로 히어로에 뜨고, 새 생성은 일어나지 않는다 ──
  await expect(page.getByText("오늘은 맑아요", { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("기본 추천", { exact: false })).toHaveCount(0);
  await expect(page.getByText("한도에 도달했어요", { exact: false })).toHaveCount(0);
  expect(
    reportCalls,
    "서버 사본이 있으면 새 기기는 Claude를 다시 부르지 않는다(한도 미소진)"
  ).toBe(0);
});

/**
 * 위 테스트의 음성 대조군(negative control) — 서버 사본이 **없으면** 종전 동작 그대로다:
 * 새 기기는 생성을 시도하고, 한도(429)에 막히면 규칙 폴백("기본 추천") + 한도 안내가 뜬다.
 * 이 테스트가 있어야 위 테스트의 통과가 "서버 사본을 실제로 읽은 결과"임이 보장된다
 * (조회가 죽어 있어도 위 테스트가 통과하는 헛된 검증 방지).
 */
test("TC-XDEV-02(모킹): 서버 사본이 없으면 429는 종전대로 기본 추천 폴백 — 대조군", async ({
  page,
  baseURL,
}) => {
  await seedFakeSession(page, baseURL!);
  await mockEnvApisSuccess(page);
  await page.route("**/rest/v1/children**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([CHILD_ROW]) })
  );
  // 서버 사본 없음 — 조회는 항상 빈 결과.
  await page.route("**/rest/v1/daily_reports**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/api/report", (route: Route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: "오늘의 브리핑 생성 한도에 도달했어요. 내일 다시 이용할 수 있어요.",
        limit: 20,
        isGuest: false,
      }),
    })
  );

  await page.goto("/home");
  await expect(page.getByText("기본 추천", { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("한도에 도달했어요", { exact: false }).first()
  ).toBeVisible({ timeout: 15_000 });
  // 한도 소진 상태에서 "AI 판단 다시 받기"는 지킬 수 없는 약속이라 노출하지 않는다.
  await expect(page.getByRole("button", { name: "AI 판단 다시 받기" })).toHaveCount(0);
});
