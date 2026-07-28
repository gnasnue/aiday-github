"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation"; ;
import { Bell, MapPin, ChevronDown, ChevronRight, Sun, Cloud, CloudSun, CloudRain, CloudSnow, RefreshCw, Share2 } from "lucide-react";
import PageHeader, { headerBtn } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import LineIcon from "@/components/LineIcon";
import ShareReportCard, { type ShareReportData } from "@/components/ShareReportCard";
import ReportFeedback from "@/components/ReportFeedback";
import HeroDecisionBrief, {
  type HeroIssue,
  type HeroNowWeather,
} from "@/components/HeroDecisionBrief";
import PrepChecklistCard from "@/components/PrepChecklistCard";
import MorningMessageAction from "@/components/MorningMessageAction";
import { buildCarePlan } from "@/lib/care-plan";
import {
  toBrief,
  splitHook,
  splitPrepText,
  buildAiChecklist,
  buildHeroEvidence,
  pickPrimaryPrep,
  pickSupportLine,
  discomfortIndex,
  DI_WARN,
  DI_SEVERE,
  HEAT_SEVERE_TEMP,
  COLD_SEVERE_TEMP,
} from "@/lib/hero-brief";
import { withSubjectSuffix } from "@/lib/korean";
import { hasRespiratory, hasAllergy, hasSkin } from "@/lib/domain/child-conditions";
import {
  ChildProfile,
  PROFILES_KEY,
  allowBrowseHome,
  defaultProfiles,
  fetchProfilesFromDb,
  isDemoProfile,
  loadProfiles,
  realLocalProfiles,
} from "@/lib/profile";
import { buildRecommendation, type Recommendation } from "@/lib/recommendation-engine";
import { useLocation } from "@/lib/useLocation";
import type { WeatherData } from "@/lib/weather-api";
import { buildTimeline, buildTomorrowTimeline, dustLabel, pollenLabel, type EnvRaw, type HomeTimeSlot } from "@/lib/timeline";
import { loadEnvSnapshot, saveEnvSnapshot } from "@/lib/env-cache";
import { buildPrepKeywords, isCriticalPrep } from "@/lib/prep";
import { canonicalPrep } from "@/lib/prep-vocab";
import { ageInMonths, canRecommendMask, isSweatProne } from "@/lib/domain/child-conditions";
import { perfStart, perfMark, perfReport, perfEnabled, type PerfSession } from "@/lib/perf";
import { track, ageBand } from "@/lib/analytics";
import { localDateStr } from "@/lib/date";
import { REPORT_CACHE_VERSION, reportCacheKey } from "@/lib/report-cache";
import { fetchDailyReport, saveDailyReport } from "@/lib/daily-report-store";
import DayReviewEntryCard from "@/components/DayReviewEntryCard";
import HomeHealthTips from "@/components/HomeHealthTips";
import type { EnvData } from "@/lib/env-data";
import { saveCheckedKeys } from "@/lib/memory/checklist-state";
import { isProvisionalReport, needsMorningRefresh } from "@/lib/report-freshness";

/* ---- AI 리포트 당일 캐시: 날짜 키 + 환경 급변 판정 ---- */
// localDateStr(lib/date.ts): 로컬 기준 YYYY-MM-DD — 리포트 피드백 1일 1회 키와 공유

// 캐시 키·버전(현행 v32)·버전 이력 주석은 lib/report-cache.ts로 추출(2026-07-28) —
// 오늘의 마무리 화면이 아침 판단 스냅샷을 같은 키로 읽는다. 버전 승격도 그 파일에서 한다.

// 리포트 판단에 실제로 들어가는 프로필 입력만 정규화한 시그니처. 생성 시점 값을 캐시에 저장해
// 같은 날 체질·민감도·일과가 바뀌면 당일 고정 캐시를 버리고 재생성한다.
// - 이름·이모지·성별 등 문구 표시용 필드는 제외 — 판단이 같은데 재생성(Claude 비용)하지 않기 위해.
// - age·birth는 서버의 마스크 연령 게이트(만 2세 미만) 판정에 쓰이므로 포함한다.
// - JSON.parse 유래 객체는 키 순서가 다를 수 있어 필드를 명시 나열해 순서를 고정한다.
const profileSignature = (p: ChildProfile): string =>
  JSON.stringify({
    age: p.age ?? "",
    birth: p.birth ? { year: p.birth.year, month: p.birth.month, day: p.birth.day ?? "" } : null,
    conditions: [...(p.conditions ?? [])].sort(),
    conditionEtc: (p.conditionEtc ?? "").trim(),
    cold: p.cold ?? "",
    hot: p.hot ?? "",
    sweat: p.sweat ?? "",
    schedule: {
      goSchool: p.schedule?.goSchool ?? "",
      outdoorStart: p.schedule?.outdoorStart ?? "",
      outdoorEnd: p.schedule?.outdoorEnd ?? "",
      leaveSchool: p.schedule?.leaveSchool ?? "",
      eveningStart: p.schedule?.eveningStart ?? "",
      eveningEnd: p.schedule?.eveningEnd ?? "",
    },
  });

// 리포트 생성 시점의 환경 요약. 당일 고정 캐시를 깨고 재생성할 "급변"인지 비교하는 근거.
type EnvSignature = {
  rain: string; // 시각별 강수 형태 유무 ("06:00:0,09:00:1,...")
  maxPop: number; // 하루 최대 강수확률
  dustBad: boolean; // 미세먼지(PM10) 나쁨(3) 이상 여부
  pm25Bad: boolean; // 초미세먼지(PM2.5) 나쁨(3) 이상 여부
  khaiBad: boolean; // 통합대기환경지수 나쁨(3) 이상 여부
  uvHigh: boolean; // 자외선 강함(지수 6) 이상 여부
  pollenHigh: boolean; // 꽃가루 높음(지수 2) 이상 여부
  temps: Record<string, number>; // 시각별 기온
  hums: Record<string, number>; // 시각별 습도(예보) — 결측 시각은 제외
};

const envSignature = (
  w: { hourlyForecast?: { hour: string; temp: number; pty: number | null; pop: number | null; humidity?: number | null }[] } | null,
  a: { pm10Grade?: number | null; pm25Grade?: number | null; khaiGrade?: number | null } | null,
  uv: { uvi?: number | null; hourly?: Record<string, number | null> } | null,
  pollen: { oak?: number | null; pine?: number | null; weed?: number | null } | null
): EnvSignature => {
  const hours = w?.hourlyForecast ?? [];
  const uvVals = uv?.hourly ? Object.values(uv.hourly).filter((v): v is number => v != null) : [];
  const uvPeak = uvVals.length ? Math.max(...uvVals) : uv?.uvi ?? null;
  const pollenVals = pollen
    ? [pollen.oak, pollen.pine, pollen.weed].filter((v): v is number => v != null)
    : [];
  const pollenMax = pollenVals.length ? Math.max(...pollenVals) : null;
  return {
    rain: hours.map((h) => `${h.hour}:${h.pty && h.pty > 0 ? 1 : 0}`).join(","),
    maxPop: hours.reduce((m, h) => Math.max(m, h.pop ?? 0), 0),
    dustBad: (a?.pm10Grade ?? 1) >= 3,
    pm25Bad: (a?.pm25Grade ?? 1) >= 3,
    khaiBad: (a?.khaiGrade ?? 1) >= 3,
    uvHigh: (uvPeak ?? 0) >= 6,
    pollenHigh: (pollenMax ?? 0) >= 2, // 기상청 꽃가루농도위험지수 0~3에서 '높음'은 2
    temps: Object.fromEntries(hours.map((h) => [h.hour, h.temp])),
    hums: Object.fromEntries(
      hours.filter((h): h is typeof h & { humidity: number } => typeof h.humidity === "number")
        .map((h) => [h.hour, h.humidity])
    ),
  };
};

// 급변 기준: 비 소식 생김/사라짐 · 강수확률 30%p 이상 변동 · 대기질(PM10·PM2.5·통합) 나쁨 경계 통과 ·
// 자외선 강함 경계 통과 · 꽃가루 높음 경계 통과 · 같은 시각 기온 예보 3°C 이상 · 같은 시각 습도 예보
// 20%p 이상 변동. 습도는 같은 시각 예보끼리 비교해 하루 주기의 자연 변동(아침↔낮)이 재생성(비용)을
// 유발하지 않게 한다. 스냅샷이 없는 구캐시는 급변 아님으로 취급.
const envChanged = (prev: EnvSignature | undefined, cur: EnvSignature): boolean => {
  if (!prev) return false;
  if (prev.rain !== cur.rain) return true;
  if (Math.abs((prev.maxPop ?? 0) - cur.maxPop) >= 30) return true;
  if (!!prev.dustBad !== cur.dustBad) return true;
  if (!!prev.pm25Bad !== cur.pm25Bad) return true;
  if (!!prev.khaiBad !== cur.khaiBad) return true;
  if (!!prev.uvHigh !== cur.uvHigh) return true;
  if (!!prev.pollenHigh !== cur.pollenHigh) return true;
  if (
    Object.entries(cur.hums ?? {}).some(([h, v]) => {
      const pv = prev.hums?.[h];
      return typeof pv === "number" && Math.abs(pv - v) >= 20;
    })
  )
    return true;
  return Object.entries(cur.temps).some(([h, t]) => {
    const pt = prev.temps?.[h];
    return typeof pt === "number" && Math.abs(pt - t) >= 3;
  });
};

/* ---- 상태 3단계 (good/neutral/warn) — 표시 계층 전용 매핑 ---- */
type StatusTone = "good" | "neutral" | "warn";

// 값 텍스트 색: 상태를 나타내는 모든 색은 3단계 토큰 중 하나 (예외 없음)
const toneText: Record<StatusTone, string> = {
  good: "text-status-good",
  neutral: "text-status-neutral",
  warn: "text-status-warn",
};
// 상태 도트: neutral은 옅은 도트(환경 칩) 또는 숨김(시간대 카드)
const toneDot: Record<StatusTone, string> = {
  good: "bg-status-good",
  neutral: "bg-status-neutral-dot",
  warn: "bg-status-warn",
};

// 환경 칩: 엔진의 warn 판정만 오렌지, 나머지(좋음·보통)는 무색(neutral) — 초록 미사용
const badgeTone = (tone: "ok" | "warn"): StatusTone => (tone === "warn" ? "warn" : "neutral");

/* ---- 하늘상태(SKY/PTY) → 날씨 아이콘 (표시 계층 전용) ---- */

// 시간대별 카드 아이콘: 실제 예보의 SKY/PTY를 반영해 슬롯마다 다르게 표시
// SKY 1=맑음 3=구름많음 4=흐림 / PTY 0=없음 1=비 2=비/눈 3=눈 4=소나기
// size는 히어로 우상단(32) 재사용을 위한 것 — 두 카드가 같은 함수를 써야 같은 하늘을 그린다
const skySlotIcon = (sky: number | null, pty: number | null, size = 24) => {
  const props = { size, strokeWidth: 1.5, className: "text-muted-foreground" } as const;
  if (pty && pty > 0) return pty === 3 ? <CloudSnow {...props} /> : <CloudRain {...props} />;
  if (sky === 1) return <Sun {...props} />;
  if (sky === 4) return <Cloud {...props} />;
  return <CloudSun {...props} />; // 구름많음(3) 및 기본값
};

// 체크리스트 아이콘: AI가 "☂️ 우산" 형태로 동적 생성하므로 키워드 매핑 + fallback

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


/* ---- 하루 케어 플랜: 슬롯별 "특이사항" 요약 ---- */

// 준비물 칩 강조는 아이템 종류가 아니라 신호 긴급도로 판정한다 — lib/prep.ts isCriticalPrep.

// 슬롯 라벨 정리: "등원시간" → "등원", "하원시간" → "하원"
const careLabel = (label: string) => label.replace(/시간$/, "");

// 온도 옆에 붙일 "특이사항" 지표 — 2단계로 나눠 낸다 (2026-07-20 확정 규칙):
//  · 경고급(기준치 이상/이하): 비 소식·나쁨·높음·강함·건조 등. 있으면 이것만 노출.
//  · 관찰급('보통'): 아이 프로파일(호흡기·알레르기·피부) 기반 미리 챙기기 신호.
//    경고급이 하나라도 있으면 병기하지 않고, 없을 때만 1개까지만 노출한다.
const slotNotables = (slot: HomeTimeSlot, conditions: string[] = []): string[] => {
  const watchAir = hasRespiratory(conditions) || hasAllergy(conditions); // 미세먼지·꽃가루 민감
  const watchUv = hasSkin(conditions); // 자외선 민감
  const watchDry = hasSkin(conditions); // 건조 민감
  const warn: string[] = [];
  const watch: string[] = [];

  if ((slot.pty != null && slot.pty > 0) || (slot.pop != null && slot.pop >= 60)) warn.push("비 소식");

  if (slot.dust === "나쁨" || slot.dust === "매우나쁨") warn.push(`미세먼지 ${slot.dust}`);
  else if (watchAir && slot.dust === "보통") watch.push("미세먼지 보통");

  if (slot.pollen === "높음" || slot.pollen === "매우높음") warn.push(`꽃가루 ${slot.pollen}`);
  else if (watchAir && slot.pollen === "보통") watch.push("꽃가루 보통");

  if (slot.uv === "강함" || slot.uv === "매우강함") warn.push(`자외선 ${slot.uv}`);
  else if (watchUv && slot.uv === "보통") watch.push("자외선 보통");

  if (slot.wind === "강함") warn.push("바람 강함");

  if (slot.humidity > 0 && slot.humidity <= 40) warn.push("건조");
  else if (watchDry && slot.humidity > 0 && slot.humidity <= 50) watch.push("건조 주의");

  // 더위·추위 — 히어로 warn 어휘와 **같은 임계**를 쓴다(lib/hero-brief.ts 상단 주석 참조).
  // 히어로만 더위·고습을 모르던 결함(2026-07-27)을 고치면서 두 곳을 함께 개정했다 —
  // 한쪽만 바뀌면 "히어로는 더위 경고 / 시간대 카드 특이사항엔 더위 없음"으로 다시 갈린다.
  const di = discomfortIndex(slot.temp, slot.humidity);
  if ((di != null && di >= DI_SEVERE) || slot.temp >= HEAT_SEVERE_TEMP) warn.push("더위 매우 심함");
  else if (di != null && di >= DI_WARN) warn.push("더위 심함");

  if (slot.temp <= COLD_SEVERE_TEMP) warn.push("추위 심함");

  return warn.length > 0 ? warn : watch.slice(0, 1);
};

