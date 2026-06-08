"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation"; ;
import { ArrowLeft, MapPin, ChevronDown, RefreshCw, Info } from "lucide-react";
import Logo from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ChildProfile, loadProfiles } from "@/lib/profile";
import { withSubjectSuffix } from "@/lib/korean";

/* ----------------------------- mock data ----------------------------- */

const current = {
  city: "서울 강남구",
  updated: "방금 업데이트",
  icon: "🌤️",
  desc: "구름 조금",
  temp: 18,
  feels: 16,
  high: 22,
  low: 9,
  humidity: 38,
  wind: 4.2, // m/s
  rainProb: 10,
};

const dust = {
  pm10: { value: 62, label: "보통" },
  pm25: { value: 28, label: "보통" },
  o3: { value: 0.041, label: "보통" },
};

const pollen = [
  { name: "참나무", level: "매우높음", score: 4 },
  { name: "소나무", level: "높음", score: 3 },
  { name: "자작나무", level: "보통", score: 2 },
  { name: "잡초류", level: "낮음", score: 1 },
  { name: "잔디류", level: "낮음", score: 1 },
];

const uv = { value: 7, label: "높음" }; // 0-10+

const hourly = [
  { h: "08", icon: "⛅", t: 12, rain: 0 },
  { h: "10", icon: "☀️", t: 16, rain: 0 },
  { h: "12", icon: "☀️", t: 19, rain: 0 },
  { h: "14", icon: "🌤️", t: 21, rain: 10 },
  { h: "16", icon: "🌥️", t: 20, rain: 20 },
  { h: "18", icon: "🌥️", t: 16, rain: 30 },
  { h: "20", icon: "☁️", t: 13, rain: 20 },
  { h: "22", icon: "☁️", t: 11, rain: 10 },
];

const weekly = [
  { day: "오늘", date: "5/01", icon: "🌤️", high: 22, low: 9, rain: 10, weekend: false },
  { day: "금", date: "5/02", icon: "☀️", high: 24, low: 11, rain: 0, weekend: false },
  { day: "토", date: "5/03", icon: "🌤️", high: 23, low: 12, rain: 10, weekend: true },
  { day: "일", date: "5/04", icon: "🌦️", high: 19, low: 11, rain: 60, weekend: true },
  { day: "월", date: "5/05", icon: "☁️", high: 18, low: 10, rain: 30, weekend: false },
  { day: "화", date: "5/06", icon: "🌧️", high: 16, low: 9, rain: 80, weekend: false },
  { day: "수", date: "5/07", icon: "⛅", high: 20, low: 10, rain: 20, weekend: false },
];

/* ----------------------------- helpers ----------------------------- */

const levelTone = (label: string) => {
  if (["매우높음", "매우나쁨", "위험"].includes(label)) return "text-destructive";
  if (["높음", "나쁨"].includes(label)) return "text-accent";
  if (label === "보통") return "text-foreground";
  return "text-muted-foreground";
};

const levelBg = (label: string) => {
  if (["매우높음", "매우나쁨", "위험"].includes(label)) return "bg-destructive/10 border-destructive/20";
  if (["높음", "나쁨"].includes(label)) return "bg-accent/10 border-accent/20";
  if (label === "보통") return "bg-secondary border-border";
  return "bg-muted border-border";
};

const uvLabel = (v: number) =>
  v >= 11 ? "위험" : v >= 8 ? "매우높음" : v >= 6 ? "높음" : v >= 3 ? "보통" : "낮음";

const humidityLabel = (h: number) =>
  h <= 30 ? "건조" : h <= 60 ? "쾌적" : h <= 75 ? "다습" : "매우습함";

/* ----------------------------- nav ----------------------------- */


/* ----------------------------- page ----------------------------- */

