"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Home, Wind, Shirt, Heart, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const navItems: { icon: LucideIcon; label: string; to: string }[] = [
  { icon: Home, label: "홈", to: "/home" },
  { icon: Wind, label: "환경정보", to: "/env" },
  { icon: Shirt, label: "옷차림", to: "/outfit" },
  { icon: Heart, label: "건강팁", to: "/tips" },
  { icon: User, label: "마이", to: "/me" },
];

const allowed = ["/home", "/env", "/outfit", "/tips", "/me"];

const BottomNav = () => {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[390px] -translate-x-1/2 border-t border-border/70 bg-background/92 shadow-[0_-4px_16px_hsl(24_30%_12%_/_0.04)] backdrop-blur-xl safe-bottom"
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
