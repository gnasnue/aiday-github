import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";

const navItems = [
  { icon: "🏠", label: "홈", to: "/home" },
  { icon: "📊", label: "환경정보", to: "/env" },
  { icon: "👕", label: "옷차림", to: "/outfit" },
  { icon: "💊", label: "건강팁", to: "/tips" },
  { icon: "👤", label: "마이", to: "/me" },
];

const allowed = ["/home", "/env", "/outfit", "/tips", "/me"];

const BottomNav = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[390px] -translate-x-1/2 border-t border-border bg-background/95 backdrop-blur-md">
      <div className="container-mobile">
        <ul className="grid grid-cols-5">
          {navItems.map((n) => {
            const isActive = location.pathname === n.to;
            const handleClick = (e: React.MouseEvent) => {
              if (!allowed.includes(n.to)) {
                e.preventDefault();
                toast(`${n.label} 페이지는 준비 중이에요`);
              }
            };
            return (
              <li key={n.label}>
                <Link
                  to={n.to}
                  onClick={handleClick}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-smooth ${
                    isActive
                      ? "font-semibold text-accent"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-lg">{n.icon}</span>
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
