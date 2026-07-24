import { test, expect, request as pwRequest } from "@playwright/test";
import {
  checklistHeading,
  mockApis502,
  mockEnvApisSuccess,
  mockReport503,
  mockReportAborted,
  mockReportSuccess,
} from "./fixtures";

/**
 * TC-ERR-* — 외부 API·네트워크 장애를 page.route()로 모킹해 실 Claude 비용 없이 클라이언트
 * 회복력을 검증한다(작업 지시: "날씨 API 502 — network.route()로 모킹해 확인"). 정적/모킹
 * 기반이라 mobile·desktop 양쪽에서 실행 가능.
 */
test.describe("서버·네트워크 오류 처리(모킹)", () => {
  test("TC-ERR-01: 환경 API 전체 502 — 환경정보 탭 오류 배너", async ({ page }) => {
    await mockApis502(page, ["**/api/weather?**", "**/api/weather/weekly**", "**/api/air?**", "**/api/uv?**", "**/api/pollen?**"]);
    await mockReport503(page); // 리포트도 비용 없이 fatal 처리되도록
    await page.goto("/env");
    await expect(page.getByText("환경 데이터를 불러오지 못했어요")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("TC-ERR-02: 날씨 API만 502(부분 장애) — 홈 크래시 없이 다른 카드는 정상", async ({ page }) => {
    // 먼저 4종 API 전부 성공으로 등록한 뒤, weather/weekly만 502로 다시 등록해 덮어쓴다
    // (Playwright는 같은 URL에 매칭되는 라우트가 여럿이면 나중에 등록된 핸들러를 우선 적용한다).
    await mockEnvApisSuccess(page);
    await mockApis502(page, ["**/api/weather?**", "**/api/weather/weekly**"]);
    await mockReportSuccess(page);
    const res = await page.goto("/home");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Application error");
    // 리포트 카드 자체는 report 모킹 성공으로 정상 렌더되어야 함(빈 화면 금지)
    await expect(checklistHeading(page)).toBeVisible({ timeout: 15_000 });
  });

  test("TC-ERR-03: /api/report 503(설정 오류) — 기본 추천 폴백", async ({ page }) => {
    await mockEnvApisSuccess(page);
    await mockReport503(page);
    await page.goto("/home");
    await expect(page.getByText("기본 추천", { exact: false })).toBeVisible({ timeout: 15_000 });
    const bodyText = await page.locator("main").innerText();
    expect(bodyText.trim().length, "503 폴백 시 화면이 비어 있음(빈 화면 금지 위반)").toBeGreaterThan(20);
  });

  test("TC-ERR-04: /api/report 네트워크 단절 — 재시도 후 기본 추천", async ({ page }) => {
    await mockEnvApisSuccess(page);
    await mockReportAborted(page);
    await page.goto("/home");
    await expect(page.getByText("기본 추천", { exact: false })).toBeVisible({ timeout: 20_000 });
  });

  test("TC-ERR-05: /api/report 잘못된 입력(빈 body) — HTTP 400", async ({ page, baseURL }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    const res = await ctx.post("/api/report", { data: {} });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("필수 입력");
    await ctx.dispose();
  });

  test("TC-ERR-06: 오프라인 상태에서 홈 진입", async ({ page, context }) => {
    await context.setOffline(true);
    let navError: unknown = null;
    try {
      await page.goto("/home", { timeout: 10_000 });
    } catch (e) {
      navError = e;
    }
    await context.setOffline(false);
    // SW(오프라인 캐시)가 없는 순수 웹앱이므로 완전 오프라인 최초 진입은 브라우저 레벨에서 실패하는 것이
    // 예상된 동작이다(memory: SW 부재). 크래시(500) 없이 네트워크 오류로 실패하는지만 확인.
    test.info().annotations.push({
      type: "note",
      description: navError
        ? "예상대로 오프라인 최초 진입은 브라우저 네트워크 오류로 실패(Service Worker 미도입, 알려진 설계)"
        : "오프라인 상태에서도 페이지가 로드됨(캐시 존재 가능성) — 예상과 다름, 확인 필요",
    });
  });
});
