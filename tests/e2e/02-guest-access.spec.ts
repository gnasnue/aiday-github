import { test, expect } from "@playwright/test";
import { checklistHeading, mockEnvApisSuccess, mockReportSuccess } from "./fixtures";

/**
 * TC-GUEST-* — 비로그인 상태로 보호되어야 할 것처럼 보이는 라우트에 직접 접근했을 때의
 * 실제 동작 확인. 전역 middleware.ts가 없고 app/(main)/layout.tsx에도 인증 가드가 없음을
 * 코드로 확인했으므로(가정 금지, 실행으로 검증), 실제 라이브 사이트 응답을 그대로 기록한다.
 *
 * /home 등은 실제로 /api/report를 호출하므로(실 Claude 비용), 이 스펙은 라우트 접근성 자체를
 * 검증하는 것이 목적이라 env·report API를 모두 모킹해 비용 없이 반복 실행 가능하게 한다.
 * 실제 AI 리포트 생성 자체의 정상 동작은 05-home-report.spec.ts(P0-4, 비모킹)에서 별도 검증한다.
 */
test.describe("게스트 라우트 접근", () => {
  test.beforeEach(async ({ page }) => {
    await mockEnvApisSuccess(page);
    await mockReportSuccess(page);
  });

  test("TC-GUEST-01: 비로그인 /home 직접 접근 — 리다이렉트 없이 데모 프로필로 렌더", async ({ page }) => {
    const res = await page.goto("/home");
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/home$/); // /login 등으로 리다이렉트되지 않음
    // 데모 프로필 칩(지우/도윤)이 노출되어야 함
    await expect(page.getByRole("button", { name: "지우" })).toBeVisible();
    await expect(page.getByRole("button", { name: "도윤" })).toBeVisible();
  });

  test("TC-GUEST-02: 비로그인 /env,/outfit,/tips,/me 직접 접근", async ({ page }) => {
    for (const path of ["/env", "/outfit", "/tips", "/me"]) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} 응답 코드`).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });

  test("TC-GUEST-03: 존재하지 않는 프로필 id로 /me/edit 접근", async ({ page }) => {
    await page.goto("/me/edit/does-not-exist-id");
    // 코드(app/me/edit/[id]/page.tsx:101-104): 없으면 토스트 후 /me로 replace
    await expect(page).toHaveURL(/\/me$/, { timeout: 10_000 });
  });

  test("TC-LAND-04: 하단 탭 전체 순회", async ({ page }) => {
    await page.goto("/home");
    const tabs: Array<[string, RegExp]> = [
      ["환경정보", /\/env$/],
      ["옷차림", /\/outfit$/],
      ["건강팁", /\/tips$/],
      ["마이", /\/me$/],
      ["홈", /\/home$/],
    ];
    for (const [label, urlPattern] of tabs) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(urlPattern);
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });

  test("TC-HOME-07: 홈→환경정보→뒤로가기 — 리포트 캐시 재사용(중복 재요청 없음)", async ({ page }) => {
    let reportCalls = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/report")) reportCalls++;
    });
    await page.goto("/home");
    await expect(checklistHeading(page)).toBeVisible({ timeout: 15_000 });
    expect(reportCalls, "최초 진입 시 리포트 요청 1회").toBe(1);

    await page.getByRole("link", { name: "환경정보" }).click();
    await expect(page).toHaveURL(/\/env$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/home$/);
    await expect(checklistHeading(page)).toBeVisible({ timeout: 15_000 });
    expect(reportCalls, "뒤로가기로 홈 재진입 시 리포트가 캐시 없이 재요청되면 안 됨(당일 캐시)").toBe(1);
  });
});
