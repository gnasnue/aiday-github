"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation"; ;
import {
  ArrowLeft,
  Info,
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudSnow,
  Wind,
  Droplets,
  Umbrella,
  Footprints,
  type LucideIcon,
} from "lucide-react";
import Logo from "@/components/Logo";
import LineIcon, { type LineIconName } from "@/components/LineIcon";
const ootdLook = "/ootd-look.jpg";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ChildProfile, loadProfiles } from "@/lib/profile";
import { withTopicParticle } from "@/lib/korean";
import { hasRespiratory, hasSkin } from "@/lib/domain/child-conditions";


type Category = "아우터" | "이너" | "하의" | "악세사리";

// 아이템 아이콘 참조 — LineIcon 이름, 로컬 보완 아이콘("pants"), 또는 lucide 컴포넌트
type ItemIconRef = LineIconName | "pants" | LucideIcon;

interface OutfitItem {
  icon: ItemIconRef;
  name: string;
  note?: string;
  category: Category;
}

interface AvoidItem {
  icon: ItemIconRef;
  name: string;
  reason: string;
}

// LineIcon 세트에 없는 하의(바지) 아이콘 — 동일 규격(24 viewBox, round cap/join) 로컬 보완
const PANTS_PATHS = ["M7.5 3h9", "M7.5 3 6 21h4l2-9.5L14 21h4L16.5 3"];

const ItemIcon = ({ icon, size = 18 }: { icon: ItemIconRef; size?: number }) => {
  if (icon === "pants") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {PANTS_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  }
  if (typeof icon === "string") return <LineIcon name={icon} size={size} />;
  const Icon = icon;
  return <Icon size={size} strokeWidth={1.75} />;
};

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
  feelsLike: number | null;
  windSpeed: number | null;
  humidity: number | null;
  pop: number | null;
  sky: number | null;
  pty: number | null;
}

// SKY: 1=맑음, 3=구름많음, 4=흐림 / PTY: 0=없음, 1=비, 2=비/눈, 3=눈, 4=소나기
function weatherCondition(w: WeatherData | null): { Icon: LucideIcon; label: string } {
  if (!w) return { Icon: Cloud, label: "날씨 로딩 중" };
  const pty = w.pty ?? 0;
  if (pty === 3) return { Icon: CloudSnow, label: "눈" };
  if (pty === 2) return { Icon: CloudSnow, label: "비/눈" };
  if (pty === 4) return { Icon: CloudRain, label: "소나기" };
  if (pty === 1) return { Icon: CloudRain, label: "비" };
  const sky = w.sky ?? 1;
  if (sky >= 4) return { Icon: Cloud, label: "흐림" };
  if (sky === 3) return { Icon: CloudSun, label: "구름많음" };
  return { Icon: Sun, label: "맑음" };
}

