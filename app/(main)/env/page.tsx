"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation"; ;
import {
  ArrowLeft,
  MapPin,
  ChevronDown,
  RefreshCw,
  Info,
  Sun,
  Cloud,
  CloudSun,
  CloudSunRain,
  CloudRain,
  CloudSnow,
  Droplet,
  Droplets,
  Leaf,
  TreeDeciduous,
  TreePine,
  Sprout,
} from "lucide-react";
import LineIcon from "@/components/LineIcon";
import Logo from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ChildProfile, loadProfiles } from "@/lib/profile";
import { withSubjectSuffix } from "@/lib/korean";
import { computeOutdoorIndex } from "@/lib/outdoor-index";

/* ----------------------------- helpers ----------------------------- */

const gradeToLabel = (g: number | null) =>
  g === 1 ? "좋음" : g === 2 ? "보통" : g === 3 ? "나쁨" : g === 4 ? "매우나쁨" : "알 수 없음";

const skyIcon = (sky: number | null, pty: number | null, size = 24) => {
  const props = { size, strokeWidth: 1.75, "aria-hidden": true as const };
  if (pty && pty > 0) return pty === 3 ? <CloudSnow {...props} /> : <CloudRain {...props} />;
  if (sky === 1) return <Sun {...props} />;
  if (sky === 3) return <CloudSun {...props} />;
  if (sky === 4) return <Cloud {...props} />;
  return <CloudSun {...props} />;
};

/* 주간 예보 API가 내려주는 아이콘 코드(이모지 문자열) → 벡터 아이콘 매핑.
   아래 case의 이모지는 API 응답 값 비교용 키일 뿐 화면에 렌더링되지 않는다. */
const weekIcon = (code: string, size = 24) => {
  const props = { size, strokeWidth: 1.75, "aria-hidden": true as const };
  switch (code) {
    case "🌨️": return <CloudSnow {...props} />;
    case "🌧️": return <CloudRain {...props} />;
    case "🌦️": return <CloudSunRain {...props} />;
    case "☁️": return <Cloud {...props} />;
    case "⛅": return <CloudSun {...props} />;
    case "☀️": return <Sun {...props} />;
    default: return <CloudSun {...props} />;
  }
};

const skyDesc = (sky: number | null, pty: number | null) => {
  if (pty === 1) return "비";
  if (pty === 2) return "비/눈";
  if (pty === 3) return "눈";
  if (pty === 4) return "소나기";
  if (sky === 1) return "맑음";
  if (sky === 3) return "구름많음";
  if (sky === 4) return "흐림";
  return "알 수 없음";
};

/* ----------------------------- helpers ----------------------------- */

// v3: 상태는 순백 카드 위 "상태색 텍스트"로만 — 틴트 배경·보더·브랜드 오렌지(accent) 금지
const levelTone = (label: string) => {
  if (["매우높음", "매우나쁨", "위험"].includes(label)) return "text-status-bad";
  if (["높음", "나쁨"].includes(label)) return "text-status-warn";
  if (label === "보통") return "text-status-neutral";
  return "text-muted-foreground";
};

const uvLabel = (v: number) =>
  v >= 11 ? "위험" : v >= 8 ? "매우높음" : v >= 6 ? "높음" : v >= 3 ? "보통" : "낮음";

const pollenGradeLabel = (g: number | null) =>
  g === null ? "--" : g >= 4 ? "매우높음" : g >= 3 ? "높음" : g >= 2 ? "보통" : "낮음";

const humidityLabel = (h: number) =>
  h <= 30 ? "건조" : h <= 60 ? "쾌적" : h <= 75 ? "다습" : "매우습함";

