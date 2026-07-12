import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// dev 서버와 프로덕션 빌드가 같은 .next를 공유하면, dev 실행 중 next build가
// 청크 테이블을 덮어써 dev 서버가 깨진다 (Cannot find module './NNN.js' → 홈 500).
// 프로덕션 빌드·서빙은 .next-build를 쓰도록 분리한다.
const nextConfig = (phase: string): NextConfig => ({
  reactStrictMode: true,
  // src/ contains legacy Vite files — exclude from Next.js compilation
  pageExtensions: ["tsx", "ts", "jsx", "js"],
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next" : ".next-build",
});

export default nextConfig;