const Environment = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [profiles] = useState<ChildProfile[]>(() => loadProfiles());
  const activeId = (() => {
    try {
      return localStorage.getItem("aiweather:activeProfileId") || profiles[0]?.id;
    } catch {
      return profiles[0]?.id;
    }
  })();
  const cur = profiles.find((p) => p.id === activeId) ?? profiles[0];
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  /* personalized insights based on conditions + env */
  const insights = useMemo(() => {
    const list: { icon: string; title: string; body: string; tone: "warn" | "info" | "ok" }[] = [];
    const conds = cur?.conditions ?? [];
    const hasResp = conds.some((c) => c.includes("호흡기"));
    const hasAllergy = conds.some((c) => c.includes("알레르기"));
    const hasSkin = conds.some((c) => c.includes("피부"));

    if (pollen[0].score >= 3 && (hasResp || hasAllergy)) {
      list.push({
        icon: "🌳",
        title: `${pollen[0].name} 꽃가루 ${pollen[0].level}`,
        body: `알레르기·호흡기 민감 아이는 외출 시 KF94 마스크와 모자를 챙겨주세요. 귀가 후 옷 털기·세안·코 세척이 도움됩니다.`,
        tone: "warn",
      });
    }
    if (uv.value >= 6) {
      list.push({
        icon: "🧴",
        title: `자외선 ${uv.label} (지수 ${uv.value})`,
        body: "외출 20분 전 SPF30+ 자외선차단제, 챙 넓은 모자, 자외선 차단 선글라스 착용을 권장해요.",
        tone: "warn",
      });
    }
    if (current.humidity <= 35) {
      list.push({
        icon: "💧",
        title: `습도 ${humidityLabel(current.humidity)} (${current.humidity}%)`,
        body: hasSkin
          ? "민감 피부에는 자극이 큰 환경이에요. 보습제를 자주 덧바르고 실내 가습을 권장합니다."
          : "수분 섭취를 늘리고 실내 가습으로 호흡기·피부 건조를 예방하세요.",
        tone: "info",
      });
    }
    if (dust.pm10.value >= 80 || dust.pm25.value >= 35) {
      list.push({
        icon: "😷",
        title: `미세먼지 ${dust.pm10.label} / 초미세 ${dust.pm25.label}`,
        body: "장시간 야외활동은 피하고, 외출 시 마스크·외출 후 손 씻기를 잊지 마세요.",
        tone: "warn",
      });
    } else {
      list.push({
        icon: "🌿",
        title: "미세먼지 양호",
        body: "야외 활동에 무리 없는 수치예요. 다만 꽃가루는 별도로 확인하세요.",
        tone: "ok",
      });
    }
    if (current.wind >= 5) {
      list.push({
        icon: "🧣",
        title: `바람 ${current.wind}m/s`,
        body: "체감온도가 낮아질 수 있어요. 얇은 바람막이나 목수건을 챙기면 좋아요.",
        tone: "info",
      });
    }
    return list;
  }, [cur]);

  const refresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast("최신 환경 정보로 새로고침했어요");
    }, 500);
  };

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.back()}
                className="rounded-full p-2 text-foreground hover:bg-muted"
                aria-label="뒤로가기"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Logo />
            </div>
            <button
              onClick={refresh}
              className="rounded-full p-2 text-foreground hover:bg-muted"
              aria-label="새로고침"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="container-mobile pt-5">
          <h1 className="text-xl font-bold tracking-tight">환경정보</h1>

          {/* Location */}
          <button
            onClick={() => toast("위치 변경은 준비 중이에요")}
            className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <MapPin className="h-4 w-4" />
            <span>{current.city}</span>
            <ChevronDown className="h-3.5 w-3.5" />
            <span className="ml-1 text-xs">· {current.updated}</span>
          </button>

          {/* Personalized insights */}
          <section className="mt-5">
            <h2 className="text-base font-bold tracking-tight">
              {cur ? `${withSubjectSuffix(cur.name)} 위한 맞춤 인사이트` : "맞춤 인사이트"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {cur?.conditions?.length
                ? `${cur.name}의 건강 정보(${cur.conditions.join(", ")})를 반영했어요`
                : "프로필을 등록하면 더 정확한 추천을 받을 수 있어요"}
            </p>
            <div className="mt-3 space-y-2.5">
              {insights.map((it, i) => (
                <article
                  key={i}
                  className={`flex items-start gap-3 rounded-2xl border p-4 shadow-soft ${
                    it.tone === "warn"
                      ? "border-accent/30 bg-accent/5"
                      : it.tone === "ok"
                        ? "border-border bg-card"
                        : "border-primary/30 bg-secondary/40"
                  }`}
                >
                  <span className="text-2xl">{it.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground">{it.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{it.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Outdoor activity index */}
          <section className="mt-7 rounded-2xl border border-border bg-gradient-warm p-5 shadow-soft">
            <p className="text-xs font-medium text-accent">오늘의 야외활동 지수</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">68</span>
              <span className="text-sm text-muted-foreground">/ 100 · 보통</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-background/60">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent"
                style={{ width: "68%" }}
              />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-foreground">
              꽃가루·자외선이 다소 높아요. 짧은 산책 위주로 권장하며, 정오~오후 2시 사이는 그늘에서 쉬어주세요.
            </p>
          </section>

          {/* Current weather hero */}
          {loading ? (
            <Skeleton className="mt-4 h-44 w-full rounded-2xl" />
          ) : (
            <section className="mt-4 rounded-2xl bg-gradient-warm p-5 shadow-soft animate-fade-up">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-accent">현재 날씨</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-5xl font-bold text-foreground">{current.temp}°</span>
                    <span className="text-sm text-muted-foreground">체감 {current.feels}°</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{current.desc}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    최고 {current.high}° · 최저 {current.low}°
                  </p>
                </div>
                <span className="text-6xl leading-none">{current.icon}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-background/70 p-3 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">습도</p>
                  <p className="mt-0.5 font-bold text-foreground">{current.humidity}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">바람</p>
                  <p className="mt-0.5 font-bold text-foreground">{current.wind}m/s</p>
                </div>
                <div>
                  <p className="text-muted-foreground">강수확률</p>
                  <p className="mt-0.5 font-bold text-foreground">{current.rainProb}%</p>
                </div>
              </div>
            </section>
          )}

          {/* Air quality */}
          <section className="mt-7">
            <h2 className="text-base font-bold tracking-tight">대기질 · 미세먼지</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { k: "PM10", v: dust.pm10.value, label: dust.pm10.label, unit: "㎍/㎥" },
                { k: "PM2.5", v: dust.pm25.value, label: dust.pm25.label, unit: "㎍/㎥" },
                { k: "오존", v: dust.o3.value, label: dust.o3.label, unit: "ppm" },
              ].map((d) => (
                <div
                  key={d.k}
                  className={`rounded-2xl border p-3 text-center ${levelBg(d.label)}`}
                >
                  <p className="text-xs font-medium text-muted-foreground">{d.k}</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{d.v}</p>
                  <p className="text-[10px] text-muted-foreground">{d.unit}</p>
                  <p className={`mt-1 text-xs font-bold ${levelTone(d.label)}`}>{d.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Pollen */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold tracking-tight">꽃가루 지수</h2>
              <a
                href="https://www.weather.go.kr/w/forecast/life/life-weather-index.do?tabIndex=4"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground underline"
              >
                기상청 출처
              </a>
            </div>
            <div className="mt-3 space-y-2 rounded-2xl border border-border bg-card p-3 shadow-soft">
              {pollen.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="w-16 text-sm font-medium text-foreground">{p.name}</span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        p.score >= 4
                          ? "bg-destructive"
                          : p.score >= 3
                            ? "bg-accent"
                            : p.score >= 2
                              ? "bg-primary"
                              : "bg-muted-foreground/40"
                      }`}
                      style={{ width: `${(p.score / 4) * 100}%` }}
                    />
                  </div>
                  <span className={`w-16 text-right text-xs font-bold ${levelTone(p.level)}`}>
                    {p.level}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* UV + Humidity */}
          <section className="mt-7 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <p className="text-xs font-medium text-muted-foreground">자외선 지수</p>
              <p className="mt-1 text-3xl font-bold text-foreground">{uv.value}</p>
              <p className={`text-xs font-bold ${levelTone(uv.label)}`}>{uvLabel(uv.value)}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-primary via-accent to-destructive"
                  style={{ width: `${Math.min(100, (uv.value / 11) * 100)}%` }}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <p className="text-xs font-medium text-muted-foreground">온·습도</p>
              <p className="mt-1 text-3xl font-bold text-foreground">{current.humidity}%</p>
              <p
                className={`text-xs font-bold ${
                  current.humidity <= 30 || current.humidity >= 75
                    ? "text-accent"
                    : "text-foreground"
                }`}
              >
                {humidityLabel(current.humidity)}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                실내 권장 40~60%
              </p>
            </div>
          </section>

          {/* Hourly */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold tracking-tight">시간대별 날씨</h2>
              <span className="text-xs text-muted-foreground">가로 스크롤 →</span>
            </div>
            <div className="mt-3 -mx-5 flex flex-nowrap gap-2 overflow-x-auto overflow-y-hidden px-5 pb-2 scrollbar-hide [-webkit-overflow-scrolling:touch]">
              {hourly.map((h) => (
                <div
                  key={h.h}
                  className="w-[64px] shrink-0 rounded-2xl border border-border bg-card p-2.5 text-center shadow-soft"
                >
                  <p className="text-xs text-muted-foreground">{h.h}시</p>
                  <p className="my-1 text-2xl">{h.icon}</p>
                  <p className="text-sm font-bold text-foreground">{h.t}°</p>
                  <p
                    className={`mt-0.5 text-[10px] font-medium ${
                      h.rain >= 50 ? "text-accent" : "text-muted-foreground"
                    }`}
                  >
                    💧{h.rain}%
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Weekly */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold tracking-tight">주간 날씨</h2>
              <span className="text-xs text-muted-foreground">주말 강조</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              {weekly.map((w, i) => (
                <div
                  key={w.date}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i !== weekly.length - 1 ? "border-b border-border/60" : ""
                  } ${w.weekend ? "bg-secondary/60" : ""}`}
                >
                  <div className="w-12">
                    <p
                      className={`text-sm font-bold ${
                        w.weekend ? "text-accent" : "text-foreground"
                      }`}
                    >
                      {w.day}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{w.date}</p>
                  </div>
                  <span className="text-2xl">{w.icon}</span>
                  <div className="flex-1">
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="absolute h-full rounded-full bg-gradient-to-r from-primary to-accent"
                        style={{
                          left: `${((w.low + 5) / 35) * 100}%`,
                          width: `${((w.high - w.low) / 35) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="w-20 text-right text-xs">
                    <span className="text-muted-foreground">{w.low}°</span>
                    <span className="mx-1 text-muted-foreground/60">/</span>
                    <span className="font-bold text-foreground">{w.high}°</span>
                  </p>
                  <p
                    className={`w-10 text-right text-[11px] font-medium ${
                      w.rain >= 50 ? "text-accent" : "text-muted-foreground"
                    }`}
                  >
                    💧{w.rain}%
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3" />
              주말은 나들이 계획에 참고하세요. 일요일 비 소식 있어요.
            </p>
          </section>

        </main>
      </div>
    </div>
  );
};

export default Environment;
