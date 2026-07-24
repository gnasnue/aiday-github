import { test, expect } from "@playwright/test";
import { mockEnvApisSuccess } from "./fixtures";

/**
 * P0-5 — 프로필 편집 후 저장 결과 반영 확인 (app/me/edit/[id]/page.tsx).
 * /outfit·/me는 /api/report를 호출하지 않으므로(옷차림 탭은 /api/weather만 사용,
 * app/(main)/outfit/page.tsx:344 확인) 이 스펙은 실 Claude 비용이 없다.
 * mobile 전용(playwright.config.ts) — 다른 비용 스펙과의 실행 순서 일관성을 위해.
 *
 * 참고: 데모 프로필 "지우"의 birth에는 day가 없다(lib/profile.ts defaultProfiles:
 * { year:"2022", month:"3" } — day 미포함). 편집 화면은 저장 시 year/month/day
 * 셋 다 요구하므로(app/me/edit/[id]/page.tsx:138), 생년월일을 바꾸지 않아도 day를
 * 새로 선택해야 저장할 수 있다 — 실사용 흐름 그대로 재현한다.
 */
test.describe("프로필 편집", () => {
  test.beforeEach(async ({ page }) => {
    await mockEnvApisSuccess(page);
  });

  const newName = "지우편집됨QA";

  test("P0-5: 이름·건강정보 변경 → 저장 → /me·/outfit에 반영 확인", async ({ page }) => {
    await page.goto("/me");
    const jiwooCard = page.locator("article").filter({ has: page.getByText("지우", { exact: true }) });
    await expect(jiwooCard).toBeVisible();
    await jiwooCard.getByRole("button", { name: "편집" }).click();
    await expect(page).toHaveURL(/\/me\/edit\//);

    // 이름 변경
    const nameInput = page.locator("input").first();
    await nameInput.fill(newName);

    // 생년월일 day 보완 선택(데모 데이터엔 day가 없어 저장 검증을 통과하려면 선택 필요)
    const dayCombobox = page.getByRole("combobox").nth(2);
    await dayCombobox.click();
    await page.getByRole("option", { name: "15일" }).click();

    // 호흡기 민감 체질 체크 — 지우의 원본 조건("비염")이 정규화되어 이미 체크돼 있을 수 있으므로
    // Radix Checkbox의 실제 aria-checked를 읽어 판단한다(클래스 추정 대신 접근성 속성 사용).
    const respLabel = page.getByText("호흡기 민감 (비염, 천식·기관지)", { exact: false });
    const respCheckbox = respLabel.locator("xpath=preceding-sibling::button[1]");
    const checkedAttr = await respCheckbox.getAttribute("aria-checked");
    if (checkedAttr !== "true") await respLabel.click();

    await page.getByRole("button", { name: "저장하기" }).click();

    // 민감정보 동의 게이트가 뜨면(첫 저장) 동의 후 저장 계속.
    // hasAllRequiredConsents는 terms_privacy·sensitive_child_data 둘 다 요구하므로
    // (lib/consent.ts REQUIRED_CONSENT_TYPES) 다이얼로그 안의 두 체크박스를 모두 체크해야
    // "동의하고 저장하기" 버튼이 활성화된다(처음엔 disabled 확인 — Radix Checkbox는
    // <label> 안에 중첩된 button이라 label 텍스트 클릭으로 토글된다).
    const consentGateBtn = page.getByRole("button", { name: "동의하고 저장하기" });
    if (await consentGateBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const termsText = page.getByText("에 동의합니다", { exact: false });
      if (await termsText.count()) await termsText.first().click();
      await page.getByText("아이 건강 정보를 맞춤 리포트에 활용", { exact: false }).click();
      await expect(consentGateBtn).toBeEnabled({ timeout: 3_000 });
      await consentGateBtn.click();
    }

    await expect(page.getByText("프로필이 저장됐어요")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/me$/, { timeout: 10_000 });

    // /me 목록에 변경된 이름이 실제로 반영됐는지
    await expect(page.getByText(newName, { exact: true })).toBeVisible();

    // localStorage에도 반영되어 새로고침 후 유지되는지
    await page.reload();
    await expect(page.getByText(newName, { exact: true })).toBeVisible();

    // 옷차림 탭 — 호흡기 민감 체질 프로필이면 KF94 마스크가 추천에 포함되는지(§05 수락 기준)
    await page.getByRole("link", { name: "옷차림" }).click();
    await expect(page).toHaveURL(/\/outfit$/);
    await expect(page.getByText("KF94 마스크", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  });
});
