"use client";

import Link from "next/link";

/**
 * 브랜드 마크: 떠오르는 해 + 빛살 + 언덕 + 반짝이.
 * 이모지(🌤️) 대신 벡터 마크 사용 — OS별 렌더링 편차 제거, 앱스토어 품질.
 * ⚠️ app/icon.svg(파비콘·PWA·홈 화면 아이콘)와 동일한 패스여야 한다.
 *    한쪽만 바꾸면 탭 파비콘과 인앱 로고가 어긋난다 — 항상 함께 수정할 것.
 */
const Mark = () => (
  // viewBox로 icon.svg의 앱 아이콘용 여백을 잘라내되, y 시작점은 해+언덕의
  // 시각적 무게중심이 박스 세로 중앙에 오도록 잡음 — 텍스트와 수직 정렬 기준 (패스는 동일)
  <svg width="30" height="30" viewBox="17 23 90 90" fill="none" aria-hidden="true">
    <g transform="translate(0 12.5)" fill="none" strokeLinecap="round">
      {/* 빛살 */}
      <g stroke="#EDB94A" strokeWidth="3">
        <line x1="60" y1="33" x2="60" y2="25" />
        <line x1="76.6" y1="38.7" x2="81.5" y2="32.4" />
        <line x1="43.4" y1="38.7" x2="38.5" y2="32.4" />
        <line x1="85.4" y1="50.8" x2="92.9" y2="48" />
        <line x1="34.6" y1="50.8" x2="27.1" y2="48" />
      </g>
      {/* 해 */}
      <path d="M38 60 A22 22 0 0 1 82 60 Z" fill="#EFAA35" />
      {/* 언덕 */}
      <path d="M20 70 Q60 56 100 70" stroke="#7FB4A6" strokeWidth="5" />
      {/* 반짝이 */}
      <path
        d="M98 17 Q100.3 21.7 105 24 Q100.3 26.3 98 31 Q95.7 26.3 91 24 Q95.7 21.7 98 17 Z"
        fill="#6FB0A0"
      />
    </g>
  </svg>
);

const Logo = ({ className = "" }: { className?: string }) => (
  <Link
    href="/"
    aria-label="AiDay 아이데이 홈으로"
    className={`inline-flex items-center gap-2 font-bold text-foreground ${className}`}
  >
    <Mark />
    <span className="text-[17px] tracking-[-0.01em]">AiDay 아이데이</span>
  </Link>
);

export default Logo;
