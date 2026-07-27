import type { Page, Route } from "@playwright/test";

/**
 * Supabase 세션 쿠키 존재 확인. 이 앱의 `lib/supabase.ts`는 `createBrowserClient`(@supabase/ssr)를
 * 쓴다 — 세션이 localStorage가 아니라 `sb-<ref>-auth-token`(대용량 시 `.0`/`.1` 청크) 쿠키에
 * 저장된다(코드 주석: "createClient(@supabase/supabase-js)는 localStorage만 사용 → 서버 쿠키 무시").
 * 세션 유지 여부는 반드시 쿠키로 확인해야 한다.
 */
export async function hasSupabaseAuthCookie(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies();
  return cookies.some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}

/**
 * 공용 테스트 헬퍼 — 라이브 데모(https://aiday-demo.vercel.app) 대상 Playwright 스펙에서 공유.
 * 애플리케이션 소스코드는 건드리지 않고, 실제 코드 동작(app/api/*, app/(main)/home/page.tsx)을
 * 읽고 그 형식에 맞춰 모킹한다.
 */

/**
 * 홈의 "오늘 챙길 것" 체크리스트 헤딩.
 *
 * 공유 이미지 캡처용 off-screen `ShareReportCard`에도 같은 문구가 있으나 그쪽은 `<div>`라
 * heading role이 아니어서 strict mode 충돌이 없다.
 *
 * 2026-07-27 수정: 종전에는 `getByRole("paragraph")`로 찾았는데 이 제목은
 * `components/PrepChecklistCard.tsx`에서 `<h2>`로 렌더된다(7/26 Decision Brief 개편 이후).
 * 그래서 셀렉터가 아무것도 못 찾아 TC-ERR-02·TC-HOME-07·TC-LAND-04가 코드와 무관하게
 * 실패하고 있었다(거짓 실패). heading role로 맞춘다.
 */
export function checklistHeading(page: Page) {
  return page.getByRole("heading", { name: "오늘 챙길 것" });
}

/** QA 테스트 계정임을 이메일만 봐도 알 수 있는 패턴. 실제로 Supabase에 생성되며 삭제하지 않는다. */
export function genTestEmail(): string {
  return `aiday-qa-test+${Date.now()}@example.com`;
}

export const TEST_PASSWORD = "AidayQaTest!2026";

/** /api/weather, /api/weather/weekly, /api/air, /api/uv, /api/pollen을 정상 200으로 모킹. */
export async function mockEnvApisSuccess(page: Page) {
  await page.route("**/api/weather?**", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        temperature: 26,
        sky: 1,
        pty: 0,
        humidity: 55,
        windSpeed: 2,
        pop: 20,
        hourlyForecast: [
          { hour: "09", temp: 24, sky: 1, pty: 0, humidity: 60, windSpeed: 2, pop: 20 },
          { hour: "12", temp: 29, sky: 1, pty: 0, humidity: 50, windSpeed: 2, pop: 20 },
          { hour: "18", temp: 27, sky: 3, pty: 0, humidity: 55, windSpeed: 2, pop: 30 },
        ],
      }),
    })
  );
  await page.route("**/api/weather/weekly**", (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ days: [] }) })
  );
  await page.route("**/api/air?**", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pm10: 40, pm25: 20, pm10Grade: 2, pm25Grade: 2, khaiGrade: 2 }),
    })
  );
  await page.route("**/api/uv?**", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ uvi: 7, hourly: { "9": 3, "12": 7, "18": 2 } }),
    })
  );
  await page.route("**/api/pollen?**", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ oak: 1, pine: 1, weed: null }),
    })
  );
}

/** 지정한 API들을 502로 모킹(외부 서비스 장애 재현). */
export async function mockApis502(page: Page, patterns: string[]) {
  for (const p of patterns) {
    await page.route(p, (route: Route) =>
      route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "upstream 502" }) })
    );
  }
}

/** 실제 Claude 호출 없이 /api/report를 SSE 성공 응답으로 모킹(비용 방지용 — 라우트 렌더/네비게이션 확인 목적). */
export async function mockReportSuccess(page: Page, hook = "[QA 모킹] 오늘은 맑아요") {
  await page.route("**/api/report", (route: Route) => {
    const body =
      `event: hook\ndata: ${JSON.stringify(hook)}\n\n` +
      `event: message\ndata: ${JSON.stringify("QA 모킹 메시지입니다. 실제 Claude 호출이 아닙니다.")}\n\n` +
      `event: done\ndata: ${JSON.stringify({
        hook,
        message: "QA 모킹 메시지입니다. 실제 Claude 호출이 아닙니다.",
        checklist: ["QA 모킹 체크리스트 1", "QA 모킹 체크리스트 2"],
        prep: {},
      })}\n\n`;
    route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });
}

/** /api/report를 429(레이트리밋)로 모킹 — 로그인 사용자 UX 문구 검증용(실제 20회 소진 대체). */
export async function mockReport429(page: Page) {
  await page.route("**/api/report", (route: Route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": "3600" },
      body: JSON.stringify({
        error: "오늘의 브리핑 생성 한도에 도달했어요. 내일 다시 이용할 수 있어요.",
        limit: 20,
        isGuest: false,
      }),
    })
  );
}

/** /api/report를 503(설정 오류)로 모킹 — Fallback Chain 검증용. */
export async function mockReport503(page: Page) {
  await page.route("**/api/report", (route: Route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }),
    })
  );
}

/** /api/report 네트워크 단절 재현(연결 자체를 끊음). */
export async function mockReportAborted(page: Page) {
  await page.route("**/api/report", (route: Route) => route.abort("connectionreset"));
}

/**
 * /api/report 직접 호출용 최소 유효 payload.
 * app/api/report/route.ts:144-198은 `child`·`weather`의 "존재"만 검사하고 하위 필드는
 * 런타임에 강제하지 않으므로, 이 최소 구성으로 실제 레이트리밋 카운터까지 도달한다.
 */
export const MINIMAL_REPORT_PAYLOAD = {
  child: { name: "QA 레이트리밋 테스트", age: "4", gender: "unknown" as const },
  weather: { temperature: 20, sky: 1, pty: 0, humidity: 50, windSpeed: 1, pop: 10, hourlyForecast: [] },
  air: null,
  uv: null,
  pollen: null,
};
