"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation"; ;
import { Bell, Settings, MapPin, ChevronDown, Check } from "lucide-react";
import Logo from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import CharacterReport from "@/components/CharacterReport";
import { withSubjectSuffix } from "@/lib/korean";
import { ChildProfile, loadProfiles, syncProfilesFromDb } from "@/lib/profile";
import { buildRecommendation } from "@/lib/recommendation-engine";
import { mockWeather } from "@/lib/weather-mock";
import type { WeatherData } from "@/lib/weather-api";

const items = [
  { emoji: "🧣", name: "유아 면 목수건", price: "9,900원" },
  { emoji: "😷", name: "키즈 KF94 마스크", price: "12,500원" },
  { emoji: "🧴", name: "민감 피부 보습로션", price: "18,000원" },
  { emoji: "🧥", name: "얇은 가디건", price: "29,900원" },
];

const toneStyle = (t: "ok" | "warn") =>
  t === "warn" ? "chip-warn" : "bg-background text-muted-foreground border-border";

const renderRich = (text: string) => {
  // 줄바꿈(\n)을 기준으로 문단 분리 후, 각 문단 내에서 **bold**/__accent__ 처리
  const lines = text.split(/\n/);
  return lines.map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
    const rendered = parts.map((p, i) => {
      if (/^__[^_]+__$/.test(p)) {
        return (
          <b key={i} className="font-bold text-accent">
            {p.slice(2, -2)}
          </b>
        );
      }
      if (/^\*\*[^*]+\*\*$/.test(p)) {
        return (
          <b key={i} className="font-semibold text-foreground">
            {p.slice(2, -2)}
          </b>
        );
      }
      return <span key={i}>{p}</span>;
    });
    return (
      <span key={li}>
        {rendered}
        {li < lines.length - 1 && <br />}
      </span>
    );
  });
};


