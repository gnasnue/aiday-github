"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapPin,
  ChevronDown,
  RefreshCw,
  Sun,
  Cloud,
  CloudSun,
  CloudSunRain,
  CloudRain,
  CloudSnow,
  CloudFog,
  CircleDashed,
  Flower2,
  Droplet,
  Droplets,
  Wind,
  Home,
  Trees,
  Umbrella,
  ChevronRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import PageHeader, { headerBtn } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ChildProfile, defaultProfiles, loadProfiles } from "@/lib/profile";
import { getActiveProfileId } from "@/lib/storage-keys";
import { useLocation } from "@/lib/useLocation";
import { withSubjectSuffix } from "@/lib/korean";
import {
  hasRespiratory,
  hasAllergy,
  hasSkin,
  ageInMonths,
  canRecommendMask,
} from "@/lib/domain/child-conditions";
import { computeOutdoorIndex } from "@/lib/outdoor-index";
import { humidityLabel, pollenLevelOf } from "@/lib/timeline";
import {
  fetchEnvData,
  envRegion,
  type EnvWeather,
  type EnvAir,
  type EnvPollen,
  type EnvUv,
  type EnvWeekDay,
} from "@/lib/env-data";
import {
  judgeWeekendDay,
  pickOutingPlaces,
  weekendConstitutionNote,
  mapSearchUrl,
  type WeekendVerdict,
} from "@/lib/weekend-outing";

// 나들이 장소 시드 지역은 환경 데이터 조회 지역과 같아야 한다(lib/env-data의 envRegion).
// 여기서 따로 하드코딩하면 지방 확장 시 데이터는 옮겨가고 장소만 서울에 남는다.

// verdict → 배지 표시 (v3: 순백 카드 위 상태색 텍스트, 브랜드 오렌지는 데이터에 안 씀)
// 인앱 수요 프로브 dedup 키 — 화면 안에서만 쓰지만 호출 자리에 리터럴을 두지 않는다
// (eslint no-restricted-syntax: 키는 상수로).
const OUTING_PROBE_KEY = "aiday:probe:weekend-outing";

const VERDICT_META: Record<WeekendVerdict, { label: string; tone: string; Icon: typeof Home }> = {
  indoor: { label: "실내 추천", tone: "text-status-info", Icon: Home },
  outdoor: { label: "실외 좋아요", tone: "text-status-good", Icon: Trees },
  caution: { label: "실외 대비", tone: "text-status-warn", Icon: Umbrella },
};

/* ----------------------------- helpers ----------------------------- */

const gradeToLabel = (g: number | null) =>
  g === 1 ? "좋음" : g === 2 ? "보통" : g === 3 ? "나쁨" : g === 4 ? "매우나쁨" : "알 수 없음";

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

const uvLabel = (v: number) =>
  v >= 11 ? "위험" : v >= 8 ? "매우높음" : v >= 6 ? "높음" : v >= 3 ? "보통" : "낮음";

// 꽃가루농도위험지수(0~3) → 라벨. 단계 매핑은 lib/timeline.ts 단일 출처.
const pollenGradeLabel = (g: number | null) => (g === null ? "--" : pollenLevelOf(g));

// 환경부 오존 1시간 기준 등급 (ppm): ≤0.03 좋음 / ≤0.09 보통 / ≤0.15 나쁨 / 초과 매우나쁨
const o3Grade = (ppm: number | null): number | null =>
  ppm === null ? null : ppm <= 0.03 ? 1 : ppm <= 0.09 ? 2 : ppm <= 0.15 ? 3 : 4;

/* ---- 지표 리스트 행 (2026-07-21 IA 재구성) ----
   등급이 주인공, 수치는 보조. 색·도트는 warn·bad에만 — "특이사항 없음 = 색 없음"(홈과 동일 원칙). */

type RowTone = "warn" | "bad" | "neutral" | "muted" | "off";

const labelToTone = (label: string): RowTone =>
  ["매우높음", "매우나쁨", "위험"].includes(label)
    ? "bad"
    : ["높음", "나쁨", "강함", "건조", "매우습함"].includes(label)
      ? "warn"
      : ["보통", "다습"].includes(label)
        ? "neutral"
        : "muted";

const gradeTextTone: Record<RowTone, string> = {
  warn: "text-status-warn",
  bad: "text-status-bad",
  neutral: "text-status-neutral",
  muted: "text-muted-foreground",
  off: "text-faint",
};

