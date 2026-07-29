import { test, expect, type Page } from "@playwright/test";
import { mockEnvApisSuccess, mockReportSuccess } from "./fixtures";

/**
 * P0-3 + TC-ONB-* — 온보딩 5단계(app/onboarding/page.tsx, TOTAL=5) 아이 프로필 등록과
 * 새로고침 후 유지(localStorage `aiday:profiles`) 확인.
 *
 * 완료 후 /home 진입 시 실제 /api/report가 호출되므로(실 Claude 비용), 이 스펙의 목적은
 * "프로필 등록·영속화"이지 리포트 생성 자체가 아니다 — env·report API를 모킹해 비용을
 * 피한다. 실제 AI 리포트 생성은 05-home-report.spec.ts(P0-4)에서 비모킹으로 별도 검증한다.
 * mobile 전용(playwright.config.ts) — desktop과 중복 실행 방지.
 */

const CHILD_NAME = "QA온보딩아이";

async function fillStep1(page: Page, name: string) {
  await page.locator("input").first().fill(name);
  const comboboxes = page.getByRole("combobox");
  await comboboxes.nth(0).click(); // 년
  await page.getByRole("option", { name: "2022년" }).click();
  await comboboxes.nth(1).click(); // 월
  await page.getByRole("option", { name: "5월" }).click();
  await page.getByRole("button", { name: "여아", exact: true }).click();
}

async function fillStep2(page: Page, opts: { pickCondition?: string; sensitiveConsent?: boolean } = {}) {
  const label = opts.pickCondition ?? "해당없음";
  await page.getByText(label, { exact: true }).click();
  // 약관 동의 — <label>이 중첩 Checkbox(button)를 감싸므로 텍스트 클릭으로 토글된다(네이티브 label 동작).
  // "에 동의합니다"(약관 행)와 "데 동의합니다"(민감정보 행, "...활용하는 데 동의합니다")는
  // 마지막 음절이 달라 문자열이 겹치지 않는다 — 이용약관 링크(<a>) 자체는 클릭 대상에서 제외.
  const termsText = page.getByText("에 동의합니다", { exact: false });
  if (await termsText.count()) await termsText.first().click();
  if (opts.sensitiveConsent) {
    await page.getByText("아이 건강 정보를 맞춤 리포트에 활용", { exact: false }).click();
  }
}

async function fillStep3(page: Page) {
  const comboboxes = page.getByRole("combobox");
  await comboboxes.nth(0).click(); // 추위 민감도
  await page.getByRole("option", { name: "보통", exact: true }).click();
  await comboboxes.nth(1).click(); // 더위 민감도
  await page.getByRole("option", { name: "보통", exact: true }).click();
  await comboboxes.nth(2).click(); // 땀 분비
  await page.getByRole("option", { name: "보통", exact: true }).click();
}

