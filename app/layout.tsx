import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "아이데이(AI-Day)",
  description: "내 아이를 위한 맞춤형 날씨 정보를 알려드립니다",
  openGraph: {
    title: "아이데이(AI-Day)",
    description: "내 아이를 위한 맞춤형 날씨 정보를 알려드립니다",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    site: "@aiday_app",
    title: "아이데이(AI-Day)",
    description: "내 아이를 위한 맞춤형 날씨 정보를 알려드립니다",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
