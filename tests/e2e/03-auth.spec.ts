import { test, expect } from "@playwright/test";
import { genTestEmail, hasSupabaseAuthCookie, TEST_PASSWORD } from "./fixtures";

/**
 * P0-1 + TC-AUTH-* — 이메일 회원가입/로그인, 세션 유지, 잘못된 입력.
 *
 * 이 스펙은 실제 Supabase Auth에 계정을 생성한다("aiday-qa-test+{ts}@example.com" 패턴).
 * 이메일 인증이 프로젝트 설정상 켜져 있으면 코드(app/signup/page.tsx: data.session 분기)에
 * 따라 세션 없이 게스트 모드로 /onboarding에 진행되며, 이 경우 실제 로그인 세션 검증은
 * "BLOCKED — 이메일 인증 대기, 실메일 확인 불가"로 기록한다(작업 지시 §절대 제약).
 *
 * 비용 참고: 이 스펙은 /home으로 진행하지 않으므로(app/auth/landing/page.tsx가 신규 계정을
 * 프로필 없음으로 판단해 /onboarding으로 보냄) 실 Claude 호출이 발생하지 않는다.
 * mobile 프로젝트 전용(playwright.config.ts testIgnore) — 실 계정 생성을 desktop과 중복하지 않기 위함.
 */