const rowIconTone = (tone: RowTone) =>
  tone === "warn"
    ? "bg-status-warn-bg text-status-warn"
    : tone === "bad"
      ? "bg-status-bad-bg text-status-bad"
      : tone === "off"
        ? "bg-muted text-faint"
        : "bg-muted text-muted-foreground";

type EnvRow = {
  key: string;
  name: string;
  sub?: string; // 이름 옆 보조 표기 (대기질 압축 행)
  note?: string; // 행 하단 한 줄 — 체질 각주(warn 행) 또는 결측 안내
  noteMuted?: boolean; // 결측 안내는 faint 톤
  Icon: LucideIcon;
  grade: string;
  value?: string;
  tone: RowTone;
};

/* ---- 야외활동 지수 히어로: 등급 → 상태색 (게이지 fill은 상태색만, 브랜드 오렌지 금지) ---- */
const HERO_TONE: Record<string, { text: string; fill: string }> = {
  좋음: { text: "text-status-good", fill: "bg-status-good" },
  보통: { text: "text-status-neutral", fill: "bg-status-neutral" },
  주의: { text: "text-status-warn", fill: "bg-status-warn" },
  나쁨: { text: "text-status-bad", fill: "bg-status-bad" },
};

/* ----------------------------- page ----------------------------- */

