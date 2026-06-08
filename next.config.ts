import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // src/ contains legacy Vite files — exclude from Next.js compilation
  pageExtensions: ["tsx", "ts", "jsx", "js"],
};

export default nextConfig;
