import { test, expect } from "@playwright/test";
import { checklistHeading, mockEnvApisSuccess, mockReportSuccess } from "./fixtures";

/**
 * TC-RESP-03 / TC-HOME-05 — 반응형 레이아웃 + 데이터 많음(다중 프로필) 시나리오.
 * env·report를 모두 모킹해 비용 없이 mobile·desktop 양쪽에서 실행한다.
 */
test.describe("반응형 · 데이터 많음", () => {
  test.beforeEach(async ({ page }) => {
    await mockEnvApisSuccess(page);
    await mockReportSuccess(page);
  });

  test("TC-RESP-03: 홈 하단 탭바 5개 전부 노출·클릭 가능", async ({ page }, testInfo) => {
    await page.goto("/home");
    await expect(checklistHeading(page)).toBeVisible({ timeout: 15_000 });
    for (const label of ["홈", "환경정보", "옷차림", "건강팁", "마이"]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow, `${testInfo.project.name}에서 홈 화면 가로 스크롤 발생`).toBeFalsy();
    await page.screenshot({ path: `screenshots/home-${testInfo.project.name}.png`, fullPage: true });
  });

  test("TC-HOME-04(모킹, 회귀용): 데모 프로필 '예시' 배지 표시 확인 — 실 API 비용 없이 검증", async ({ page }, testInfo) => {
    await page.goto("/home");
    await expect(checklistHeading(page)).toBeVisible({ timeout: 15_000 });
    const demoBadgeCount = await page.getByText("예시", { exact: false }).count();
    await page.screenshot({ path: `screenshots/BUG-1-demo-badge-missing-${testInfo.project.name}.png`, fullPage: true });
    expect
      .soft(demoBadgeCount, 'BUG-1 회귀: 데모 프로필(지우/도윤)에 "예시" 배지 텍스트가 없음 — PRD S-001 기대와 불일치')
      .toBeGreaterThan(0);
  });

  test("TC-HOME-05: 프로필 3개 이상 등록 시 레이아웃 유지", async ({ page }) => {
    await page.goto("/home");
    await expect(checklistHeading(page)).toBeVisible({ timeout: 15_000 });

    // localStorage에 프로필을 직접 추가(데모 2개 + QA 추가 3개 = 5개)해 "데이터 많음" 상태 재현
    await page.evaluate(() => {
      const raw = localStorage.getItem("aiweather:profiles");
      const list = raw ? JSON.parse(raw) : [];
      for (let i = 1; i <= 3; i++) {
        list.push({
          id: `qa-many-${i}`,
          name: `QA다자녀${i}`,
          emoji: "🧒",
          age: "만 3세",
          gender: "unknown",
          birth: { year: "2023", month: "1" },
          conditions: ["해당없음"],
          cold: "보통이에요",
          hot: "보통이에요",
          sweat: "보통이에요",
          schedule: {},
          createdAt: Date.now() + i,
        });
      }
      localStorage.setItem("aiweather:profiles", JSON.stringify(list));
    });
    await page.reload();
    await expect(checklistHeading(page)).toBeVisible({ timeout: 15_000 });

    for (let i = 1; i <= 3; i++) {
      await expect(page.getByRole("button", { name: `QA다자녀${i}` })).toBeVisible();
    }
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow, "프로필 5개 상태에서 가로 스크롤로 레이아웃이 깨짐").toBeFalsy();
  });
});