// 환경부 오존 1시간 기준 등급 (ppm): ≤0.03 좋음 / ≤0.09 보통 / ≤0.15 나쁨 / 초과 매우나쁨
const o3Grade = (ppm: number | null): number | null =>
  ppm === null ? null : ppm <= 0.03 ? 1 : ppm <= 0.09 ? 2 : ppm <= 0.15 ? 3 : 4;

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

  // 실제 API 데이터
  type HourlyForecast = {
    hour: string; temp: number; sky: number | null; pty: number | null;
    humidity: number | null; windSpeed: number | null; pop: number | null;
  };
  const [weather, setWeather] = useState<{
    temperature: number | null; sky: number | null; pty: number | null;
    humidity: number | null; windSpeed: number | null; pop: number | null;
    hourlyForecast?: HourlyForecast[];
  } | null>(null);
  const [air, setAir] = useState<{
    pm10: number | null; pm25: number | null;
    pm10Grade: number | null; pm25Grade: number | null;
    o3: number | null; stationName: string | null;
    hourly?: Record<string, number | null>;
  } | null>(null);
  const [pollen, setPollen] = useState<{
    oak: number | null; pine: number | null; weed: number | null;
  } | null>(null);
  const [uv, setUv] = useState<{ uvi: number | null; hourly?: Record<string, number | null> } | null>(null);
  type WeekDay = {
    day: string; date: string; icon: string;
    high: number | null; low: number | null; rain: number; weekend: boolean;
  };
  const [weekly, setWeekly] = useState<WeekDay[] | null>(null);

  const fetchAll = useCallback(async () => {
    const [wRes, aRes, pRes, uRes, weekRes] = await Promise.allSettled([
      fetch("/api/weather?lat=37.5665&lon=126.9780").then((r) => r.json()),
      fetch("/api/air?station=%EC%A2%85%EB%A1%9C%EA%B5%AC").then((r) => r.json()),
      fetch("/api/pollen?region=서울").then((r) => r.json()),
      fetch("/api/uv?region=서울").then((r) => r.json()),
      fetch("/api/weather/weekly?region=서울&lat=37.5665&lon=126.9780").then((r) => r.json()),
    ]);
    if (wRes.status === "fulfilled" && !wRes.value.error) setWeather(wRes.value);
    if (aRes.status === "fulfilled" && !aRes.value.error) setAir(aRes.value);
    if (pRes.status === "fulfilled" && !pRes.value.error) setPollen(pRes.value);
    if (uRes.status === "fulfilled" && !uRes.value.error) setUv(uRes.value);
    if (weekRes.status === "fulfilled" && !weekRes.value.error && Array.isArray(weekRes.value.week))
      setWeekly(weekRes.value.week);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* 맞춤 인사이트 — 실측 환경값 + 아이 프로필 조건으로만 생성 (가정값 없음).
     데이터가 없는 항목은 카드를 만들지 않는다(없는 값을 실제처럼 보이지 않게). */
  const insights = useMemo(() => {
    const list: { icon: ReactNode; title: string; body: string; tone: "warn" | "info" | "ok" }[] = [];
    const conds = cur?.conditions ?? [];
    const hasResp = conds.some((c) => c.includes("호흡기"));
    const hasAllergy = conds.some((c) => c.includes("알레르기"));
    const hasSkin = conds.some((c) => c.includes("피부"));
    const sensitive = hasResp || hasAllergy;

    // 1) 미세먼지 — 실측 등급 있을 때만
    if (air && (air.pm10Grade != null || air.pm25Grade != null)) {
      const g = Math.max(air.pm10Grade ?? 0, air.pm25Grade ?? 0);
      if (g >= 3) {
        list.push({
          icon: <LineIcon name="mask" size={20} strokeWidth={1.75} />,
          title: `미세먼지 ${gradeToLabel(air.pm10Grade)} / 초미세 ${gradeToLabel(air.pm25Grade)}`,
          body: sensitive
            ? "호흡기·알레르기가 민감한 아이에겐 부담이 큰 수치예요. 장시간 야외활동은 피하고 KF94 마스크를 챙기세요."
            : "장시간 야외활동은 피하고, 외출 시 마스크·귀가 후 손 씻기를 잊지 마세요.",
          tone: "warn",
        });
      } else if (g >= 1) {
        list.push({
          icon: <Leaf size={20} strokeWidth={1.75} aria-hidden />,
          title: `미세먼지 ${gradeToLabel(g)}`,
          body: "야외 활동에 무리 없는 수치예요.",
          tone: "ok",
        });
      }
    }

    // 2) 꽃가루 — 실측 위험지수 반영 (프로필로 강도만 조절)
    const pollenVals = pollen
      ? [pollen.oak, pollen.pine, pollen.weed].filter((v): v is number => v != null)
      : [];
    const pollenMax = pollenVals.length ? Math.max(...pollenVals) : null;
    if (pollenMax != null && pollenMax >= 2) {
      list.push({
        icon: <TreeDeciduous size={20} strokeWidth={1.75} aria-hidden />,
        title: `꽃가루 ${pollenGradeLabel(pollenMax)}`,
        body: sensitive
          ? "호흡기·알레르기 민감 아이는 특히 주의하세요. KF94 마스크·모자, 귀가 후 옷 털기·세안·코 세척이 도움됩니다."
          : "민감한 아이라면 외출 시 마스크·모자를 챙기고 귀가 후 세안·코 세척을 권장해요.",
        tone: pollenMax >= 3 ? "warn" : "info",
      });
    }

    // 3) 자외선 — 실측 지수 높음 이상일 때
    if (uv?.uvi != null && uv.uvi >= 6) {
      list.push({
        icon: <Droplet size={20} strokeWidth={1.75} aria-hidden />,
        title: `자외선 ${uvLabel(uv.uvi)} (지수 ${uv.uvi})`,
        body: hasSkin
          ? "민감 피부에는 자외선 차단이 중요해요. 자외선차단제·모자·긴소매로 노출을 줄이세요."
          : "정오~오후 2시 외출은 모자·자외선차단제로 노출을 줄여주세요.",
        tone: "warn",
      });
    }

    // 4) 습도 — 실측값 기준 건조/다습
    if (weather?.humidity != null) {
      const h = weather.humidity;
      if (h <= 35) {
        list.push({
          icon: <LineIcon name="droplet" size={20} strokeWidth={1.75} />,
          title: `습도 건조 (${h}%)`,
          body: hasSkin
            ? "민감 피부엔 자극이 큰 환경이에요. 보습제를 자주 덧바르고 실내 가습을 권장합니다."
            : "수분 섭취를 늘리고 실내 가습으로 호흡기·피부 건조를 예방하세요.",
          tone: "info",
        });
      } else if (h >= 75) {
        list.push({
          icon: <Droplets size={20} strokeWidth={1.75} aria-hidden />,
          title: `습도 높음 (${h}%)`,
          body: "땀·습기로 피부 트러블이 생기기 쉬워요. 통풍이 잘 되는 옷을 입히고 자주 환기해주세요.",
          tone: "info",
        });
      }
    }

    // 5) 바람 — 실측 풍속
    if (weather?.windSpeed != null && weather.windSpeed >= 5) {
      list.push({
        icon: <LineIcon name="scarf" size={20} strokeWidth={1.75} />,
        title: `바람 ${weather.windSpeed}m/s`,
        body: "체감온도가 낮아질 수 있어요. 얇은 바람막이나 목수건을 챙기면 좋아요.",
        tone: "info",
      });
    }

    return list;
  }, [cur, air, weather, uv, pollen]);

  /* 주간 날씨 온도 바 스케일 — 그 주의 실제 최저~최고 범위로 정규화 */
  const weekTempRange = useMemo(() => {
    const temps = (weekly ?? [])
      .flatMap((w) => [w.low, w.high])
      .filter((v): v is number => v != null);
    if (!temps.length) return null;
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    return { min, span: max === min ? 1 : max - min };
  }, [weekly]);

  /* 주간 하단 안내 — 주말 강수 소식이 있으면 반영 */
  const weekendHint = useMemo(() => {
    const wet = (weekly ?? []).find((w) => w.weekend && w.rain >= 50);
    if (wet)
      return `주말은 나들이 계획에 참고하세요. ${wet.day === "오늘" ? "오늘" : wet.day + "요일"} 비 소식이 있어요.`;
    return "주말은 나들이 계획에 참고하세요.";
  }, [weekly]);

  /* 오늘의 야외활동 지수 — 환경 수치 종합 (데이터 로딩 전엔 null) */
  const outdoor = useMemo(() => {
    if (!weather && !air && !uv && !pollen) return null;
    const pollenMax = pollen
      ? Math.max(pollen.oak ?? 0, pollen.pine ?? 0, pollen.weed ?? 0) || null
      : null;
    return computeOutdoorIndex({
      pm10Grade: air?.pm10Grade ?? null,
      pm25Grade: air?.pm25Grade ?? null,
      uvi: uv?.uvi ?? null,
      pollenMax,
      pop: weather?.pop ?? null,
      temp: weather?.temperature ?? null,
      windSpeed: weather?.windSpeed ?? null,
    });
  }, [weather, air, uv, pollen]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setLoading(true);
    try {
      await fetchAll();
      toast("최신 환경 정보로 새로고침했어요");
    } catch {
      toast("새로고침에 실패했어요. 잠시 후 다시 시도해주세요");
    } finally {
      setRefreshing(false);
    }
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
              disabled={refreshing}
              className="rounded-full p-2 text-foreground hover:bg-muted disabled:opacity-50"
              aria-label="새로고침"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        <main className="container-mobile pt-5">
          {/* Personalized insights */}
          <section>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-[20px] font-bold tracking-tight">
                {cur ? `${withSubjectSuffix(cur.name)} 위한 맞춤 인사이트` : "맞춤 인사이트"}
              </h2>
              {/* Location */}
              <button
                onClick={() => toast("위치 변경은 준비 중이에요")}
                className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>{air?.stationName ?? "서울"}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {cur?.conditions?.length
                ? `${cur.name}의 건강 정보(${cur.conditions.join(", ")})를 반영했어요`
                : "프로필을 등록하면 더 정확한 추천을 받을 수 있어요"}
            </p>
            {loading ? (
              <div className="mt-3 space-y-2.5">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ) : insights.length > 0 ? (
              <div className="mt-3 space-y-2.5">
                {insights.map((it, i) => (
                  <article
                    key={i}
                    className="flex items-start gap-3 rounded-2xl bg-card p-4 shadow-soft"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        it.tone === "warn"
                          ? "bg-status-warn-bg text-status-warn"
                          : it.tone === "info"
                            ? "bg-status-info-bg text-status-info"
                            : "bg-primary-tint text-accent"
                      }`}
                    >
                      {it.icon}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">{it.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{it.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl bg-card p-4 shadow-soft text-center text-sm text-muted-foreground">
                지금은 특별히 주의할 환경 요인이 없어요
                <p className="mt-1 text-xs">쾌적한 하루예요</p>
              </div>
            )}
          </section>

          {/* Outdoor activity index */}
          {loading ? (
            <Skeleton className="mt-7 h-28 w-full rounded-2xl" />
          ) : outdoor ? (
            <section className="mt-7 rounded-2xl bg-card p-5 shadow-card">
              <p className="text-xs font-medium text-accent">오늘의 야외활동 지수</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">{outdoor.score}</span>
                <span className="text-sm text-muted-foreground">/ 100 · {outdoor.label}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${
                    outdoor.label === "좋음"
                      ? "bg-status-good"
                      : outdoor.label === "보통"
                        ? "bg-primary"
                        : "bg-status-warn"
                  }`}
                  style={{ width: `${outdoor.score}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-foreground">
                {outdoor.comment}
              </p>
              {outdoor.basis.length > 0 && (
                <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
                  아이데이 종합 지표(공인 지수 아님) · {outdoor.basis.join(" · ")} 기준
                </p>
              )}
            </section>
          ) : null}

          {/* Current weather hero */}
          {loading ? (
            <Skeleton className="mt-4 h-44 w-full rounded-2xl" />
          ) : (
            <section className="mt-4 rounded-2xl bg-card p-5 shadow-soft animate-fade-up">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-accent">현재 날씨</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-5xl font-bold text-foreground">
                      {weather?.temperature != null ? `${weather.temperature}°` : "--°"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">
                    {skyDesc(weather?.sky ?? null, weather?.pty ?? null)}
                  </p>
                </div>
                <span className="shrink-0 text-accent">
                  {skyIcon(weather?.sky ?? null, weather?.pty ?? null, 56)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">습도</p>
                  <p className="mt-0.5 font-bold text-foreground">
                    {weather?.humidity != null ? `${weather.humidity}%` : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">바람</p>
                  <p className="mt-0.5 font-bold text-foreground">
                    {weather?.windSpeed != null ? `${weather.windSpeed}m/s` : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">강수확률</p>
                  <p className="mt-0.5 font-bold text-foreground">
                    {weather?.pop != null ? `${weather.pop}%` : "--"}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Air quality */}
          <section className="mt-7">
            <h2 className="text-[17px] font-bold tracking-tight">대기질 · 미세먼지</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { k: "PM10", v: air?.pm10 ?? "--", label: gradeToLabel(air?.pm10Grade ?? null), unit: "㎍/㎥" },
                { k: "PM2.5", v: air?.pm25 ?? "--", label: gradeToLabel(air?.pm25Grade ?? null), unit: "㎍/㎥" },
                { k: "오존", v: air?.o3 != null ? air.o3 : "--", label: gradeToLabel(o3Grade(air?.o3 ?? null)), unit: "ppm" },
              ].map((d) => (
                <div
                  key={d.k}
                  className="rounded-2xl bg-card p-3 text-center shadow-soft"
                >
                  <p className="text-xs font-medium text-muted-foreground">{d.k}</p>
                  <p className="num mt-1 text-xl font-bold text-foreground">{d.v}</p>
                  <p className="text-xs text-faint">{d.unit}</p>
                  <p className={`mt-1 text-xs font-bold ${levelTone(d.label)}`}>{d.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Pollen */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[17px] font-bold tracking-tight">꽃가루 지수</h2>
              <a
                href="https://www.weather.go.kr/w/forecast/life/life-weather-index.do?tabIndex=4"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-accent"
              >
                기상청 출처
              </a>
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-20 w-full rounded-2xl" />
            ) : pollen && (pollen.oak !== null || pollen.pine !== null || pollen.weed !== null) ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { k: "참나무", v: pollen.oak, Icon: TreeDeciduous },
                  { k: "소나무", v: pollen.pine, Icon: TreePine },
                  { k: "잡초", v: pollen.weed, Icon: Sprout },
                ].map((d) => {
                  const label = pollenGradeLabel(d.v);
                  return (
                    <div
                      key={d.k}
                      className="rounded-2xl bg-card p-3 text-center shadow-soft"
                    >
                      <d.Icon className="mx-auto h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                      <p className="mt-1 text-xs font-medium text-muted-foreground">{d.k}</p>
                      <p className={`mt-1 text-sm font-bold ${levelTone(label)}`}>{label}</p>
                    </div>
                  );
                })}
              </div>
            ) : pollen ? (
              // 모든 종이 null = 200 응답이지만 제공 기간이 아님 (참나무·소나무 4~6월, 잡초 8~10월)
              <div className="mt-3 rounded-2xl bg-card p-4 shadow-soft text-center text-sm text-muted-foreground">
                지금은 꽃가루 예보 제공 기간이 아니에요
                <p className="mt-1 text-xs">참나무·소나무는 4~6월, 잡초는 8~10월에 제공돼요</p>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl bg-card p-4 shadow-soft text-center text-sm text-muted-foreground">
                꽃가루 데이터를 불러오지 못했어요
                <p className="mt-1 text-xs">잠시 후 다시 시도해주세요</p>
              </div>
            )}
          </section>

          {/* UV + Humidity */}
          <section className="mt-7 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card p-4 shadow-soft">
              <p className="text-xs font-medium text-muted-foreground">자외선 지수</p>
              <p className="mt-1 text-3xl font-bold text-foreground">
                {uv?.uvi != null ? uv.uvi : "--"}
              </p>
              <p className={`text-xs font-bold ${uv?.uvi != null ? levelTone(uvLabel(uv.uvi)) : "text-muted-foreground"}`}>
                {uv?.uvi != null ? uvLabel(uv.uvi) : (loading ? "로딩 중" : "데이터 없음")}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${
                    uv?.uvi == null
                      ? "bg-primary"
                      : uv.uvi >= 6
                        ? "bg-status-warn"
                        : uv.uvi >= 3
                          ? "bg-primary"
                          : "bg-status-good"
                  }`}
                  style={{ width: uv?.uvi != null ? `${Math.min(uv.uvi / 11 * 100, 100)}%` : "0%" }}
                />
              </div>
            </div>
            <div className="rounded-2xl bg-card p-4 shadow-soft">
              <p className="text-xs font-medium text-muted-foreground">온·습도</p>
              <p className="mt-1 text-3xl font-bold text-foreground">
                {weather?.humidity != null ? `${weather.humidity}%` : "--"}
              </p>
              <p
                className={`text-xs font-bold ${
                  (weather?.humidity ?? 50) <= 30 || (weather?.humidity ?? 50) >= 75
                    ? "text-status-warn"
                    : "text-status-neutral"
                }`}
              >
                {weather?.humidity != null ? humidityLabel(weather.humidity) : "로딩 중"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                실내 권장 40~60%
              </p>
            </div>
          </section>

          {/* Weekly */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[17px] font-bold tracking-tight">주간 날씨</h2>
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-64 w-full rounded-2xl" />
            ) : weekly && weekly.length > 0 ? (
              <>
                <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-soft">
                  {weekly.map((w, i) => (
                    <div
                      key={w.date}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        i !== weekly.length - 1 ? "border-b border-border" : ""
                      }`}
                    >
                      <div className="w-12">
                        {/* 요일 색: 달력 관례(토=파랑·일=빨강) — 브랜드 오렌지는 데이터에 쓰지 않는다 */}
                        <p
                          className={`text-sm font-bold ${
                            w.day === "토"
                              ? "text-status-info"
                              : w.weekend
                                ? "text-status-bad"
                                : "text-foreground"
                          }`}
                        >
                          {w.day}
                        </p>
                        <p className="text-xs text-faint">{w.date}</p>
                      </div>
                      <span className="shrink-0 text-muted-foreground">{weekIcon(w.icon, 24)}</span>
                      <div className="flex-1">
                        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                          {w.low != null && w.high != null && weekTempRange && (
                            <div
                              className="absolute h-full rounded-full bg-foreground/30"
                              style={{
                                left: `${((w.low - weekTempRange.min) / weekTempRange.span) * 100}%`,
                                width: `${Math.max((w.high - w.low) / weekTempRange.span * 100, 6)}%`,
                              }}
                            />
                          )}
                        </div>
                      </div>
                      <p className="w-20 text-right text-xs">
                        <span className="text-muted-foreground">{w.low != null ? `${w.low}°` : "--"}</span>
                        <span className="mx-1 text-muted-foreground/60">/</span>
                        <span className="font-bold text-foreground">{w.high != null ? `${w.high}°` : "--"}</span>
                      </p>
                      <p
                        className={`inline-flex w-10 items-center justify-end gap-0.5 text-right text-xs font-medium ${
                          w.rain >= 50 ? "text-status-info" : "text-muted-foreground"
                        }`}
                      >
                        <Droplet size={12} strokeWidth={1.75} aria-hidden />
                        {w.rain}%
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="h-3 w-3" />
                  {weekendHint}
                </p>
              </>
            ) : (
              <div className="mt-3 rounded-2xl bg-card p-4 shadow-soft text-center text-sm text-muted-foreground">
                주간 예보를 불러오지 못했어요
                <p className="mt-1 text-xs">잠시 후 다시 시도해주세요</p>
              </div>
            )}
          </section>

        </main>
      </div>
    </div>
  );
};

export default Environment;
