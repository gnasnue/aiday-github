import { test, expect } from "@playwright/test";
import { checklistHeading, mockEnvApisSuccess, mockReportSuccess } from "./fixtures";

/**
 * TC-STORE-01 — localStorage 네임스페이스 마이그레이션(`aiweather:` → `aiday:`).
 *
 * 왜 E2E인가: 자기치유 로직 자체는 `lib/storage-keys.test.ts`(유닛)가 덮는다. 여기서
 * 검증하는 건 **화면 14곳이 실제로 그 접근자를 지나가는가**다 — 한 화면이라도 옛 키를
 * 직접 읽으면 기존 사용자의 프로필이 사라진 것처럼 보이고, 그게 이 작업의 유일한 리스크다.
 *
 * ⚠️ 마이그레이션이 포함된 빌드에서만 통과한다. 배포 전에는
 * `E2E_BASE_URL=http://localhost:3000`으로 실행할 것(라이브는 이전 번들).
 */
const LEGACY_PROFILE = {
  id: "legacy-child-1",
  name: "레거시아이",
  emoji: "🧒",
  age: "만 4세",
  gender: "unknown",
  birth: { year: "2022", month: "5" },
  conditions: ["해당없음"],
  cold: "보통이에요",
  hot: "보통이에요",
  sweat: "보통이에요",
  schedule: {},
  createdAt: 1_700_000_000_000,
};

test.describe("localStorage 마이그레이션", () => {
  test.beforeEach(async ({ page }) => {
    await mockEnvApisSuccess(page);
    await mockReportSuccess(page);
    // 구 접두어만 있는 상태(= 이번 배포 전부터 앱을 쓰던 사용자)를 첫 스크립트로 심는다.
    await page.addInitScript((profile) => {
      localStorage.setItem("aiweather:profiles", JSON.stringify([profile]));
      localStorage.setItem("aiweather:activeProfileId", profile.id);
    }, LEGACY_PROFILE);
  });

  test("TC-STORE-01: 구키만 있던 사용자의 프로필·아이 선택이 유지되고 신키로 옮겨진다", async ({ page }) => {
    await page.goto("/home");
    await expect(checklistHeading(page)).toBeVisible({ timeout: 15_000 });

    // ① 화면에 그대로 보인다 (프로필 유실 없음 — 이 작업의 핵심 수용 기준)
    await expect(page.getByRole("button", { name: LEGACY_PROFILE.name })).toBeVisible({
      timeout: 15_000,
    });

    // ② 신키로 복사됐고, 활성 아이 선택도 넘어왔다
    const migrated = await page.evaluate(() => ({
      profiles: localStorage.getItem("aiday:profiles"),
      active: localStorage.getItem("aiday:activeProfileId"),
    }));
    expect(migrated.profiles, "aiday:profiles로 복사되어야 함").toContain(LEGACY_PROFILE.name);
    expect(migrated.active).toBe(LEGACY_PROFILE.id);

    // ③ 구키는 아직 남아 있다 — 배포 직후 구버전 번들 탭(bfcache)이 쓰던 값을 잃지 않기 위한
    //    의도된 미러다. 다음 릴리스에서 미러 쓰기를 제거하면 이 기대는 함께 바뀐다.
    const legacyStill = await page.evaluate(() => localStorage.getItem("aiweather:profiles"));
    expect(legacyStill).toContain(LEGACY_PROFILE.name);
  });

  test("TC-STORE-02: 다른 탭 화면(마이·하루)도 같은 아이를 이어서 본다", async ({ page }) => {
    await page.goto("/me");
    await expect(page.getByText(LEGACY_PROFILE.name).first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/day");
    await expect(page.getByText(LEGACY_PROFILE.name).first()).toBeVisible({ timeout: 15_000 });
  });
});
