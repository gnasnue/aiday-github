"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { useEffect, useState } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // bfcache/홈스크린(PWA) 복원 잔상 방지 — 앱을 다시 열 때 브라우저가 직전 배포 번들로
  // 렌더된 페이지를 메모리에서 그대로 복원해, 옛 화면(예: 살구색 AI 카드)이 잠깐 보였다
  // 새 번들로 전환되는 문제가 있다. 서비스워커가 없어 코드 수정만으로는 첫 페인트를 못 바꾸므로,
  // 복원(persisted)된 경우엔 최신 번들로 강제 리로드한다. Vercel 배포·iOS 홈스크린 실행 대응.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
        <Toaster />
        <Sonner />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
