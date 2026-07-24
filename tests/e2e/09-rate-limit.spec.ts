import { test, expect } from "@playwright/test";
import { MINIMAL_REPORT_PAYLOAD, mockReport429 } from "./fixtures";

/**
 * P0-2 — 게스트 vs 로그인 레이트리밋 차등 동작(429).
 *
 * ⚠️ 이 스펙은 파일명 접두사(09-)로 스위트 마지막에 실행되도록 배치했다(작업 지시 —
 * "레이트리밋 테스트는 마지막 순서로 배치 권장"). 게스트 IP 버킷(일 10회, lib/rate-limit.ts
 * GUEST_DAILY_LIMIT)은 이 스위트의 다른 게스트 테스트(P0-4 등)와 공유되므로, 먼저 실행된
 * 테스트가 이미 일부를 소진했을 수 있다 — 그래서 "정확히 11번째"를 가정하지 않고, 429가
 * 나올 때까지 루프(상한 15회 안전장치)로 실제 소진을 검증한다.
 *
 * 로그인 사용자(일 20회, USER_DAILY_LIMIT)는 실제로 소진하지 않는다 — 게스트와 동일한
 * checkReportRateLimit 함수를 공유해 코드 경로가 같고(lib/rate-limit.ts), 20회 연속 실
 * Claude 호출은 비용 대비 추가 정보가 적다. 대신 /api/report를 429로 모킹해 UI 문구만
 * 검증한다(test-plan.md §2-4 참조). mobile 전용.
 */
test.describe.serial("P0-2: 레이트리밋", () => {
  test("P0-2a: 게스트 /api/report 실제 소진 → HTTP 429", async ({ request }) => {
    test.setTimeout(120_000);
    const SAFETY_CAP = 15;
    let hit429 = false;
    let callsMade = 0;
    let body: { error?: string; limit?: number } = {};
    let retryAfter: string | null = null;

    for (let i = 1; i <= SAFETY_CAP; i++) {
      const res = await request.post("/api/report", { data: MINIMAL_REPORT_PAYLOAD });
      callsMade = i;
      if (res.status() === 429) {
        hit429 = true;
        body = await res.json();
        retryAfter = res.headers()["retry-after"] ?? null;
        break;
      }
      expect(res.status(), `${i}번째 호출은 200이어야 함(레이트리밋 전)`).toBe(200);
    }

    console.log(`[QA] 게스트 레이트리밋 도달까지 호출 수: ${callsMade}`);
    expect(hit429, `${SAFETY_CAP}회 이내에 429에 도달하지 못함(게스트 한도 10회 대비 이상)`).toBeTruthy();
    expect(body.error, "429 응답에 error 메시지가 없음").toBeTruthy();
    expect(retryAfter, "429 응답에 Retry-After 헤더가 없음").toBeTruthy();

    test.info().annotations.push({
      type: "note",
      description: `게스트 레이트리밋 실제 소진 확인 — ${callsMade}회째에 429 도달(다른 테스트가 같은 IP 버킷을 일부 소진했을 수 있어 정확히 11회가 아닐 수 있음). 응답 본문: ${JSON.stringify(body)}`,
    });
  });

  test("P0-2b: 게스트 429 소진 후 실제 홈 화면 — 빈 화면 아님 + 문구 확인", async ({ page }) => {
    // 위 테스트에서 이미 게스트 IP 쿼터를 소진했으므로 이 진입은 실 Claude 비용이 추가되지 않는다
    // (서버가 Claude를 호출하기 전에 429로 즉시 응답 — app/api/report/route.ts:216-228).
    await page.goto("/home");
    await expect(page.locator("body")).not.toContainText("Application error");
    const mainText = await page.locator("main").innerText();
    expect(mainText.trim().length, "429 상태에서 홈이 빈 화면임(빈 화면 금지 위반)").toBeGreaterThan(20);

    // PRD S-001 기대: "오늘의 체험 횟수를 모두 사용했어요. 가입하면 계속 이용할 수 있어요" + [무료로 시작하기] CTA
    // BUG-2 수정(app/api/report/route.ts의 isGuest 플래그 + app/(main)/home/page.tsx의
    // reportLimitReached 영구 배너)으로 게스트 429 화면에 가입 유도 문구·CTA가 렌더된다.
    // auto-wait(toBeVisible) 사용 — 429 반영은 fetch→React 상태 갱신을 거치므로 즉시 count()를
    // 읽으면 아직 반영 전이라 항상 0으로 오탐한다(false negative). .first() — 같은 문구가
    // 토스트 + 카드 안 영구 배너 두 곳에 동시 표시되는 의도된 중복이다.
    await expect
      .soft(
        page.getByText("가입하면 계속 이용", { exact: false }).first(),
        "BUG-2 회귀: 게스트 429 화면에 가입 유도 문구가 없음"
      )
      .toBeVisible({ timeout: 15_000 });
  });
});

