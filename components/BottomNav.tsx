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
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[390px] -translate-x-1/2 border-t border-border bg-background/95 backdrop-blur-md">
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
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-smooth ${
                    isActive
                      ? "font-semibold text-accent"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <n.icon size={22} strokeWidth={1.75} />
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