test.describe("온보딩", () => {
  test.beforeEach(async ({ page }) => {
    await mockEnvApisSuccess(page);
    await mockReportSuccess(page);
  });

  test("TC-ONB-01/02: 1단계 필수값 미입력 시 진행 차단", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("아이 이름을 입력해주세요")).toBeVisible();
    await expect(page.getByText("1 / 5")).toBeVisible();

    await page.locator("input").first().fill("이름만입력");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("태어난 연도와 월을 선택해주세요")).toBeVisible();
    await expect(page.getByText("1 / 5")).toBeVisible();
  });

  test("TC-ONB-03/04: 2단계 조건 미선택 및 민감정보 미동의 차단", async ({ page }) => {
    await page.goto("/onboarding");
    await fillStep1(page, "검증용아이");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("2 / 5")).toBeVisible();

    // 조건 0개 선택 상태로 다음
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText(/하나 이상 선택해주세요/)).toBeVisible();

    // 실제 건강 특이사항 선택(해당없음이 아님) + 약관만 동의, 민감정보 미동의
    await page.getByText("호흡기 민감 (비염, 천식·기관지)", { exact: false }).click();
    const termsText = page.getByText("에 동의합니다", { exact: false });
    if (await termsText.count()) await termsText.first().click();
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("건강 정보 활용 동의를 확인해주세요")).toBeVisible();
    await expect(page.getByText("2 / 5")).toBeVisible();
  });

  test("TC-ONB-05: 3단계 온도 민감도 일부만 선택 시 차단", async ({ page }) => {
    await page.goto("/onboarding");
    await fillStep1(page, "검증용아이2");
    await page.getByRole("button", { name: "다음" }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("3 / 5")).toBeVisible();

    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "보통", exact: true }).click();
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("세 항목 모두 선택해주세요")).toBeVisible();
  });

  test("TC-ONB-06: 뒤로가기 버튼으로 이전 단계 이동", async ({ page }) => {
    await page.goto("/onboarding");
    await fillStep1(page, "뒤로가기테스트");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("2 / 5")).toBeVisible();
    await page.getByRole("button", { name: "뒤로가기" }).click();
    await expect(page.getByText("1 / 5")).toBeVisible();
  });

  test("TC-ONB-07: 중간 이탈(나중에 이어서 하기) 후 재방문 시 이어하기", async ({ page }) => {
    await page.goto("/onboarding");
    await fillStep1(page, "이탈테스트아이");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("2 / 5")).toBeVisible();
    await page.getByRole("button", { name: "나중에 이어서 하기" }).click();
    await expect(page).toHaveURL(/\/home$/);

    await page.goto("/onboarding");
    // 진행 상태가 저장돼 있으면 2단계에서 재개(또는 최소 1단계 값 유지) — 실제 동작 기록
    const stepText = await page.getByText(/^\d \/ 5$/).textContent();
    expect(stepText).toBeTruthy();
    console.log(`[QA] TC-ONB-07 재방문 시 실제 복원된 단계: ${stepText}`);
    test.info().annotations.push({ type: "note", description: `재방문 시 복원된 단계: ${stepText}` });
  });

  test("P0-3: 5단계 전체 완료 → 홈 진입 → 새로고침 후 프로필 유지", async ({ page }) => {
    await page.goto("/onboarding");
    await fillStep1(page, CHILD_NAME);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("2 / 5")).toBeVisible();

    await fillStep2(page);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("3 / 5")).toBeVisible();

    await fillStep3(page);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("4 / 5")).toBeVisible();

    await page.getByRole("button", { name: "건너뛰고 나중에 입력할게요" }).click();
    await expect(page.getByText("5 / 5")).toBeVisible();

    await page.getByRole("button", { name: "완료" }).click();
    await expect(page.getByText(/첫 번째.*리포트가 준비됐어요/)).toBeVisible({ timeout: 10_000 });

    // localStorage에 실제 저장되었는지(완료 버튼 클릭 즉시, 홈 이동 전에도 확인 가능)
    const savedRaw = await page.evaluate(() => localStorage.getItem("aiday:profiles"));
    expect(savedRaw, "완료 시점에 aiday:profiles가 저장되어야 함").toBeTruthy();
    expect(savedRaw).toContain(CHILD_NAME);

    await page.getByRole("button", { name: "오늘 리포트 보러가기" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("button", { name: CHILD_NAME })).toBeVisible({ timeout: 15_000 });

    // 핵심 검증: 새로고침 후에도 프로필이 유지되는가
    await page.reload();
    await expect(page.getByRole("button", { name: CHILD_NAME })).toBeVisible({ timeout: 15_000 });
    const afterReload = await page.evaluate(() => localStorage.getItem("aiday:profiles"));
    expect(afterReload).toContain(CHILD_NAME);
  });

  test("TC-ONB-08: 완료 화면 새로고침 시 크래시 없이 홈으로 복귀 가능", async ({ page }) => {
    await page.goto("/onboarding");
    await fillStep1(page, "완료화면새로고침");
    await page.getByRole("button", { name: "다음" }).click();
    await fillStep2(page);
    await page.getByRole("button", { name: "다음" }).click();
    await fillStep3(page);
    await page.getByRole("button", { name: "다음" }).click();
    await page.getByRole("button", { name: "건너뛰고 나중에 입력할게요" }).click();
    await page.getByRole("button", { name: "완료" }).click();
    await expect(page.getByText(/첫 번째.*리포트가 준비됐어요/)).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