// 현재 기온 기준 옷차림 밴드 — 빠른 규칙 기반 조회(LLM 아님).
// 카테고리별 1~2개만 담아 과하지 않게, 로딩 중(temp=null)엔 선선(20°) 폴백.
function baseItems(temp: number | null): OutfitItem[] {
  const t = temp ?? 20;
  if (t >= 28) {
    // 한여름 — 아우터 없이 가볍게
    return [
      { category: "이너", icon: "shirt", name: "반팔 티셔츠", note: "통기성 좋은 면" },
      { category: "이너", icon: "shirt", name: "민소매 이너", note: "땀 배출" },
      { category: "하의", icon: "pants", name: "면 반바지", note: "시원하게" },
    ];
  }
  if (t >= 25) {
    // 더움 — 반팔 위주, 아우터 없이
    return [
      { category: "이너", icon: "shirt", name: "반팔 티셔츠", note: "통기성 면" },
      { category: "이너", icon: "shirt", name: "얇은 긴팔 티", note: "자외선·냉방 대비" },
      { category: "하의", icon: "pants", name: "면 반바지", note: "시원하게" },
      { category: "하의", icon: "pants", name: "7부 면 팬츠", note: "활동성 ↑" },
    ];
  }
  if (t >= 21) {
    // 따뜻 — 얇은 겉옷 하나 정도
    return [
      { category: "아우터", icon: "cardigan", name: "얇은 가디건", note: "아침·냉방 대비" },
      { category: "이너", icon: "shirt", name: "반팔 티셔츠", note: "면 소재" },
      { category: "하의", icon: "pants", name: "면 조거 팬츠", note: "활동성 ↑" },
    ];
  }
  if (t >= 17) {
    // 선선
    return [
      { category: "아우터", icon: "cardigan", name: "얇은 자켓", note: "가벼운 겉옷" },
      { category: "아우터", icon: "cardigan", name: "후드집업", note: "탈착 쉬움" },
      { category: "이너", icon: "shirt", name: "긴팔 티셔츠", note: "면 소재" },
      { category: "하의", icon: "pants", name: "면 긴바지", note: "활동성 ↑" },
    ];
  }
  if (t >= 12) {
    // 쌀쌀
    return [
      { category: "아우터", icon: "cardigan", name: "바람막이 자켓", note: "바람 차단" },
      { category: "이너", icon: "shirt", name: "얇은 니트", note: "보온 레이어" },
      { category: "이너", icon: "shirt", name: "긴팔 이너", note: "받쳐 입기" },
      { category: "하의", icon: "pants", name: "면 긴바지", note: "활동성 ↑" },
    ];
  }
  if (t >= 9) {
    // 추움
    return [
      { category: "아우터", icon: "cardigan", name: "두꺼운 코트", note: "보온 겉옷" },
      { category: "이너", icon: "shirt", name: "니트 스웨터", note: "따뜻한 보온" },
      { category: "하의", icon: "pants", name: "면 긴바지", note: "활동성 ↑" },
    ];
  }
  if (t >= 5) {
    // 많이 추움
    return [
      { category: "아우터", icon: "cardigan", name: "패딩 · 두꺼운 코트", note: "체온 유지" },
      { category: "이너", icon: "shirt", name: "히트텍 이너", note: "발열 보온" },
      { category: "이너", icon: "shirt", name: "니트 스웨터", note: "레이어드" },
      { category: "하의", icon: "pants", name: "기모 바지", note: "하체 보온" },
    ];
  }
  // 한겨울
  return [
    { category: "아우터", icon: "cardigan", name: "두꺼운 패딩", note: "한파 대비" },
    { category: "이너", icon: "shirt", name: "기모 이너 + 니트", note: "발열·보온" },
    { category: "하의", icon: "pants", name: "기모 바지", note: "하체 보온" },
  ];
}

