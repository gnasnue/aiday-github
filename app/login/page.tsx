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

const Login = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const pw = (form.elements.namedItem("pw") as HTMLInputElement).value;
    if (!email.trim()) {
      toast.error("이메일을 입력해주세요.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });
    if (error) {
      setLoading(false);
      if (error.message === "Email not confirmed") {
        toast.error("이메일 인증이 아직 완료되지 않았어요.", {
          description: "가입 시 받은 메일의 인증 링크를 눌러주세요. 메일이 없다면 재발송할 수 있어요.",
          duration: 8000,
          action: {
            label: "인증 메일 재발송",
            onClick: () => void resendConfirmEmail(),
          },
        });
        return;
      }
      toast.error(
        error.message === "Invalid login credentials"
          ? "이메일 또는 비밀번호가 올바르지 않아요."
          : error.message
      );
      return;
    }
    toast.success("다시 만나서 반가워요!");
    // 홈/온보딩 분기는 인증 후 공통 판단 지점에서 수행
    router.replace("/auth/landing");
  };

  const resendConfirmEmail = async () => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=/auth/landing`,
      },
    });
    if (error) toast.error(error.message);
    else toast.success("인증 메일을 다시 보냈어요. 메일함(스팸함 포함)을 확인해주세요.");
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      toast.error("가입한 이메일을 먼저 입력해주세요.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("비밀번호 재설정 메일을 보냈어요. 메일함을 확인해주세요.");
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=/auth/landing`,
      },
    });
    if (error) toast.error(error.message);
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
            <h1 className="text-2xl font-bold tracking-tight">로그인</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              다시 만나서 반가워요. 오늘의 리포트가 기다리고 있어요
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="parent@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="pw">비밀번호</Label>
                <button
                  type="button"
                  onClick={resetPassword}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  비밀번호를 잊으셨나요?
                </button>
              </div>
              <Input id="pw" type="password" required className="h-12" />
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover shadow-soft"
            >
              {loading ? "로그인 중..." : "로그인"}
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
              계정이 없으신가요?{" "}
              <Link href="/signup" className="font-medium text-accent underline-offset-4 hover:underline">
                회원가입
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

export default Login;
