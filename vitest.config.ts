import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      // 백그라운드 작업이 만드는 git worktree는 레포 전체 사본이라, 그대로 두면
      // 같은 테스트가 사본 수만큼 중복 수집돼 "몇 건 통과"가 의미를 잃는다.
      ".claude/worktrees/**",
      // 빌드 산출물(dev/prod distDir 분리 — CLAUDE.md 참조)
      ".next*/**",
    ],
  },
});
