import { Link } from "react-router-dom";

const Logo = ({ className = "" }: { className?: string }) => (
  <Link to="/" className={`inline-flex items-center gap-1.5 font-bold text-foreground ${className}`}>
    <span className="text-xl">🌤️</span>
    <span className="text-lg tracking-tight">아이데이</span>
  </Link>
);

export default Logo;
