import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// dev 서버와 프로덕션 빌드가 같은 .next를 공유하면, dev 실행 중 next build가
// 청크 테이블을 덮어써 dev 서버가 깨진다 (Cannot find module './NNN.js' → 홈 500).
// 로컬 빌드·서빙은 .next-build로 분리한다. Vercel은 Output Directory가 .next로
// 고정되어 있고 dev 서버와 충돌할 일도 없으므로 기본값을 유지한다.
const nextConfig = (phase: string): NextConfig => ({
  reactStrictMode: true,
  // src/ contains legacy Vite files — exclude from Next.js compilation
  pageExtensions: ["tsx", "ts", "jsx", "js"],
  distDir:
    phase === PHASE_DEVELOPMENT_SERVER || process.env.VERCEL ? ".next" : ".next-build",
});

export default nextConfig;
