"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation"; ;
import { ArrowLeft, Info } from "lucide-react";
import Logo from "@/components/Logo";
const ootdLook = "/ootd-look.jpg";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ChildProfile, loadProfiles } from "@/lib/profile";
import { withTopicParticle } from "@/lib/korean";


type Category = "아우터" | "이너" | "하의" | "악세사리";

interface OutfitItem {
  emoji: string;
  name: string;
  note?: string;
  category: Category;
}

interface AvoidItem {
  emoji: string;
  name: string;
  reason: string;
}

interface OutfitPlan {
  temp: number | null;
  headline: string;
  subline: string;
  items: OutfitItem[];
  avoid: AvoidItem[];
  context: string[];
}

const categoryOrder: Category[] = ["아우터", "이너", "하의", "악세사리"];

const categoryMeta: Record<Category, { label: string; hint: string }> = {
  아우터: { label: "아우터", hint: "OUTER" },
  이너: { label: "이너", hint: "INNER" },
  하의: { label: "하의", hint: "BOTTOM" },
  악세사리: { label: "악세사리", hint: "ACC" },
};

interface WeatherData {
  temperature: number | null;
  windSpeed: number | null;
  humidity: number | null;
  pop: number | null;
  sky: number | null;
  pty: number | null;
}

function buildOutfit(
  profile: ChildProfile | undefined,
  weather: WeatherData | null
): OutfitPlan {
  const name = profile?.name ?? "우리 아이";
  const sweat = profile?.sweat ?? "";
  const cold = profile?.cold ?? "";
  const conditions = profile?.conditions ?? [];
  const hasRhinitis = conditions.includes("비염");
  const sensitiveSkin = conditions.includes("피부 민감");

  const temp = weather?.temperature ?? null;
  const windStrong = (weather?.windSpeed ?? 0) >= 5;
  const rainy = weather?.pty != null && weather.pty > 0;

  // Personalized headline
  let headline = `${withTopicParticle(name)} 오늘 레이어드 코디가 좋아요.`;
  let subline = "기온 변화를 대비해 입고 벗기 쉬운 옷을 입혀주세요.";

  if (sweat === "많아요") {
    headline = `땀이 많은 ${withTopicParticle(name)} 통기성 좋은 옷이 좋아요.`;
    subline = "얇은 아우터와 흡습 소재 이너를 입혀서 입고 벗을 수 있게 해주세요.";
  } else if (cold === "추위를 많이 타요") {
    headline = `추위에 약한 ${withTopicParticle(name)} 한 겹 더 챙겨 주세요.`;
    subline = "체온 보호를 위한 보온 이너와 가벼운 아우터를 추천해요.";
  } else if (temp != null && temp >= 23) {
    headline = `${withTopicParticle(name)} 오늘 한낮엔 활동량이 많을 거예요.`;
    subline = `현재 ${temp}°로 따뜻하니 통기성 좋은 코디가 좋아요.`;
  } else if (temp != null && temp <= 10) {
    headline = `${withTopicParticle(name)} 오늘은 따뜻하게 입혀주세요.`;
    subline = `현재 ${temp}°로 쌀쌀해요. 보온 레이어드를 추천해요.`;
  }

  const items: OutfitItem[] = [
    { category: "아우터", emoji: "🧥", name: "얇은 가디건", note: "탈착 쉬운 소재" },
    { category: "아우터", emoji: "🧢", name: "경량 바람막이", note: "바람 대비" },
    { category: "이너", emoji: "👕", name: "긴팔 면 티셔츠", note: "땀 흡수 좋은 코튼" },
    { category: "이너", emoji: "👚", name: "반팔 베이스 티", note: "레이어드용" },
    { category: "하의", emoji: "👖", name: "면 조거 팬츠", note: "활동성 ↑" },
    { category: "하의", emoji: "🩳", name: "스트레치 7부 팬츠", note: "통기성" },
  ];

  if (windStrong) {
    items.push({ category: "악세사리", emoji: "🧣", name: "면 목수건", note: `바람 ${weather?.windSpeed}m/s` });
  }
  if (rainy) {
    items.push({ category: "악세사리", emoji: "☂️", name: "우산", note: "강수 예보" });
  }
  if (hasRhinitis) {
    items.push({ category: "악세사리", emoji: "😷", name: "KF94 마스크", note: "비염 보호" });
  }
  if (sensitiveSkin) {
    items.push({ category: "악세사리", emoji: "🧴", name: "보습 로션", note: "외출 전 도포" });
  }

  // Avoid list
  const avoid: AvoidItem[] = [];
  if (temp != null && temp >= 23) {
    avoid.push({
      emoji: "🧥",
      name: "두꺼운 패딩",
      reason: `오늘 기온이 ${temp}°로 따뜻해요. 두꺼운 외투는 땀을 유발할 수 있어요.`,
    });
  }
  if (sweat === "많아요") {
    avoid.push({
      emoji: "👕",
      name: "기모/폴라 이너",
      reason: `땀이 많은 ${name}에게는 통기성이 떨어져 땀띠·발진의 원인이 될 수 있어요.`,
    });
  }
  if (avoid.length === 0) {
    avoid.push({
      emoji: "🧣",
      name: "두꺼운 목도리",
      reason: "오늘 날씨에는 과한 보온 아이템은 불필요해요.",
    });
  }

  const context = [
    temp != null ? `현재 ${temp}°` : "날씨 로딩 중",
    windStrong ? `바람 ${weather?.windSpeed}m/s — 바람막이 추천` : `바람 ${weather?.windSpeed ?? "--"}m/s`,
  ];

  return { temp, headline, subline, items, avoid, context };
}

