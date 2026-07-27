import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig paths("@/*")와 동일한 별칭 — lib/prompts/report.ts처럼 "@/lib/…"를
    // import하는 모듈을 테스트가 직접 불러올 수 있게 한다.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      // 백그라운드 작업이 만드는 git worktree는 레포 전체 사본이라, 그대로 두면
      // 같은 테스트가 사본 수만큼 중복 수집돼 "몇 건 통과"가 의미를 잃는다.
      ".claude/worktrees/**",
      // 빌드 산출물(dev/prod distDir 분리 — CLAUDE.md 참조)
      ".next*/**",
      // Playwright E2E 스펙(tests/e2e/*.spec.ts) — vitest 기본 include 패턴(**/*.spec.ts)과
      // 겹쳐 vitest가 잘못 주워 실행하면 test.describe() 문법 오류로 깨진다. 별도 러너(npm run test:e2e).
      "tests/e2e/**",
    ],
  },
});
