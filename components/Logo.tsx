"use client";

import Link from "next/link";

/**
 * 브랜드 마크: 떠오르는 해 + 아이를 감싸는 호(arc).
 * 이모지(🌤️) 대신 벡터 마크 사용 — OS별 렌더링 편차 제거, 앱스토어 품질.
 */
const Mark = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {/* 지평선 위 해 */}
    <circle cx="12" cy="11" r="4.5" fill="hsl(38 91% 55%)" />
    {/* 아이를 감싸는 호 */}
    <path
      d="M3.5 16.5c2.2 3 5 4.5 8.5 4.5s6.3-1.5 8.5-4.5"
      stroke="hsl(24 30% 12%)"
      strokeWidth="2.4"
      strokeLinecap="round"
      className="dark:stroke-[hsl(33_30%_96%)]"
    />
  </svg>
);

const Logo = ({ className = "" }: { className?: string }) => (
  <Link
    href="/"
    aria-label="AiDay 아이데이 홈으로"
    className={`inline-flex items-center gap-1.5 font-bold text-foreground ${className}`}
  >
    <Mark />
    <span className="text-[17px] tracking-tight">AiDay 아이데이</span>
  </Link>
);

export default Logo;