const Home = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [profiles, setProfiles] = useState<ChildProfile[]>(() => loadProfiles());
  const [active, setActive] = useState<string>(() => {
    try {
      return localStorage.getItem("aiweather:activeProfileId") || loadProfiles()[0].id;
    } catch {
      return loadProfiles()[0].id;
    }
  });
  const [checked, setChecked] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [weatherData, setWeatherData] = useState<WeatherData>(mockWeather);
  const [aiHook, setAiHook] = useState<string>("");
  const [aiMessage, setAiMessage] = useState<string>("");
  const [aiChecklist, setAiChecklist] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const weatherRawRef = useRef<object | null>(null);
  const airRawRef = useRef<object | null>(null);

  // Refresh profiles when returning from onboarding
  useEffect(() => {
    const list = loadProfiles();
    setProfiles(list);
    if (!list.find((p) => p.id === active)) {
      setActive(list[0].id);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // 로그인 상태면 DB 프로필을 localStorage로 복원 (다른 기기·재로그인 대응)
  useEffect(() => {
    syncProfilesFromDb().then((list) => {
      if (!list) return;
      setProfiles(list);
      setActive((prev) => (list.find((p) => p.id === prev) ? prev : list[0].id));
    });
  }, []);

  // Persist active profile
  useEffect(() => {
    try { localStorage.setItem("aiweather:activeProfileId", active); } catch {}
  }, [active]);

  // 실제 날씨 + 대기질 데이터 로드
  useEffect(() => {
    const fetchEnv = async () => {
      setLoading(true);
      try {
        const [weatherRes, airRes] = await Promise.allSettled([
          fetch("/api/weather?lat=37.5665&lon=126.9780").then((r) => r.json()),
          fetch("/api/air?station=%EC%A2%85%EB%A1%9C%EA%B5%AC").then((r) => r.json()),
        ]);

        const w = weatherRes.status === "fulfilled" ? weatherRes.value : null;
        const a = airRes.status === "fulfilled" ? airRes.value : null;

        // Cache raw API responses for use in fetchReport (T4: avoid duplicate fetch)
        weatherRawRef.current = w;
        airRawRef.current = a;

        if (w && !w.error) {
          const dustGrade = a?.pm10Grade ?? 1;
          const dustLabel = (["좋음", "보통", "나쁨", "매우나쁨"] as const)[dustGrade - 1] ?? "보통";
          const windLabel = w.windSpeed >= 9 ? "강함" : w.windSpeed >= 4 ? "보통" : "약함";
          setWeatherData({
            ...mockWeather,
            temp: w.temperature ?? mockWeather.temp,
            humidity: w.humidity ?? mockWeather.humidity,
            dustLevel: dustLabel,
            windSpeed: windLabel,
          });
          setAiLoading(true);
          setAiHook("");
          setAiMessage("");
          setAiError(false);
        }
        setLoading(false);
      } catch {
        setLoading(false);
      }
    };
    fetchEnv();
  }, []);

  const cur = profiles.find((p) => p.id === active) ?? profiles[0];

  const REPORT_CACHE_TTL = 5 * 60 * 1000;

  // Claude AI 리포트 (T5: 5분 localStorage 캐시)
  useEffect(() => {
    if (!aiLoading || !cur) return;

    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `aiday:report:v6:${cur.id}:${today}`;

    const fetchReport = async () => {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
        if (cached && Date.now() - cached.ts < REPORT_CACHE_TTL && cached.message && Array.isArray(cached.checklist)) {
          setAiHook(cached.hook ?? "");
          setAiMessage(cached.message);
          if (cached.checklist.length > 0) setAiChecklist(cached.checklist);
          setAiLoading(false);
          return;
        }

        // T4: use cached weather/air from fetchEnv instead of re-fetching
        const w = weatherRawRef.current ?? {};
        const a = airRawRef.current as { error?: string; pm10Grade?: number } | null;

        const res = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            child: {
              name: cur.name,
              age: cur.age,
              gender: cur.gender,
              conditions: cur.conditions,
              conditionEtc: cur.conditionEtc,
              cold: cur.cold,
              hot: cur.hot,
              sweat: cur.sweat,
              schedule: cur.schedule,
            },
            weather: w,
            air: a?.error ? null : a,
          }),
        });

        if (!res.ok) {
          setAiError(true);
          toast("AI 리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
          setAiLoading(false);
          return;
        }

        const data = await res.json();
        if (data.message) {
          setAiHook(data.hook ?? "");
          setAiMessage(data.message);
          if (Array.isArray(data.checklist) && data.checklist.length > 0) {
            setAiChecklist(data.checklist);
          }
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ hook: data.hook ?? "", message: data.message, checklist: data.checklist ?? [], ts: Date.now() }));
          } catch {}
        }
      } catch (err) {
        console.error("[AI report]", err);
        setAiError(true);
        toast("AI 리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
      } finally {
        setAiLoading(false);
      }
    };

    fetchReport();
  }, [aiLoading, cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 프로필 변경 시 AI 리포트 재요청
  useEffect(() => {
    if (!loading) {
      setAiLoading(true);
      setAiHook("");
      setAiError(false);
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const recommendation = useMemo(
    () => buildRecommendation(cur, weatherData),
    [cur, weatherData]
  );
  const { checklist: baseChecklist, message: fallbackMessage, badges } = recommendation;

  const message = aiMessage || fallbackMessage;

  // AI 체크리스트가 있으면 사용, 없으면 recommendation engine fallback
  const activeChecklist: { icon: string; text: string; key: string }[] = useMemo(() => {
    if (aiChecklist.length > 0) {
      return aiChecklist.map((item, i) => {
        // "☂️ 우산" 형태 파싱
        const match = item.match(/^(\p{Emoji_Presentation}|\p{Emoji}️|[\u{1F300}-\u{1FFFF}]|\S+)\s+(.+)$/u);
        if (match) return { icon: match[1], text: match[2], key: `ai-${i}` };
        return { icon: "✅", text: item, key: `ai-${i}` };
      });
    }
    return baseChecklist;
  }, [aiChecklist, baseChecklist]);

  const allDone = checked.length === activeChecklist.length;

  // 오늘의 판단 상태 — 배지 tone에서 도출 (기능 변경 없음, 표현만)
  const hasWarn = badges.some((b) => b.tone === "warn");

  // Reset checklist when profile changes
  useEffect(() => setChecked([]), [active]);

  const toggle = (i: number) =>
    setChecked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
        {/* Top nav */}
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center justify-between">
            <Logo />
            <div className="flex items-center gap-1">
              <button
                onClick={() => toast("새 알림이 없어요")}
                className="relative rounded-full p-3 text-foreground hover:bg-muted"
                aria-label="알림"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
              </button>
              <button
                onClick={() => toast("설정 페이지는 준비 중이에요")}
                className="rounded-full p-3 text-foreground hover:bg-muted"
                aria-label="설정"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="container-mobile pt-5">
          {/* Profile tabs */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setActive(p.id)}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-smooth ${
                  active === p.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/40"
                }`}
              >
                <span>{p.emoji}</span>
                <span className="font-medium">{p.name}</span>
                <span className={`text-xs ${active === p.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{p.age}</span>
              </button>
            ))}
            <button
              onClick={() => router.push("/onboarding")}
              className="flex min-h-11 shrink-0 items-center rounded-full border border-dashed border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
            >
              + 추가
            </button>
          </div>

          {/* Location */}
          <button
            onClick={() => toast("위치 변경은 준비 중이에요")}
            className="mt-4 flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>서울 강남구</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          {/* AI message card */}
          {loading ? (
            <section className="mt-4 rounded-2xl bg-secondary p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-16 rounded-full" />
                ))}
              </div>
              <Skeleton className="mt-4 h-32 w-full rounded-xl" />
            </section>
          ) : (
            <section className="mt-4 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft animate-fade-up">
              {/* 카드 헤더 */}
              <div className="bg-secondary px-5 pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-accent">AI Report</span>
                  <div className="flex items-center gap-2">
                    {aiError && (
                      <span className="text-[10px] text-muted-foreground/60">기본 추천</span>
                    )}
                    <span className="text-[11px] tabular text-muted-foreground">
                      {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
                    </span>
                  </div>
                </div>

                {/* 상태 필 — 5초 안에 파악되는 오늘의 결론 */}
                {!aiLoading && (
                  <span
                    className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                      hasWarn ? "chip-warn" : "chip-good"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                    {hasWarn ? "오늘은 주의가 필요해요" : "오늘은 무난한 하루예요"}
                  </span>
                )}

                {/* AI 로딩 중: hook + message 영역 skeleton */}
                {aiLoading ? (
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-5 w-3/4 rounded-full" />
                    <div className="mt-3 space-y-1.5">
                      <Skeleton className="h-3.5 w-full rounded-full" />
                      <Skeleton className="h-3.5 w-5/6 rounded-full" />
                      <Skeleton className="h-3.5 w-4/6 rounded-full" />
                    </div>
                  </div>
                ) : (
                  <>
                    {/* hook — 화면 전체의 히어로. 이 한 문장이 아침의 결론 */}
                    {aiHook && (
                      <h1 className="mt-3 text-[19px] font-bold leading-[1.4] tracking-[-0.01em] text-foreground break-keep">
                        {aiHook}
                      </h1>
                    )}
                    {/* message — 상세 설명 */}
                    <div className={aiHook ? "mt-2 space-y-1.5" : "mt-3 space-y-2"}>
                      {message.split("\n").filter(Boolean).map((line, i) => (
                        <p key={i} className="text-[14px] leading-[1.7] text-foreground/80 break-keep">
                          {renderRich(line)}
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="px-5 pb-5">
              <div className="mt-4 flex flex-wrap gap-1.5">
                {badges.map((b) => (
                  <span
                    key={b.label}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium tabular ${toneStyle(b.tone)}`}
                  >
                    {b.label} · {b.value}
                  </span>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-soft p-4">
                <div className="flex items-center justify-between px-1">
                  <p className="eyebrow normal-case tracking-[0.06em]">오늘 챙길 것</p>
                  {allDone ? (
                    <p className="text-xs font-semibold text-status-good animate-fade-in">준비 끝 ✓</p>
                  ) : (
                    <p className="text-xs font-semibold tabular text-muted-foreground">
                      {checked.length}
                      <span className="text-muted-foreground/50"> / {activeChecklist.length}</span>
                    </p>
                  )}
                </div>
                <ul className="mt-1 divide-y divide-border/40">
                  {activeChecklist.map((c, i) => {
                    const on = checked.includes(i);
                    return (
                      <li key={i}>
                        <button
                          onClick={() => toggle(i)}
                          className="flex w-full items-center gap-3 px-1 py-2.5 text-left"
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-smooth ${
                              on
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background"
                            }`}
                          >
                            {on && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <span className="text-base">{c.icon}</span>
                          <span className={`flex-1 text-sm ${on ? "text-muted-foreground line-through" : "text-foreground"}`}>
                            {c.text}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* 신뢰 라인 — 누구 기준으로, 무엇을 근거로 판단했는지 */}
              <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground/70">
                {withSubjectSuffix(cur.name)} 위한 프로필 기준 해석 · 기상청·에어코리아 실측 데이터
              </p>
              </div>
            </section>
          )}

          {/* Timeline */}
          <section className="mt-8">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[22px] font-bold tracking-tight">시간대별 환경</h2>
              <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground/70">옆으로 넘겨보세요 →</span>
            </div>
            <div className="mt-3 -mx-5 flex flex-nowrap gap-2.5 overflow-x-auto overflow-y-hidden px-5 pb-2 scrollbar-hide [-webkit-overflow-scrolling:touch]">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-44 w-[150px] shrink-0 rounded-2xl" />
                  ))
                : mockWeather.timeline.map((t) => (
                    <article
                      key={t.time}
                      className="w-[148px] shrink-0 rounded-2xl border border-border/60 bg-card p-4 transition-smooth hover:border-foreground/30 hover:shadow-soft"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold tracking-tight">{t.time}</p>
                          <p className="text-[11px] text-muted-foreground">{t.hour}</p>
                        </div>
                        <span className="text-2xl">{t.icon}</span>
                      </div>
                      <div className="mt-3 flex items-baseline gap-1 tabular">
                        <span className="text-[26px] font-bold leading-none tracking-tight">{t.temp}°</span>
                        <span className="text-[11px] text-muted-foreground">체감 {t.feels}°</span>
                      </div>
                      <div className="my-3 h-px bg-border/60" />
                      <dl className="space-y-1.5 text-[11px]">
                        {([
                          ["미세먼지", t.dust, ["나쁨", "매우나쁨"].includes(t.dust)],
                          ["자외선", t.uv, ["강함", "매우강함"].includes(t.uv)],
                          ["꽃가루", t.pollen, ["높음", "매우높음"].includes(t.pollen)],
                          ["습도", `${t.humidity}%`, t.humidity <= 40],
                          ["바람", t.wind, t.wind === "강함"],
                        ] as [string, string, boolean][]).map(([k, v, bad]) => (
                          <div key={k} className="flex items-center justify-between">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd
                              className={
                                bad
                                  ? "font-semibold text-status-warn"
                                  : "font-medium tabular text-foreground"
                              }
                            >
                              {v}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
            </div>
          </section>

          {/* Character-based personalized report */}
          {!loading && (
            <CharacterReport
              gender={cur.gender}
              childName={cur.name}
              weather={weatherData}
              conditions={cur.conditions ?? []}
            />
          )}

          {/* Recommended items */}
          <section className="mt-8">
            <h2 className="text-[22px] font-bold tracking-tight break-keep">
              {withSubjectSuffix(cur.name)} 위한 오늘의 추천 아이템
            </h2>
            <div className="mt-3 -mx-5 flex flex-nowrap gap-2.5 overflow-x-auto overflow-y-hidden px-5 pb-2 scrollbar-hide [-webkit-overflow-scrolling:touch]">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-44 w-[130px] shrink-0 rounded-2xl" />
                  ))
                : items.map((it) => (
                    <button
                      key={it.name}
                      onClick={() => toast("외부 구매 페이지로 이동합니다")}
                      className="w-[132px] shrink-0 rounded-2xl border border-border/60 bg-card p-2.5 text-left transition-smooth hover:border-foreground/30 hover:shadow-soft"
                    >
                      <div className="flex h-24 items-center justify-center rounded-xl bg-soft text-4xl">
                        {it.emoji}
                      </div>
                      <p className="mt-2.5 line-clamp-2 px-0.5 text-[13px] font-medium leading-snug">{it.name}</p>
                      <p className="mt-1 px-0.5 text-xs font-semibold text-foreground">{it.price}</p>
                    </button>
                  ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default Home;
