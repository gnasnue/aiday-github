"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track, trackSessionStart } from "@/lib/analytics";
import { CONSENT_UPDATED_EVENT } from "@/lib/consent";

// 전역 계측: 탭 세션 시작 1회(session_start) + 라우트 이동마다 page_view.
// Providers에 마운트되어 모든 페이지(로그인 전 포함)를 커버한다. 렌더 출력 없음.
export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackSessionStart();
    const afterConsent = () => {
      trackSessionStart();
      track("page_view");
    };
    window.addEventListener(CONSENT_UPDATED_EVENT, afterConsent);
    return () => window.removeEventListener(CONSENT_UPDATED_EVENT, afterConsent);
  }, []);

  useEffect(() => {
    track("page_view");
  }, [pathname]);

  return null;
}
