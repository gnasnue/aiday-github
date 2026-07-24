// 실패한 Playwright 테스트의 스크린샷·트레이스를 test-results/에서 screenshots/·traces/로 복사한다.
// 사용: node scripts/collect-e2e-artifacts.mjs
// (이 스크립트는 테스트 인프라 산출물이며 애플리케이션 소스코드가 아니다 — QA 작업 지시 범위 내)
import { readdirSync, statSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "test-results");
const SHOTS = join(ROOT, "screenshots");
const TRACES = join(ROOT, "traces");

if (!existsSync(SRC)) {
  console.log("test-results/ 없음 — 수집할 아티팩트가 없습니다.");
  process.exit(0);
}
mkdirSync(SHOTS, { recursive: true });
mkdirSync(TRACES, { recursive: true });

let shotCount = 0;
let traceCount = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else {
      const ext = extname(entry);
      if (ext === ".png") {
        const dest = join(SHOTS, `${basename(dir)}__${entry}`);
        copyFileSync(full, dest);
        shotCount++;
      } else if (ext === ".zip" && entry.includes("trace")) {
        const dest = join(TRACES, `${basename(dir)}__${entry}`);
        copyFileSync(full, dest);
        traceCount++;
      }
    }
  }
}

walk(SRC);
console.log(`복사 완료 — 스크린샷 ${shotCount}개 → screenshots/, 트레이스 ${traceCount}개 → traces/`);
