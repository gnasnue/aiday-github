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
  PROFILES_KEY,
  fetchProfilesFromDb,
  realLocalProfiles,
  uploadLocalProfilesToDb,
} from "@/lib/profile";
import { syncLocalConsentsToDb } from "@/lib/consent";

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

      // 건강 정보 활용 동의는 별도 게이트 화면 없이 맥락 안에서만 받는다 —
      // 신규 입력은 온보딩 2단계 인라인, 기존 프로필 수정은 마이 편집 화면.
      // (2026-07-20 결정: 가입 직후 전체 화면 동의 게이트는 지인 베타 이탈 요소라 제거)

      // 가입 시 확인한 약관 등 현재까지의 동의 이력을 계정에 동기화한다.
      // 홈 표시는 이 동기화 결과에 의존하지 않는 백그라운드 이력 기록이므로 await하지 않는다 —
      // 예전엔 이 Supabase 왕복이 프로필 조회 왕복 뒤에 직렬로 쌓여 랜딩 스피너를 그만큼 길게
      // 잡았다. 클라이언트 네비(router.replace)라 문서가 유지돼 non-await 프로미스도 완주한다.
      void syncLocalConsentsToDb("auth_sync").catch(() => {});

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