const Environment = () => {
  // 초기값은 SSR 안전한 defaultProfiles로. useState 초기값·렌더 중 localStorage를 읽으면
  // 서버(기본 프로필)와 클라 첫 렌더(저장 프로필)가 어긋나 하이드레이션 불일치(React #418)가 난다.
  // 저장된 프로필·활성 아이는 마운트 후 effect에서 주입한다.
  const [profiles, setProfiles] = useState<ChildProfile[]>(defaultProfiles);
  const [activeId, setActiveId] = useState<string | undefined>(defaultProfiles[0]?.id);
  useEffect(() => {
    const list = loadProfiles();
    setProfiles(list);
    try {
      const saved = getActiveProfileId();
      setActiveId(saved && list.some((p) => p.id === saved) ? saved : list[0]?.id);
    } catch {
      setActiveId(list[0]?.id);
    }
  }, []);
  const cur = profiles.find((p) => p.id === activeId) ?? profiles[0];
  const { location, locating, requestLocation } = useLocation();
  const [loading, setLoading] = useState(true);

  // 실제 API 데이터 — 타입·조회는 lib/env-data가 단일 출처(홈·팁과 같은 입력을 쓰기 위함)
  const [weather, setWeather] = useState<EnvWeather | null>(null);
  const [air, setAir] = useState<EnvAir | null>(null);
  const [pollen, setPollen] = useState<EnvPollen | null>(null);
  const [uv, setUv] = useState<EnvUv | null>(null);
  const [weekly, setWeekly] = useState<EnvWeekDay[] | null>(null);

  // 인앱 수요 프로브 — "주말 추천 더 보고 싶어요" 클릭 여부(로컬 dedup)
  const [outingProbed, setOutingProbed] = useState(false);
  useEffect(() => {
    try {
      setOutingProbed(localStorage.getItem(OUTING_PROBE_KEY) === "1");
    } catch {}
  }, []);

  // 위치는 원시값으로 분해해 의존성에 넣는다 — useLocation이 동기화마다 새 객체를 만들어
  // 객체 그대로 의존하면 값이 같아도 재조회가 돈다.
  const { gu, lat, lon, station } = location;
  const region = envRegion(location);
  const fetchAll = useCallback(
    async (signal?: AbortSignal) => {
      const data = await fetchEnvData({ gu, lat, lon, station }, { includeWeekly: true, signal });
      if (signal?.aborted) return;
      // 실패한 소스는 이전 값을 유지한다 — 새로고침 한 번 실패했다고 이미 보여준
      // 실측을 지우면, 사용자에겐 앱이 아는 것을 잊어버린 것처럼 보인다.
      if (data.weather) setWeather(data.weather);
      if (data.air) setAir(data.air);
      if (data.pollen) setPollen(data.pollen);
      if (data.uv) setUv(data.uv);
      if (data.weekly) setWeekly(data.weekly);
      setLoading(false);
    },
    [gu, lat, lon, station]
  );

  useEffect(() => {
    // 화면 이탈·기준지 변경 시 진행 중 요청을 끊는다 — 늦게 도착한 이전 위치의 응답이
    // 새 기준지 화면에 섞이지 않게.
    const ac = new AbortController();
    fetchAll(ac.signal);
    return () => ac.abort();
  }, [fetchAll]);

  /* 지금 환경 지표 — 단일 카드 리스트 행. 실측만 표시하고 결측은 정직하되 압축한다.
     체질 각주는 warn·bad 행에만 붙인다(경고+개인화가 동시에 성립할 때) — 판단은 홈 담당. */
  const envRows = useMemo<EnvRow[]>(() => {
    const rows: EnvRow[] = [];
    const conds = cur?.conditions ?? [];
    const watchAir = hasRespiratory(conds) || hasAllergy(conds);
    const watchSkin = hasSkin(conds);
    const childName = cur?.name ?? "아이";

    // 대기질 3종 — 동시 결측이면 1행으로 압축, 개별 결측은 "--"
    const airAllMissing =
      !air || (air.pm10Grade == null && air.pm25Grade == null && air.o3 == null);
    if (airAllMissing) {
      rows.push({
        key: "air",
        name: "대기질",
        sub: "미세·초미세·오존",
        Icon: Cloud,
        grade: "잠시 후",
        tone: "off",
        note: "측정소 응답 지연 — 잠시 후 자동 갱신돼요",
        noteMuted: true,
      });
    } else {
      const airRow = (
        key: string,
        name: string,
        Icon: LucideIcon,
        grade: number | null,
        v: number | null,
        unit: string
      ): EnvRow => {
        // 등급이 1~4 밖(null·0 등 결측 표기)이면 "알 수 없음" 대신 결측(--)으로 — 실측값이 있으면 수치만 보조 표기
        if (grade == null || grade < 1 || grade > 4)
          return { key, name, Icon, grade: "--", tone: "off", value: v != null ? `${v} ${unit}` : undefined };
        const label = gradeToLabel(grade);
        return {
          key,
          name,
          Icon,
          grade: label,
          tone: labelToTone(label),
          value: v != null ? `${v} ${unit}` : undefined,
        };
      };
      rows.push(airRow("pm10", "미세먼지", Cloud, air.pm10Grade, air.pm10, "㎍/㎥"));
      rows.push(airRow("pm25", "초미세먼지", CloudFog, air.pm25Grade, air.pm25, "㎍/㎥"));
      rows.push(airRow("o3", "오존", CircleDashed, o3Grade(air.o3), air.o3, "ppm"));
    }

    // 꽃가루 — 실패 / 제공 기간 외(참나무·소나무 3~6월, 잡초류 8~10월) / 정상
    const pollenVals = pollen
      ? [pollen.oak, pollen.pine, pollen.weed].filter((v): v is number => v != null)
      : [];
    if (!pollen) {
      rows.push({ key: "pollen", name: "꽃가루", Icon: Flower2, grade: "불러오지 못했어요", tone: "off" });
    } else if (pollenVals.length === 0) {
      rows.push({
        key: "pollen",
        name: "꽃가루",
        Icon: Flower2,
        grade: "제공 기간 아님",
        tone: "off",
        value: "참나무·소나무 3~6월 · 잡초류 8~10월",
      });
    } else {
      const max = Math.max(...pollenVals);
      const label = pollenGradeLabel(max);
      rows.push({
        key: "pollen",
        name: "꽃가루",
        Icon: Flower2,
        grade: label,
        tone: labelToTone(label),
        value: `지수 ${max}`,
      });
    }

    // 자외선
    if (uv?.uvi != null) {
      const label = uvLabel(uv.uvi);
      rows.push({ key: "uv", name: "자외선", Icon: Sun, grade: label, tone: labelToTone(label), value: `지수 ${uv.uvi}` });
    } else {
      rows.push({ key: "uv", name: "자외선", Icon: Sun, grade: "--", tone: "off" });
    }

    // 습도
    if (weather?.humidity != null) {
      const label = humidityLabel(weather.humidity);
      rows.push({
        key: "humidity",
        name: "습도",
        Icon: Droplets,
        grade: label,
        tone: labelToTone(label),
        value: `${weather.humidity}%`,
      });
    } else {
      rows.push({ key: "humidity", name: "습도", Icon: Droplets, grade: "--", tone: "off" });
    }

    // 바람 — 홈 타임라인과 동일 매핑 (≥9 강함 / ≥4 보통 / 약함)
    if (weather?.windSpeed != null) {
      const ws = weather.windSpeed;
      const label = ws >= 9 ? "강함" : ws >= 4 ? "보통" : "약함";
      rows.push({ key: "wind", name: "바람", Icon: Wind, grade: label, tone: labelToTone(label), value: `${ws} m/s` });
    } else {
      rows.push({ key: "wind", name: "바람", Icon: Wind, grade: "--", tone: "off" });
    }

    // 체질 각주 — 마스크는 연령 안전 규칙(canRecommendMask, 만 2세 미만 금지)을 공유한다
    const isAlert = (r?: EnvRow) => !!r && (r.tone === "warn" || r.tone === "bad");
    if (watchAir) {
      const maskOk = canRecommendMask(ageInMonths(cur?.age, cur?.birth));
      const maskNote = maskOk
        ? `호흡기가 민감한 ${childName}에겐 KF94 마스크가 필요해요`
        : `만 2세 미만 ${childName}에겐 마스크 대신 외출 줄이기가 안전해요`;
      const target = ["pm25", "pm10", "pollen"]
        .map((k) => rows.find((r) => r.key === k))
        .find(isAlert);
      if (target) target.note = maskNote;
    }
    if (watchSkin) {
      const uvRow = rows.find((r) => r.key === "uv");
      if (isAlert(uvRow)) uvRow!.note = `피부가 민감한 ${childName}에겐 선크림·모자가 좋아요`;
      const humRow = rows.find((r) => r.key === "humidity");
      if (isAlert(humRow) && humRow!.grade === "건조")
        humRow!.note = `피부가 민감한 ${childName}에겐 보습제를 자주 발라주세요`;
    }

    return rows;
  }, [air, pollen, uv, weather, cur]);

  // 전 지표 결측 — 카드 대신 정직한 안내 1장
  const envAllMissing = !weather && !air && !uv && !pollen;

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

  /* 이번 주말 나들이 판단 — 주간 데이터에서 주말(토/일) 최대 2일을 뽑아
     날씨(강수확률·기온·하늘상태)로 실내/실외를 판단하고, 아이 체질 한 줄 + 장소를 붙인다.
     미래일이라 대기질·자외선 예보는 없어 판단은 날씨 기반으로 한정된다. */
  const weekendPlan = useMemo(() => {
    if (!weekly) return null;
    const days = weekly.filter((w) => w.weekend).slice(0, 2);
    if (days.length === 0) return null;
    return days.map((d) => {
      const j = judgeWeekendDay(d);
      return {
        ...j,
        places: pickOutingPlaces(j.verdict, region),
        note: weekendConstitutionNote(j.verdict, cur?.conditions),
      };
    });
  }, [weekly, cur, region]);

  const sendOutingProbe = async () => {
    if (outingProbed) return;
    setOutingProbed(true);
    try {
      localStorage.setItem(OUTING_PROBE_KEY, "1");
    } catch {}
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: "weekend-outing",
          action: "want-more",
          meta: { verdicts: (weekendPlan ?? []).map((d) => d.verdict).join(",") },
        }),
      });
    } catch {}
    toast("의견 고마워요! 더 좋은 주말 추천을 준비할게요");
  };

  /* 오늘의 야외활동 지수 — 환경 수치 종합 (데이터 로딩 전엔 null).
     이 화면의 유일한 판단(히어로). 상세 판단·준비물은 홈 담당. */
  const outdoor = useMemo(() => {
    if (!weather && !air && !uv && !pollen) return null;
    // 지수 0은 "낮음"이라는 실측값이라 결측(null)과 구분해야 한다 —
    // null을 0으로 메우거나 `|| null`로 걷어내면 위 리스트 행과 근거 표기가 어긋난다.
    const pollenNums = pollen
      ? [pollen.oak, pollen.pine, pollen.weed].filter((v): v is number => v != null)
      : [];
    const pollenMax = pollenNums.length ? Math.max(...pollenNums) : null;
    return computeOutdoorIndex({
      pm10Grade: air?.pm10Grade ?? null,
      pm25Grade: air?.pm25Grade ?? null,
      uvi: uv?.uvi ?? null,
      pollenMax,
      pop: weather?.pop ?? null,
      humidity: weather?.humidity ?? null,
      temp: weather?.temperature ?? null,
      windSpeed: weather?.windSpeed ?? null,
    });
  }, [weather, air, uv, pollen]);

  const heroTone = outdoor ? HERO_TONE[outdoor.label] ?? HERO_TONE["보통"] : HERO_TONE["보통"];

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
        <PageHeader
          right={
            <button
              onClick={refresh}
              disabled={refreshing}
              className={headerBtn}
              aria-label="새로고침"
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.75} />
            </button>
          }
        />

        <main className="container-mobile pt-5">
          {/* 타이틀 + 위치 */}
          <section>
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-[20px] font-bold tracking-tight">
                {cur ? `${withSubjectSuffix(cur.name)} 위한 맞춤 환경 정보` : "맞춤 환경 정보"}
              </h1>
              {/* Location — 홈과 동일한 전역 위치(useLocation). 탭하면 실위치 기반으로 기준지 변경.
                  min-h-11: 44px 터치 타겟 (2026-07-19 감사 C-9) */}
              <button
                onClick={requestLocation}
                className="flex min-h-11 shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>{locating ? "위치 확인 중…" : `서울 ${location.gu}`}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {cur?.conditions?.length
                ? `${cur.name}의 건강 정보(${cur.conditions.join(", ")})를 반영했어요`
                : "프로필을 등록하면 더 정확한 추천을 받을 수 있어요"}
            </p>
          </section>

          {/* ① 야외활동 지수 — 히어로 (화면의 유일한 판단).
             등급(display 26)이 주인공, 점수는 보조. 게이지 fill은 상태색만 (C-3). */}
          {loading ? (
            <Skeleton className="mt-4 h-44 w-full rounded-2xl" />
          ) : outdoor ? (
            <section className="mt-4 rounded-2xl bg-card p-5 shadow-card animate-fade-up">
              <p className="eyebrow">오늘의 야외활동 지수</p>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span
                  className={`text-[26px] font-extrabold leading-none tracking-[-0.02em] ${heroTone.text}`}
                >
                  {outdoor.label}
                </span>
                <span className="num text-[15px] text-muted-foreground">{outdoor.score} / 100</span>
              </div>
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-label={`야외활동 지수 ${outdoor.score}점, ${outdoor.label}`}
                aria-valuenow={outdoor.score}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full rounded-full ${heroTone.fill}`}
                  style={{ width: `${outdoor.score}%` }}
                />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground break-keep">
                {outdoor.comment}
              </p>
              <p className="mt-3 border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
                아이데이 종합 지표(공인 지수 아님)
                {outdoor.basis.length > 0 ? ` · ${outdoor.basis.join(" · ")} 기준` : ""}
              </p>
            </section>
          ) : null}

          {/* ② 지금 환경 지표 — 단일 카드 리스트 행. 등급 우선, 수치는 보조(faint). */}
          <section className="mt-8">
            <h2 className="text-[17px] font-bold tracking-tight">지금 환경 지표</h2>
            {loading ? (
              <Skeleton className="mt-3 h-96 w-full rounded-2xl" />
            ) : envAllMissing ? (
              <div className="mt-3 rounded-2xl bg-card p-4 shadow-soft text-center text-sm text-muted-foreground">
                환경 데이터를 불러오지 못했어요
                <p className="mt-1 text-xs">네트워크 확인 후 잠시 뒤 다시 시도해주세요</p>
              </div>
            ) : (
              <>
                <ul className="mt-3 divide-y divide-border rounded-2xl bg-card px-4 shadow-soft">
                  {envRows.map((r) => (
                    <li key={r.key} className="flex min-h-14 items-center gap-3 py-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${rowIconTone(r.tone)}`}
                      >
                        <r.Icon size={19} strokeWidth={1.75} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[16px] font-medium ${
                            r.tone === "off" ? "text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {r.name}
                          {r.sub && (
                            <span className="ml-1.5 text-[13px] font-normal text-faint">{r.sub}</span>
                          )}
                        </p>
                        {r.note && (
                          <p
                            className={`mt-0.5 text-[13px] leading-snug break-keep ${
                              r.noteMuted ? "text-faint" : "text-muted-foreground"
                            }`}
                          >
                            {r.note}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`flex items-center justify-end gap-1.5 text-sm font-semibold ${gradeTextTone[r.tone]}`}
                        >
                          {(r.tone === "warn" || r.tone === "bad") && (
                            <span
                              className="h-[5px] w-[5px] shrink-0 rounded-full bg-current"
                              aria-hidden="true"
                            />
                          )}
                          {r.grade}
                        </p>
                        {r.value && (
                          <p className="num mt-0.5 text-[13px] text-faint">{r.value}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 px-1 text-xs text-muted-foreground/80">
                  기상청 · 에어코리아 실측
                  {air?.stationName ? ` — ${air.stationName} 측정소 기준` : ""}
                </p>
              </>
            )}
          </section>

          {/* ③ 주간 날씨 */}
          <section className="mt-8">
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
                      {/* 강수확률 ≥60% 강조 — home 시간대별 환경과 동일 기준(warn) */}
                      <p
                        className={`inline-flex w-10 items-center justify-end gap-0.5 text-right text-xs font-medium ${
                          w.rain >= 60 ? "text-status-warn" : "text-muted-foreground"
                        }`}
                      >
                        <Droplet size={12} strokeWidth={1.75} aria-hidden />
                        {w.rain}%
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-2xl bg-card p-4 shadow-soft text-center text-sm text-muted-foreground">
                주간 예보를 불러오지 못했어요
                <p className="mt-1 text-xs">잠시 후 다시 시도해주세요</p>
              </div>
            )}
          </section>

          {/* ④ 이번 주말 나들이 — 주간날씨 하단. 날씨로 실내/실외 판단 + 서울 큐레이션 장소.
             장소 "검색"이 아니라 판단 지원(코어)의 연장. 실사용 수요는 하단 프로브로 검증. */}
          {!loading && weekendPlan && weekendPlan.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[17px] font-bold tracking-tight">이번 주말 나들이</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                주말 날씨로 실내·실외를 판단하고, 그 조건에 맞는 서울 나들이 장소를 추천해요
              </p>

              <div className="mt-3 space-y-3">
                {weekendPlan.map((d) => {
                  const v = VERDICT_META[d.verdict];
                  return (
                    <div key={d.date} className="rounded-2xl bg-card p-4 shadow-soft">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-bold text-foreground">
                            {d.day === "오늘" ? "오늘" : `${d.day}요일`}
                          </span>
                          <span className="text-xs text-faint">{d.date}</span>
                          <span className="text-xs text-muted-foreground">· 강수 {d.rain}%</span>
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-soft px-2.5 py-1 text-[11px] font-bold ${v.tone}`}>
                          <v.Icon size={13} strokeWidth={1.75} aria-hidden />
                          {v.label}
                        </span>
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-foreground">{d.reason}</p>
                      {d.note && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.note}</p>
                      )}

                      {d.places.length > 0 && (
                        <ul className="mt-3 space-y-2">
                          {d.places.map((p) => (
                            <li key={p.name}>
                              <a
                                href={mapSearchUrl(p.name)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2.5 rounded-xl bg-muted/60 p-3"
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent">
                                  {p.kind === "indoor" ? (
                                    <Home size={18} strokeWidth={1.75} aria-hidden />
                                  ) : (
                                    <Trees size={18} strokeWidth={1.75} aria-hidden />
                                  )}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13px] font-semibold text-foreground">{p.name}</p>
                                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    {p.area} · {p.note}
                                  </p>
                                </div>
                                <ChevronRight className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 인앱 수요 프로브 — 클릭은 이벤트만 기록, 가짜 기능 없음.
                 버튼은 primary-tint+accent (R-2: 17px bold 미만 흰 텍스트 금지 규칙 준수) */}
              <div className="mt-3 rounded-2xl bg-card p-4 shadow-soft text-center">
                {outingProbed ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    의견 고마워요! 더 좋은 주말 추천을 준비할게요
                  </p>
                ) : (
                  <>
                    <p className="text-[13px] font-semibold text-foreground">
                      이런 주말 추천, 더 보고 싶으세요?
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      관심을 남겨주시면 더 많은 지역·장소로 넓혀갈게요
                    </p>
                    <button
                      onClick={sendOutingProbe}
                      className="mt-3 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary-tint px-4 text-[13px] font-semibold text-accent"
                    >
                      <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      더 보고 싶어요
                    </button>
                  </>
                )}
              </div>
            </section>
          )}

        </main>
      </div>
    </div>
  );
};

export default Environment;
