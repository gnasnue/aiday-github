"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import AnalyticsTracker from "@/components/AnalyticsTracker";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  // 배포 버전 불일치로 강제 리로드하는 동안 옛 프레임을 가리는 오버레이 노출 여부
  const [reloading, setReloading] = useState(false);

  // bfcache/홈스크린(PWA) 복원 잔상 방지 — 앱을 다시 열 때 브라우저가 직전 배포 번들로
  // 렌더된 페이지를 메모리에서 그대로 복원해, 옛 화면(예: 살구색 AI 카드)이 잠깐 보였다
  // 새 번들로 전환되는 문제가 있다. 서비스워커가 없어 코드 수정만으로는 첫 페인트를 못 바꾼다.
  //
  // 예전엔 복원(persisted)될 때마다 무조건 리로드했으나, 그 경우 같은 번들에도 매 복귀마다
  // 리로드가 걸리고(잔상 + 강제 새로고침) 첫 페인트에 옛 프레임이 그대로 노출됐다. 이제는
  // 최신 배포 버전(/api/version)과 이 번들의 빌드 ID를 비교해 "실제로 배포가 바뀐 경우에만"
  // 리로드하고, 리로드 직전 오버레이로 옛 프레임을 가린다. 같은 버전이면 아무 것도 하지 않는다.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return; // 신규 로드는 항상 최신 번들이라 대상 아님
      const mine = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
      fetch("/api/version", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (d?.id && d.id !== mine) {
            setReloading(true); // 옛 프레임을 가린 뒤 최신 번들로 교체
            window.location.reload();
          }
        })
        .catch(() => {}); // 조회 실패 시 리로드하지 않음(정상 화면 유지)
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AnalyticsTracker />
        {children}
        <Toaster />
        <Sonner />
        {reloading && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
}
