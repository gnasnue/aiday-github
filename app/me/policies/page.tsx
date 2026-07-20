"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, ShieldCheck, ChevronRight, Mail } from "lucide-react";

/**
 * 약관 및 정책 — 서비스에 적용되는 법적 문서로 가는 허브.
 *
 * 개인정보처리방침은 서비스 내에서 쉽게 접근할 수 있어야 하므로(개인정보보호법
 * 공개 의무) 마이페이지 계정 메뉴에서 이 페이지를 거쳐 상시 열람 가능하게 한다.
 * 문서 자체는 /terms·/privacy가 단일 진실 — 여기서는 링크와 시행 버전만 안내한다.
 */

const docs = [
  {
    Icon: FileText,
    name: "이용약관",
    detail: "2026년 7월 20일 시행 · 베타 v2",
    href: "/terms",
  },
  {
    Icon: ShieldCheck,
    name: "개인정보처리방침",
    detail: "2026년 7월 20일 시행 · 베타 v3",
    href: "/privacy",
  },
] as const;

const Policies = () => {
  const router = useRouter();

  return (
    <div className="page-shell">
      <div className="page-frame pb-8 animate-fade-in">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center gap-2">
            <button
              onClick={() => router.back()}
              className="-ml-2 rounded-full p-2 text-foreground hover:bg-muted"
              aria-label="뒤로가기"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base font-bold tracking-tight">약관 및 정책</h1>
          </div>
        </header>

        <main className="container-mobile flex flex-col gap-6 py-5">
          <p className="text-sm leading-[1.6] text-muted-foreground break-keep">
            아이데이 베타 서비스에 적용되는 문서예요. 가입 시 동의한 내용은 언제든 여기서
            다시 확인할 수 있어요.
          </p>

          <div className="divide-y divide-border rounded-2xl bg-card px-4 shadow-soft">
            {docs.map((d) => (
              <Link key={d.href} href={d.href} className="flex items-center gap-3 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <d.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-snug text-foreground">
                    {d.name}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-[1.5] text-muted-foreground">
                    {d.detail}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
              </Link>
            ))}
          </div>

          <p className="flex items-start gap-1.5 text-[13px] leading-[1.5] text-faint break-keep">
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span>
              개인정보 열람·정정·삭제나 동의 철회는{" "}
              <a href="mailto:admin.aiday@gmail.com" className="underline underline-offset-2">
                admin.aiday@gmail.com
              </a>
              으로 요청할 수 있어요.
            </span>
          </p>
        </main>
      </div>
    </div>
  );
};

export default Policies;
