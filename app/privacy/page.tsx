import Link from "next/link";
import Logo from "@/components/Logo";
import { ChevronLeft } from "lucide-react";

export const metadata = { title: "개인정보처리방침 — 아이데이" };

export default function PrivacyPage() {
  return (
    <div className="page-shell">
      <div className="page-frame">
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center gap-2">
            <Link href="/" className="flex h-11 w-11 items-center justify-center -ml-3 text-muted-foreground hover:text-foreground" aria-label="홈으로">
              <ChevronLeft size={22} strokeWidth={1.75} />
            </Link>
            <Logo />
          </div>
        </header>
        <main className="container-mobile py-12">
          <h1 className="text-[1.375rem] font-bold tracking-tight">개인정보처리방침</h1>
          <div className="mt-4 rounded-2xl bg-card p-5 shadow-soft">
            <p className="text-sm leading-relaxed text-muted-foreground break-keep">
              개인정보처리방침은 정식 서비스 출시와 함께 제공될 예정이에요. 개인정보 처리에
              관해 궁금한 점이 있다면 아래로 문의해 주세요.
            </p>
            <a href="mailto:admin@aiday.app" className="mt-3 inline-block text-sm font-medium text-accent hover:underline underline-offset-4">
              admin@aiday.app
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