const Outfit = () => {
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

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weather?lat=37.5665&lon=126.9780")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setWeather(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const plan = useMemo(() => buildOutfit(cur, weather), [cur, weather]);

  const grouped = useMemo(() => {
    const map: Record<Category, OutfitItem[]> = {
      아우터: [],
      이너: [],
      하의: [],
      악세사리: [],
    };
    for (const it of plan.items) map[it.category].push(it);
    return map;
  }, [plan.items]);

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
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
          </div>
        </header>

        <main className="container-mobile pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Today's OOTD
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight">
            {cur ? `${cur.name}의 오늘 코디` : "오늘의 코디"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            아이의 체질과 오늘 날씨를 반영한 맞춤 옷차림이에요.
          </p>

          {/* Hero */}
          {loading ? (
            <Skeleton className="mt-4 h-32 w-full rounded-2xl" />
          ) : (
            <section className="mt-4 rounded-2xl border border-border/60 bg-card p-5 shadow-soft animate-fade-up">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                현재 기온
              </p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight text-foreground">
                  {plan.temp != null ? `${plan.temp}°` : "--°"}
                </span>
              </div>
              <div className="mt-4 rounded-2xl bg-soft p-4">
                <p className="text-[14px] font-semibold leading-snug text-foreground break-keep">
                  {plan.headline}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground break-keep">
                  {plan.subline}
                </p>
              </div>
            </section>
          )}

          {/* Recommended items - OOTD style by category */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[22px] font-bold tracking-tight">추천 아이템</h2>
              <span className="text-[11px] text-muted-foreground">아우터 → 이너 → 하의 → 악세사리</span>
            </div>

            <div className="mt-3 space-y-3">
              {categoryOrder.map((cat) => {
                const list = grouped[cat];
                if (!list.length) return null;
                return (
                  <div
                    key={cat}
                    className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-bold text-foreground">
                          {categoryMeta[cat].label}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {categoryMeta[cat].hint}
                        </span>
                      </div>
                      <span className="rounded-full bg-soft px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {list.length}개
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {list.map((it) => (
                        <div
                          key={it.name}
                          className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background p-3"
                        >
                          <span className="text-2xl">{it.emoji}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-foreground">
                              {it.name}
                            </p>
                            {it.note && (
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {it.note}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Today's Look board */}
          <section className="mt-7">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[22px] font-bold tracking-tight">오늘의 룩 : 추천 코디 미리 보기</h2>
              <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-[10px] font-medium text-red-500">
                AI코디 추천
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground break-keep">
              추천 아이템을 실제 코디로 미리 확인해보세요. 매일 날씨와 아이 체질에 맞춰 업데이트돼요.
            </p>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft">
              <img
                src={ootdLook}
                alt={`${cur?.name ?? "우리 아이"}의 오늘 코디 미리보기`}
                loading="lazy"
                className="block w-full object-cover"
              />
            </div>
          </section>

          {/* Avoid */}
          <section className="mt-7">
            <h2 className="text-[22px] font-bold tracking-tight">피해주세요</h2>
            <ul className="mt-3 space-y-2">
              {plan.avoid.map((a) => (
                <li
                  key={a.name}
                  className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{a.emoji}</span>
                    <p className="text-[14px] font-semibold text-foreground">{a.name}</p>
                  </div>
                  <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-soft px-3 py-2">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <p className="text-[12px] leading-relaxed text-muted-foreground break-keep">
                      {a.reason}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
};

export default Outfit;
