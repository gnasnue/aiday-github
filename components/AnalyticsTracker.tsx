"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track, trackSessionStart } from "@/lib/analytics";

// 전역 계측: 탭 세션 시작 1회(session_start) + 라우트 이동마다 page_view.
// Providers에 마운트되어 모든 페이지(로그인 전 포함)를 커버한다. 렌더 출력 없음.
export default function AnalyticsTracker() {
  useEffect(() => {
    trackSessionStart();
  }, []);

  const pathname = usePathname();
  useEffect(() => {
    track("page_view");
  }, [pathname]);

  return null;
}
