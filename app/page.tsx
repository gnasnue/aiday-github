import Link from "next/link";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const pains = [
  "날씨 앱, 미세먼지 앱, 꽃가루에 자외선 정보까지… 앱마다 따로 확인하고 해석하기 번거로워요.",
  "일교차가 심한 날엔 아이 옷을 어떻게 입혀 보내야 할지 매번 헷갈려요. 누가 좀 정해줬으면 좋겠어요.",
  "등원 준비에 출근 준비까지… 워킹맘이 제일 정신없는 아침엔 이것저것 고민하고 챙길 여유가 없어요.",
  "비염, 아토피, 감기에 잘 걸리는 아이… 민감한 우리 아이에 딱 맞는 세심한 육아 가이드 어디 없을까요?",
];

const diffs: { title: string; desc: string }[] = [
  { title: "복잡한 수치를 육아 언어로", desc: "미세먼지·꽃가루·습도 같은 복잡한 환경 정보들을 바쁜 엄마아빠를 위한 '육아 번역기'처럼, 우리 아이에게 오늘 어떤 준비가 필요한지 한눈에 쉽게 알려드려요." },
  { title: "우리 아이 맞춤형 육아 가이드", desc: "비염, 꽃가루 알러지, 땀 많은 아이… 똑같은 날씨에도 우리 아이의 건강 상태와 체질, 생활 패턴에 따라 꼭 필요한 케어와 준비는 다를 수 있어요." },
  { title: "시간대별 준비 가이드", desc: "등원 때는 괜찮아도, 하원 시간엔 쌀쌀해질 수 있어요. 우리 아이의 하루 일과에 맞춰 시간대별로 준비해야 할 것들을 놓치지 않게 미리 알려드려요." },
  { title: "미리 받아보는 육아 가이드", desc: "생활 패턴과 사용자 선택에 따라 전날 밤 · 아침 준비 전, 굳이 앱을 열지 않아도 오늘 꼭 필요한 데일리 육아 가이드를 미리 받아볼 수 있어요." },
];

const reviews = [
  { text: "우리 아이 체질 기준으로 알려주니까 오늘 아침 뭘 준비해야 할지 판단이 훨씬 쉬워졌어요.", who: "6세 아들 엄마 · 비염 아이" },
  { text: "아침에 얇게 입혀 보냈다가 하원 때 추워했던 적이 많았는데, 이제 겉옷 챙기는 걸 놓치지 않게 됐어요.", who: "7세 딸 엄마 · 열 많은 아이" },
  { text: "등원 준비만으로도 정신없는데, 오늘 뭘 챙겨야 하는지 아침마다 먼저 정리돼 있으니 마음이 훨씬 편해요.", who: "5세 아들 엄마 · 맞벌이" },
];

export default function IndexPage() {
  return (
    <div className="page-shell">
      <div className="page-frame animate-fade-in">
        {/* Nav */}
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center justify-between">
            <Logo />
            <div className="flex items-center gap-1">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="h-11 px-3 text-xs text-foreground">로그인</Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="bg-secondary">
          <div className="container-mobile py-12 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1 text-xs font-medium text-accent shadow-soft">
              <Sparkles size={13} strokeWidth={2} />
              바쁜 엄마아빠를 위한 AI 육아 비서
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-foreground break-keep">
              오늘 우리 아이,<br />뭘 입히고 뭘 챙겨야 할지<br />
              <span className="text-accent">AI가 먼저 알려드려요</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground break-keep">
              미세먼지, 꽃가루, 자외선, 일교차까지.<br />
              오늘 날씨와 우리 아이 체질을 함께 분석해서,<br />
              등원룩·마스크·겉옷·준비물까지<br />
              더 쉽게 결정할 수 있게 도와드려요.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3">
              <Link href="/signup" className="w-full">
                <Button size="lg" className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover shadow-soft">
                  무료로 시작하기
                </Button>
              </Link>
              <Link href="/home" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                먼저 둘러볼게요 →
              </Link>
            </div>
          </div>
        </section>

        {/* Pain points */}
        <section className="py-12">
          <div className="container-mobile">
            <p className="eyebrow normal-case tracking-[0.06em] text-center">매일 아침</p>
            <h2 className="mt-2 text-center text-[1.375rem] font-bold leading-snug tracking-tight break-keep">
              이런 고민 하고 계신가요?
            </h2>
            <div className="mt-6 space-y-3">
              {pains.map((p, i) => (
                <div key={i} className="rounded-2xl border border-border/60 bg-card p-5 shadow-soft">
                  <p className="text-sm font-medium leading-relaxed text-foreground break-keep">{p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Differentiators */}
        <section className="bg-soft py-12">
          <div className="container-mobile">
            <p className="eyebrow normal-case tracking-[0.06em] text-center">아이데이의 방식</p>
            <h2 className="mt-2 text-center text-[1.375rem] font-bold leading-snug tracking-tight break-keep">
              환경 정보를<br />&ldquo;우리 아이 기준&rdquo;으로 해석합니다
            </h2>
            <div className="mt-6 space-y-3">
              {diffs.map((d, i) => (
                <div key={d.title} className="rounded-2xl border border-border/60 bg-card p-5 shadow-soft">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-xs font-bold tabular-nums text-accent">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="text-base font-semibold break-keep">{d.title}</h3>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground break-keep">{d.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Reviews */}
        <section className="py-12">
          <div className="container-mobile">
            <p className="eyebrow normal-case tracking-[0.06em] text-center">사용 후기</p>
            <h2 className="mt-2 text-center text-[1.375rem] font-bold leading-snug tracking-tight">
              부모님들의 이야기
            </h2>
            <div className="mt-6 space-y-4">
              {reviews.map((r, i) => (
                <div key={i} className="rounded-2xl border border-border/60 bg-card p-5 shadow-soft">
                  <p className="text-sm leading-relaxed text-foreground break-keep">
                    {r.text}
                  </p>
                  <p className="mt-3 text-right text-xs text-muted-foreground">
                    - {r.who}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-secondary py-12">
          <div className="container-mobile text-center">
            <h2 className="text-[1.375rem] font-bold leading-snug tracking-tight break-keep">
              매일 아침 육아의 시작,<br />첫 판단은 아이데이에게 맡겨보세요
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground break-keep">
              아이 프로필 입력 후, 매일 가이드를 받아볼 수 있어요.
            </p>
            <div className="mt-6">
              <Link href="/signup" className="block">
                <Button size="lg" className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover shadow-soft">
                  무료로 시작하기
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border bg-background">
          <div className="container-mobile py-8 text-center flex flex-col items-center">
            <Logo />
            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <Link href="/terms" className="hover:text-foreground">이용약관</Link>
              <Link href="/privacy" className="hover:text-foreground">개인정보처리방침</Link>
              <a href="mailto:admin@aiday.app" className="hover:text-foreground">admin@aiday.app</a>
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground/70">
              환경 데이터 출처: 기상청 단기예보 · 한국환경공단 에어코리아
            </p>
            <p className="mt-2 text-xs text-muted-foreground">© 2026 아이데이. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
