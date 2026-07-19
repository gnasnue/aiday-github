"use client";

// 인증 후 공통 판단 지점.
// 이메일 로그인·가입, 구글 OAuth(로그인/가입 페이지 공용) 모두 인증 성공 후 이곳을 거친다.
// 도착지는 진입 경로가 아니라 사용자 상태로 결정한다:
//   비로그인 → /login · DB 프로필 있음 → /home · 없음 → /onboarding
// 게스트 시절 만든 로컬 프로필이 있으면 첫 진입 시 DB로 이전한다 (PRODUCT-DECISIONS §3).

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { toast } from "sonner";
import {
  type ChildProfile,
  PROFILES_KEY,
  fetchProfilesFromDb,
  realLocalProfiles,
  uploadLocalProfilesToDb,
} from "@/lib/profile";
import {
  hasAllRequiredConsents,
  readLocalConsentSelection,
  syncLocalConsentsToDb,
} from "@/lib/consent";

const hasHealthDetails = (profile: ChildProfile) =>
  (profile.conditions?.some((item) => item !== "해당없음") ?? false) ||
  Boolean(profile.conditionEtc || profile.cold || profile.hot || profile.sweat);

const AuthLanding = () => {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // React Strict Mode 이중 실행 → 중복 업로드 방지
    ran.current = true;

    // 홈 지연 계측용 — landing 마운트 시각을 기록해 home에서 "landing(프로필 조회 포함)→env_start"
    // 구간을 남긴다. (로그인 인증 자체의 왕복 시간은 login 페이지에서 발생하므로 포함되지 않음)
    try {
      if (typeof performance !== "undefined") {
        sessionStorage.setItem("aiday:perf:navToHome", String(performance.now()));
      }
    } catch {}

    const route = async () => {
      let res = await fetchProfilesFromDb();

      if (res.status === "no-auth") {
        router.replace("/login");
        return;
      }
      if (res.status === "error") {
        // 빈 계정으로 오판해 온보딩으로 보내지 않는다 — 홈은 로컬 fallback이 있음
        toast.error("프로필을 불러오지 못했어요. 네트워크 확인 후 다시 시도해주세요.");
        router.replace("/home");
        return;
      }

      // 이미 건강 관련 정보가 있는 기존·로컬 프로필만 보호자 확인을 먼저 받는다.
      // 신규 사용자는 기본정보부터 입력하고, 건강정보 입력 직전에 맥락 안에서 확인한다.
      const localProfiles = realLocalProfiles();
      const hasStoredHealthDetails = [...res.list, ...localProfiles].some(hasHealthDetails);
      if (hasStoredHealthDetails && !hasAllRequiredConsents(readLocalConsentSelection())) {
        router.replace("/onboarding?consentOnly=1");
        return;
      }

      // 가입 시 확인한 약관 등 현재까지의 동의 이력을 계정에 동기화한다.
      await syncLocalConsentsToDb("auth_sync");

      // DB가 비어 있고 게스트 시절 만든 로컬 프로필이 있으면 DB로 이전 후 재조회
      if (!res.list.length && realLocalProfiles().length) {
        const uploaded = await uploadLocalProfilesToDb();
        if (uploaded > 0) {
          const again = await fetchProfilesFromDb();
          if (again.status === "ok") res = again;
          toast.success("이 기기에서 만든 아이 프로필을 계정에 저장했어요.");
        }
      }

      if (res.list.length) {
        // DB 기준으로 로컬 복원 (다른 기기·재로그인 대응)
        try {
          localStorage.setItem(PROFILES_KEY, JSON.stringify(res.list));
          const activeKey = "aiweather:activeProfileId";
          const active = localStorage.getItem(activeKey);
          if (!res.list.some((p) => p.id === active)) {
            localStorage.setItem(activeKey, res.list[0].id);
          }
        } catch {}
        // 계측이 활성(aiday:perf)이면 ?perf=1을 전달해 재로그인 시에도 계측이 유지되게 한다.
        let dest = "/home";
        try {
          if (localStorage.getItem("aiday:perf") === "1") dest = "/home?perf=1";
        } catch {}
        router.replace(dest);
      } else {
        router.replace("/onboarding");
      }
    };

    route();
  }, [router]);

  return (
    <div className="page-shell">
      <div className="page-frame flex flex-col items-center justify-center bg-background px-5">
        <Logo />
        <div className="mt-6 h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <p className="mt-4 text-sm text-muted-foreground">
          계정 정보를 확인하고 있어요...
        </p>
      </div>
    </div>
  );
};

export default AuthLanding;
