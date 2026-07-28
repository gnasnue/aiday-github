"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Home, Wind, Shirt, CalendarCheck2, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// 4번째 탭: 건강팁(/tips) → 하루(/day) 교체 (2026-07-28).
// 건강팁은 독립 과업이 아니라 환경에서 파생된 설명형 콘텐츠라 홈 하단 "오늘의 건강 팁"
// 섹션으로 흡수했고, /tips 페이지는 그 섹션에서 진입하는 전체 가이드로 존치한다.
// 비워진 자리는 아침 판단의 결과가 쌓이는 "하루"가 가져간다 — 제품의 학습 루프가
// 네비게이션 구조로 드러나야 하기 때문(홈=판단 / 하루=결과와 개인화).
const navItems: { icon: LucideIcon; label: string; to: string }[] = [
  { icon: Home, label: "홈", to: "/home" },
  { icon: Wind, label: "환경정보", to: "/env" },
  { icon: Shirt, label: "옷차림", to: "/outfit" },
  { icon: CalendarCheck2, label: "하루", to: "/day" },
  { icon: User, label: "마이", to: "/me" },
];

const allowed = ["/home", "/env", "/outfit", "/day", "/me"];

const BottomNav = () => {
  const pathname = usePathname();

  return (
    // 모바일에서 하단 네비가 스크롤을 따라 흐르던 문제 — 원인 두 개 중 하나를 여기서 없앤다.
    // `backdrop-filter`를 쓴 `position: fixed` 요소는 iOS Safari가 스크롤 중 backdrop을
    // 다시 래스터화하면서 고정 레이어가 콘텐츠를 따라 밀린다. 배경을 불투명으로 바꾸면
    // 합성이 한 겹으로 끝나 흐르지 않고, 반투명 위 텍스트보다 가독성도 좋아진다.
    // (같은 화면의 sticky 헤더들은 fixed가 아니라 이 문제가 없어 blur를 유지한다)
    // 나머지 원인인 100vh 기준선은 globals.css의 dvh 전환으로 처리했다.
    <nav
      aria-label="주요 메뉴"
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[390px] -translate-x-1/2 border-t border-border bg-background shadow-[0_-4px_16px_hsl(24_30%_12%_/_0.04)] safe-bottom"
    >
      <div className="container-mobile">
        <ul className="grid grid-cols-5">
          {navItems.map((n) => {
            const isActive = pathname === n.to;
            const handleClick = (e: React.MouseEvent) => {
              if (!allowed.includes(n.to)) {
                e.preventDefault();
                toast(`${n.label} 페이지는 준비 중이에요`);
              }
            };
            return (
              <li key={n.label}>
                <Link
                  href={n.to}
                  onClick={handleClick}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] transition-smooth ${
                    isActive
                      ? "font-semibold text-foreground"
                      : "font-medium text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {/* 활성 탭: 아이콘 뒤 크림 필 — 색이 아닌 형태로도 활성 상태 전달 (색약 접근성) */}
                  <span
                    className={`flex h-8 w-14 items-center justify-center rounded-full transition-smooth ${
                      isActive ? "bg-secondary" : "bg-transparent group-active:bg-muted"
                    }`}
                  >
                    <n.icon
                      size={21}
                      strokeWidth={isActive ? 2.2 : 1.75}
                      className={isActive ? "text-accent" : undefined}
                    />
                  </span>
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
};

export default BottomNav;