function buildOutfit(
  profile: ChildProfile | undefined,
  weather: WeatherData | null
): OutfitPlan {
  const name = profile?.name ?? "우리 아이";
  const sweat = profile?.sweat ?? "";
  const cold = profile?.cold ?? "";
  const conditions = profile?.conditions ?? [];
  const hasRhinitis = hasRespiratory(conditions);
  const sensitiveSkin = hasSkin(conditions);

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

  // 현재 기온 밴드로 기본 아이템을 뽑고, 날씨·체질 조건으로 악세사리를 덧붙인다.
  const items: OutfitItem[] = [...baseItems(temp)];

  if (windStrong) {
    items.push({ category: "악세사리", icon: "scarf", name: "면 목수건", note: `바람 ${weather?.windSpeed}m/s` });
  }
  if (rainy) {
    items.push({ category: "악세사리", icon: Umbrella, name: "우산", note: "강수 예보" });
  }
  if (hasRhinitis) {
    items.push({ category: "악세사리", icon: "mask", name: "KF94 마스크", note: "호흡기 보호" });
  }
  if (sensitiveSkin) {
    items.push({ category: "악세사리", icon: "droplet", name: "보습 로션", note: "외출 전 도포" });
  }

  // Avoid list — "당연한 말"(더운데 패딩 등)은 배제하고, 현재 날씨 요인에서 놓치기 쉬운 비자명한 조언만.
  // 후보에 theme을 달아 같은 주제(소재/색/신발/모자/핏)는 하나만 뽑아 유사·중복 조언을 막는다. 최대 3개.
  const sunny = (weather?.sky ?? 3) === 1;
  const humid = (weather?.humidity ?? 0) >= 75;
  const rainRisk = rainy || (weather?.pop ?? 0) >= 60;

  const avoidCandidates: (AvoidItem & { theme: string })[] = [];

  // 신발 (강수)
  if (rainRisk) {
    avoidCandidates.push({
      theme: "shoes",
      icon: Footprints,
      name: "가죽 · 스웨이드 운동화",
      reason: "젖으면 잘 마르지 않고 쉽게 상해요. 방수되는 신발을 신겨 주세요.",
    });
  }
  // 색 (자외선)
  if (sunny && temp != null && temp >= 22) {
    avoidCandidates.push({
      theme: "color",
      icon: "shirt",
      name: "검은색 · 진한 색 옷",
      reason: "햇빛을 흡수해 체감온도를 높여요. 자외선이 강한 날엔 밝은 색이 시원해요.",
    });
  }
  // 소재 (더위·습도) — 습하면 속건, 아니면 통기성 관점으로 하나만
  if (humid && temp != null && temp >= 22) {
    avoidCandidates.push({
      theme: "material",
      icon: "shirt",
      name: "땀이 안 마르는 두꺼운 면 상의",
      reason: `습도 ${weather?.humidity}%로 땀이 잘 안 말라 눅눅해요. 속건 기능성 소재가 쾌적해요.`,
    });
  } else if (temp != null && temp >= 24) {
    avoidCandidates.push({
      theme: "material",
      icon: "shirt",
      name: "통풍 안 되는 합성섬유 상의",
      reason: "통풍이 안 돼 땀이 갇히면 땀띠가 생기기 쉬워요. 통기성 좋은 면·린넨이 좋아요.",
    });
  }
  // 모자 (바람)
  if (windStrong) {
    avoidCandidates.push({
      theme: "hat",
      icon: "cap",
      name: "챙 넓은 모자",
      reason: `바람이 ${weather?.windSpeed}m/s로 강해 잘 날아가요. 끈 있는 모자가 안전해요.`,
    });
  }
  // 핏/노출 — 더운 날은 통풍, 추운 날은 보온 관점으로 하나만
  if (temp != null && temp >= 24) {
    avoidCandidates.push({
      theme: "fit",
      icon: "shirt",
      name: "몸에 딱 붙는 옷",
      reason: "통풍이 안 돼 땀이 차고 답답해요. 약간 여유 있는 핏이 시원해요.",
    });
  } else if (temp != null && temp <= 8) {
    avoidCandidates.push({
      theme: "fit",
      icon: "pants",
      name: "발목 드러나는 바지 · 양말",
      reason: "찬바람이 살에 직접 닿아 체온이 빠르게 떨어져요. 발목까지 감싸 주세요.",
    });
  } else if (temp != null && temp <= 15) {
    avoidCandidates.push({
      theme: "fit",
      icon: "cardigan",
      name: "한 겹짜리 두꺼운 외투",
      reason: "일교차가 커요. 두꺼운 한 겹보다 벗고 입기 쉬운 레이어드가 체온 조절에 유리해요.",
    });
  }
  if (avoidCandidates.length === 0) {
    avoidCandidates.push({
      theme: "fit",
      icon: "shirt",
      name: "몸에 딱 붙는 옷",
      reason: "공기가 통하지 않아 활동 중 땀이 차기 쉬워요. 약간 여유 있는 핏이 좋아요.",
    });
  }

  // 같은 주제는 하나만, 최대 3개
  const seenThemes = new Set<string>();
  const avoidTop: AvoidItem[] = [];
  for (const c of avoidCandidates) {
    if (seenThemes.has(c.theme)) continue;
    seenThemes.add(c.theme);
    avoidTop.push({ icon: c.icon, name: c.name, reason: c.reason });
    if (avoidTop.length >= 3) break;
  }

  const context = [
    temp != null ? `현재 ${temp}°` : "날씨 로딩 중",
    windStrong ? `바람 ${weather?.windSpeed}m/s — 바람막이 추천` : `바람 ${weather?.windSpeed ?? "--"}m/s`,
  ];

  return { temp, headline, subline, items, avoid: avoidTop, context };
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

  const condition = useMemo(() => weatherCondition(weather), [weather]);
  const metrics = useMemo(() => {
    const list: { Icon: LucideIcon; label: string; value: string }[] = [];
    if (weather?.windSpeed != null)
      list.push({ Icon: Wind, label: "바람", value: `${weather.windSpeed}m/s` });
    if (weather?.humidity != null)
      list.push({ Icon: Droplets, label: "습도", value: `${weather.humidity}%` });
    if (weather?.pop != null)
      list.push({ Icon: Umbrella, label: "강수", value: `${weather.pop}%` });
    return list;
  }, [weather]);

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

          {/* Hero — 온도·날씨 지표(동적) + 맞춤 인사이트 한 줄 배치 */}
          {loading ? (
            <Skeleton className="mt-4 h-36 w-full rounded-2xl" />
          ) : (
            <section className="mt-4 rounded-2xl bg-card p-4 shadow-soft animate-fade-up">
              <div className="flex items-stretch gap-3.5">
                {/* 온도 */}
                <div className="flex shrink-0 flex-col items-center justify-center text-center">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <condition.Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span className="text-[11px] font-medium">{condition.label}</span>
                  </div>
                  <p className="mt-0.5 text-[40px] font-bold leading-none tracking-tight text-foreground tabular-nums">
                    {plan.temp != null ? `${plan.temp}°` : "--°"}
                  </p>
                  {weather?.feelsLike != null && (
                    <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                      체감 {weather.feelsLike}°
                    </p>
                  )}
                </div>

                {/* 구분선 */}
                <div className="w-px shrink-0 self-stretch bg-border/70" />

                {/* 맞춤 인사이트 */}
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <p className="text-[13.5px] font-semibold leading-snug text-foreground break-keep">
                    {plan.headline}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground break-keep">
                    {plan.subline}
                  </p>
                </div>
              </div>

              {/* 실시간 날씨 지표 */}
              {metrics.length > 0 && (
                <div className="mt-3 flex items-center gap-4 border-t border-border/60 pt-2.5">
                  {metrics.map((m) => (
                    <div
                      key={m.label}
                      className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"
                    >
                      <m.Icon className="h-3.5 w-3.5 text-muted-foreground/70" strokeWidth={1.75} />
                      <span className="text-muted-foreground/80">{m.label}</span>
                      <span className="font-medium text-foreground tabular-nums">{m.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Recommended items - OOTD style by category */}
          <section className="mt-7">
            <h2 className="text-[17px] font-bold tracking-tight">추천 아이템</h2>

            <div className="mt-3 space-y-3">
              {categoryOrder.map((cat) => {
                const list = grouped[cat];
                if (!list.length) return null;
                return (
                  <div
                    key={cat}
                    className="rounded-2xl bg-card p-4 shadow-soft"
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
                          className="flex items-center gap-2.5 rounded-xl bg-muted/60 p-3"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent">
                            <ItemIcon icon={it.icon} />
                          </span>
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
              <h2 className="text-[17px] font-bold tracking-tight">오늘의 룩 : 추천 코디 미리 보기</h2>
              <span className="shrink-0 rounded-full bg-soft px-2 py-0.5 text-[10px] font-medium text-red-500">
                AI코디 추천
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground break-keep">
              추천 아이템을 실제 코디로 미리 확인해보세요. 매일 날씨와 아이 체질에 맞춰 업데이트돼요.
            </p>
            <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-soft">
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
            <h2 className="text-[17px] font-bold tracking-tight">피해주세요</h2>
            <ul className="mt-3 space-y-2">
              {plan.avoid.map((a) => (
                <li
                  key={a.name}
                  className="rounded-2xl bg-card p-4 shadow-soft"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-status-warn-bg text-status-warn">
                      <ItemIcon icon={a.icon} />
                    </span>
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
