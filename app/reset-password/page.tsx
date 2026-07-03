"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

// 비밀번호 재설정 메일 링크 → /auth/callback?next=/reset-password 로 세션 교환 후 진입.
// 세션이 없으면(직접 접근·링크 만료) 재요청 안내를 보여준다.
const ResetPassword = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setHasSession(!!user));
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const pw = (form.elements.namedItem("pw") as HTMLInputElement).value;
    const pw2 = (form.elements.namedItem("pw2") as HTMLInputElement).value;
    if (pw.length < 8) {
      toast.error("비밀번호는 8자 이상이어야 해요.");
      return;
    }
    if (pw !== pw2) {
      toast.error("비밀번호가 일치하지 않아요.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("비밀번호가 변경됐어요.");
    router.push("/home");
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
            <h1 className="text-2xl font-bold tracking-tight">비밀번호 재설정</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              새로 사용할 비밀번호를 입력해주세요
            </p>
          </div>

          {hasSession === false ? (
            <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
              <p className="text-sm text-foreground">
                재설정 링크가 만료됐거나 잘못된 접근이에요.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                로그인 화면에서 재설정 메일을 다시 요청해주세요.
              </p>
              <Link href="/login">
                <Button
                  size="lg"
                  className="mt-5 h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover shadow-soft"
                >
                  로그인 화면으로
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="pw">새 비밀번호</Label>
                <Input id="pw" type="password" placeholder="8자 이상" required className="h-12" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2">새 비밀번호 확인</Label>
                <Input id="pw2" type="password" required className="h-12" />
              </div>
              <Button
                type="submit"
                size="lg"
                disabled={loading || hasSession === null}
                className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover shadow-soft"
              >
                {loading ? "변경 중..." : "비밀번호 변경"}
              </Button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
};

export default ResetPassword;