// serial 블록 밖에 둔다 — 완전히 모킹된 테스트라 위 P0-2b의 소프트 실패(예상된 발견)로
// serial 모드가 이 테스트를 건너뛰지 않게 하기 위함(Playwright: serial 그룹은 한 테스트가
// 실패로 표시되면 이후 테스트를 스킵한다).
test("TC-RATE-LOGIN(모킹): 로그인 429는 가입 유도 없이 이용 한도 안내만", async ({ page }) => {
  await mockReport429(page);
  await page.route("**/api/weather?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ temperature: 20, sky: 1, pty: 0, humidity: 50, windSpeed: 1, pop: 10, hourlyForecast: [] }) })
  );
  await page.goto("/home");
  await expect(page.locator("body")).not.toContainText("Application error");
  // 429 처리는 fetch→상태 갱신을 거치는 비동기 흐름이라, goto 직후 즉시 count()를 읽으면
  // 아직 반영 전이라 항상 0으로 오탐할 수 있다(false negative) — 한도 안내 배너가 실제로
  // 뜨는 것을 먼저 auto-wait로 확인한 뒤에야 "CTA 부재"가 유의미해진다.
  // .first() — 같은 문구가 일회성 토스트 + 카드 안 영구 배너 두 곳에 동시 표시되도록 만든
  // 의도된 중복이라(app/(main)/home/page.tsx) strict mode 충돌을 피하려면 첫 매치만 보면 된다.
  await expect(
    page.getByText("오늘의 브리핑 생성 한도에 도달했어요", { exact: false }).first()
  ).toBeVisible({ timeout: 15_000 });
  const hasSignupCta = await page.getByText("가입하면", { exact: false }).count();
  expect(hasSignupCta, "로그인 429 화면에는 가입 유도 문구가 없어야 함(PRD 기대와 일치)").toBe(0);
});

/**
 * BUG-2 수정(게스트 429 화면에 가입 유도 CTA)을 실 API 비용 없이 검증하는 모킹 버전.
 * 게스트 일일 쿼터가 이미 소진된 상태(P0-2a)에서는 재실행 시 실 호출이 즉시 429가 되어 새
 * 스크린샷을 남기기 어려우므로, 같은 코드 경로(app/(main)/home/page.tsx의 reportLimitReached,
 * app/api/report/route.ts의 isGuest 플래그)를 모킹으로 항상 검증 가능하게 만든 회귀 테스트.
 */
test("TC-RATE-GUEST-CTA(모킹, 회귀용): 게스트 429 화면에 가입 유도 문구 표시 확인", async ({ page }) => {
  await page.route("**/api/report", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": "3600" },
      body: JSON.stringify({
        error: "오늘의 체험 횟수를 모두 사용했어요. 가입하면 계속 이용할 수 있어요.",
        limit: 10,
        isGuest: true,
      }),
    })
  );
  await page.route("**/api/weather?**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ temperature: 20, sky: 1, pty: 0, humidity: 50, windSpeed: 1, pop: 10, hourlyForecast: [] }) })
  );
  await page.goto("/home");
  await expect(page.locator("body")).not.toContainText("Application error");
  // 429 반영은 fetch→React 상태 갱신을 거치므로 auto-wait(toBeVisible)로 정착을 기다린다 —
  // goto 직후 즉시 count()를 읽으면 아직 반영 전이라 항상 0으로 오탐한다(false negative).
  // .first() — 같은 문구가 토스트 + 카드 안 영구 배너 두 곳에 동시 표시되는 의도된 중복이다.
  const signupCta = page.getByText("가입하면 계속 이용", { exact: false }).first();
  await expect
    .soft(signupCta, "BUG-2 회귀: 게스트 429 화면에 가입 유도 문구(\"가입하면 계속 이용\")가 없음")
    .toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "screenshots/BUG-2-guest-429-no-signup-cta.png", fullPage: true });
});
