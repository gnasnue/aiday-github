import { test, expect } from "@playwright/test";

/**
 * TC-LAND-* / TC-RESP-01,02 — 랜딩 페이지. 외부 API 호출이 없는 정적 콘텐츠라
 * 실 비용 없이 mobile·desktop 양쪽 프로젝트에서 실행한다.
 */
test.describe("랜딩 페이지", () => {
  test("TC-LAND-01/02/03: CTA·둘러보기·정책 링크", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /오늘 우리 아이/ })).toBeVisible();

    // 정책 링크가 href="#"이 아니라 실문서로 연결되는지 (§05 신뢰성 정합)
    const termsLink = page.getByRole("link", { name: "이용약관" });
    const privacyLink = page.getByRole("link", { name: "개인정보처리방침" });
    await expect(termsLink).toHaveAttribute("href", "/terms");
    await expect(privacyLink).toHaveAttribute("href", "/privacy");

    // 실문서로 실제 이동 확인
    await termsLink.click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.locator("body")).not.toContainText("404");

    await page.goBack();
    await privacyLink.click();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test("TC-LAND-01: 무료로 시작하기 → /signup", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "무료로 시작하기" }).first().click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("TC-RESP-01/02: 뷰포트별 랜딩 레이아웃 무결성", async ({ page }, testInfo) => {
    await page.goto("/");
    const heading = page.getByRole("heading", { name: /오늘 우리 아이/ });
    await expect(heading).toBeVisible();
    // 가로 스크롤(레이아웃 깨짐) 없어야 함
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow, `${testInfo.project.name} 프로젝트에서 가로 스크롤 발생`).toBeFalsy();
    await page.screenshot({ path: `screenshots/landing-${testInfo.project.name}.png`, fullPage: true });
  });
});
