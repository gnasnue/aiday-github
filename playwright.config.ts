import { defineConfig, devices } from "@playwright/test";

/**
 * 아이데이(AiDay) 라이브 데모 E2E 설정.
 *
 * 대상: https://aiday-demo.vercel.app (실 프로덕션 Supabase + 실 Claude Sonnet API)
 * - 헤드리스 전용. `--headed`/`--ui` 사용 금지(작업 지시).
 * - 비용이 발생하는 스펙(온보딩 완료·홈 실제 리포트 생성·레이트리밋·회원가입)은
 *   mobile 프로젝트에서만 실행한다 — desktop과 중복 실행 시 실 Claude 호출이 2배가 된다.
 *   (각 스펙 파일 상단 주석에 프로젝트 제한 근거를 기록해 둔다.)
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // 게스트 레이트리밋 버킷이 IP 단위로 공유되므로 워커 병렬화를 피한다
  workers: 1,
  forbidOnly: false,
  retries: 0, // 실 API 대상 — 재시도가 레이트리밋 소진을 앞당기므로 비활성
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  outputDir: "test-results",
  use: {
    // 버그 수정 검증 시엔 로컬 dev 서버(E2E_BASE_URL=http://localhost:3000)로 재실행한다 —
    // 라이브 데모는 배포 전까지 수정 사항을 반영하지 않는다.
    baseURL: process.env.E2E_BASE_URL || "https://aiday-demo.vercel.app",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "mobile",
      use: {
        // iPhone 13 프리셋은 WebKit 엔진을 요구해 별도 브라우저 설치가 필요하므로,
        // Chromium 기반 Pixel 5 프리셋에 DESIGN.md 390px 고정 프레임 뷰포트만 덮어쓴다.
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
      // 비용/상태 변경을 동반하는 스펙은 mobile에서만 실행 — 아래 testIgnore로 제외.
      testIgnore: [
        "**/*auth.spec.ts",
        "**/*onboarding.spec.ts",
        "**/*home-report.spec.ts",
        "**/*profile-edit.spec.ts",
        "**/*rate-limit.spec.ts",
      ],
    },
  ],
});