test.describe.serial("이메일 인증", () => {
  const email = genTestEmail();
  let sessionGrantedAtSignup = false;

  test("TC-AUTH-03: 회원가입 비밀번호 불일치", async ({ page }) => {
    await page.goto("/signup");
    await page.locator("#email").fill(genTestEmail());
    await page.locator("#pw").fill("password1234");
    await page.locator("#pw2").fill("different5678");
    await page.locator("#consent-terms_privacy").check();
    await page.getByRole("button", { name: "가입하기" }).click();
    await expect(page.getByText("비밀번호가 일치하지 않아요")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/); // 이동하지 않음
  });

  test("TC-AUTH-04: 회원가입 약관 미동의 제출 차단", async ({ page }) => {
    await page.goto("/signup");
    await page.locator("#email").fill(genTestEmail());
    await page.locator("#pw").fill(TEST_PASSWORD);
    await page.locator("#pw2").fill(TEST_PASSWORD);
    // 약관 체크 없이 제출
    await page.getByRole("button", { name: "가입하기" }).click();
    await expect(page.getByText("이용약관을 확인해주세요")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("P0-1a: 회원가입 성공 + 세션/이메일인증 분기 관찰", async ({ page }) => {
    await page.goto("/signup");
    await page.locator("#email").fill(email);
    await page.locator("#pw").fill(TEST_PASSWORD);
    await page.locator("#pw2").fill(TEST_PASSWORD);
    await page.locator("#consent-terms_privacy").check();
    await page.getByRole("button", { name: "가입하기" }).click();

    // 세션 즉시 발급("가입이 완료되었어요!")과 이메일 인증 대기("인증 메일을 보냈어요") 중 관찰
    const emailConfirmToast = page.getByText("인증 메일을 보냈어요", { exact: false });
    const instantToast = page.getByText("가입이 완료되었어요!", { exact: false });
    await expect(instantToast.or(emailConfirmToast)).toBeVisible({ timeout: 15_000 });
    const needsEmailConfirm = await emailConfirmToast.isVisible().catch(() => false);

    await page.waitForURL(/\/(onboarding|auth\/landing)/, { timeout: 15_000 });
    // auth/landing은 과도적 화면 — 최종적으로 온보딩(신규 계정, DB 프로필 없음)에 안착해야 함
    await page.waitForURL(/\/onboarding$/, { timeout: 15_000 });

    const hasAuthCookie = await hasSupabaseAuthCookie(page);
    sessionGrantedAtSignup = hasAuthCookie && !needsEmailConfirm;

    test.info().annotations.push({
      type: "signup-branch",
      description: needsEmailConfirm
        ? "BLOCKED — 이메일 인증 대기 상태로 가입됨. 실메일 확인 불가로 이후 실제 로그인 세션 검증은 차단."
        : `세션 즉시 발급됨(Supabase auth 쿠키 확인됨: ${hasAuthCookie}). 로그인 세션 검증 계속 진행.`,
    });

    if (sessionGrantedAtSignup) {
      // 세션이 실제로 유지되는지 새로고침으로 확인 (핵심: 세션 유지)
      await page.reload();
      await expect(page).not.toHaveURL(/\/login$/);
      const stillHasAuth = await hasSupabaseAuthCookie(page);
      expect(stillHasAuth, "새로고침 후 세션(Supabase auth 쿠키)이 사라짐").toBeTruthy();
    }
  });

  test("P0-1b: 방금 만든 계정으로 /login 재로그인 시도", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#pw").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "로그인", exact: true }).click();

    if (sessionGrantedAtSignup) {
      // 정상 로그인 기대: 인증 성공 → 판단 지점(auth/landing) → 온보딩(프로필 없음, 신규 계정)
      await expect(page.getByText("다시 만나서 반가워요!")).toBeVisible({ timeout: 15_000 });
      await page.waitForURL(/\/onboarding$/, { timeout: 15_000 });
      await page.reload();
      const stillHasAuth = await hasSupabaseAuthCookie(page);
      expect(stillHasAuth, "재로그인 후 새로고침에도 세션 유지되어야 함").toBeTruthy();
    } else {
      // 이메일 미인증 계정 로그인 시도 — "이메일 인증이 아직 완료되지 않았어요" 오류 경로 검증
      await expect(page.getByText("이메일 인증이 아직 완료되지 않았어요")).toBeVisible({ timeout: 15_000 });
      test.info().annotations.push({
        type: "note",
        description: "BLOCKED — 실메일 인증 불가로 로그인 세션 유지까지는 검증 못함. 오류 경로(재발송 안내)는 정상 확인.",
      });
    }
  });

  test("TC-AUTH-01: 잘못된 자격증명 로그인", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("no-such-user-aiday-qa@example.com");
    await page.locator("#pw").fill("wrongpassword123");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않아요")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test("TC-AUTH-02: 로그인 이메일 빈 값 제출", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#pw").fill("somepassword");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.getByText("이메일을 입력해주세요")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("TC-AUTH-05: 로그인 '이메일 저장' 옵션 — 체크 시 다음 방문 자동 채움, 해제 시 삭제", async ({ page }) => {
    // 실 계정 불필요 — app/login/page.tsx:43-48은 signInWithPassword 호출 전에 localStorage를
    // 갱신하므로, 로그인 성공 여부와 무관하게 저장/삭제 로직만 독립적으로 검증할 수 있다.
    const testEmail = genTestEmail();

    await page.goto("/login");
    await page.locator("#email").fill(testEmail);
    await page.locator("#pw").fill("wrong-password-for-remember-check");
    await page.locator("#remember-email").check();
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않아요")).toBeVisible({ timeout: 15_000 });

    const saved = await page.evaluate(() => localStorage.getItem("aiday.rememberedEmail"));
    expect(saved, "체크 상태로 제출 후 localStorage에 이메일이 저장돼야 함").toBe(testEmail);

    // 재방문 시 이메일 자동 채움 + 체크박스 유지 확인
    await page.reload();
    await expect(page.locator("#email")).toHaveValue(testEmail);
    await expect(page.locator("#remember-email")).toBeChecked();

    // 체크 해제 후 제출 — localStorage 정리, 다음 방문엔 빈 값 + 미체크
    await page.locator("#remember-email").uncheck();
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않아요")).toBeVisible({ timeout: 15_000 });
    const clearedAfterUncheck = await page.evaluate(() => localStorage.getItem("aiday.rememberedEmail"));
    expect(clearedAfterUncheck, "체크 해제 후 제출하면 localStorage 저장값이 제거돼야 함").toBeNull();

    await page.reload();
    await expect(page.locator("#email")).toHaveValue("");
    await expect(page.locator("#remember-email")).not.toBeChecked();
  });

  test("TC-AUTH-06: Google OAuth 버튼(수동 테스트 필요 — 외부 계정)", async ({ page }) => {
    await page.goto("/login");
    const googleBtn = page.getByRole("button", { name: "Google 계정으로 계속" });
    await expect(googleBtn).toBeVisible();
    test.info().annotations.push({
      type: "blocked",
      description: "BLOCKED — 실 구글 계정 필요, 자동화하지 않음. 버튼 노출만 확인.",
    });
  });

  test("TC-AUTH-07: 세션 만료(쿠키 삭제) 후 /me 재진입 — 게스트로 정상 강등", async ({ page, context }) => {
    // 방금 만든 계정으로 재로그인해 실제 세션을 만든 뒤(sessionGrantedAtSignup이면),
    // Supabase auth 쿠키를 강제 삭제해 "세션 만료"를 흉내낸다 — 전역 미들웨어가 없으므로
    // (코드 확인) 서버 리다이렉트가 아니라 클라이언트 판단에 의존하는 실제 동작을 관찰한다.
    if (sessionGrantedAtSignup) {
      await page.goto("/login");
      await page.locator("#email").fill(email);
      await page.locator("#pw").fill(TEST_PASSWORD);
      await page.getByRole("button", { name: "로그인", exact: true }).click();
      await page.waitForURL(/\/onboarding$/, { timeout: 15_000 });
    }
    const cookies = await context.cookies();
    await context.clearCookies({ name: /^sb-.*auth-token/ });
    void cookies;

    await page.goto("/me");
    await expect(page.locator("body")).not.toContainText("Application error");
    // 미들웨어 부재 확인(코드) — /login으로 강제 리다이렉트되지 않고 게스트 데모 프로필로 렌더되는지
    const onLogin = /\/login$/.test(page.url());
    test.info().annotations.push({
      type: "note",
      description: onLogin
        ? "세션 쿠키 삭제 후 /login으로 리다이렉트됨(서버 가드 존재 가능성 — 재확인 필요)"
        : "세션 쿠키 삭제 후에도 /login으로 리다이렉트되지 않고 게스트 데모 화면으로 정상 강등(전역 미들웨어 부재와 일치)",
    });
  });
});
