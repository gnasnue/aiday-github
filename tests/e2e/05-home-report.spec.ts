import { test, expect } from "@playwright/test";
import { checklistHeading } from "./fixtures";

/**
 * P0-4 + TC-HOME-01,02,04,06 — 홈 AI 브리핑 실제 생성과 체크리스트 토글.
 *
 * ⚠️ 비용 발생: 이 스펙은 실제 Claude Sonnet을 호출한다(모킹 없음). 게스트 프로필
 * 전환(지우→도윤)·새로고침 각각 실 리포트 생성 1회씩 추가되므로, 하나의 테스트 안에서
 * 순차적으로 진행해 브라우저 컨텍스트(및 localStorage 당일 캐시)를 재사용하고 불필요한
 * 재생성을 피한다. mobile 전용(playwright.config.ts) — desktop 중복 실행 방지(비용 2배 방지).
 */
test.describe("홈 AI 리포트(실 API)", () => {
  test("P0-4: 실제 AI 브리핑 생성 + 체크리스트 토글 + 프로필 전환 + 새로고침 쿨다운", async ({ page }) => {
    test.setTimeout(120_000);
    const reportRequests: { url: string; postData: string | null }[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/report")) {
        reportRequests.push({ url: req.url(), postData: req.postData() });
      }
    });
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // 1) 실제 홈 진입 — 지우(기본 데모 프로필) 리포트 생성
    const res = await page.goto("/home");
    expect(res?.status()).toBeLessThan(400);

    const heading = checklistHeading(page);
    await expect(heading).toBeVisible({ timeout: 20_000 }); // PRD p95 <=10s + 콜드스타트 여유

    // AI 훅(결론 한 줄)이 표시되어야 함 — 빈 화면 금지
    const heroText = await page.locator("main").innerText();
    expect(heroText.trim().length, "홈 본문이 비어 있음(빈 화면 금지 위반 가능성)").toBeGreaterThan(20);

    // 2) 체크리스트 토글 — 카운터가 실제로 갱신되는지
    const counter = heading.locator("xpath=following::p[1]");
    const list = heading.locator("xpath=following::ul[1]");
    const items = list.locator("li button");
    await expect(items.first()).toBeVisible({ timeout: 10_000 });
    const beforeText = (await counter.textContent()) ?? "";
    await items.first().click();
    await expect(counter).not.toHaveText(beforeText);
    await items.first().click(); // 원복
    await expect(counter).toHaveText(beforeText);

    // 3) TC-HOME-04: 데모 프로필 "예시" 배지 — PRD S-001 "[도윤 2세 (예시)]" 표기(BUG-1 수정,
    //    app/(main)/home/page.tsx의 isDemoProfile 배지 렌더). 소프트 검증으로 기록하고 계속 진행.
    const demoBadgeCount = await page.getByText("예시", { exact: false }).count();
    expect
      .soft(demoBadgeCount, 'TC-HOME-04: 데모 프로필에 "예시" 배지 텍스트가 없음 — PRD S-001 기대와 불일치')
      .toBeGreaterThan(0);

    // 4) TC-HOME-06: 리포트 유용성 피드백
    await page.getByRole("button", { name: "도움이 됐어요" }).click();
    await expect(page.getByText("의견 감사해요")).toBeVisible({ timeout: 5_000 });

    // 5) TC-HOME-01: 프로필 전환(도윤) — 크래시 없이 재렌더 + 새 child로 실제 요청 발생
    await page.getByRole("button", { name: "도윤" }).click();
    await expect(heading).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText("Application error");

    // 6) TC-HOME-02: 새로고침 60초 쿨다운 — 첫 클릭은 실제 재생성, 즉시 재클릭은 차단돼야 함
    const refreshBtn = page.getByRole("button", { name: "리포트 새로고침" });
    await expect(refreshBtn).toBeEnabled({ timeout: 15_000 });
    await refreshBtn.click();
    await expect(refreshBtn).toBeEnabled({ timeout: 20_000 }); // 재생성 완료 대기
    await refreshBtn.click(); // 60초 이내 재클릭
    await expect(page.getByText("방금 갱신했어요")).toBeVisible({ timeout: 5_000 });

    // 비용 참고 로그 — 이 테스트 1회 실행으로 발생한 실제 /api/report 호출 수
    console.log(`[QA] /api/report 실호출 횟수: ${reportRequests.length}`);
    expect(reportRequests.length, "예상보다 많은 실 리포트 생성 호출 발생(비용 점검 필요)").toBeLessThanOrEqual(4);

    const seriousErrors = consoleErrors.filter((e) => !/favicon|hydrat/i.test(e));
    expect.soft(seriousErrors, `콘솔 오류 발견: ${seriousErrors.join(" | ")}`).toEqual([]);
  });
});