// 준비물 → 그 준비물을 정당화하는 환경 신호. 체크리스트 사유를 만들 때
// slotNotables()가 낸 특이사항 중 이 신호에 해당하는 것만 골라 쓴다.
// (매칭 없으면 체감 온도로 — 물통·여벌 옷처럼 더위가 근거인 준비물)
const PREP_SIGNAL: { match: RegExp; signal: RegExp }[] = [
  { match: /우산|우비/, signal: /비 소식/ },
  { match: /마스크|실내놀이/, signal: /미세먼지|꽃가루/ },
  { match: /선크림|모자/, signal: /자외선/ },
  { match: /보습|로션|크림/, signal: /건조/ },
  { match: /방한|목수건|겉옷|가디건|바람막이/, signal: /바람|건조/ },
];


const Home = () => {
  const router = useRouter();
  const pathname = usePathname();
  // 초기값은 SSR 안전한 defaultProfiles로 둔다. loadProfiles()·localStorage를 useState 초기값에서
  // 읽으면 서버(기본 프로필)와 클라이언트 첫 렌더(저장된 프로필/활성 아이)가 어긋나 하이드레이션
  // 불일치(React #418)가 난다 — 프로필 이름·활성 아이 기준 콘텐츠가 통째로 달라지기 때문.
  // 실제 저장값은 아래 마운트 effect에서 주입한다(로그인 사용자는 이후 DB 조회가 다시 덮어씀).
  const [profiles, setProfiles] = useState<ChildProfile[]>(defaultProfiles);
  const [active, setActive] = useState<string>(defaultProfiles[0].id);
  useEffect(() => {
    const list = loadProfiles();
    setProfiles(list);
    try {
      const saved = localStorage.getItem("aiweather:activeProfileId");
      setActive(saved && list.some((p) => p.id === saved) ? saved : list[0].id);
    } catch {
      setActive(list[0].id);
    }
  }, []);
  // 체크 상태는 항목 key 기준 — 인덱스 기준이면 목록이 교체될 때(폴백→AI 도착,
  // 급변 재생성) 체크가 엉뚱한 항목으로 옮겨간다. 같은 key(같은 준비물)는 목록이
  // 바뀌어도 체크가 유지되고, 사라진 항목의 체크는 자연히 무시된다.
  const [checked, setChecked] = useState<string[]>([]);
  const { location, locating, requestLocation } = useLocation();
  const [loading, setLoading] = useState(true);
  // 실측 도착 전엔 null — mock 초기값이 실측인 척 렌더되지 않게 한다 (2026-07 조사: 무표기 폴백).
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  // 현재 날씨 스칼라(지금 날씨 카드용) — weatherData는 축약본이라 원본 스칼라를 따로 보관
  const [curWeather, setCurWeather] = useState<{
    temperature: number | null; feelsLike: number | null; windSpeed: number | null;
    humidity: number | null; pop: number | null; sky: number | null; pty: number | null;
  } | null>(null);
  const [envRaw, setEnvRaw] = useState<EnvRaw | null>(null);
  const [aiHook, setAiHook] = useState<string>("");
  const [aiMessage, setAiMessage] = useState<string>("");
  const [aiChecklist, setAiChecklist] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  // 스트리밍 중 hook만 먼저 도착한 구간 — 헤드라인은 노출하되 본문은 스켈레톤 유지
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiError, setAiError] = useState(false);
  // 429(한도 초과) 전용 — 게스트/로그인 여부에 따라 카드 안에 다른 안내+CTA를 영구 표시한다
  // (토스트는 사라지므로 별도 상태로 붙잡아 둔다). 다른 원인의 실패에서는 null로 유지.
  const [reportLimitReached, setReportLimitReached] = useState<{ isGuest: boolean } | null>(null);
  // 수동 새로고침의 "환경 재fetch" 구간 — 이 동안엔 aiLoading이 아직 false라, 별도 플래그로
  // 리포트 스켈레톤·버튼 비활성·아이콘 회전을 유지한다. env 재조회가 끝나 리포트 생성으로
  // 넘어가는 순간(aiLoading=true) 해제되고, 이후는 aiLoading이 이어받는다.
  const [refreshing, setRefreshing] = useState(false);
  // 수동 새로고침 트리거 — 증가시키면 env effect가 재실행돼 날씨·대기질을 새로 가져온다.
  const [refreshNonce, setRefreshNonce] = useState(0);
  // 현재 표시 중인 리포트의 생성 시각 — 헤더에 "7월 13일 (월) 07:30" 형태로 노출
  const [reportTs, setReportTs] = useState<number | null>(null);
  // 리포트 본문(message) 펼침 여부 — 랜딩 시엔 hook만 노출하고 본문은 접어둔다.
  // 바쁜 부모가 앱을 켰을 때 "아침의 결론(hook)"이 한눈에 들어오게 하고,
  // 자세한 설명은 원할 때만 펼쳐본다. 매 진입마다 접힌 상태로 시작(의도된 기본값).
  const [reportExpanded, setReportExpanded] = useState(false);
  // 마운트 즉시 당일 캐시로 리포트를 이미 그렸는지 — true면 env(uv/pollen) 게이트를
  // 기다리는 동안·재검증 중에도 스켈레톤 없이 캐시 내용을 유지한다(재방문 체감 지연 제거).
  const [reportPrimed, setReportPrimed] = useState(false);
  // env 단계가 끝나 "리포트를 시도할지 말지"가 정해졌는지. false인 동안 히어로는 스켈레톤을
  // 유지한다 — 종전엔 `loading`이 env 1차 게이트(weather+air)에서 풀리는데 리포트 착수는
  // 전체 게이트(+uv·pollen) 뒤라, 그 사이 수백 ms 동안 규칙 기반 카드가 통째로 노출됐다
  // (2026-07-28 계측: 랜딩 6.1초 지점에 규칙 문장이 헤드라인으로 떴다 사라짐).
  // weather 실패로 리포트를 아예 못 만드는 경우에도 true가 되어 폴백 카드가 정상 노출된다.
  const [reportAttempted, setReportAttempted] = useState(false);
  const [sharing, setSharing] = useState(false); // 공유 이미지 생성 중
  const shareCardRef = useRef<HTMLDivElement>(null); // 공유 캡처 대상(off-screen)
  const forceRefreshRef = useRef(false); // 수동 새로고침: 당일 캐시 무시하고 재생성
  // 수동 새로고침 시 env effect가 "전체 스켈레톤(loading) 없이" 조용히 재조회하도록 하는 표식.
  // 초기 로드·위치 변경(false)은 종전대로 스켈레톤을 띄우고, 새로고침(true)은 기존 화면을
  // 유지한 채 데이터만 갈아끼운다. fetchEnv 진입 시 1회 소비된다.
  const softRefreshRef = useRef(false);
  // reportPrimed의 동기 미러 — 마운트 시 생성된 env effect 클로저가 항상 최신 값을 읽게 한다
  // (state는 클로저에 갇혀 stale해지므로, env 흐름 분기는 ref로 판정).
  const primedRef = useRef(false);
  const lastManualRefreshRef = useRef(0);
  const weatherRawRef = useRef<object | null>(null);
  const airRawRef = useRef<object | null>(null);
  const uvRawRef = useRef<object | null>(null);
  const pollenRawRef = useRef<object | null>(null);
  // 홈 지연 계측 세션 — 환경 API~AI 리포트 워터폴 구간 실측 (?perf=1일 때만 콘솔 출력)
  const perfRef = useRef<PerfSession | null>(null);
  // 리포트 요청 세대 — 프로필 전환·DB 복원(cur.id 변경)으로 새 요청이 시작되면 증가시켜,
  // 늦게 끝난 이전 아이의 응답이 현재 화면 상태를 덮어쓰지 못하게 한다(stale 응답 방어).
  const reportGenRef = useRef(0);
  // 진행 중인 리포트 요청 — single-flight(같은 아이 중복 방지) + 새 요청 시작·언마운트 시
  // 이전 요청 취소(중복 Claude 생성·비용 차단). 서버는 req.signal로 Anthropic 스트림까지 abort.
  const activeReportRef = useRef<{ ctrl: AbortController; childId: string } | null>(null);
  // 현재 활성 프로필 id의 최신값(렌더마다 동기 갱신) — isCurrent()가 effect 실행 순서에 의존하지
  // 않고, "요청의 아이가 아직 활성인가"를 항상 최신 기준으로 판단하게 한다(stale 표시 방지).
  const activeIdRef = useRef<string | null>(null);

  // Refresh profiles when returning from onboarding
  useEffect(() => {
    const list = loadProfiles();
    setProfiles(list);
    if (!list.find((p) => p.id === active)) {
      setActive(list[0].id);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // 로그인 상태면 DB 프로필을 localStorage로 복원 (다른 기기·재로그인 대응).
  // 로그인했는데 DB도 로컬 실프로필도 없으면(온보딩 미완료) 데모 대신 온보딩으로 유도.
  useEffect(() => {
    fetchProfilesFromDb().then((res) => {
      if (res.status !== "ok") return; // 게스트·조회 실패 → 로컬 상태 유지
      if (res.list.length) {
        try { localStorage.setItem(PROFILES_KEY, JSON.stringify(res.list)); } catch {}
        setProfiles(res.list);
        setActive((prev) => (res.list.find((p) => p.id === prev) ? prev : res.list[0].id));
      } else if (!realLocalProfiles().length && !allowBrowseHome()) {
        router.replace("/onboarding");
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist active profile
  useEffect(() => {
    try { localStorage.setItem("aiweather:activeProfileId", active); } catch {}
  }, [active]);

  // 실제 날씨 + 대기질 데이터 로드
  // 화면 셸·카드는 weather·air가 도착하면 바로 표시(loading 해제)해 체감 로딩을 줄이고,
  // AI 리포트는 자외선·꽃가루까지 4개 입력이 모두 준비된 뒤 착수한다(리포트가 이 값들을 반영).
  useEffect(() => {
    // Strict Mode 이중 실행·언마운트 시 이전 흐름을 취소해 활성 env 흐름을 하나로 제한한다.
    // 이로써 계측 세션이 하나만 진행되고(리포트 세션과의 연결이 보장됨), 실서비스에서도
    // 언마운트 후 상태 갱신·중복 요청을 막는다.
    const controller = new AbortController();
    const fetchEnv = async () => {
      // 수동 새로고침(soft)이면 전체 스켈레톤을 띄우지 않고 기존 화면을 유지한 채 데이터만 갈아끼운다.
      // 초기 로드·위치 변경은 종전대로 loading 스켈레톤을 노출한다.
      const soft = softRefreshRef.current;
      softRefreshRef.current = false;
      // 스냅샷 캐시 키/무효화는 위치 원시값만 필요하다(객체 identity 아님) — effect deps와 정렬.
      const snapLoc = { station: location.station, lat: location.lat, lon: location.lon };
      // A2 즉시 페인트: 초기 로드(비soft)에서 같은 위치의 신선한(≤90분) env 스냅샷이 있으면,
      // weather+air 네트워크를 기다리지 않고 그 값으로 시간대별 환경·케어 플랜·"지금 날씨"를
      // 즉시 그린다. 이후 아래 fetch가 조용히(스켈레톤 없이) 재검증해 최신값으로 덮어쓴다.
      let hydrated = false;
      if (!soft) {
        const snap = loadEnvSnapshot(snapLoc);
        if (snap) {
          setEnvRaw(snap.env);
          if (snap.curWeather) setCurWeather(snap.curWeather);
          weatherRawRef.current = snap.env.weather;
          airRawRef.current = snap.env.air;
          uvRawRef.current = snap.env.uv;
          pollenRawRef.current = snap.env.pollen;
          setLoading(false);
          hydrated = true;
        }
      }
      // 스냅샷으로 그렸으면 스켈레톤을 켜지 않는다(즉시 페인트 유지). 스냅샷이 없으면 종전대로.
      if (!soft && !hydrated) setLoading(true);
      // 계측 시작 — home 마운트 직후 환경 API 착수 시점. 세션을 로컬로 캡처해
      // 이후 비동기 응답이 항상 이 세션에 마킹하게 한다(공유 ref 덮어쓰기 오염 방지).
      const perf = perfStart();
      perfRef.current = perf;
      perfMark(perf, "env_start");
      // landing→home 전환 시각이 있으면 그 구간(landing 마운트~home env_start; 인증 자체는 제외)을
      // 참고용으로 남긴다. (SPA 클라이언트 네비라 performance.now()가 문서 수명 내에서 연속)
      try {
        const navT = Number(sessionStorage.getItem("aiday:perf:navToHome"));
        if (navT > 0 && perfEnabled()) {
          console.log(`[perf] landing(프로필 조회 포함)→home env_start [${perf.id}]: ${Math.round(perf.t0 - navT)}ms`);
        }
        sessionStorage.removeItem("aiday:perf:navToHome");
      } catch {}
      // getJson: 부모 취소(controller)와 타임아웃을 요청별 AbortController에 수동 연결한다.
      // AbortSignal.any()는 Safari 17.4+ 전용이라 구형 iOS에서 throw → 스켈레톤 영구 정지
      // 위험이 있어 쓰지 않는다 (AbortController·setTimeout만으로 광범위 호환).
      // 개별 완료 마커로 API별 결과를 남긴다: <api>_ok / _timeout / _err. Σ(누적)가 각 API의
      // 응답시간 근사값이다(4개가 env_start 직후 동시 착수하므로). 취소된 흐름은 마킹하지 않는다.
      // retries: 실패(널·에러) 시 재시도 횟수. 첫 시도가 콜드 캐시·발표지연으로 늦거나 타임아웃돼도,
      // 재시도 땐 서버 캐시(revalidate)가 데워져 즉시 성공하는 경우가 많아, 한 번 끊기면 폴백에
      // 갇히던 문제(자동 재시도 없음)를 없앤다. 마킹은 종료 시도의 최종 결과로 한 번만 남겨 Σ를 보존한다.
      const getJson = (
        url: string,
        timeoutMs: number,
        mark: string,
        retries = 0,
        retryDelayMs = 1200
      ): Promise<any> => {
        const attempt = (n: number): Promise<any> => {
          const ac = new AbortController();
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            ac.abort();
          }, timeoutMs);
          const onParentAbort = () => ac.abort();
          controller.signal.addEventListener("abort", onParentAbort, { once: true });
          return fetch(url, { signal: ac.signal })
            .then((r) => r.json())
            .catch(() => null)
            .then((r) => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", onParentAbort);
              const ok = r && !r.error;
              const willRetry = !ok && n > 0 && !controller.signal.aborted;
              if (!controller.signal.aborted && !willRetry) {
                perfMark(perf, ok ? `${mark}_ok` : timedOut ? `${mark}_timeout` : `${mark}_err`);
              }
              if (willRetry) {
                return new Promise<void>((res) => setTimeout(res, retryDelayMs)).then(() =>
                  controller.signal.aborted ? r : attempt(n - 1)
                );
              }
              return r;
            });
        };
        return attempt(retries);
      };

      // 요청 시작·await·상태 갱신을 모두 try로 감싸 예기치 못한 throw에도 setLoading(false)에
      // 도달하게 한다(스켈레톤 영구 정지 방지).
      try {
        // 4개 모두 즉시 병렬 착수 (개별 실패·타임아웃은 null 폴백).
        // 공공 API(data.go.kr)가 느려지는 날 리포트 착수가 무한정 지연되지 않도록 상한을 둔다.
        // 클라 타임아웃(9s) > 서버 라우트 상한(uv/pollen AbortSignal.timeout(8000))으로 둔다.
        // 종전엔 uv/pollen 클라 5s < 서버 8s라, 상류가 5~8초 걸리는 순간 클라가 서버의 캐시
        // 적재(next.revalidate) 완주 전에 끊어 캐시가 영영 안 데워졌다 → 매 진입 5초 타임아웃 +
        // uv/pollen 결측 폴백에 갇힘(캐시미스 사이클). 클라를 서버보다 길게 잡아 서버가 상류를
        // 완주·캐싱하도록 하면, 이후 진입은 revalidate 캐시 히트로 즉시 통과한다.
        // weather·air는 화면 셸의 근거라 실패 시 1회 재시도(콜드 캐시 첫 로드가 폴백에 갇히지 않게).
        // uv·꽃가루는 재시도를 두지 않는다 — 재시도까지 두면 최악 ~19s로 uv/pollen이 weather를
        // 넘어 새 게이트 병목이 된다(eng review 결론, 타임아웃 상향 단독 채택).
        const weatherP = getJson(`/api/weather?lat=${location.lat}&lon=${location.lon}`, 9000, "weather", 1);
        const airP = getJson(`/api/air?station=${encodeURIComponent(location.station)}`, 9000, "air", 1);
        const uvP = getJson("/api/uv?region=서울", 9000, "uv");
        const pollenP = getJson("/api/pollen?region=서울", 9000, "pollen");

        // 1) weather·air 도착 → 화면 셸·상단 카드·시간대 카드를 먼저 표시 (uv·꽃가루는 이후 채움)
        const [w, a] = await Promise.all([weatherP, airP]);
        if (controller.signal.aborted) return; // 취소된(stale) 흐름 — 상태·계측 갱신 안 함
        perfMark(perf, "env_primary_gate"); // weather+air 게이트 통과 (화면 셸 표시 가능)
        weatherRawRef.current = w; // fetchReport에서 재사용 (T4: 중복 호출 방지)
        airRawRef.current = a;
        setEnvRaw((prev) => ({
          weather: w && !w.error ? w : null,
          air: a && !a.error ? a : null,
          // uv/pollen을 여기서 null로 비우지 않는다 — 스냅샷 즉시 페인트·수동 새로고침의 재검증
          // 중 직전 값을 유지해 시간대 카드가 깜빡이지 않게 한다(uv/pollen은 region=서울 전역값이라
          // 구 변경에도 유효). 첫 콜드 로드는 prev가 없어 null → 종전과 동일. 아래 full gate에서 갱신.
          uv: prev?.uv ?? null,
          pollen: prev?.pollen ?? null,
        }));
        if (w && !w.error && w.temperature != null) {
          const windLabel = w.windSpeed >= 9 ? "강함" : w.windSpeed >= 4 ? "보통" : "약함";
          // mock 블렌딩 없이 실측만으로 구성 — 습도 결측(드묾)은 경고 미판정 중립값 50,
          // 꽃가루·자외선은 후속 게이트에서 실데이터로 갱신될 때까지 보수 기본값.
          setWeatherData({
            temp: w.temperature,
            humidity: w.humidity ?? 50,
            // 타임라인 카드와 동일한 매핑 사용 — null(측정 실패)은 "보통"으로 통일
            dustLevel: dustLabel(a?.pm10Grade ?? null),
            pollenLevel: "낮음",
            uvIndex: 0,
            windSpeed: windLabel,
            timeline: [],
          });
          setCurWeather({
            temperature: w.temperature ?? null,
            feelsLike: w.feelsLike ?? null,
            windSpeed: w.windSpeed ?? null,
            humidity: w.humidity ?? null,
            pop: w.pop ?? null,
            sky: w.sky ?? null,
            pty: w.pty ?? null,
          });
        }
        setLoading(false);

        // 2) uv·꽃가루 도착 → 시간대 카드 갱신 + 리포트 입력 준비 후 착수
        const [u, po] = await Promise.all([uvP, pollenP]);
        if (controller.signal.aborted) return; // 취소된(stale) 흐름 — 상태·계측 갱신 안 함
        perfMark(perf, "env_full_gate"); // uv+pollen 게이트 통과 (AI 착수·캐시 확인 관문)
        uvRawRef.current = u;
        pollenRawRef.current = po;
        setEnvRaw((prev) =>
          prev
            ? { ...prev, uv: u && !u.error ? u : null, pollen: po && !po.error ? po : null }
            : prev
        );
        // 상단 환경 칩(꽃가루·자외선)도 실데이터로 갱신. 없으면 안전 기본값("낮음"/UV 0)으로
        // 폴백해 mock 고정값(꽃가루 "높음")이 잘못된 경보로 남지 않게 한다.
        const pollenVals =
          po && !po.error
            ? [po.oak, po.pine, po.weed].filter((v: number | null): v is number => v != null)
            : [];
        const pollenLevel = pollenLabel(pollenVals.length ? Math.max(...pollenVals) : null);
        const uvIndex = u && !u.error && typeof u.uvi === "number" ? u.uvi : 0;
        setWeatherData((prev) => (prev ? { ...prev, pollenLevel, uvIndex } : prev));
        // A2: 이번 성공분을 즉시 페인트 스냅샷으로 저장 → 다음 콜드 재진입(≤90분)은 스켈레톤 없이
        // 이 값으로 즉시 그린다. weather 결측이면 saveEnvSnapshot이 내부적으로 저장을 건너뛴다.
        saveEnvSnapshot(
          snapLoc,
          {
            weather: w && !w.error ? w : null,
            air: a && !a.error ? a : null,
            uv: u && !u.error ? u : null,
            pollen: po && !po.error ? po : null,
          },
          w && !w.error && w.temperature != null
            ? {
                temperature: w.temperature ?? null,
                feelsLike: w.feelsLike ?? null,
                windSpeed: w.windSpeed ?? null,
                humidity: w.humidity ?? null,
                pop: w.pop ?? null,
                sky: w.sky ?? null,
                pty: w.pty ?? null,
              }
            : null
        );
        // 새로고침 env 재조회 종료 — 이제 리포트 생성(aiLoading)이 이어받는다.
        setRefreshing(false);
        // env 단계 종료 — 아래 분기로 리포트 착수 여부가 확정된다. 히어로 스켈레톤 해제 조건.
        setReportAttempted(true);
        if (w && !w.error) {
          setAiLoading(true); // 리포트 effect 착수(캐시 재검증) — primed면 스켈레톤은 안 뜸
          // 이미 캐시로 그려둔 경우엔 지우지 않는다(재검증 중 잔상·깜빡임 방지).
          if (!primedRef.current) {
            setAiHook("");
            setAiMessage("");
          }
          setAiError(false);
          setReportLimitReached(null);
        } else if (!primedRef.current) {
          // 날씨 실측이 없으면 AI 리포트를 생성할 수 없다(날씨가 핵심 입력).
          // 이때 규칙 기반 기본 추천을 노출하되, aiError로 표시해 헤더에 "기본 추천"을
          // 명확히 붙인다 — 폴백이 정상 AI 리포트로 오인되지 않게 한다.
          // 단, 당일 캐시 리포트가 이미 프라임돼 있으면(primedRef) 그 리포트는 진짜 AI 리포트다 —
          // weather가 간헐 실패(기상청 502)했다고 "기본 추천"으로 오표기하지 않는다. A1로 이 캐시
          // 리포트가 콜드 초기부터 노출되므로, 오표기 가드가 없으면 콜드 아침에 오표기가 잦아진다.
          setAiError(true);
        }
      } catch {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
          // env가 통째로 실패해도 스켈레톤에 갇히지 않게 한다 — 폴백 카드로 넘긴다.
          setReportAttempted(true);
        }
      }
    };
    fetchEnv();
    return () => controller.abort();
    // 위치가 바뀌면 환경 데이터 전체를 새 기준지로 다시 가져온다 (이전 흐름은 abort로 취소).
    // refreshNonce가 바뀌면(수동 새로고침) 같은 기준지로 날씨·대기질을 다시 가져와 리포트까지 갱신한다.
  }, [location.lat, location.lon, location.station, refreshNonce]);

  const cur = profiles.find((p) => p.id === active) ?? profiles[0];
  // 최신 활성 프로필 id를 렌더마다 동기 반영 — 리포트 요청의 stale 판정 기준 (effect 순서 무관)
  activeIdRef.current = cur?.id ?? null;

  // 홈이 이미 받아온 env 원시값을 건강 팁 셀렉터의 입력 형태로 어댑트한다 —
  // **재페치하지 않는다.** 같은 순간에 홈 팁과 /tips 화면이 다른 등급을 말하면 안 되므로
  // 판정 입력은 하나여야 한다(lib/env-data가 존재하는 이유와 같은 원칙). weather가 없으면
  // 팁을 만들지 않는다(fail-closed는 selectTips가 처리).
  const tipsEnv: EnvData | null = useMemo(() => {
    if (!envRaw) return null;
    const w = envRaw.weather as EnvData["weather"] | null;
    return {
      weather: w,
      air: envRaw.air as EnvData["air"],
      pollen: envRaw.pollen as EnvData["pollen"],
      uv: envRaw.uv as EnvData["uv"],
      weekly: null,
      missing: (["weather", "air", "pollen", "uv"] as const).filter(
        (k) => envRaw[k] == null
      ) as EnvData["missing"],
    };
  }, [envRaw]);

  // 수동 새로고침 쿨다운 — 중복 탭으로 인한 불필요한 Claude 호출(비용) 방지
  const REFRESH_COOLDOWN = 60 * 1000;

  // Claude AI 리포트 — 당일 고정 캐시. 아침에 만든 브리핑을 하루 내내 유지하고,
  // 환경 급변(envChanged) 또는 수동 새로고침일 때만 재생성한다 (일관성 + 비용).
  useEffect(() => {
    if (!aiLoading || !cur) return;

    // v17: 우산 강수확률 임계값(60%/40~50% 2단계) 프롬프트 명시 — 프롬프트 변경으로 구캐시 무효화
    const cacheKey = reportCacheKey(cur.id);

    // 주의: 이 effect는 hook 도착 시 setAiLoading(false)로 자기 dep을 스트림 도중 바꾼다.
    // 따라서 cleanup에서 fetch를 abort하면 SSE가 done 전에 끊긴다 — abort를 쓰지 않는다.
    // Strict Mode 세션 연결 문제는 env 흐름을 단일화(위 fetchEnv abort)해 이미 해소된다
    // (env 세션이 하나뿐이라 perfRef.current가 유일 → 리포트가 올바른 세션에 연결됨).
    const fetchReport = async () => {
      const force = forceRefreshRef.current;
      forceRefreshRef.current = false;
      const childId = cur.id;
      const t0 = Date.now(); // 베타 계측: report_viewed의 latency_ms 재료

      // single-flight — 같은 아이의 요청이 진행 중이고 강제 새로고침이 아니면 중복 시작 안 함
      // (Strict 이중 실행·연타로 인한 중복 Claude 호출 방지).
      const activePrev = activeReportRef.current;
      if (activePrev && activePrev.childId === childId && !force) return;
      // 다른 아이거나 강제 새로고침이면 이전 요청을 즉시 취소한다 — 클라이언트 fetch abort가
      // 서버 req.signal을 통해 진행 중인 Anthropic 스트림까지 취소해 중복 생성·비용을 막는다.
      if (activePrev) activePrev.ctrl.abort();
      const ctrl = new AbortController();
      activeReportRef.current = { ctrl, childId };

      let regenerating = false; // 급변으로 기존 브리핑을 교체하는 경우 (완료 시 안내 토스트)
      let morningRegen = false; // 새벽 잠정본을 06시 이후 당일 발표본으로 교체하는 경우
      let profileRegen = false; // 같은 날 아이 판단 입력(체질·민감도·일과)이 바뀌어 교체하는 경우
      // 계측 세션 로컬 캡처 — 초기 진입이면 fetchEnv의 세션(env 마커 포함)을 1회 점유(claim)하고,
      // 이미 점유·보고된 세션(재방문·프로필 전환·중첩 요청)이면 리포트 전용 새 세션을 만든다.
      // 어느 경로든 세션을 claim해, 뒤이은 요청이 같은 세션에 마커를 덧쓰지 않게 한다
      // (한 요청의 보고가 다른 요청의 마커를 삼키는 것 방지).
      const base = perfRef.current;
      let perf: PerfSession;
      if (base && !base.reported && !base.claimed) {
        base.claimed = true;
        perf = base;
      } else {
        perf = perfStart();
        perf.claimed = true;
        perfRef.current = perf;
      }
      let outcome = "unknown"; // finally에서 성공/실패 구분 기록 (생존자 편향 방지)
      // 이 요청이 여전히 화면의 주인인지 판정 — 두 조건 모두:
      //  ① gen: 같은 아이의 더 새 요청(수동 새로고침 등)이 시작되면 증가해 이전 요청을 밀어냄
      //  ② childId: 활성 프로필이 다른 아이로 바뀌면(전환) 이 요청은 즉시 stale
      // childId 비교는 effect 실행 순서에 의존하지 않아, hook 도착 전 전환 시에도 안전하다.
      const gen = ++reportGenRef.current;
      const isCurrent = () => gen === reportGenRef.current && childId === activeIdRef.current;
      try {
        // T4: use cached env from fetchEnv instead of re-fetching
        const w = weatherRawRef.current ?? {};
        const a = airRawRef.current as { error?: string; pm10Grade?: number } | null;
        const u = uvRawRef.current as { error?: string; uvi?: number | null; hourly?: Record<string, number | null> } | null;
        const po = pollenRawRef.current as { error?: string; oak?: number | null; pine?: number | null; weed?: number | null } | null;
        const uvClean = u?.error ? null : u;
        const pollenClean = po?.error ? null : po;
        const sig = envSignature(
          w as Parameters<typeof envSignature>[0],
          a?.error ? null : a,
          uvClean,
          pollenClean
        );

        // 판단 입력 스냅샷 — 캐시 생성 시점과 지금의 프로필이 같은 판단을 낳는지 비교 근거
        const profSig = profileSignature(cur);

        // 당일 캐시는 2단이다 — 1순위 로컬(localStorage), 2순위 서버 사본(daily_reports).
        // 서버 사본이 필요한 이유: 리포트가 브라우저 저장소에만 있으면 폰↔PC·시크릿창처럼
        // 저장소가 다른 기기에서는 "오늘의 리포트가 없는 것"과 같고, 하루 한도를 소진한 뒤엔
        // 그 기기의 히어로가 반드시 규칙 폴백("기본 추천")으로 추락한다(2026-07-27 실사용 제보).
        // 조회는 Claude 생성이 아니므로 비용도 한도도 쓰지 않는다 — 한도는 "새로 쓰기"만 막는다.
        // 강제 새로고침(force)은 재생성이 목적이라 어느 쪽 캐시도 보지 않는다.
        let cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
        let cachedFromServer = false;
        if (!force && !(cached && cached.message && Array.isArray(cached.checklist))) {
          const remote = await fetchDailyReport(childId, localDateStr(), REPORT_CACHE_VERSION);
          // 대기 중 프로필이 전환됐으면 이 응답은 남의 것 — 버린다.
          if (remote && isCurrent()) {
            cached = remote;
            cachedFromServer = true;
          }
        }
        if (cached && !force && cached.message && Array.isArray(cached.checklist)) {
          // 같은 날 아이 체질·민감도·일과가 바뀌었으면 구 판단은 무효 — 재생성한다.
          // (me 화면 수정 후 홈 복귀, 다른 기기에서 수정한 프로필의 DB 복원 모두 포괄.)
          const profileChanged = cached.profileSig !== profSig;
          // 새벽(00~06시) 생성 잠정본은 06시 이후 첫 방문에서 당일 발표본(02시 예보·
          // 당일 자외선)으로 조용히 교체한다 — 재료가 전날 밤 예보 기준이었기 때문.
          // 06시 전이면 잠정본이 그 시점의 최선이므로 그대로 캐시 히트.
          const morningRefresh =
            typeof cached.ts === "number" && needsMorningRefresh(cached.ts);
          if (!profileChanged && !envChanged(cached.env, sig) && !morningRefresh) {
            perfMark(perf, cachedFromServer ? "cache_hit_server" : "cache_hit");
            outcome = "cache_hit";
            // 서버 사본을 썼으면 이 기기의 로컬 캐시에도 적어둔다 — 다음 진입부터는
            // 프라임 effect가 동기로 읽어 즉시 페인트되고, 서버 왕복도 사라진다.
            if (cachedFromServer) {
              try {
                localStorage.setItem(
                  cacheKey,
                  JSON.stringify({
                    hook: cached.hook ?? "",
                    message: cached.message,
                    checklist: cached.checklist,
                    ts: cached.ts,
                    env: cached.env,
                    profileSig: cached.profileSig,
                  })
                );
              } catch {}
            }
            if (isCurrent()) {
              setAiHook(cached.hook ?? "");
              setAiMessage(cached.message);
              if (cached.checklist.length > 0) setAiChecklist(cached.checklist);
              setReportTs(typeof cached.ts === "number" ? cached.ts : null);
              setAiLoading(false);
            }
            return;
          }
          regenerating = true;
          profileRegen = profileChanged;
          morningRegen = !profileChanged && morningRefresh && !envChanged(cached.env, sig);
        }

        // SSE 스트림 소비 — hook·message가 도착하는 즉시 히어로를 노출하고,
        // done 이벤트의 전체 페이로드로 체크리스트·준비물·캐시를 채운다.
        type ReportPayload = { hook: string; message: string; checklist: string[]; prep: Record<string, string[]> };

        // 한 번의 시도 결과. retry=일시 실패(재시도 대상), fatal=영구 실패(즉시 폴백),
        // stale=취소·낡은 요청(실패 아님).
        type AttemptResult =
          | { kind: "done"; payload: ReportPayload }
          | { kind: "retry"; reason: "exception" | "stream_error" | "empty" }
          | { kind: "fatal"; httpStatus: number; detail?: string; isGuest?: boolean }
          | { kind: "stale" };

        // 리포트 요청 1회: fetch → SSE 소비. 콜드 스타트/게이트웨이 순간 오류/네트워크 끊김은
        // retry로, 한도(429)·입력(4xx)·설정(503) 오류는 fatal로 구분해 돌려준다.
        const runReportAttempt = async (attempt: number): Promise<AttemptResult> => {
          perfMark(perf, attempt === 1 ? "report_fetch_start" : "report_retry"); // 캐시 미스 → 서버 요청 착수
          let res: Response;
          try {
            res = await fetch("/api/report", {
              method: "POST",
              signal: ctrl.signal, // 새 요청·언마운트 시 취소 → 서버 Anthropic 스트림까지 abort
              headers: {
                "Content-Type": "application/json",
                // 계측 요청만 서버 로그를 남기도록 게이팅 + 클라이언트/서버 로그 correlation
                ...(perfEnabled() ? { "x-perf-id": perf.id } : {}),
              },
              body: JSON.stringify({
                child: {
                  name: cur.name,
                  age: cur.age,
                  // birth(연·월)를 함께 보내 서버가 마스크 연령 게이트(만 2세 미만)를 정확히 판정.
                  birth: cur.birth,
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
                uv: uvClean,
                pollen: pollenClean,
              }),
            });
          } catch (err) {
            // 취소(새 요청·언마운트)는 실패가 아니다. 그 외 네트워크 예외는 재시도 대상.
            if (ctrl.signal.aborted || !isCurrent()) return { kind: "stale" };
            console.error("[AI report] fetch 예외:", err);
            return { kind: "retry", reason: "exception" };
          }

          // 사전 검증 실패(apiKey·baseURL 등)는 여전히 non-2xx JSON으로 온다.
          // 429(한도)·4xx(입력)·503(설정)은 재시도해도 결과가 같으므로 즉시 폴백(fatal).
          if (!res.ok || !res.body) {
            let detail: string | undefined;
            let isGuest: boolean | undefined;
            try {
              const body = await res.json();
              detail = body?.error;
              isGuest = body?.isGuest;
              if (detail) console.error("[AI report] 서버 오류 상세:", detail);
            } catch {}
            return { kind: "fatal", httpStatus: res.status, detail, isGuest };
          }

          if (isCurrent()) setAiStreaming(true); // hook 도착 후 본문 스켈레톤 표시 근거
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let streamErr = false;
          let final: ReportPayload | null = null;

          const handleEvent = (event: string, dataStr: string) => {
            let data: unknown;
            try {
              data = JSON.parse(dataStr);
            } catch {
              return;
            }
            if (event === "hook") {
              perfMark(perf, "report_hook"); // 첫 가시 콘텐츠 (스켈레톤 해제)
              if (isCurrent()) {
                setAiHook(typeof data === "string" ? data : "");
                setAiLoading(false); // 헤드라인(아침의 결론) 즉시 노출 — 본문은 message까지 스켈레톤
              }
            } else if (event === "message") {
              if (isCurrent()) setAiMessage(typeof data === "string" ? data : "");
            } else if (event === "done") {
              final = data as ReportPayload;
            } else if (event === "error") {
              streamErr = true;
            }
          };

          while (true) {
            let readResult: ReadableStreamReadResult<Uint8Array>;
            try {
              readResult = await reader.read();
            } catch (err) {
              // 스트림 도중 연결 끊김(콜드 타임아웃·네트워크) — 취소가 아니면 재시도 대상.
              if (ctrl.signal.aborted || !isCurrent()) return { kind: "stale" };
              console.error("[AI report] 스트림 read 예외:", err);
              return { kind: "retry", reason: "exception" };
            }
            if (readResult.done) break;
            // 새 요청(프로필 전환 등)이 시작됐으면 이 스트림은 낡음 — 취소하고 중단(불필요한 생성 소비 방지)
            if (!isCurrent()) {
              try { await reader.cancel(); } catch {}
              return { kind: "stale" };
            }
            buf += decoder.decode(readResult.value, { stream: true });
            const chunks = buf.split("\n\n");
            buf = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const ev = chunk.match(/^event: (.+)$/m)?.[1]?.trim();
              const dt = chunk.match(/^data: (.+)$/m)?.[1];
              if (ev && dt != null) handleEvent(ev, dt);
            }
          }

          if (!isCurrent()) return { kind: "stale" };
          if (streamErr) return { kind: "retry", reason: "stream_error" };
          const payload = final as ReportPayload | null;
          if (payload && payload.message) return { kind: "done", payload };
          // done은 왔지만 message 없음 = 서버가 모델 응답 파싱에 실패 → 재시도로 회복 시도.
          return { kind: "retry", reason: "empty" };
        };

        // 시도 루프 — 일시 실패면 잠깐 쉬고 한 번 더(콜드·게이트웨이·네트워크 순간 오류가
        // 곧장 "기본 추천"에 갇히지 않게). 각 시도는 Claude 생성 1회라 비용을 고려해 최대 2회.
        // 429·4xx·503(fatal)·취소(stale)는 재시도하지 않는다.
        const MAX_REPORT_ATTEMPTS = 2;
        const RETRY_DELAY_MS = 900;
        let attemptRes: AttemptResult = { kind: "stale" };
        for (let attempt = 1; attempt <= MAX_REPORT_ATTEMPTS; attempt++) {
          attemptRes = await runReportAttempt(attempt);
          if (attemptRes.kind !== "retry") break;
          if (attempt < MAX_REPORT_ATTEMPTS && isCurrent() && !ctrl.signal.aborted) {
            perfMark(perf, `report_retry_wait_${attemptRes.reason}`);
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            if (!isCurrent() || ctrl.signal.aborted) { attemptRes = { kind: "stale" }; break; }
          }
        }

        // 취소·낡은 요청은 done 처리·상태 갱신을 건너뛰고 finally로 (계측만 남긴다)
        if (attemptRes.kind === "stale" || !isCurrent()) {
          outcome = ctrl.signal.aborted ? "aborted" : "superseded";
          return;
        }

        if (attemptRes.kind === "done") {
          const done = attemptRes.payload;
          setReportLimitReached(null);
          setAiHook(done.hook ?? "");
          setAiMessage(done.message);
          if (Array.isArray(done.checklist) && done.checklist.length > 0) {
            setAiChecklist(done.checklist);
          }
          const now = Date.now();
          setReportTs(now);
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ hook: done.hook ?? "", message: done.message, checklist: done.checklist ?? [], ts: now, env: sig, profileSig: profSig }));
          } catch {}
          // 서버 사본에도 올린다(로그인 사용자만, 실패는 삼킨다) — 다른 기기·시크릿창에서
          // 같은 판단이 뜨고, 한도를 소진해도 오늘 리포트가 살아 있게 하는 근거가 이 행이다.
          void saveDailyReport(childId, localDateStr(), REPORT_CACHE_VERSION, {
            hook: done.hook ?? "",
            message: done.message,
            checklist: done.checklist ?? [],
            ts: now,
            env: sig,
            profileSig: profSig,
          });
          if (regenerating) toast(profileRegen ? "아이 정보가 바뀌어 브리핑을 새로 썼어요" : morningRegen ? "아침 예보가 나와 브리핑을 새로 썼어요" : "날씨가 바뀌어 브리핑을 새로 썼어요");
          else if (force) toast("최신 날씨로 새로고침했어요");
          perfMark(perf, "report_done"); // 전체 페이로드 수신·정착
          outcome = "done";
        } else if (attemptRes.kind === "fatal") {
          // 영구 실패(429 한도·4xx 입력·503 설정) — 재시도 무의미, 즉시 폴백.
          perfMark(perf, `report_http_${attemptRes.httpStatus}`);
          outcome = `http_${attemptRes.httpStatus}`;
          // 한도(429)는 "새 생성"만 막힌 것이다 — 새로고침이 방금 비운 당일 캐시 리포트가
          // localStorage에 그대로 있으면 되살린다(캐시는 항상 진짜 AI 리포트). 규칙 폴백은
          // 캐시조차 없을 때만 — 안 그러면 한도에 걸린 새로고침 한 번에 멀쩡한 아침
          // 리포트가 사라진다(2026-07-27). 프로필이 바뀌었으면 구 판단이라 되살리지 않는다.
          let restored = false;
          if (attemptRes.httpStatus === 429) {
            // 로컬 캐시 → 없으면 서버 사본. 여기까지 왔다는 건 캐시가 없거나(신규 기기)
            // 신선도 판정에서 낡다고 본 경우인데(급변·아침 갱신), 한도에 막혀 새로 쓸 수 없으면
            // **낡은 진짜 리포트가 규칙 폴백보다 낫다** — 그래서 여기서는 profileSig만 본다
            // (프로필이 바뀌었으면 다른 아이의 판단에 가까워 되살리지 않는다).
            const restore = (r: { hook?: string; message?: string; checklist?: unknown; ts?: unknown; profileSig?: string } | null) => {
              if (!r || !r.message || !Array.isArray(r.checklist) || r.profileSig !== profSig) return false;
              setAiHook(r.hook ?? "");
              setAiMessage(r.message);
              if (r.checklist.length > 0) setAiChecklist(r.checklist as string[]);
              setReportTs(typeof r.ts === "number" ? r.ts : null);
              return true;
            };
            try {
              restored = restore(JSON.parse(localStorage.getItem(cacheKey) ?? "null"));
            } catch {}
            if (!restored) {
              const remote = await fetchDailyReport(childId, localDateStr(), REPORT_CACHE_VERSION);
              if (isCurrent()) restored = restore(remote);
            }
          }
          setAiError(!restored);
          // 하루 한도 소진(429)은 카드 안에 게스트/로그인 여부에 맞는 안내+CTA를 영구 표시한다
          // (토스트는 몇 초 뒤 사라져 재방문 시 다시 보이지 않으므로 별도 상태로 붙잡아 둔다).
          setReportLimitReached(
            attemptRes.httpStatus === 429 ? { isGuest: attemptRes.isGuest ?? true } : null
          );
          // 하루 한도 소진(429)은 "잠시 후 다시"가 거짓말이 된다 — 서버 문구를 그대로 쓴다.
          toast(
            attemptRes.httpStatus === 429 && attemptRes.detail
              ? attemptRes.detail
              : "AI 리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요."
          );
          setAiLoading(false);
        } else {
          // 재시도까지 소진된 일시 실패(exception/stream_error/empty) — 규칙 기반 "기본 추천" 폴백.
          if (attemptRes.reason === "empty") console.warn("[AI report] 빈 응답 수신 — 기본 추천으로 대체합니다.");
          perfMark(perf, `report_${attemptRes.reason}`);
          outcome = attemptRes.reason;
          setAiError(true);
          setReportLimitReached(null);
          toast(
            attemptRes.reason === "empty"
              ? "AI 리포트 생성에 실패해 기본 추천을 보여드려요."
              : "AI 리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요."
          );
          setAiLoading(false);
        }
      } catch (err) {
        // 취소(새 요청·언마운트)·낡은 요청은 오류가 아니다 — 화면·계측을 오류로 집계하지 않는다.
        if (ctrl.signal.aborted || !isCurrent()) {
          outcome = ctrl.signal.aborted ? "aborted" : "superseded";
        } else {
          console.error("[AI report]", err);
          perfMark(perf, "report_exception");
          outcome = "exception";
          setAiError(true);
          toast("AI 리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        }
      } finally {
        // 낡은 요청은 화면 상태를 건드리지 않는다(현재 요청이 관리 중). 계측은 남기되
        // 성공·오류·빈응답·중단(실서비스 관점의 실패 포함)을 outcome으로 구분해 기록한다.
        if (isCurrent()) {
          setAiLoading(false);
          setAiStreaming(false);
        }
        // 이 요청이 아직 활성으로 등록돼 있으면 해제(새 요청이 이미 교체했으면 건드리지 않음).
        if (activeReportRef.current?.ctrl === ctrl) activeReportRef.current = null;
        perfReport(perf, `home 진입 → AI 리포트 (${isCurrent() ? outcome : outcome === "aborted" ? "aborted" : "superseded"})`);
        // 베타 계측 — 성공은 report_viewed, 실서비스 관점의 실패는 report_error.
        // 취소·낡은 요청(aborted/superseded)은 사용자 경험이 아니므로 집계하지 않는다.
        if (outcome === "cache_hit" || outcome === "done") {
          track("report_viewed", {
            age_band: ageBand(cur.age),
            cached: outcome === "cache_hit",
            latency_ms: Date.now() - t0,
          });
        } else if (outcome !== "aborted" && outcome !== "superseded" && outcome !== "unknown") {
          track("report_error", { stage: outcome });
        }
      }
    };

    fetchReport();
  }, [aiLoading, cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 프로필 변경 시 AI 리포트 재요청.
  // (세대 증가는 여기서 하지 않는다 — 리포트 effect가 먼저 실행돼 새 요청을 시작한 뒤 여기서
  //  gen을 또 올리면, 방금 시작한 요청까지 stale이 돼 스켈레톤이 남는다. 이전 아이 응답 차단은
  //  isCurrent()의 child 비교(activeIdRef)가 담당하므로 effect 순서와 무관하게 안전하다.)
  useEffect(() => {
    if (!loading) {
      setAiLoading(true);
      setAiHook("");
      setAiError(false);
      setReportLimitReached(null);
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // 마운트·프로필 전환 즉시 당일 캐시를 읽어 리포트를 바로 노출한다. 기존엔 리포트를
  // env(uv/pollen) 게이트 뒤에서만 읽어, 캐시가 있어도 재방문자가 공공 API 콜드미스만큼
  // 기다렸다(워터폴). 여기서 먼저 그려두고, env 도착 후 리포트 effect가 envChanged를
  // 재검증해 급변일 때만 조용히 재생성한다. 이 effect는 [active] 클리어 effect 뒤에 정의해
  // 전환 시 클리어를 덮어쓰고(새 아이 캐시로) 최신 상태가 남게 한다. 강제 새로고침 땐 프라임 안 함.
  useEffect(() => {
    primedRef.current = false;
    setReportPrimed(false);
    if (!cur || forceRefreshRef.current) return;
    try {
      const cached = JSON.parse(
        localStorage.getItem(reportCacheKey(cur.id)) ?? "null"
      );
      // 판단 입력이 캐시 생성 시점과 다르면 프라임하지 않는다 — 구 판단을 잠깐이라도
      // 보여주지 않고 스켈레톤을 유지하면, 리포트 effect가 곧 재생성한다.
      if (
        cached &&
        cached.message &&
        Array.isArray(cached.checklist) &&
        cached.profileSig === profileSignature(cur)
      ) {
        setAiHook(cached.hook ?? "");
        setAiMessage(cached.message);
        if (cached.checklist.length > 0) setAiChecklist(cached.checklist);
        setReportTs(typeof cached.ts === "number" ? cached.ts : null);
        primedRef.current = true;
        setReportPrimed(true);
      }
    } catch {}
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 언마운트 시 진행 중인 리포트 요청 취소 (서버 Anthropic 스트림까지 abort). 빈 deps라
  // aiLoading 변화로는 트리거되지 않아 스트리밍 도중 자기 요청을 끊지 않는다.
  useEffect(() => () => activeReportRef.current?.ctrl.abort(), []);

  // 수동 새로고침 — 날씨·대기질을 지금 시점으로 다시 가져온 뒤, 그 최신 데이터로 리포트를 재생성한다.
  // (종전엔 로드 시점 환경 스냅샷을 재사용해 리포트 문구만 다시 썼다. "새로고침인데 날씨가 그대로"인
  //  기대 불일치를 없애기 위해, 환경 재fetch → 리포트 재생성으로 연결한다.)
  const refreshReport = () => {
    if (aiLoading || loading || refreshing) return;
    const now = Date.now();
    if (now - lastManualRefreshRef.current < REFRESH_COOLDOWN) {
      toast("방금 갱신했어요");
      return;
    }
    lastManualRefreshRef.current = now;
    track("report_refreshed");
    forceRefreshRef.current = true; // 당일 캐시 무시하고 재생성
    softRefreshRef.current = true; // env는 전체 스켈레톤 없이 조용히 재조회
    // 캐시로 그려둔 내용을 비우고 스켈레톤을 노출한다(재생성 중임을 명확히).
    primedRef.current = false;
    setReportPrimed(false);
    setAiHook("");
    setAiMessage("");
    setAiError(false);
    setReportLimitReached(null);
    setRefreshing(true); // env 재조회 구간 동안 버튼 비활성·스켈레톤·아이콘 회전 유지
    setRefreshNonce((n) => n + 1); // env effect 재실행 → 날씨·대기질 재fetch → 끝나면 리포트 재생성
  };

  // 시간대별 환경: 활성 프로필의 일과 + 실측 데이터로 구성. 실데이터가 없으면 mock.
  const timeline = useMemo<HomeTimeSlot[] | null>(
    () => (envRaw ? buildTimeline(cur?.schedule, envRaw) : null),
    [envRaw, cur?.schedule]
  );

  // 렌더용 슬롯: 실데이터가 없으면 빈 배열 — mock 값을 실측인 척 보여주지 않는다
  // (2026-07 조사: 무표기 폴백이 "지표 부정확" 체감의 근본 원인 중 하나).
  // 빈 상태는 시간대별 환경·케어 플랜 섹션이 "데이터 지연" 안내로 렌더한다.
  const displaySlots = useMemo<HomeTimeSlot[]>(() => timeline ?? [], [timeline]);

  // 내일 미리보기 — 시간대별 환경 섹션의 "오늘|내일" 세그먼트 (2026-07-20).
  // 같은 env 응답에 실려 온 내일분 예보·자외선으로 구성. 내일 미세먼지·꽃가루는 존재하지
  // 않는 값이라(실측/당일 발행) 렌더에서 두 지표 행을 숨기고 "당일 아침 확정" 안내로 대체.
  // AI 리포트·케어 플랜은 오늘 전용 유지 — 내일 해석은 밤 예고편 알림 설계(§3-7)와 함께.
  const [envDay, setEnvDay] = useState<"today" | "tomorrow">("today");
  const tomorrowSlots = useMemo<HomeTimeSlot[]>(
    () => (envRaw ? buildTomorrowTimeline(cur?.schedule, envRaw) ?? [] : []),
    [envRaw, cur?.schedule]
  );
  const timelineSlots = envDay === "tomorrow" ? tomorrowSlots : displaySlots;

  // 규칙 기반 추천(AI 리포트 폴백 + 상단 환경 칩).
  // 체크리스트·메시지는 실측 슬롯(displaySlots)을 근거로 삼아 상단 칩과 어긋나지 않게 하고,
  // 칩(badges)은 종전대로 weatherData의 실측 스칼라값에서 도출한다.
  // 실측 자체가 없으면 mock 기반 추천 대신 정직한 안내 문구만 낸다.
  const recommendation = useMemo<Recommendation>(
    () =>
      weatherData
        ? buildRecommendation(cur, weatherData, displaySlots)
        : {
            checklist: [],
            message: "실시간 환경 데이터를 불러오지 못했어요. 네트워크 확인 후 잠시 뒤 다시 열어주세요.",
            badges: [],
          },
    [cur, weatherData, displaySlots]
  );

  // 슬롯별 준비물 키워드 — 규칙 엔진(lib/prep.ts) 단일 소스.
  // 매 슬롯 빠짐없이·흔들림 없이 보여야 하는 표면이라 규칙이 적합 (2026-07-20 A/B로 확정,
  // docs/PRODUCT-DECISIONS.md). AI의 뉘앙스는 message·checklist에서 살린다.
  const slotPrep = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    const sweatProne = isSweatProne(cur?.hot, cur?.sweat);
    // 24개월 미만이면 규칙 엔진도 마스크 대신 실내놀이 — AI 프롬프트 규칙과 정렬 (R1)
    const maskOk = canRecommendMask(ageInMonths(cur?.age, cur?.birth));
    displaySlots.forEach((slot, i) => {
      map[slot.time] = buildPrepKeywords(slot, i > 0 ? displaySlots[i - 1] : null, cur?.conditions, i === 0, sweatProne, maskOk);
    });
    return map;
  }, [displaySlots, cur?.conditions, cur?.hot, cur?.sweat, cur?.age, cur?.birth]);
  const { checklist: baseChecklist, message: fallbackMessage, badges } = recommendation;

  const message = aiMessage || fallbackMessage;

  // 신뢰 라인 — 누구 기준으로, 무엇을 근거로 판단했는지. 리포트 본문(message) 최하단에 붙는다.
  // caption 13으로 복귀 — 11px은 DESIGN.md에서 eyebrow 전용이고 본문 캡션에는 금지다.
  const trustLine = cur ? (
    <p className="pt-1 text-[13px] leading-[1.5] text-muted-foreground break-keep">
      {withSubjectSuffix(cur.name)} 위한 프로필 기준 해석 · 기상청·에어코리아 실측 데이터
    </p>
  ) : null;

  // AI 체크리스트가 있으면 사용, 없으면 recommendation engine fallback.
  // 이름은 canonicalPrep으로 표준화(물통/물병, 선크림/자외선차단제 등 별칭 통일 — 케어
  // 플랜 칩과 같은 어휘), key도 표준화된 이름 기반이라 목록이 교체돼도 같은 준비물의
  // 체크가 유지된다. 같은 이름이 중복 생성되면 뒤 항목에 인덱스를 붙여 key 충돌을 막는다.
  // 파싱·표준화·key 부여는 `buildAiChecklist`(lib/hero-brief.ts) 순수 함수로 옮겼다 —
  // 인라인이던 시절 정규식의 `\S+` 대안이 이모지 없는 항목의 첫 단어를 아이콘으로 먹어
  // "여벌 상의"를 "상의"로 렌더했고, 화면 JSX 안이라 유닛 테스트로 잡을 수 없었다.
  const activeChecklist: { icon: string; text: string; key: string }[] = useMemo(
    () => (aiChecklist.length > 0 ? buildAiChecklist(aiChecklist) : baseChecklist),
    [aiChecklist, baseChecklist]
  );


  // ── 하루 케어 플랜 "지금" 판정 — 슬롯 시각 ±W 밴드 ──────────────────────
  // 종전엔 "지나간 마지막 슬롯"을 무조건 "지금"으로 삼아, 등원~하원 6시간 빈칸 내내
  // 등원(몇 시간 전)에 "지금"이 고정됐다. 이제 슬롯 시각과 얼마나 가까운지로 판정한다:
  //  · 점 슬롯(등원·하원): [start, start+W]="지금", [start−W, start)="곧"
  //  · 구간 슬롯(야외활동·저녁): [start,end] 전체="지금"(뒤 트레일 없음), [start−W, start)="곧"
  //  · 어느 밴드에도 안 들면 빈칸 → 강조 없음(전 슬롯 중립 카드)
  // 겹칠 땐 다가오는(더 이른 start의 곧) 슬롯 우선 — 지나간 것보다 준비할 것을 앞세운다.
  // W는 예보 3시간 해상도(±2h 데이터 유효)보다 안쪽으로 잡아, 붙은 환경값이 넉넉히 유효할 때만 "지금".
  const CARE_BAND_MIN = 90;
  const careNowMin = (() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  })();
  const slotStartMin = (s: HomeTimeSlot): number | null => {
    const [h, m] = s.hour.split(":").map(Number);
    return Number.isNaN(h) ? null : h * 60 + (m || 0);
  };
  const slotEndMin = (s: HomeTimeSlot): number | null => {
    if (!s.endHour) return null;
    const [h, m] = s.endHour.split(":").map(Number);
    return Number.isNaN(h) ? null : h * 60 + (m || 0);
  };

  // 활성/임박 후보 수집 후 다가오는 슬롯 우선으로 하나만 고른다.
  const careFocus = (() => {
    type Cand = { idx: number; kind: "now" | "soon"; start: number };
    const cands: Cand[] = [];
    displaySlots.forEach((s, i) => {
      const start = slotStartMin(s);
      if (start == null) return;
      const end = slotEndMin(s);
      if (end != null) {
        if (careNowMin >= start && careNowMin <= end) cands.push({ idx: i, kind: "now", start });
        else if (careNowMin >= start - CARE_BAND_MIN && careNowMin < start) cands.push({ idx: i, kind: "soon", start });
      } else {
        if (careNowMin >= start && careNowMin <= start + CARE_BAND_MIN) cands.push({ idx: i, kind: "now", start });
        else if (careNowMin >= start - CARE_BAND_MIN && careNowMin < start) cands.push({ idx: i, kind: "soon", start });
      }
    });
    // 곧(임박) 후보가 있으면 가장 가까운(가장 이른 start) 것, 없으면 활성 중 가장 최근(늦은 start).
    const soon = cands.filter((c) => c.kind === "soon").sort((a, b) => a.start - b.start);
    if (soon.length) return { idx: soon[0].idx, kind: "soon" as const };
    const active = cands.filter((c) => c.kind === "now").sort((a, b) => b.start - a.start);
    if (active.length) return { idx: active[0].idx, kind: "now" as const };
    return null;
  })();

  // 렌더용: 강조할 슬롯 인덱스와 라벨 종류.
  // ⚠ 사용자 확정 규칙 2건 (DESIGN.md Component Grammar 참조):
  //  1) 시각 강조는 ±90분 밴드 안(지금/곧)에만 적용한다. 밴드 밖 빈칸은 어떤 슬롯도
  //     강조하지 않는다(무강조 중립 카드) — "다음" 앞보기 강조 금지.
  //  2) careHighlightKind는 시각 스타일(보더·도트)과 sr-only 전용이다. "지금"·"곧"·
  //     "다음"·"N시간 후"·"기본 시간" 등 판정 상태를 보이는 텍스트로 렌더하지 않는다.
  const careHighlightIdx = careFocus ? careFocus.idx : -1;
  const careHighlightKind: "now" | "soon" | null = careFocus ? careFocus.kind : null;

  // 온보딩 일과를 전부 생략한 유저 — 4슬롯 시각이 모두 기본값. 섹션 하단 넛지로 입력 유도.
  const allSlotsDefault = displaySlots.length > 0 && displaySlots.every((s) => s.isDefault);

  // 헤더 메타 — "7월 14일 (화) 07:30 기준" (요일 포함·24시간제). 시각은 리포트 생성
  // 시점이므로 "기준"을 붙여 현재 시각으로 오독되지 않게 한다.
  const reportMeta = (() => {
    const d = reportTs != null ? new Date(reportTs) : new Date();
    const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${wd})`;
    if (reportTs == null) return `${base} 기준`;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${base} ${hh}:${mm} 기준`;
  })();

  // 새벽(00~06시) 생성 잠정본 여부 — 전날 밤 발표본 재료로 만든 리포트임을 카드 안에서
  // 알린다. 06시 이후 방문 시 리포트 effect가 당일 발표본으로 재생성해 ts가 갱신되면
  // 캡션은 자연히 사라진다. "언제 보라"가 아니라 "앱이 알아서 갱신한다"를 전달하는 문구.
  const reportProvisional = reportTs != null && isProvisionalReport(reportTs);

  /* ---- 히어로 Decision Brief 파생 (lib/hero-brief, 유닛 테스트로 고정) ----
     hook의 "[공감] — [행동]" 구조를 그대로 쓴다 — 조건절은 pill, 행동절은 결론.
     프롬프트·캐시 스키마 변경이 없다. */
  const brief = toBrief(aiHook || "");

  // 기관에 보낼 아침 메시지의 부탁 문단 — 하루 탭의 '오늘 부탁'과 **같은 엔진**을 쓴다
  // (lib/care-plan). 두 화면이 각자 문구를 만들면 부모가 기관에 보낸 말과 앱이 보여주는
  // 말이 갈린다. 케어 플랜이 발동하지 않는 날은 null이고, 그때는 조건·준비물만으로 조립된다.
  const morningHandoff = useMemo(
    () =>
      timeline && cur
        ? (buildCarePlan({
            slots: timeline,
            childName: cur.name,
            conditions: cur.conditions,
            hot: cur.hot,
            sweat: cur.sweat,
          })?.handoff ?? null)
        : null,
    [timeline, cur]
  );

  // 폴백(규칙 기반)에는 hook이 없다 — 본문 첫 문장을 결론 자리에 넣고 타입을 title(20)로
  // 낮춘다(HeroDecisionBrief fallback variant). display 28/800은 AI 판단 전용이다.
  const plainLines = message
    .split("\n")
    .map((l) => l.replace(/\*\*|__/g, "").trim())
    .filter(Boolean);

  // 로딩 게이트 — 캐시 리포트가 프라임돼 있으면 스켈레톤을 건너뛴다(랜딩 지연 최적화 유지).
  // `!reportAttempted`를 함께 본다 — env 1차 게이트에서 loading이 풀린 뒤 리포트 착수(전체
  // 게이트) 전까지의 공백에 규칙 기반 카드가 통째로 노출되던 구멍을 막는다(2026-07-28).
  const briefLoading = (loading || !reportAttempted || aiLoading || refreshing) && !reportPrimed;
  const listLoading =
    (loading || !reportAttempted || aiLoading || aiStreaming || refreshing) && !reportPrimed;

  // AI 본문 대기 구간 — hook은 왔는데 message는 아직인 SSE 창(실측 2~3초).
  // 이 구간엔 규칙 엔진 폴백 문장을 "AI 판단"인 척 어떤 표면에도 쓰지 않는다. 종전엔
  // `aiMessage || fallbackMessage`가 근거 자리에 규칙 문장을 대입해 랜딩 직후 낯선 문장이
  // 잠깐 떴다(2026-07-28 사용자 제보). PR #94가 "오늘 챙길 것"에서 이미 닫은 구멍이
  // PR #167의 새 표면(support·자세히)에 다시 열린 것 — 같은 게이트를 여기서도 건다.
  // 리포트가 아직 정착하지 않은 전 구간을 덮는다: ①로딩(스켈레톤) 중 ②hook만 온 스트리밍 창.
  // ①까지 포함하는 이유 — 화면 밖 공유 카드는 스켈레톤과 무관하게 항상 렌더돼 있어서,
  // 로딩 중 공유를 누르면 규칙 문장이 "오늘의 AI 리포트"로 내보내진다(2026-07-28 계측에서
  // 462px 오프스크린 <p>로 확인). AI 실패가 확정된 폴백 상태에서는 규칙 문장이 정직한
  // 내용이므로 그대로 쓴다.
  const aiBodyPending = briefLoading || (!!aiHook && !aiMessage);
  // 본문 표면(자세히·공유)이 쓸 텍스트. 대기 구간엔 비운다 — 폴백 상태(AI 실패)에서는
  // 종전대로 규칙 문장을 그대로 쓴다(그때는 그게 정직한 화면이다).
  const displayBody = aiBodyPending ? "" : message;

  // 아이 특성 근거 문장 — 프롬프트 규칙상 체질 연결 문장에는 아이 이름이 들어간다.
  // 없으면 두 번째 문장(첫 문장은 이슈 서술)으로 폴백한다. 잘라내지 않는다 — 개인화 근거를
  // 자르면 유료 서비스의 핵심이 사라진다. 발췌 규칙은 lib/hero-brief.ts에 순수 함수로 두고
  // 유닛 테스트로 고정한다 — 인라인 로직이라 회귀를 못 잡았던 것이 2026-07-28 재발의 조건이었다.
  const supportLine = pickSupportLine({
    aiMessage,
    childName: cur.name,
    hasHeadline: !!brief.headline,
    firstPlainLine: plainLines[0] ?? null,
  });

  // 상세 본문 문단 — v3 body 규격(16/400/1.6). 접힘이 기본이라 랜딩 높이에 영향이 없고,
  // 펼쳤을 때는 "읽는 리포트"가 되어야 하므로 14px·foreground/80(스케일 밖 반투명)을 버렸다.
  // 히어로 근거 문장으로 이미 쓴 줄은 제외한다 — 상세가 같은 카드 안으로 들어온 뒤로는
  // 같은 문장이 네 줄 아래 또 나오면 "복사해 붙인 글"처럼 읽힌다(2026-07-26).
  const detailParagraphs = displayBody
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== supportLine)
    .map((line, i) => (
      // 히어로 본문 단은 15/1.66 하나다(DESIGN.md 2026-07-26 supporting 스펙). supporting과
      // 이 상세 문단은 같은 AI 리포트 문장을 잘라 놓은 것이라, 크기·행간이 다르면 펼쳤을 때
      // 한 리포트가 두 종류 글로 읽힌다. 색만 위계로 남긴다(보조 근거=muted / 본문=잉크).
      <p key={i} className="text-[15px] leading-[1.66] text-foreground break-keep">
        {renderRich(line)}
      </p>
    ));

  // 판단 기준 슬롯 — 사용자가 입력한 첫 일과(없으면 첫 슬롯). 판단·근거·사유가 모두
  // 이 슬롯을 가리켜야 한 화면 안에서 서로 어긋나지 않는다.
  const basisSlot = displaySlots.find((sl) => !sl.isDefault) ?? displaySlots[0] ?? null;

  // 1순위는 AI가 정한다 — hook의 조건절(pill 텍스트)이 곧 오늘의 1순위 이슈다
  // (프롬프트 규칙 5: hook은 1순위 이슈로 쓴다). 그래서 pill 아이콘과 근거 칩 순서를
  // 이 텍스트에 맞춘다. 맞추지 않으면 "pill은 자외선인데 아이콘은 비"처럼 어긋난다.
  const ctxIssue = (() => {
    const ctx = brief.context ?? "";
    if (!ctx) return null;
    if (/비|소나기|강수/.test(ctx)) return "강수";
    if (/미세먼지|황사/.test(ctx)) return "미세먼지";
    if (/꽃가루/.test(ctx)) return "꽃가루";
    if (/자외선/.test(ctx)) return "자외선";
    if (/바람/.test(ctx)) return "바람";
    if (/건조/.test(ctx)) return "습도";
    // 더위·추위 — AI가 pill에 "낮 31도 고습"·"폭염"처럼 더위를 1순위로 꼽는 날이 잦다.
    // 종전엔 이 갈래가 없어 그 칩을 앞으로 올릴 수 없었고, warn 어휘에도 더위가 없어서
    // 카드가 뉴트럴로 남았다(2026-07-27). "습함/습도"는 더위 쪽으로 붙인다 — 건조와 달리
    // 고습은 단독 지표가 아니라 불쾌지수(더위)로 판정하기 때문이다.
    if (/폭염|더위|무더|고온|더운|습/.test(ctx)) return "더위";
    if (/한파|추위|추운|영하/.test(ctx)) return "추위";
    if (/일교차/.test(ctx)) return "일교차";
    return null;
  })();

  // 근거 칩 + 히어로 상태는 **lib/hero-brief.ts buildHeroEvidence 한 곳**에서 나온다.
  // 칩(warn)과 카드 색을 서로 다른 곳에서 계산하던 동안 "주의색 카드 + 근거 칩 0개"가
  // 구조적으로 발생했다(2026-07-26). 후보 규칙·하한 규칙은 전부 그 함수의 주석에 있다 —
  // 여기서 후보를 다시 만들지 마라.
  //
  // badges(weatherData 스칼라)를 쓰지 않는 이유: 시간대별 환경·케어 플랜 카드는 슬롯 값을
  // 쓰기 때문에, badges로 칩을 만들면 같은 화면에서 "히어로는 특이사항 없음 / 아래 카드는
  // 자외선 매우강함"처럼 어긋난다(2026-07-21 "홈=판단 / env=근거" 결정이 해소한 문제와 같은 류).
  // 등급 임계값은 slotNotables()의 경고급 조건과 동일해야 한다 — 둘 중 하나만 바뀌면 안 된다.
  //
  // safe(야외활동 권유)는 아직 배선하지 않는다: 홈에는 야외활동 지수 입력(pm25 등급)이
  // 타입상 없어, env와 다른 입력으로 같은 지수를 계산하면 두 화면의 판단이 또 어긋난다.
  const {
    evidence,
    issueLabels,
    state: heroSt,
  } = buildHeroEvidence({
    slot: basisSlot,
    // 일교차 표본은 슬롯이 아니라 원시 3시간 예보다 — 이유는 tempRangeOf 주석 참고
    hourlyTemps: envRaw?.weather?.hourlyForecast?.map((h) => h.temp),
    ctxIssue,
    hasAiHook: !!aiHook,
  });

  // context pill 아이콘 — 1순위 이슈를 모양으로 말한다(색이 빠져도 남는 상태 신호).
  const HERO_ISSUE_BY_LABEL: Record<string, HeroIssue> = {
    강수: "rain",
    미세먼지: "dust",
    꽃가루: "pollen",
    자외선: "uv",
    바람: "cold",
    습도: "temp",
    // heat·cold 아이콘은 HeroDecisionBrief에 처음부터 정의돼 있었지만 매핑이 없어 한 번도
    // 쓰이지 않았다 — 더위·추위가 warn 어휘에 없었기 때문이다(2026-07-27 승격과 함께 배선).
    더위: "heat",
    추위: "cold",
    일교차: "temp",
  };
  const heroIssue: HeroIssue | undefined =
    heroSt === "caution"
      ? HERO_ISSUE_BY_LABEL[ctxIssue ?? issueLabels[0] ?? ""] ?? "temp"
      : undefined;

  // 준비물 사유 — AI 체크리스트는 "이모지 짧은이름"만 준다(report.ts 출력 규칙). 그래서 사유는
  // 그 준비물이 필요한 슬롯의 특이사항에서 만든다: "등원 09:00 · 자외선 매우강함".
  // 규칙 폴백이 "이름 (사유)" 형태를 주면 그것을 그대로 쓴다.
  // 일과 미입력 슬롯(isDefault)에서는 시각을 쓰지 않는다 — 지어낸 시각에 거짓 정밀도를 얹지 않고,
  // "기본 시간"임을 텍스트로 노출하는 것도 금지 범주다.
  const prepReason = (title: string): string => {
    const canon = canonicalPrep(title);
    // 준비물마다 "그 물건을 정당화하는 신호"가 다르다. 슬롯의 첫 특이사항을 그냥 쓰면
    // 선크림 사유가 "비 소식"이 되는 식으로 어긋난다.
    const signal = PREP_SIGNAL.find((p) => p.match.test(canon))?.signal;
    // 이 준비물이 실제로 배정된 슬롯을 우선하고, 없으면 판단 기준 슬롯을 쓴다
    // (AI 체크리스트에는 slotPrep에 없는 항목도 들어온다).
    const target =
      displaySlots.find((slot) =>
        (slotPrep[slot.time] ?? []).some((kw) => canonicalPrep(kw) === canon)
      ) ?? basisSlot;
    if (!target) return "";
    const label = target.isDefault
      ? careLabel(target.time)
      : `${careLabel(target.time)} ${target.hour}`;
    const notables = slotNotables(target, cur?.conditions);
    const matched = signal ? notables.find((n) => signal.test(n)) : undefined;
    // 매칭되는 환경 신호가 없으면 체감 온도로 — 물통·여벌 옷처럼 더위가 근거인 준비물에서
    // "등원 09:00 · 체감 30°"가 실제 이유다. 지어낸 문구를 붙이지 않는다.
    return matched ? `${label} · ${matched}` : `${label} · 체감 ${target.feels}°`;
  };

  // 준비물 — 제목/사유 분리 + 강조 1개(헤드라인이 지시한 준비물 → 없으면 긴급 신호 첫 항목).
  const prepItems = activeChecklist.map((c) => {
    const { title, reason } = splitPrepText(c.text);
    return { key: c.key, title, reason: reason || prepReason(title), icon: c.icon };
  });
  const criticalPrepKeys = (() => {
    const keys = new Set<string>();
    displaySlots.forEach((slot) => {
      (slotPrep[slot.time] ?? []).forEach((kw) => {
        if (isCriticalPrep(kw, slot, cur?.conditions)) keys.add(canonicalPrep(kw));
      });
    });
    return keys;
  })();
  const primaryPrepKey = pickPrimaryPrep(
    brief.headline || aiHook || "",
    prepItems.map((it) => ({
      key: it.key,
      title: it.title,
      critical: criticalPrepKeys.has(canonicalPrep(it.title)),
    }))
  );

  // 히어로 우상단 기준값 — 조회 시점의 하늘·현재·체감. 실측 기온이 없으면 블록을 그리지 않는다
  // (추정값을 실측인 척 보여주지 않는다는 2026-07 무표기 폴백 결론). 아이콘은 시간대별 환경
  // 카드와 같은 skySlotIcon을 써서 두 카드의 하늘이 어긋나지 않게 한다.
  const nowTemp = curWeather?.temperature ?? weatherData?.temp ?? null;
  const heroNow: HeroNowWeather | null =
    nowTemp != null
      ? {
          icon: skySlotIcon(curWeather?.sky ?? null, curWeather?.pty ?? null, 32),
          temp: `${nowTemp}°`,
          feels: curWeather?.feelsLike != null ? `${curWeather.feelsLike}°` : null,
        }
      : null;

  // 로딩 게이트 — 캐시 리포트가 프라임돼 있으면 스켈레톤을 건너뛴다(랜딩 지연 최적화 유지).

  // 오늘 챙길 것 스켈레톤 — 히어로 전체 로딩(briefLoading)과 목록만 로딩(listLoading) 두
  // 경로가 같은 골격을 그려야 한다. 이제 한 카드 안이라 골격이 갈리면 높이가 튄다.
  const prepSkeleton = (
    <div aria-busy="true">
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-full" />
      </div>
      <div className="mt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex min-h-14 items-center gap-3">
            <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
            <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );

  // 공유 — 오늘의 AI 리포트 요약(hook·챙길 것·환경 칩)을 텍스트로 만들어
  // 모바일 네이티브 공유 시트(navigator.share)로 넘긴다. 미지원(주로 데스크톱)이면
  // 클립보드 복사로 폴백. 사용자 제스처(클릭) 안에서만 호출되므로 권한 이슈 없음.
  const buildShareText = () => {
    const lines: string[] = [];
    lines.push(`[AiDay] ${withSubjectSuffix(cur.name)} 위한 오늘의 리포트`);
    lines.push(reportMeta);
    if (aiHook) lines.push("", splitHook(aiHook).join(" "));
    // 자세한 리포트 본문 — 마크다운 강조(**)는 평문에서 노이즈이므로 제거해 공유.
    const bodyText = displayBody
      .split("\n")
      .map((l) => l.replace(/\*\*/g, "").trim())
      .filter(Boolean)
      .join("\n");
    if (bodyText) lines.push("", bodyText);
    if (activeChecklist.length > 0) {
      lines.push("", "오늘 챙길 것");
      activeChecklist.forEach((c) => lines.push(`· ${c.icon} ${c.text}`));
    }
    if (badges.length > 0) {
      lines.push("", badges.map((b) => `${b.label} ${b.value}`).join(" / "));
    }
    lines.push("", "날씨·대기질을 아이 체질로 해석 — AiDay");
    return lines.join("\n");
  };

  // 공유 이미지 카드에 넘길 데이터 — 화면 렌더 상태(hook·본문·칩·체크리스트)에서 파생.
  const shareCardData: ShareReportData = {
    childName: cur.name,
    dateLabel: reportMeta,
    hook: aiHook ? splitHook(aiHook).join(" ") : "",
    paragraphs: displayBody
      .split("\n")
      .map((l) => l.replace(/\*\*/g, "").trim())
      .filter(Boolean),
    badges: badges.map((b) => ({ label: b.label, value: b.value, tone: badgeTone(b.tone) })),
    checklist: activeChecklist.map((c) => {
      // "제목 (사유)" → 제목/사유 분리 (체크리스트 렌더와 동일 규칙)
      const m = c.text.match(/^(.*?)\s*[（(](.+?)[)）]\s*$/);
      return { icon: c.icon, title: m ? m[1].trim() : c.text, reason: m ? m[2].trim() : "" };
    }),
  };

  // 텍스트 공유 폴백 — 이미지 생성이 안 되거나 파일 공유 미지원일 때.
  const shareAsText = async () => {
    const text = buildShareText();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "AiDay 오늘의 리포트", text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("리포트를 클립보드에 복사했어요");
    } catch {
      toast("공유를 지원하지 않는 환경이에요");
    }
  };

  const handleShare = async () => {
    if (aiLoading || aiStreaming) {
      toast("리포트를 준비 중이에요");
      return;
    }
    if (sharing) return;
    const node = shareCardRef.current;
    if (!node) {
      await shareAsText();
      return;
    }
    setSharing(true);
    try {
      // 폰트가 준비된 뒤 캡처해야 한글이 폴백 폰트로 새지 않는다.
      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
      // html-to-image는 공유 시점에만 필요하므로 동적 로드 — 초기 홈 번들에서 제외.
      const { toPng } = await import("html-to-image");
      // skipFonts: Pretendard CDN은 교차 출처라 임베드가 막힌다(cssRules 접근 불가).
      // 임베드를 건너뛰면 캡처는 시스템 한글 폰트로 렌더되고, 무의미한 CORS 에러 로그도 사라진다.
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: true,
        backgroundColor: "#FFF8F0",
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "aiday-report.png", { type: "image/png" });

      // 1) 네이티브 파일 공유 — 모바일 우선. 이미지가 그대로 카톡·인스타로.
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file], title: "AiDay 오늘의 리포트" });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          // 그 외 오류는 다운로드 폴백으로 진행
        }
      }

      // 2) 다운로드 폴백 — 파일 공유 미지원(주로 데스크톱)
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "aiday-report.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("리포트 이미지를 저장했어요");
    } catch {
      // 이미지 생성 자체가 실패하면 텍스트 공유로 폴백
      await shareAsText();
    } finally {
      setSharing(false);
    }
  };

  // Reset checklist when profile changes
  useEffect(() => setChecked([]), [active]);

  const toggle = (key: string) => {
    // 지표 3(체크리스트 인터랙션율) — 항목 텍스트는 AI 생성물이라 이름이 섞일 수 있어
    // key(표준화된 준비물명 / 폴백 key)만 기록한다.
    track("checklist_toggled", {
      item: key,
      checked: !checked.includes(key),
    });
    setChecked((p) => {
      const next = p.includes(key) ? p.filter((x) => x !== key) : [...p, key];
      // 저녁 "오늘의 마무리"가 실행 여부를 프리필하는 재료 — 분석 이벤트(append-only)는
      // 다시 읽을 수 없어 제품 상태로 따로 남긴다. 부모가 아침에 답한 것을 저녁에 또
      // 묻지 않기 위한 최소 저장이다(서버 승격은 P1).
      if (cur) saveCheckedKeys(cur.id, next);
      return next;
    });
  };

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
        {/* Top nav */}
        <PageHeader
          right={
            // 알림 — 정식 출시 예정. 우상단 점으로 "예정"을 암시하고, 탭하면 예고 안내.
            <button
              onClick={() => toast("기준치 이상 환경 변화 알림은 정식 출시에 추가될 예정이에요")}
              className={`${headerBtn} relative`}
              aria-label="알림 (정식 출시 예정)"
            >
              <Bell className="h-5 w-5" strokeWidth={1.75} />
              <span
                className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
            </button>
          }
        />

        <main className="container-mobile pt-5">
          {/* 상단 라인 — 프로필 탭(좌, 가로 스크롤) + 위치(우, 고정) */}
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-hide">
              {/* 프로필 세그먼트 컨트롤 — 아이 전환 스위치(DESIGN.md 세그먼트 문법).
                  bg-muted 트랙 위에서 활성 아이만 흰 카드로 떠올라(bg-card + shadow-soft)
                  "누를 수 있는 컨트롤"임이 색이 아니라 형태로 전달된다 — 이름이 붉게 읽히지
                  않게 하려 accent를 뺐더니 버튼감이 사라진 문제 해소(2026-07-19 결정).
                  아바타 이니셜·나이는 중복 정보라 제외 — 상세는 마이 페이지에. */}
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-muted p-1">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActive(p.id)}
                    aria-pressed={active === p.id}
                    className={`flex min-h-9 shrink-0 items-center rounded-full px-4 text-sm transition-smooth active:scale-[0.97] ${
                      active === p.id
                        ? "bg-card font-bold text-foreground shadow-soft"
                        : "font-medium text-muted-foreground"
                    }`}
                  >
                    {p.name}
                    {isDemoProfile(p) && (
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        (예시)
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => router.push("/onboarding")}
                className="flex min-h-9 shrink-0 items-center rounded-full border border-dashed border-border-control bg-transparent px-4 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                + 추가
              </button>
            </div>

            {/* 위치 — 상단 라인 우측 고정. 탭하면 실위치 기반으로 기준지 변경(위치 v1).
                라벨은 항상 실제 데이터 기준지(구 단위)와 일치한다. */}
            <button
              onClick={requestLocation}
              className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span>{locating ? "위치 확인 중…" : `서울 ${location.gu}`}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
          </div>

          {/* 오늘 준비 머리글 — 타이틀 + 발행 시각(아래), 유틸은 우측 상단.
              새로고침·공유는 화면 전체의 유틸이라 히어로 카드 밖에 둔다 — 결론 옆에
              컨트롤이 붙으면 조건 배지에서 결론으로 가는 시선이 한 번 끊긴다. */}
          <div className="mt-2 flex items-start justify-between gap-3 pb-3">
            <div className="min-w-0 flex-1">
              {/* 아이 이름은 타이틀에서 뺐다 — 바로 위 프로필 세그먼트가 활성 아이를
                  이미 보여주고 있어 같은 정보가 두 번 나온다. 누구의 리포트인지는
                  세그먼트가, 무엇인지는 이 타이틀이 말한다. */}
              <h1 className="text-[20px] font-bold leading-[1.35] tracking-[-0.02em] break-keep">
                오늘의 AI 리포트
              </h1>
              {/* 날짜·발행 시각은 .num이 아니라 .tabular — "7월 26일 (일)"은 한글 문장이고
                  DESIGN.md가 .num(-0.03em)의 한글 사용을 금지한다. 자릿수 정렬만 필요하다.
                  타이틀 아래는 폭이 넉넉해 날짜까지 온전히 쓴다(우측 배치 때는 축약형). */}
              <p className="tabular mt-1 text-[13px] font-medium leading-[1.45] text-muted-foreground break-keep">
                {aiError && "기본 추천 · "}
                {reportMeta}
              </p>
            </div>
            {/* 새로고침·공유 — 44px 터치 타깃 + Lucide 20/1.75.
                -mr-3으로 아이콘 광학 우측선을 프레임 콘텐츠선(20px)에 맞추고,
                -mt-2로 타이틀 첫 줄과 시각 중심을 맞춘다. */}
            <div className="-mr-3 -mt-2 flex shrink-0 items-center text-muted-foreground">
              <button
                onClick={refreshReport}
                disabled={aiLoading || refreshing}
                aria-label="리포트 새로고침"
                className="flex h-11 w-11 items-center justify-center rounded-full transition-smooth hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
              >
                <RefreshCw
                  className={`h-5 w-5 ${aiLoading || refreshing ? "animate-spin" : ""}`}
                  strokeWidth={1.75}
                />
              </button>
              <button
                onClick={handleShare}
                disabled={sharing}
                aria-label="공유"
                className="flex h-11 w-11 items-center justify-center rounded-full transition-smooth hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
              >
                {sharing ? (
                  <RefreshCw className="h-5 w-5 animate-spin" strokeWidth={1.75} />
                ) : (
                  <Share2 className="h-5 w-5" strokeWidth={1.75} />
                )}
              </button>
            </div>
          </div>

          {/* AI 판단 브리프 — 조건 pill → 결론(28/800) → 체질 근거 → 판단 근거 칩.
              화면에서 유일하게 radius 24 + shadow-card를 쓰는 표면이다(L2 1곳 규칙).
              캐시 리포트가 프라임돼 있으면(reportPrimed) 스켈레톤을 건너뛰고 즉시 실카드를 그린다. */}
          {briefLoading ? (
            <section className="rounded-3xl bg-card p-5 shadow-card" aria-busy="true">
              {/* 실카드 골격 그대로 — (pill + 우상단 기준값) → 결론 2줄 → 근거 문장 3줄
                  → 자세히 → 칩 2개. 실물과 높이가 같아야 로딩→실물 전환에서 레이아웃이 튀지 않는다. */}
              <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-9 w-44 rounded-full" />
                {/* 기준값 자리표시자도 실카드와 같은 가로 배치 — 세로로 두면 스켈레톤만
                    78px가 되어 로딩→실물 전환에서 결론이 40px 위로 튄다. */}
                <div className="flex shrink-0 items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex flex-col items-end gap-1.5">
                    <Skeleton className="h-4 w-14 rounded-full" />
                    <Skeleton className="h-3 w-12 rounded-full" />
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Skeleton className="h-8 w-4/5 rounded-full" />
                <Skeleton className="h-8 w-3/5 rounded-full" />
              </div>
              <div className="mt-4 space-y-2">
                <Skeleton className="h-4 w-full rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" />
                <Skeleton className="h-4 w-3/6 rounded-full" />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-24 rounded-full" />
                  <Skeleton className="h-9 w-28 rounded-full" />
                </div>
                <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
              </div>
              <div className="-mx-5 mt-5 border-t border-border px-5 pt-5">{prepSkeleton}</div>
            </section>
          ) : (
            <HeroDecisionBrief
              state={heroSt}
              context={brief.context}
              headline={brief.headline || plainLines[0] || ""}
              prepNames={prepItems.map((it) => it.title)}
              now={heroNow}
              support={
                // AI 본문 대기 중엔 스켈레톤. 헤드라인만 먼저 온 상태에서 이 자리를 규칙
                // 문장으로 메우면 "AI가 그렇게 판단한 것"처럼 읽힌다. 2줄 골격은 실제 근거
                // 문장(15/1.66 2줄)과 같은 높이라 본문이 도착해도 카드가 튀지 않는다.
                aiBodyPending ? (
                  <span aria-busy="true" className="block space-y-1.5 py-1">
                    <Skeleton className="block h-3.5 w-full rounded-full" />
                    <Skeleton className="block h-3.5 w-4/6 rounded-full" />
                  </span>
                ) : supportLine ? (
                  renderRich(supportLine)
                ) : null
              }
              detail={
                // 대기 중엔 상세도 열지 않는다 — 열면 규칙 문장이 "자세한 리포트"로 나온다.
                heroSt === "fallback" || aiBodyPending ? null : (
                  <>
                    {detailParagraphs}
                    {/* 잠정본 안내 — 결론 옆이 아니라 이 상세 안. 조건과 결론 사이에 읽을 것을
                        늘리지 않고, 성격도 "판단"이 아니라 출처·시점 정보다. */}
                    {reportProvisional && (
                      <p className="text-[13px] leading-[1.5] text-muted-foreground break-keep">
                        전날 밤 예보 기준이에요 — 아침 6시 이후 당일 예보로 자동 갱신돼요
                      </p>
                    )}
                    {trustLine}
                  </>
                )
              }
              detailOpen={reportExpanded}
              onToggleDetail={() => setReportExpanded((v) => !v)}
              evidence={evidence}
              issue={heroIssue}
              onRetry={
                // 하루 한도를 소진한 상태에서는 재시도를 노출하지 않는다 — 이 버튼의 약속은
                // "AI 판단을 다시 받는다"인데 그게 유일하게 불가능한 상황이고, 눌러도 429가
                // 돌아온다. 종전엔 계속 보여서 사용자가 반복 클릭했고 사용량만 올랐다
                // (2026-07-27: 한도 20인데 카운터 34 — 초과 14회가 전부 이미 막힌 재시도였다).
                heroSt === "fallback" && !reportLimitReached ? refreshReport : undefined
              }
              retrying={aiLoading || refreshing}
            >
              {/* 오늘 챙길 것 — 판단과 같은 카드 안 섹션(2026-07-26). 판단과 그 판단이 지시한
                  실행이 두 표면으로 갈리면 한눈에 하나로 읽히지 않는다는 사용자 지적.
                  리포트가 정착하기 전(스트리밍 포함)까지는 스켈레톤을 유지해 규칙 폴백이 잠깐
                  노출됐다 AI 결과로 바뀌는 잔상을 막는다. */}
              {listLoading ? (
                prepSkeleton
              ) : (
                <PrepChecklistCard
                  embedded
                  items={prepItems}
                  checkedKeys={checked}
                  onToggle={toggle}
                  primaryKey={primaryPrepKey}
                  footer={
                    <>
                      {/* 전달 — 판단·실행 다음의 세 번째 행. 여기 있어야 "아침에 할 일"이
                          한 카드에서 끝난다(2026-07-29 Approach C). */}
                      <MorningMessageAction
                        childName={cur.name}
                        hook={aiHook || ""}
                        preps={prepItems.map((it) => it.title)}
                        handoff={morningHandoff}
                        atDaycare={displaySlots.some(
                          (s) => s.time.includes("등원") || s.time.includes("하원")
                        )}
                      />
                      <div className="mt-4 border-t border-border pt-4">
                        <ReportFeedback childId={cur.id} ageBand={ageBand(cur.age)} />
                      </div>
                    </>
                  }
                />
              )}
            </HeroDecisionBrief>
          )}

          {/* AI 리포트 생성 한도(429) 안내 — 토스트는 몇 초 뒤 사라지므로, 재방문해도
              보이도록 영구 배너로 둔다. 게스트만 가입 유도 CTA를 붙인다. */}
          {reportLimitReached && (
            <div className="mt-2 rounded-2xl bg-primary-tint p-4">
              <p className="text-[13px] leading-[1.5] text-foreground break-keep">
                {reportLimitReached.isGuest
                  ? "오늘의 체험 횟수를 모두 사용했어요. 가입하면 계속 이용할 수 있어요"
                  : "오늘의 브리핑 생성 한도에 도달했어요. 내일 다시 이용할 수 있어요"}
              </p>
              {reportLimitReached.isGuest && (
                <Button size="sm" className="mt-2" onClick={() => router.push("/signup")}>
                  무료로 시작하기
                </Button>
              )}
            </div>
          )}

          {/* 상세(리포트 본문·출처)와 오늘 챙길 것은 모두 히어로 카드 안으로 들어갔다(2026-07-26).
              별도 카드로 두면 표면이 셋이 되고, "판단 → 실행"이 한눈에 하나로 읽히지 않았다. */}

          {/* Timeline — 스크롤 가능성은 peek이 전달 (안내 문구 없음) */}
          <section className="mt-12">
            <div className="flex items-center justify-between">
              <h2 className="scroll-mt-14 text-[17px] font-bold tracking-[-0.01em]">시간대별 환경</h2>
              {/* 오늘|내일 세그먼트 — DESIGN.md 세그먼트 문법(프로필 전환과 동일).
                  저녁에 "내일 아침 준비"를 능동 조회할 수 있게 한다 (2026-07-20 결정). */}
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-muted p-1" role="group" aria-label="조회 날짜 선택">
                {([["today", "오늘"], ["tomorrow", "내일"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setEnvDay(key)}
                    aria-pressed={envDay === key}
                    className={`flex min-h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] transition-smooth active:scale-[0.97] ${
                      envDay === key
                        ? "bg-card font-bold text-foreground shadow-soft"
                        : "font-medium text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* 실측 없음: mock 카드 대신 정직한 안내 — 어떤 값도 실측인 척 보여주지 않는다 */}
            {!loading && timelineSlots.length === 0 && (
              <div className="mt-3 rounded-2xl bg-card p-5 text-center shadow-soft">
                <p className="text-[13.5px] font-semibold text-foreground">
                  {envDay === "tomorrow" ? "내일 예보를 불러오지 못했어요" : "환경 데이터를 불러오지 못했어요"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  기상청 응답이 지연되고 있어요. 네트워크 확인 후 잠시 뒤 다시 열어주세요.
                </p>
              </div>
            )}
            <div className="mt-3 -mx-5 flex flex-nowrap gap-2.5 overflow-x-auto overflow-y-hidden px-5 pb-2 scrollbar-hide [-webkit-overflow-scrolling:touch]">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-44 w-[150px] shrink-0 rounded-2xl" />
                  ))
                : timelineSlots.map((t) => (
                    <article
                      key={t.time}
                      className="w-[148px] shrink-0 rounded-2xl bg-card p-4 shadow-soft transition-smooth"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold tracking-[-0.01em]">{t.time}</p>
                          <p className="text-[11px] tabular text-muted-foreground">{t.hour}</p>
                        </div>
                        {skySlotIcon(t.sky, t.pty)}
                      </div>
                      <div className="mt-3 flex items-baseline gap-1">
                        <span className="num text-[26px] leading-none">{t.temp}°</span>
                        <span className="num text-[11px] text-muted-foreground">체감 {t.feels}°</span>
                      </div>
                      <div className="my-3 h-px bg-border/60" />
                      {/* 지표 값: 5px 도트 + 상태 색 텍스트, neutral은 도트 숨김 */}
                      <dl className="space-y-1.5 text-[11px]">
                        {([
                          // 경고(오렌지)만 색을 쓰고 좋음·보통은 무색(neutral) — 24개 값 그리드에서
                          // 경고가 묻히지 않도록 "특이사항 없음 = 색 없음" 원칙 적용 (good/초록 미사용)
                          // 내일 모드: 미세먼지·꽃가루는 내일 값이 존재하지 않는다(실측/당일 발행).
                          // 카드 템플릿은 오늘과 동일하게 유지하고 값만 "-"로 — 중립 폴백
                          // ("보통"/"낮음")을 예보인 척 보여주지 않기 (2026-07-21 결정).
                          ["미세먼지", envDay === "today" ? t.dust : "-", envDay === "today" && ["나쁨", "매우나쁨"].includes(t.dust) ? "warn" : "neutral"],
                          ["자외선", t.uv, ["강함", "매우강함"].includes(t.uv) ? "warn" : "neutral"],
                          ["꽃가루", envDay === "today" ? t.pollen : "-", envDay === "today" && ["높음", "매우높음"].includes(t.pollen) ? "warn" : "neutral"],
                          // 습도: 양극단 경고 — ≤40% 건조(피부·호흡기) / ≥80% 후텁지근(AI 리포트 로직과 일치)
                          ["습도", `${t.humidity}%`, t.humidity <= 40 || t.humidity >= 80 ? "warn" : "neutral"],
                          ["바람", t.wind, t.wind === "강함" ? "warn" : "neutral"],
                          // 강수확률: 우산 키워드의 근거 지표 — 데이터 있을 때만 노출
                          ...(t.pop != null
                            ? [["강수확률", `${t.pop}%`, t.pop >= 60 ? "warn" : "neutral"] as [string, string, StatusTone]]
                            : []),
                        ] as [string, string, StatusTone][]).map(([k, v, tone]) => (
                          <div key={k} className="flex items-center justify-between">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="flex items-center gap-1 whitespace-nowrap">
                              {tone !== "neutral" && (
                                <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${toneDot[tone]}`} aria-hidden="true" />
                              )}
                              <span
                                className={`${/\d/.test(v) ? "num" : tone === "neutral" ? "font-medium" : "font-semibold"} ${toneText[tone]}`}
                              >
                                {v}
                              </span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
            </div>
            {/* 내일 모드: 미세먼지(실측)·꽃가루(당일 발행)는 내일 값이 없다 — 카드는 "-"로 두고
                하단에 이유를 안내한다 (2026-07-21 결정: 문구를 카드 위→아래로 이동) */}
            {!loading && envDay === "tomorrow" && timelineSlots.length > 0 && (
              <p className="mt-2 text-[12px] leading-[1.5] text-muted-foreground break-keep">
                내일 예보 기준이에요 — 미세먼지·꽃가루는 당일 아침에 확정되면 보여드려요
              </p>
            )}
          </section>

          {/* 오늘의 케어 플랜 — 세로 타임라인: 온도 + 특이사항 지표(+프로필 민감)만, 준비물 칩 */}
          <section className="mt-8">
            <h2 className="scroll-mt-14 text-[17px] font-bold tracking-[-0.01em]">오늘의 케어 플랜</h2>
            {/* 실측 없음: 위 시간대별 카드와 동일한 정직한 빈 상태 */}
            {!loading && displaySlots.length === 0 && (
              <div className="mt-4 rounded-2xl bg-card p-5 text-center shadow-soft">
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  환경 데이터가 준비되면 케어 플랜을 보여드릴게요.
                </p>
              </div>
            )}
            <div className="mt-4">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="mb-2.5 flex gap-3">
                      <div className="flex flex-col items-center">
                        <Skeleton className="mt-5 h-3 w-3 rounded-full" />
                        {i < 2 && <span className="w-px flex-1 bg-border" />}
                      </div>
                      <Skeleton className="mb-0.5 h-24 flex-1 rounded-2xl" />
                    </div>
                  ))
                : displaySlots.map((slot, i) => {
                    const kind = i === careHighlightIdx ? careHighlightKind : null;
                    const isNow = kind === "now"; // 오렌지 강조는 진짜 "지금"에만
                    const notables = slotNotables(slot, cur?.conditions);
                    const prep = slotPrep[slot.time] ?? [];
                    const last = i === displaySlots.length - 1;
                    return (
                      <div key={slot.time} className="flex gap-3">
                        {/* 좌측 레일: 도트 + 연결선 — "지금"만 오렌지, "곧"은 옅은 강조 */}
                        <div className="flex flex-col items-center">
                          <span
                            className={`mt-5 h-3 w-3 shrink-0 rounded-full ${
                              isNow
                                ? "bg-primary ring-4 ring-primary/15"
                                : kind
                                  ? "bg-primary/60"
                                  : "bg-border-control"
                            }`}
                            aria-hidden="true"
                          />
                          {!last && <span className="w-px flex-1 bg-border" />}
                        </div>
                        {/* 카드 — 흰 카드 문법 통일. "지금"은 텍스트 뱃지 없이 1.5px 오렌지 보더로만
                            표시하고(중복·거짓정밀도 제거), 현재 슬롯임은 aria-current + sr-only로 전달. */}
                        <div
                          aria-current={isNow ? "true" : undefined}
                          className={`mb-2.5 flex-1 rounded-2xl border-[1.5px] bg-card p-4 shadow-soft ${
                            isNow
                              ? "border-primary"
                              : kind
                                ? "border-primary/40"
                                : "border-transparent"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 text-[15px] break-keep">
                              <span className="font-bold tracking-[-0.01em]">
                                <span className="num">{slot.hour}</span> {careLabel(slot.time)}
                              </span>
                              {kind === "now" && <span className="sr-only">지금</span>}
                              {kind === "soon" && <span className="sr-only">곧</span>}
                              <span className="ml-2 font-normal text-muted-foreground">
                                <span className="num">{slot.temp}°</span>
                                {notables.length > 0
                                  ? ` · ${notables.slice(0, 2).join(" · ")}`
                                  : " · 무난해요"}
                              </span>
                            </p>
                            <span className="shrink-0">{skySlotIcon(slot.sky, slot.pty)}</span>
                          </div>
                          {prep.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {prep.map((k) =>
                                isCriticalPrep(k, slot, cur?.conditions) ? (
                                  <span
                                    key={k}
                                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold chip-warn"
                                  >
                                    <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-current" aria-hidden="true" />
                                    {k}
                                  </span>
                                ) : (
                                  <span
                                    key={k}
                                    className="rounded-full border border-border-control bg-card px-3 py-1 text-[12px] font-semibold text-foreground"
                                  >
                                    {k}
                                  </span>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
            </div>
            {/* 일과 전부 기본값(온보딩 생략) — 실제 등원·하원 시각을 받아 "지금"을 정밀하게 맞추도록 유도.
                입력을 회수하면 기본값 표기가 사라지고 분 단위 안내로 승격된다. */}
            {!loading && allSlotsDefault && (
              <button
                onClick={() => router.push(`/me/edit/${encodeURIComponent(cur.id)}`)}
                className="mt-1 flex w-full items-center gap-2 rounded-2xl border border-dashed border-border-control bg-card px-4 py-3 text-left shadow-soft transition-smooth hover:border-foreground"
              >
                <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-muted-foreground break-keep">
                  지금은 <span className="font-semibold text-foreground">기본 시간</span>으로 보여드리고 있어요.
                  우리 아이 <span className="font-semibold text-foreground">일과 시간</span>을 입력하면 등·하원에 딱 맞춰 챙겨드려요.
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              </button>
            )}
          </section>

          {/* 오늘의 건강 팁 — 오늘 환경·체질에 걸린 근거 가이드로의 진입(제목+출처만).
              오늘의 정보 계열(판단 → 환경 → 케어)의 마지막 자리. 관련 팁이 없는 날은
              컴포넌트가 스스로 렌더를 건너뛴다(홈에 안심 배너를 얹지 않는다). */}
          {!loading && <HomeHealthTips env={tipsEnv} child={cur} />}

          {/* 오늘의 마무리 — 아침 판단의 결과 회수(Family Memory 원료, PRD S-003).
              오늘의 정보가 아니라 '다음 행동'이라 스크롤 끝 마감 위치에 두고, 여기서
              하루 탭(/review)으로 넘긴다. 상태 판정은 카드가 직접 읽는다(홈 diff 최소화). */}
          {!loading && <DayReviewEntryCard childId={cur.id} childName={cur.name} />}

          {/* 공유용 이미지 카드 — 화면 밖에 렌더해두고 공유 시 html-to-image로 PNG 캡처.
              display:none이면 캡처가 레이아웃을 못 잡으므로 off-screen 고정으로 둔다. */}
          {!loading && (
            <div
              aria-hidden="true"
              style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none", zIndex: -1 }}
            >
              <ShareReportCard ref={shareCardRef} data={shareCardData} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Home;
