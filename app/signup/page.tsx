"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import ConsentFields from "@/components/ConsentFields";
import {
  emptyConsentSelection,
  hasSignupConsent,
  saveLocalConsentSelection,
  syncLocalConsentsToDb,
  withBundledBetaAnalytics,
} from "@/lib/consent";

const Signup = () => {
  const router = useRouter();
  const [consents, setConsents] = useState(emptyConsentSelection);
  const [loading, setLoading] = useState(false);

  const validateAndSaveConsents = () => {
    if (!hasSignupConsent(consents)) {
      toast.error("이용약관을 확인해주세요.");
      return false;
    }
    saveLocalConsentSelection(withBundledBetaAnalytics(consents));
    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateAndSaveConsents()) return;
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const pw = (form.elements.namedItem("pw") as HTMLInputElement).value;
    const pw2 = (form.elements.namedItem("pw2") as HTMLInputElement).value;
    if (pw !== pw2) {
      toast.error("비밀번호가 일치하지 않아요.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: {
        // 인증 메일 링크가 Supabase Site URL이 아니라 현재 도메인의 콜백으로 돌아오도록 지정
        emailRedirectTo: `${location.origin}/auth/callback?next=/auth/landing`,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // 세션이 바로 생기면(이메일 인증 꺼짐) 공통 판단 지점에서 분기 —
    // 게스트 시절 프로필이 있으면 DB 이전 후 홈, 없으면 온보딩.
    // 세션이 없으면(이메일 인증 대기) 게스트 모드로 온보딩 진행, 첫 로그인 때 DB 이전.
    // 지표 1(온보딩 완료율)의 분모. Google OAuth 가입은 콜백에서 가입/로그인이 구분되지
    // 않아 여기선 이메일 가입만 집계한다 — 베타 퍼널 분석 시 유의.
    track("signup_completed", { method: "email" });
    if (data.session) {
      await syncLocalConsentsToDb("signup");
      toast.success("가입이 완료되었어요!");
    } else {
      toast.success("가입이 완료되었어요! 인증 메일을 보냈어요.", {
        description: "로그인하려면 메일함(스팸함 포함)에서 인증 링크를 눌러주세요.",
        duration: 8000,
      });
    }
    router.replace(data.session ? "/auth/landing" : "/onboarding");
  };

  const signInWithGoogle = async () => {
    if (!validateAndSaveConsents()) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=/auth/landing`,
      },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-frame animate-fade-in">
        <header className="border-b border-border/60">
          <div className="container-mobile flex h-14 items-center justify-between">
            <Logo />
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">홈으로</Link>
          </div>
        </header>

        <main className="container-mobile py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">회원가입</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              우리 아이 맞춤 환경 리포트를 시작해보세요
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" type="email" placeholder="parent@example.com" required className="h-12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">비밀번호</Label>
              <Input id="pw" type="password" placeholder="8자 이상" required className="h-12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">비밀번호 확인</Label>
              <Input id="pw2" type="password" required className="h-12" />
            </div>

            <ConsentFields value={consents} onChange={setConsents} context="signup" />

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover shadow-soft"
            >
              {loading ? "처리 중..." : "가입하기"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">또는</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white text-sm font-medium text-[#1F1F1F] transition-smooth hover:bg-gray-50 active:bg-gray-100"
            style={{ fontFamily: "'Roboto', sans-serif" }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
            </svg>
            Google 계정으로 계속
          </button>

          <div className="mt-6 space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              이미 계정이 있으신가요?{" "}
              <Link href="/login" className="font-medium text-accent underline-offset-4 hover:underline">
                로그인
              </Link>
            </p>
            <Link href="/home" className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              먼저 둘러볼게요 →
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Signup;
