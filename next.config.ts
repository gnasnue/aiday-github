import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// dev 서버와 프로덕션 빌드가 같은 .next를 공유하면, dev 실행 중 next build가
// 청크 테이블을 덮어써 dev 서버가 깨진다 (Cannot find module './NNN.js' → 홈 500).
// 로컬 빌드·서빙은 .next-build로 분리한다. Vercel은 Output Directory가 .next로
// 고정되어 있고 dev 서버와 충돌할 일도 없으므로 기본값을 유지한다.
// 배포 식별자 — bfcache/PWA로 복원된 옛 번들이 최신 배포와 다른지 판별하는 근거.
// 빌드 시점의 값이 클라이언트 번들에 인라인되고(NEXT_PUBLIC), /api/version은 런타임(=현재
// 라이브 배포)의 같은 값을 돌려준다. 둘이 다르면 옛 번들 → 최신으로 강제 리로드.
// Vercel이 커밋 SHA를 주입하며, 로컬·미배포 환경은 "dev"로 폴백(항상 일치 → 리로드 없음).
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";

const nextConfig = (phase: string): NextConfig => ({
  reactStrictMode: true,
  // src/ contains legacy Vite files — exclude from Next.js compilation
  pageExtensions: ["tsx", "ts", "jsx", "js"],
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  distDir:
    phase === PHASE_DEVELOPMENT_SERVER || process.env.VERCEL ? ".next" : ".next-build",
});

export default nextConfig;
