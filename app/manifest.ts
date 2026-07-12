import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "아이데이(AI-Day)",
    short_name: "아이데이",
    description: "내 아이를 위한 맞춤형 날씨 정보를 알려드립니다",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF8F0",
    theme_color: "#F5A623",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
