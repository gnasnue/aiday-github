import { Link } from "react-router-dom";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";

const features = [
  { icon: "🌤️", title: "통합 환경 정보", desc: "날씨, 미세먼지, 꽃가루, 자외선을 한눈에" },
  { icon: "👶", title: "아이 맞춤 AI 리포트", desc: "우리 아이 체질에 맞게 매일 아침 분석" },
  { icon: "👕", title: "시간대별 코디 가이드", desc: "등원부터 저녁 산책까지 시간대별 안내" },
  { icon: "🔔", title: "스마트 알림", desc: "자기 전, 등원 준비 전 맞춤 정보 알림" },
];

const pains = [
  { emoji: "😵‍💫", text: "날씨 앱, 미세먼지 앱, 꽃가루, 자외선 정보… 따로따로 확인하기 너무 번거로워요" },
  { emoji: "🤔", text: "일교차가 심한 날 아이 옷차림을 어떻게 해야 할지 매번 헷갈려요" },
  { emoji: "🤯", text: "바쁜 아침에 이것저것 고민하고 챙길 시간이 없어요" },
  { emoji: "🤒", text: "비염, 아토피, 감기에 잘 걸리는 아이… 민감한 우리 아이 체질에 맞는 세심한 케어 가이드 없을까요?" },
];

const diffs = [
  { icon: "🔄", title: "복잡한 수치를 육아 언어로", desc: "미세먼지·꽃가루·습도 같은 정보를\n바쁜 엄마아빠를 위한 “육아 번역기”처럼\n오늘 어떤 준비가 필요한지 쉽게 알려드려요" },
  { icon: "👶", title: "우리 아이 맞춤 해석", desc: "비염, 아토피, 열 많은 아이… 같은 날씨도 우리 아이 상태에 따라 다른 준비가 필요할 수 있어요" },
  { icon: "⏰", title: "시간대별 준비 가이드", desc: "등원 때는 괜찮아도, 하원 시간엔 추워질 수 있어요. 아이의 하루 일과에 맞춰 시간대별 준비를 미리 알려드려요" },
  { icon: "📲", title: "미리 받아보는 육아 가이드", desc: "앱을 열지 않아도, 아침마다 오늘 필요한 준비를 미리 받아볼 수 있어요" },
];

const reviews = [
  { text: "매일 아침 날씨 앱 3개를 확인했는데, 이제 아이데이 하나로 끝나요.", who: "7세 딸 엄마, 워킹맘" },
  { text: "등원 준비할 때 아침 날씨만 보고 입혔는데, 낮에 땀 흘릴 수 있다고 미리 알려줘서 좋았어요.", who: "6세 아들 엄마" },
  { text: "오후에 바람이 많이 분다고 알려줘서 감기 잘 걸리는 아이 목수건을 챙길 수 있었어요.", who: "5세 아들 엄마, 맞벌이" },
];

const Index = () => {
  return (
    <div className="page-shell">
      <div className="page-frame animate-fade-in">
        {/* Nav */}
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center justify-between">
            <Logo />
            <div className="flex items-center gap-1">
              <Link to="/signup">
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-foreground">로그인</Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" className="h-8 bg-primary px-3 text-xs text-primary-foreground hover:bg-primary-hover shadow-soft">
                  무료 시작
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="bg-secondary">
          <div className="container-mobile py-12 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1 text-xs font-medium text-accent shadow-soft">
              ✨ 바쁜 엄마아빠를 위한 AI 육아 비서
            </span>
            <h1 className="mt-5 text-2xl font-bold leading-tight tracking-tight text-foreground break-keep">
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
              <Link to="/signup" className="w-full">
                <Button size="lg" className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover shadow-glow">
                  무료로 시작하기
                </Button>
              </Link>
              <Link to="/home" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                먼저 둘러볼게요 →
              </Link>
            </div>
          </div>
        </section>

        {/* Pain points */}
        <section className="py-12">
          <div className="container-mobile">
            <h2 className="text-center text-xl font-bold tracking-tight">
              매일 아침 이런 고민<br />하고 계신가요?
            </h2>
            <div className="mt-6 space-y-3">
              {pains.map((p, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-6 shadow-soft text-center flex flex-col items-center">
                  <div className="text-3xl">{p.emoji}</div>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-foreground break-keep">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Differentiators */}
        <section className="bg-soft py-12">
          <div className="container-mobile">
            <h2 className="text-center text-xl font-bold tracking-tight break-keep">
              아이데이는 환경 정보를<br />“우리 아이 기준”으로 해석합니다.
            </h2>
            <div className="mt-6 space-y-3">
              {diffs.map((d) => (
                <div key={d.title} className="rounded-2xl bg-background p-6 shadow-soft text-center flex flex-col items-center">
                  <div className="text-2xl">{d.icon}</div>
                  <h3 className="mt-3 text-base font-semibold break-keep">{d.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground break-keep whitespace-pre-line">{d.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-12">
          <div className="container-mobile">
            <h2 className="text-center text-xl font-bold tracking-tight">
              아이데이가<br />대신 챙겨드릴게요
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {features.map((f) => (
                <div key={f.title} className="rounded-2xl border border-border bg-card p-4 text-center flex flex-col items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-2xl mb-3">{f.icon}</div>
                  <h3 className="text-sm font-semibold leading-snug break-keep">{f.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground break-keep">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Reviews - 정렬 레이아웃 대폭 수정 */}
        <section className="bg-secondary py-12">
          <div className="container-mobile">
            <h2 className="text-center text-xl font-bold tracking-tight">
              부모님들의 이야기
            </h2>
            <div className="mt-6 space-y-4">
              {reviews.map((r, i) => (
                <div key={i} className="rounded-2xl bg-background p-6 shadow-soft flex flex-col">
                  {/* 1. 따옴표 왼쪽 정렬 */}
                  <div className="text-2xl text-primary font-serif self-start mb-1">"</div>
                  
                  {/* 2. 본문 가운데 정렬 + 의미 단위 줄바꿈 */}
                  <p className="text-sm leading-relaxed text-foreground text-center break-keep px-2">
                    {r.text}
                  </p>
                  
                  {/* 3. 작성자 오른쪽 정렬 */}
                  <p className="mt-4 text-xs text-muted-foreground self-end">
                    — {r.who}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-primary">
          <div className="container-mobile py-12 text-center">
            <h2 className="text-xl font-bold tracking-tight text-primary-foreground break-keep">
              오늘부터 아이데이가<br />대신 챙겨드릴게요
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-primary-foreground/90 break-keep">
              매일 아침 바쁜 엄마 아빠 곁에서,<br />
              우리 아이의 하루를 함께 준비합니다.
            </p>
            <Link to="/signup" className="mt-6 block">
              <Button size="lg" className="h-12 w-full bg-background text-base font-semibold text-foreground hover:bg-background/90">
                무료로 시작하기
              </Button>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border bg-background">
          <div className="container-mobile py-8 text-center flex flex-col items-center">
            <Logo />
            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <a href="#" className="hover:text-foreground">이용약관</a>
              <a href="#" className="hover:text-foreground">개인정보처리방침</a>
              <a href="mailto:hello@aiweather.app" className="hover:text-foreground">hello@aiweather.app</a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">© 2025 아이데이. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
