"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation"; ;
import { Bell, Settings, MapPin, ChevronDown, Check, CircleCheck, Droplets, Umbrella, Sun, Cloud, CloudSun, CloudRain, CloudSnow, RefreshCw, Share2 } from "lucide-react";
import PageHeader, { headerBtn } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import LineIcon from "@/components/LineIcon";
import ShareReportCard, { type ShareReportData } from "@/components/ShareReportCard";
import { withSubjectSuffix } from "@/lib/korean";
import { hasRespiratory, hasAllergy, hasSkin } from "@/lib/domain/child-conditions";
import {
  ChildProfile,
  PROFILES_KEY,
  allowBrowseHome,
  fetchProfilesFromDb,
  loadProfiles,
  realLocalProfiles,
} from "@/lib/profile";
import { buildRecommendation, type Recommendation } from "@/lib/recommendation-engine";
import { nearestSeoulGu } from "@/lib/locations";
import type { WeatherData } from "@/lib/weather-api";
import { buildTimeline, dustLabel, pollenLabel, type EnvRaw, type HomeTimeSlot } from "@/lib/timeline";
import { buildPrepKeywords } from "@/lib/prep";
import { isSweatProne } from "@/lib/domain/child-conditions";
import { perfStart, perfMark, perfReport, perfEnabled, type PerfSession } from "@/lib/perf";

/* ---- AI 리포트 당일 캐시: 날짜 키 + 환경 급변 판정 ---- */

// 로컬(기기) 기준 YYYY-MM-DD — toISOString은 UTC 기준이라 KST 자정~09시 사이에
// 어제 날짜가 되어 캐시가 오전 9시에 엉뚱하게 갈리는 문제를 피한다
const localDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// AI 리포트 당일 캐시 키 — 프롬프트/스키마 변경 시 버전(v..)을 올려 구캐시를 무효화한다.
// 리포트 생성 effect와 마운트 프라임 effect가 반드시 같은 키를 쓰도록 한 곳에서 만든다
// (예전에 두 곳에 하드코딩해 버전이 어긋나며 프라임이 캐시를 못 찾던 회귀가 있었다).
const reportCacheKey = (childId: string) => `aiday:report:v18:${childId}:${localDateStr()}`;

// 리포트 생성 시점의 환경 요약. 당일 고정 캐시를 깨고 재생성할 "급변"인지 비교하는 근거.
type EnvSignature = {
  rain: string; // 시각별 강수 형태 유무 ("06:00:0,09:00:1,...")
  maxPop: number; // 하루 최대 강수확률
  dustBad: boolean; // 미세먼지 나쁨(3) 이상 여부
  uvHigh: boolean; // 자외선 강함(지수 6) 이상 여부
  pollenHigh: boolean; // 꽃가루 높음(지수 3) 이상 여부
  temps: Record<string, number>; // 시각별 기온
};

const envSignature = (
  w: { hourlyForecast?: { hour: string; temp: number; pty: number | null; pop: number | null }[] } | null,
  a: { pm10Grade?: number | null } | null,
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
    uvHigh: (uvPeak ?? 0) >= 6,
    pollenHigh: (pollenMax ?? 0) >= 3,
    temps: Object.fromEntries(hours.map((h) => [h.hour, h.temp])),
  };
};

// 급변 기준: 비 소식 생김/사라짐 · 강수확률 30%p 이상 변동 · 미세먼지 나쁨 경계 통과 ·
// 자외선 강함 경계 통과 · 꽃가루 높음 경계 통과 · 같은 시각 기온 예보 3°C 이상 변동.
// 스냅샷이 없는 구캐시는 급변 아님으로 취급.
const envChanged = (prev: EnvSignature | undefined, cur: EnvSignature): boolean => {
  if (!prev) return false;
  if (prev.rain !== cur.rain) return true;
  if (Math.abs((prev.maxPop ?? 0) - cur.maxPop) >= 30) return true;
  if (!!prev.dustBad !== cur.dustBad) return true;
  if (!!prev.uvHigh !== cur.uvHigh) return true;
  if (!!prev.pollenHigh !== cur.pollenHigh) return true;
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
const skySlotIcon = (sky: number | null, pty: number | null) => {
  const props = { size: 24, strokeWidth: 1.5, className: "text-muted-foreground" } as const;
  if (pty && pty > 0) return pty === 3 ? <CloudSnow {...props} /> : <CloudRain {...props} />;
  if (sky === 1) return <Sun {...props} />;
  if (sky === 4) return <Cloud {...props} />;
  return <CloudSun {...props} />; // 구름많음(3) 및 기본값
};

// 체크리스트 아이콘: AI가 "☂️ 우산" 형태로 동적 생성하므로 키워드 매핑 + fallback
const checklistIcon = (icon: string, text: string) => {
  const s = `${icon} ${text}`;
  // 색은 부모(아이콘 사각형)의 text-* 를 상속 — 준비물 아이콘은 warn 전용색이 아니다
  const cls = "shrink-0";
  if (/😷|마스크/.test(s)) return <LineIcon name="mask" className={cls} />;
  if (/🧣|목수건|목도리/.test(s)) return <LineIcon name="scarf" className={cls} />;
  if (/🧥|👕|가디건|외투|긴팔/.test(s)) return <LineIcon name="cardigan" className={cls} />;
  if (/🧢|👒|모자/.test(s)) return <LineIcon name="cap" className={cls} />;
  if (/타올|수건/.test(s)) return <LineIcon name="towel" className={cls} />;
  if (/☂|☔|우산|비옷/.test(s)) return <Umbrella size={19} strokeWidth={1.5} className={cls} />;
  if (/가습기/.test(s)) return <Droplets size={19} strokeWidth={1.5} className={cls} />;
  if (/🧴|💧|보습|로션|크림|미온수/.test(s)) return <LineIcon name="droplet" className={cls} />;
  if (/물병|물통|물/.test(s)) return <LineIcon name="bottle" className={cls} />;
  if (/☀|🕶|자외선|선크림|햇빛/.test(s)) return <LineIcon name="sun" className={cls} />;
  if (/통풍|여벌|옷/.test(s)) return <LineIcon name="shirt" className={cls} />;
  return <CircleCheck size={19} strokeWidth={1.5} className={cls} />;
};

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

// AI hook(히어로 헤드라인)을 두 줄로 — "조건 — 행동" 또는 "조건, 행동" 형태를 분리.
// 프롬프트 규칙상 hook은 "[공감] — [행동]" 구조라 대시가 1차 구분자다. 행동절에 쉼표가
// 섞여도(예: "자외선 매우강함 — 땀도 많은 날, 대비하세요") 대시에서 갈리도록 대시를 먼저 본다.
// 대시가 없을 때만 쉼표를 폴백 구분자로 쓰고, 둘 다 없으면 한 줄로 두고 자연 줄바꿈에 맡긴다.
const splitHook = (hook: string): string[] => {
  const dash = hook.match(/\s+[—–-]\s+/);
  if (dash && dash.index != null) {
    return [hook.slice(0, dash.index).trim(), hook.slice(dash.index + dash[0].length).trim()];
  }
  const comma = hook.search(/[,，]/);
  if (comma > 0 && comma < hook.length - 1) {
    return [hook.slice(0, comma + 1).trim(), hook.slice(comma + 1).trim()];
  }
  return [hook];
};

/* ---- 하루 케어 플랜: 슬롯별 "특이사항" 요약 ---- */

// 환경 보호용 준비물(강수·미세먼지·꽃가루·자외선 대응)은 컬러 강조, 나머지(보습·보온)는 아웃라인.
const CRITICAL_PREP = new Set(["우산", "마스크", "선크림"]);

// 슬롯 라벨 정리: "등원시간" → "등원", "하원시간" → "하원"
const careLabel = (label: string) => label.replace(/시간$/, "");

// 온도 옆에 붙일 "특이사항" 지표 — 6개 지표 중 주의 수준만.
// 아이 프로파일(호흡기·알레르기·피부)에 해당하면 '보통' 단계도 노출해 미리 챙기게 한다.
const slotNotables = (slot: HomeTimeSlot, conditions: string[] = []): string[] => {
  const watchAir = hasRespiratory(conditions) || hasAllergy(conditions); // 미세먼지·꽃가루 민감
  const watchUv = hasSkin(conditions); // 자외선 민감
  const watchDry = hasSkin(conditions); // 건조 민감
  const out: string[] = [];

  if ((slot.pty != null && slot.pty > 0) || (slot.pop != null && slot.pop >= 60)) out.push("비 소식");

  if (slot.dust === "나쁨" || slot.dust === "매우나쁨") out.push(`미세먼지 ${slot.dust}`);
  else if (watchAir && slot.dust === "보통") out.push("미세먼지 보통");

  if (slot.pollen === "높음" || slot.pollen === "매우높음") out.push(`꽃가루 ${slot.pollen}`);
  else if (watchAir && slot.pollen === "보통") out.push("꽃가루 보통");

  if (slot.uv === "강함" || slot.uv === "매우강함") out.push(`자외선 ${slot.uv}`);
  else if (watchUv && slot.uv === "보통") out.push("자외선 보통");

  if (slot.wind === "강함") out.push("바람 강함");

  if (slot.humidity > 0 && slot.humidity <= 40) out.push("건조");
  else if (watchDry && slot.humidity > 0 && slot.humidity <= 50) out.push("건조 주의");

  return out;
};


// 위치 v1 — 위치 버튼으로 설정한 실위치(서울 구 단위). 날씨는 좌표 그대로,
// 미세먼지는 해당 구 측정소로 조회. 라벨과 데이터 기준지가 항상 일치한다.
type HomeLocation = { gu: string; lat: number; lon: number; station: string };
const LOCATION_KEY = "aiday:location:v1";
// 기본 기준지: 서울시청 좌표 + 중구 측정소 (라벨 "서울 중구"와 데이터 일치)
const DEFAULT_LOCATION: HomeLocation = { gu: "중구", lat: 37.5665, lon: 126.978, station: "중구" };

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
  const [location, setLocationState] = useState<HomeLocation>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCATION_KEY) ?? "null");
      if (
        saved &&
        typeof saved.lat === "number" &&
        typeof saved.lon === "number" &&
        typeof saved.gu === "string" &&
        typeof saved.station === "string"
      )
        return saved as HomeLocation;
    } catch {}
    return DEFAULT_LOCATION;
  });
  const [locating, setLocating] = useState(false);
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
  const [aiPrep, setAiPrep] = useState<Record<string, string[]>>({});
  // AI 변형 prep 프리즈: 리포트는 5분 캐시 만료마다 재생성되고 온도 고정도 불가해
  // 같은 입력에도 키워드가 흔들린다. 지나간 시각 슬롯은 그 시각을 지날 때의 값을
  // 날짜·프로필별로 고정 저장해, 지난 카드의 준비물이 오후에 바뀌지 않게 한다.
  // (rule 변형은 입력이 같으면 출력이 같아 프리즈가 필요 없다)
  const [frozenPrep, setFrozenPrep] = useState<Record<string, string[]>>({});
  // 준비물 키워드 A/B: rule(규칙 기반, 기본) vs ai(Claude 생성). ?prep=ai|rule로 전환, 세션 간 유지
  const [prepVariant] = useState<"rule" | "ai">(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("prep");
      if (q === "ai" || q === "rule") {
        localStorage.setItem("aiday:prepVariant", q);
        return q;
      }
      return localStorage.getItem("aiday:prepVariant") === "ai" ? "ai" : "rule";
    } catch {
      return "rule";
    }
  });
  const [aiLoading, setAiLoading] = useState(false);
  // 스트리밍 중 hook만 먼저 도착한 구간 — 헤드라인은 노출하되 본문은 스켈레톤 유지
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiError, setAiError] = useState(false);
  // 현재 표시 중인 리포트의 생성 시각 — 헤더에 "7월 13일 (월) 07:30" 형태로 노출
  const [reportTs, setReportTs] = useState<number | null>(null);
  // 리포트 본문(message) 펼침 여부 — 랜딩 시엔 hook만 노출하고 본문은 접어둔다.
  // 바쁜 부모가 앱을 켰을 때 "아침의 결론(hook)"이 한눈에 들어오게 하고,
  // 자세한 설명은 원할 때만 펼쳐본다. 매 진입마다 접힌 상태로 시작(의도된 기본값).
  const [reportExpanded, setReportExpanded] = useState(false);
  // 마운트 즉시 당일 캐시로 리포트를 이미 그렸는지 — true면 env(uv/pollen) 게이트를
  // 기다리는 동안·재검증 중에도 스켈레톤 없이 캐시 내용을 유지한다(재방문 체감 지연 제거).
  const [reportPrimed, setReportPrimed] = useState(false);
  const [sharing, setSharing] = useState(false); // 공유 이미지 생성 중
  const shareCardRef = useRef<HTMLDivElement>(null); // 공유 캡처 대상(off-screen)
  const forceRefreshRef = useRef(false); // 수동 새로고침: 당일 캐시 무시하고 재생성
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
      setLoading(true);
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
      const getJson = (url: string, timeoutMs: number, mark: string) => {
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
            if (!controller.signal.aborted) {
              const ok = r && !r.error;
              perfMark(perf, ok ? `${mark}_ok` : timedOut ? `${mark}_timeout` : `${mark}_err`);
            }
            return r;
          });
      };

      // 요청 시작·await·상태 갱신을 모두 try로 감싸 예기치 못한 throw에도 setLoading(false)에
      // 도달하게 한다(스켈레톤 영구 정지 방지).
      try {
        // 4개 모두 즉시 병렬 착수 (개별 실패·타임아웃은 null 폴백).
        // 공공 API(data.go.kr)가 느려지는 날 리포트 착수가 무한정 지연되지 않도록 상한을 둔다.
        // weather·air는 화면 셸의 근거라 넉넉히(9s), uv·꽃가루는 리포트 착수를 늦추지 않게 짧게(5s).
        const weatherP = getJson(`/api/weather?lat=${location.lat}&lon=${location.lon}`, 9000, "weather");
        const airP = getJson(`/api/air?station=${encodeURIComponent(location.station)}`, 9000, "air");
        const uvP = getJson("/api/uv?region=서울", 5000, "uv");
        const pollenP = getJson("/api/pollen?region=서울", 5000, "pollen");

        // 1) weather·air 도착 → 화면 셸·상단 카드·시간대 카드를 먼저 표시 (uv·꽃가루는 이후 채움)
        const [w, a] = await Promise.all([weatherP, airP]);
        if (controller.signal.aborted) return; // 취소된(stale) 흐름 — 상태·계측 갱신 안 함
        perfMark(perf, "env_primary_gate"); // weather+air 게이트 통과 (화면 셸 표시 가능)
        weatherRawRef.current = w; // fetchReport에서 재사용 (T4: 중복 호출 방지)
        airRawRef.current = a;
        setEnvRaw({
          weather: w && !w.error ? w : null,
          air: a && !a.error ? a : null,
          uv: null,
          pollen: null,
        });
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
        if (w && !w.error) {
          setAiLoading(true); // 리포트 effect 착수(캐시 재검증) — primed면 스켈레톤은 안 뜸
          // 이미 캐시로 그려둔 경우엔 지우지 않는다(재검증 중 잔상·깜빡임 방지).
          if (!primedRef.current) {
            setAiHook("");
            setAiMessage("");
          }
          setAiError(false);
        } else {
          // 날씨 실측이 없으면 AI 리포트를 생성할 수 없다(날씨가 핵심 입력).
          // 이때 규칙 기반 기본 추천을 노출하되, aiError로 표시해 헤더에 "기본 추천"을
          // 명확히 붙인다 — 폴백이 정상 AI 리포트로 오인되지 않게 한다.
          setAiError(true);
        }
      } catch {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchEnv();
    return () => controller.abort();
    // 위치가 바뀌면 환경 데이터 전체를 새 기준지로 다시 가져온다 (이전 흐름은 abort로 취소)
  }, [location.lat, location.lon, location.station]);

  const cur = profiles.find((p) => p.id === active) ?? profiles[0];
  // 최신 활성 프로필 id를 렌더마다 동기 반영 — 리포트 요청의 stale 판정 기준 (effect 순서 무관)
  activeIdRef.current = cur?.id ?? null;

  // 지나간 슬롯 prep 고정값 복원 — 날짜 표기는 리포트 캐시 키와 동일 규칙 사용
  const prepFrozenKey = cur ? `aiday:prepFrozen:v1:${cur.id}:${localDateStr()}` : null;
  useEffect(() => {
    if (!prepFrozenKey) return;
    try {
      setFrozenPrep(JSON.parse(localStorage.getItem(prepFrozenKey) ?? "{}"));
    } catch {
      setFrozenPrep({});
    }
  }, [prepFrozenKey]);

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

        const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
        if (cached && !force && cached.message && Array.isArray(cached.checklist)) {
          if (!envChanged(cached.env, sig)) {
            perfMark(perf, "cache_hit");
            outcome = "cache_hit";
            if (isCurrent()) {
              setAiHook(cached.hook ?? "");
              setAiMessage(cached.message);
              if (cached.checklist.length > 0) setAiChecklist(cached.checklist);
              setAiPrep(cached.prep && typeof cached.prep === "object" ? cached.prep : {});
              setReportTs(typeof cached.ts === "number" ? cached.ts : null);
              setAiLoading(false);
            }
            return;
          }
          regenerating = true;
        }

        perfMark(perf, "report_fetch_start"); // 캐시 미스 → 서버 요청 착수
        const res = await fetch("/api/report", {
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

        // 사전 검증 실패(apiKey·baseURL 등)는 여전히 non-2xx JSON으로 온다
        if (!res.ok || !res.body) {
          perfMark(perf, `report_http_${res.status}`);
          outcome = `http_${res.status}`;
          // 서버가 보낸 상세 원인(게이트웨이 설정 오류 등)은 콘솔에 남긴다 — 토스트는 부모용 문구 유지
          try {
            const detail = (await res.json())?.error;
            if (detail) console.error("[AI report] 서버 오류 상세:", detail);
          } catch {}
          if (isCurrent()) {
            setAiError(true);
            toast("AI 리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
            setAiLoading(false);
          }
          return;
        }

        // SSE 스트림 소비 — hook·message가 도착하는 즉시 히어로를 노출하고,
        // done 이벤트의 전체 페이로드로 체크리스트·준비물·캐시를 채운다.
        type ReportPayload = { hook: string; message: string; checklist: string[]; prep: Record<string, string[]> };
        if (isCurrent()) setAiStreaming(true); // hook 도착 후 본문 스켈레톤 표시 근거
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let streamErr: boolean = false;
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
          const { done, value } = await reader.read();
          if (done) break;
          // 새 요청(프로필 전환 등)이 시작됐으면 이 스트림은 낡음 — 취소하고 중단(불필요한 생성 소비 방지)
          if (!isCurrent()) {
            outcome = "superseded";
            try { await reader.cancel(); } catch {}
            break;
          }
          buf += decoder.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const ev = chunk.match(/^event: (.+)$/m)?.[1]?.trim();
            const dt = chunk.match(/^data: (.+)$/m)?.[1];
            if (ev && dt != null) handleEvent(ev, dt);
          }
        }

        // 낡은(superseded) 요청은 done 처리·상태 갱신을 건너뛰고 finally로 (계측만 남긴다)
        if (!isCurrent()) return;

        if (streamErr) {
          perfMark(perf, "report_stream_error");
          outcome = "stream_error";
          setAiError(true);
          toast("AI 리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
          setAiLoading(false);
          return;
        }

        const done = final as ReportPayload | null;
        if (done && done.message) {
          setAiHook(done.hook ?? "");
          setAiMessage(done.message);
          if (Array.isArray(done.checklist) && done.checklist.length > 0) {
            setAiChecklist(done.checklist);
          }
          setAiPrep(done.prep && typeof done.prep === "object" ? done.prep : {});
          const now = Date.now();
          setReportTs(now);
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ hook: done.hook ?? "", message: done.message, checklist: done.checklist ?? [], prep: done.prep ?? {}, ts: now, env: sig }));
          } catch {}
          if (regenerating) toast("날씨가 바뀌어 브리핑을 새로 썼어요");
          perfMark(perf, "report_done"); // 전체 페이로드 수신·정착
          outcome = "done";
        } else {
          // done은 왔지만 message 없음 = 서버가 모델 응답 파싱에 실패한 경우 — 조용히 넘기지 않고 표시
          console.warn("[AI report] 빈 응답 수신 — 기본 추천으로 대체합니다.");
          setAiError(true);
          perfMark(perf, "report_empty");
          outcome = "empty";
          toast("AI 리포트 생성에 실패해 기본 추천을 보여드려요.");
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
      setAiPrep({});
      setAiError(false);
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
      if (cached && cached.message && Array.isArray(cached.checklist)) {
        setAiHook(cached.hook ?? "");
        setAiMessage(cached.message);
        if (cached.checklist.length > 0) setAiChecklist(cached.checklist);
        setAiPrep(cached.prep && typeof cached.prep === "object" ? cached.prep : {});
        setReportTs(typeof cached.ts === "number" ? cached.ts : null);
        primedRef.current = true;
        setReportPrimed(true);
      }
    } catch {}
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 언마운트 시 진행 중인 리포트 요청 취소 (서버 Anthropic 스트림까지 abort). 빈 deps라
  // aiLoading 변화로는 트리거되지 않아 스트리밍 도중 자기 요청을 끊지 않는다.
  useEffect(() => () => activeReportRef.current?.ctrl.abort(), []);

  // 수동 새로고침 — 당일 캐시를 건너뛰고 즉시 재생성
  const refreshReport = () => {
    if (aiLoading || loading) return;
    const now = Date.now();
    if (now - lastManualRefreshRef.current < REFRESH_COOLDOWN) {
      toast("방금 갱신했어요");
      return;
    }
    lastManualRefreshRef.current = now;
    forceRefreshRef.current = true;
    // 강제 재생성 — 캐시로 그려둔 내용을 비우고 스켈레톤을 노출한다(재생성 중임을 명확히).
    primedRef.current = false;
    setReportPrimed(false);
    setAiHook("");
    setAiError(false);
    setAiLoading(true);
  };

  // 시간대별 환경: 활성 프로필의 일과 + 실측 데이터로 구성. 실데이터가 없으면 mock.
  const timeline = useMemo<HomeTimeSlot[] | null>(
    () => (envRaw ? buildTimeline(cur?.schedule, envRaw) : null),
    [envRaw, cur?.schedule]
  );

  // 위치 버튼: Geolocation → 서울 최근접 구 매핑 → 기준지 변경(라벨·측정소 동시 갱신).
  // 사용자 제스처 안에서만 권한을 요청하고, 서울 밖·거부·실패는 기본 기준지 유지 + 정직한 안내.
  const handleLocationChange = () => {
    if (locating) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast("이 기기에서는 위치를 사용할 수 없어요");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        const gu = nearestSeoulGu(latitude, longitude);
        if (!gu) {
          toast("아직 서울 지역만 지원해요 — 기본 기준지(서울 중구)로 보여드려요");
          return;
        }
        const loc: HomeLocation = { gu: gu.name, lat: latitude, lon: longitude, station: gu.name };
        setLocationState(loc);
        try {
          localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
        } catch {}
        toast(`서울 ${gu.name} 기준으로 보여드릴게요`);
      },
      () => {
        setLocating(false);
        toast("위치 권한이 없어 기본 기준지(서울 중구)로 보여드려요");
      },
      { timeout: 8000, maximumAge: 600000 }
    );
  };

  // 렌더용 슬롯: 실데이터가 없으면 빈 배열 — mock 값을 실측인 척 보여주지 않는다
  // (2026-07 조사: 무표기 폴백이 "지표 부정확" 체감의 근본 원인 중 하나).
  // 빈 상태는 시간대별 환경·케어 플랜 섹션이 "데이터 지연" 안내로 렌더한다.
  const displaySlots = useMemo<HomeTimeSlot[]>(() => timeline ?? [], [timeline]);

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

  // 슬롯별 준비물 키워드 (A/B): rule=로컬 규칙 엔진, ai=Claude prep 필드
  // AI 변형에서 prep이 비면(로딩 중·미지원 응답) 규칙 기반으로 폴백해 빈 화면을 막는다
  const AI_PREP_KEY: Record<string, string> = { 등원시간: "등원", 야외활동: "야외활동", 하원시간: "하원", 저녁: "저녁" };
  // "HH:MM"이 현재 시각 이전인지 — 지나간 슬롯 판정
  const slotPassed = (hour: string): boolean => {
    const [h, m] = hour.split(":").map(Number);
    if (Number.isNaN(h)) return false;
    const now = new Date();
    return h * 60 + (m || 0) <= now.getHours() * 60 + now.getMinutes();
  };

  // 지나간 슬롯의 AI prep 고정 저장 — 슬롯 시각을 지날 때의 값을 그날 내내 유지
  useEffect(() => {
    if (prepVariant !== "ai" || !prepFrozenKey) return;
    const additions: Record<string, string[]> = {};
    for (const slot of displaySlots) {
      if (!slotPassed(slot.hour) || frozenPrep[slot.time]) continue;
      const fromAi = aiPrep[AI_PREP_KEY[slot.time] ?? slot.time];
      if (Array.isArray(fromAi) && fromAi.length > 0) additions[slot.time] = fromAi.slice(0, 2);
    }
    if (!Object.keys(additions).length) return;
    const merged = { ...frozenPrep, ...additions };
    setFrozenPrep(merged);
    try {
      localStorage.setItem(prepFrozenKey, JSON.stringify(merged));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPrep, displaySlots, prepVariant, prepFrozenKey, frozenPrep]);

  const slotPrep = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    const sweatProne = isSweatProne(cur?.hot, cur?.sweat);
    displaySlots.forEach((slot, i) => {
      const frozen = slotPassed(slot.hour) ? frozenPrep[slot.time] : undefined;
      const fromAi = frozen ?? aiPrep[AI_PREP_KEY[slot.time] ?? slot.time];
      map[slot.time] =
        prepVariant === "ai" && Array.isArray(fromAi) && fromAi.length > 0
          ? fromAi.slice(0, 2)
          : buildPrepKeywords(slot, i > 0 ? displaySlots[i - 1] : null, cur?.conditions, i === 0, sweatProne);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySlots, aiPrep, frozenPrep, prepVariant, cur?.conditions, cur?.hot, cur?.sweat]);
  const { checklist: baseChecklist, message: fallbackMessage, badges } = recommendation;

  const message = aiMessage || fallbackMessage;

  // 리포트 본문 문단 — 펼침 영역과 hook 없는 폴백에서 공통으로 재사용
  const messageParagraphs = message
    .split("\n")
    .filter(Boolean)
    .map((line, i) => (
      <p key={i} className="text-[14px] leading-[1.65] text-foreground/80 break-keep">
        {renderRich(line)}
      </p>
    ));

  // AI 체크리스트가 있으면 사용, 없으면 recommendation engine fallback
  const activeChecklist: { icon: string; text: string; key: string }[] = useMemo(() => {
    if (aiChecklist.length > 0) {
      return aiChecklist.map((item, i) => {
        // "☂️ 우산" 형태 파싱
        const match = item.match(/^(\p{Emoji_Presentation}|\p{Emoji}️|[\u{1F300}-\u{1FFFF}]|\S+)\s+(.+)$/u);
        if (match) return { icon: match[1], text: match[2], key: `ai-${i}` };
        // icon은 화면에 raw로 렌더링되지 않는다 — 체크리스트 UI는 항상 checklistIcon()을
        // 거쳐 LineIcon/lucide로 매핑되고, 매칭 실패 시 CircleCheck로 fallback된다.
        // 이 문자열은 키워드 매칭·텍스트 공유용 데이터로만 쓰인다.
        return { icon: "✅", text: item, key: `ai-${i}` };
      });
    }
    return baseChecklist;
  }, [aiChecklist, baseChecklist]);

  const allDone = checked.length === activeChecklist.length;

  // 하루 케어 플랜 "지금" 슬롯 — 지나간 마지막 슬롯(진행 중), 아직 없으면 첫 슬롯
  const careNowIdx = (() => {
    let idx = -1;
    displaySlots.forEach((s, i) => {
      if (slotPassed(s.hour)) idx = i;
    });
    return idx >= 0 ? idx : 0;
  })();

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

  // AI 리포트 hook 위 현재 환경 한 줄 — 현재날씨·체감·강수·미세먼지·습도 (있는 값만).
  // 라벨(옅게)+값(진하게) 쌍으로 렌더해 한 줄에서 각 지표가 바로 스캔되게 한다.
  const nowWeatherItems = (() => {
    const items: { label: string; value: string }[] = [];
    // 실측(curWeather·weatherData)이 있는 값만 노출 — mock·추정값 폴백 없음
    const t = curWeather?.temperature ?? weatherData?.temp ?? null;
    if (t != null) items.push({ label: "현재날씨", value: `${t}°` });
    if (curWeather?.feelsLike != null) items.push({ label: "체감", value: `${curWeather.feelsLike}°` });
    if (curWeather?.pop != null) items.push({ label: "강수", value: `${curWeather.pop}%` });
    if (weatherData?.dustLevel) items.push({ label: "미세먼지", value: weatherData.dustLevel });
    if (curWeather?.humidity != null) items.push({ label: "습도", value: `${curWeather.humidity}%` });
    return items;
  })();

  // 공유 — 오늘의 AI 리포트 요약(hook·챙길 것·환경 칩)을 텍스트로 만들어
  // 모바일 네이티브 공유 시트(navigator.share)로 넘긴다. 미지원(주로 데스크톱)이면
  // 클립보드 복사로 폴백. 사용자 제스처(클릭) 안에서만 호출되므로 권한 이슈 없음.
  const buildShareText = () => {
    const lines: string[] = [];
    lines.push(`[AiDay] ${withSubjectSuffix(cur.name)} 위한 오늘의 리포트`);
    lines.push(reportMeta);
    if (aiHook) lines.push("", splitHook(aiHook).join(" "));
    // 자세한 리포트 본문 — 마크다운 강조(**)는 평문에서 노이즈이므로 제거해 공유.
    const bodyText = message
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
    paragraphs: message
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

  const toggle = (i: number) =>
    setChecked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
        {/* Top nav */}
        <PageHeader
          right={
            <>
              <button
                onClick={() => toast("새 알림이 없어요")}
                className={headerBtn}
                aria-label="알림"
              >
                <Bell className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <button
                onClick={() => toast("설정 페이지는 준비 중이에요")}
                className={headerBtn}
                aria-label="설정"
              >
                <Settings className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </>
          }
        />

        <main className="container-mobile pt-5">
          {/* 상단 라인 — 프로필 탭(좌, 가로 스크롤) + 위치(우, 고정) */}
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-hide">
              {/* 프로필 칩 — 이름만 표기. 아바타 이니셜·나이는 이 칩에선 중복 정보라 제거(상세는 마이 페이지에).
                  활성 텍스트는 accent가 아닌 foreground — 이름이 붉은 계열로 읽히지 않게(2026-07-19 사용자 결정),
                  선택 상태는 primary-tint 배경만으로 표현한다 */}
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActive(p.id)}
                  className={`flex min-h-11 shrink-0 items-center rounded-full border border-transparent px-4 text-sm font-semibold transition-smooth ${
                    active === p.id
                      ? "bg-primary-tint text-foreground"
                      : "bg-card text-muted-foreground shadow-soft"
                  }`}
                >
                  {p.name}
                </button>
              ))}
              <button
                onClick={() => router.push("/onboarding")}
                className="flex min-h-11 shrink-0 items-center rounded-full border border-dashed border-border-control bg-card px-3.5 py-1.5 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                + 추가
              </button>
            </div>

            {/* 위치 — 상단 라인 우측 고정. 탭하면 실위치 기반으로 기준지 변경(위치 v1).
                라벨은 항상 실제 데이터 기준지(구 단위)와 일치한다. */}
            <button
              onClick={handleLocationChange}
              className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              <span>{locating ? "위치 확인 중…" : `서울 ${location.gu}`}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
          </div>

          {/* AI message card */}
          {loading ? (
            <section className="mt-4 rounded-2xl bg-card p-5 shadow-card">
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
            <section className="mt-4 rounded-2xl bg-card p-5 shadow-card animate-fade-up">
              {/* 카드 헤더 — 크림(secondary) 풀-블리드 띠. 화면당 하나뿐인 히어로 카드를
                  구분하고 "AI 리포트"임을 앵커링. 라벨(15px/bold 블랙)이 주인공이 되도록
                  날짜·시간 메타는 caption(13px·muted-foreground)으로 톤다운. */}
              <div className="-mx-5 -mt-5 mb-4 flex items-center gap-2 rounded-t-2xl bg-secondary px-5 py-3">
                <span className="shrink-0 text-[15px] font-bold text-foreground">AI 리포트</span>
                <span className="num min-w-0 flex-1 truncate text-[13px] font-medium text-muted-foreground">
                  {aiError && "기본 추천 · "}
                  {reportMeta}
                </span>
                <div className="-mr-1.5 flex shrink-0 items-center text-foreground">
                  <button
                    onClick={refreshReport}
                    disabled={aiLoading}
                    aria-label="리포트 새로고침"
                    className="rounded-full p-2 transition-smooth hover:bg-foreground/5 disabled:opacity-40"
                  >
                    <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={handleShare}
                    disabled={sharing}
                    aria-label="공유"
                    className="rounded-full p-2 transition-smooth hover:bg-foreground/5 disabled:opacity-40"
                  >
                    {sharing ? (
                      <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                    ) : (
                      <Share2 className="h-4 w-4" strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>

              {/* 현재 환경 한 줄 — hook 위에 오늘의 실측 컨텍스트. 라벨은 옅게(faint),
                  값은 진하게(foreground/bold, 숫자는 .num)로 대비를 줘 가독성을 높인다. */}
              {nowWeatherItems.length > 0 && (
                <p className="text-[12px] leading-[1.5] break-keep">
                  {nowWeatherItems.map((it, i) => (
                    <span key={it.label}>
                      {i > 0 && <span className="text-faint"> · </span>}
                      <span className="text-faint">{it.label} </span>
                      <span
                        className={`font-semibold text-foreground ${/\d/.test(it.value) ? "num" : ""}`}
                      >
                        {it.value}
                      </span>
                    </span>
                  ))}
                </p>
              )}

              {/* hook + message — 로딩 중엔 skeleton (단, 캐시로 이미 그린 경우엔 유지) */}
              {aiLoading && !reportPrimed ? (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-6 w-3/4 rounded-full" />
                  <div className="mt-3 space-y-1.5">
                    <Skeleton className="h-3.5 w-full rounded-full" />
                    <Skeleton className="h-3.5 w-5/6 rounded-full" />
                    <Skeleton className="h-3.5 w-4/6 rounded-full" />
                  </div>
                </div>
              ) : (
                <>
                  {/* hook — 화면 전체의 히어로. 이 한 문장이 아침의 결론.
                      '자세히' 토글은 마지막 줄에 우측 정렬로 얹어, 히어로와 한 덩어리로 읽히게 한다
                      (본문이 준비된 뒤에만 노출 — 스트리밍 중엔 토글 없이 hook만). */}
                  {aiHook && (
                    <h1 className="mt-3 text-[26px] font-extrabold leading-[1.32] tracking-[-0.02em] text-foreground break-keep">
                      {(() => {
                        const lines = splitHook(aiHook);
                        const canExpand = !(aiStreaming && !aiMessage);
                        return lines.map((ln, i) => {
                          const isLast = i === lines.length - 1;
                          if (!(isLast && canExpand)) {
                            return (
                              <span key={i} className="block">
                                {ln}
                              </span>
                            );
                          }
                          return (
                            <span key={i} className="flex items-end justify-between gap-3">
                              <span className="min-w-0">{ln}</span>
                              <button
                                onClick={() => setReportExpanded((v) => !v)}
                                aria-expanded={reportExpanded}
                                className="-my-2 flex shrink-0 items-center gap-0.5 whitespace-nowrap py-2 text-[13px] font-semibold text-muted-foreground transition-smooth hover:text-foreground"
                              >
                                {reportExpanded ? "접기" : "자세히"}
                                <ChevronDown
                                  className={`h-3.5 w-3.5 transition-transform ${reportExpanded ? "rotate-180" : ""}`}
                                  strokeWidth={2}
                                />
                              </button>
                            </span>
                          );
                        });
                      })()}
                    </h1>
                  )}
                  {/* message — 상세 설명(리포트 본문).
                      · 스트리밍 중 본문이 아직 안 온 구간엔 스켈레톤.
                      · hook이 있으면 랜딩 시 본문을 접어두고 [자세한 리포트 보기 ▼]로 펼친다
                        (바쁜 부모가 hook 한 문장만 먼저 보게 하는 게 목적).
                      · hook이 없는 폴백(규칙 기반 기본 추천)에선 접을 히어로가 없으므로 본문을 바로 노출. */}
                  {aiStreaming && !aiMessage ? (
                    <div className={aiHook ? "mt-2 space-y-1.5" : "mt-3 space-y-2"}>
                      <Skeleton className="h-3.5 w-full rounded-full" />
                      <Skeleton className="h-3.5 w-5/6 rounded-full" />
                      <Skeleton className="h-3.5 w-4/6 rounded-full" />
                    </div>
                  ) : aiHook ? (
                    reportExpanded && (
                      <div className="mt-2 space-y-1.5 animate-fade-up">{messageParagraphs}</div>
                    )
                  ) : (
                    <div className="mt-3 space-y-2">{messageParagraphs}</div>
                  )}
                </>
              )}

              {/* 오늘 챙길 것 — 체크박스 + 아이콘 사각형 + 제목/사유 2줄.
                  리포트가 정착(hook·message·checklist 도착)하기 전까지는 스켈레톤 유지.
                  aiLoading은 hook 도착 즉시 false가 되므로, 본문·체크리스트가 아직 없는
                  스트리밍 구간(aiStreaming)까지 함께 봐야 규칙 폴백(추천 이유 2줄·0/3)이
                  잠깐 노출됐다 AI 결과로 바뀌는 잔상을 막는다. 에러 시엔 폴백을 정상 노출.
                  캐시로 이미 그린 경우(reportPrimed)엔 재검증 중에도 캐시 체크리스트를 유지. */}
              {(aiLoading || aiStreaming) && !reportPrimed ? (
                <Skeleton className="mt-4 h-44 w-full rounded-2xl" />
              ) : (
              <div className="mt-5 border-t border-border px-0.5 pt-4 pb-0">
                <div className="flex items-center justify-between px-0.5">
                  <p className="text-[15px] font-bold">오늘 챙길 것</p>
                  {allDone ? (
                    <p className="text-xs font-bold text-status-good animate-fade-in">준비 끝 ✓</p>
                  ) : (
                    <p className="num text-xs text-muted-foreground">
                      <b className="text-foreground">{checked.length}</b> / {activeChecklist.length}
                    </p>
                  )}
                </div>
                <ul className="mt-1.5">
                  {activeChecklist.map((c, i) => {
                    const on = checked.includes(i);
                    // "제목 (사유)" 형태를 제목/사유 두 줄로 분리 — 괄호가 없으면 제목만
                    const m = c.text.match(/^(.*?)\s*[（(](.+?)[)）]\s*$/);
                    const title = m ? m[1].trim() : c.text;
                    const reason = m ? m[2].trim() : "";
                    return (
                      <li key={i}>
                        <button
                          onClick={() => toggle(i)}
                          className="flex w-full items-center gap-3 border-b border-border/40 py-3 text-left last:border-b-0"
                        >
                          <span
                            className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] bg-card transition-smooth ${
                              on
                                ? "border-status-good text-status-good"
                                : "border-border-control"
                            }`}
                          >
                            {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent">
                            {checklistIcon(c.icon, c.text)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block text-[14.5px] font-bold tracking-[-0.01em] ${
                                on ? "text-muted-foreground" : "text-foreground"
                              }`}
                            >
                              {title}
                            </span>
                            {reason && (
                              <span className="mt-0.5 block text-[12px] text-muted-foreground break-keep">
                                {reason}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              )}

              {/* 신뢰 라인 — 누구 기준으로, 무엇을 근거로 판단했는지 */}
              <p className="mt-3 px-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
                {withSubjectSuffix(cur.name)} 위한 프로필 기준 해석 · 기상청·에어코리아 실측 데이터
              </p>
            </section>
          )}

          {/* Timeline — 스크롤 가능성은 peek이 전달 (안내 문구 없음) */}
          <section className="mt-8">
            <h2 className="scroll-mt-14 text-[17px] font-bold tracking-[-0.01em]">시간대별 환경</h2>
            {/* 실측 없음: mock 카드 대신 정직한 안내 — 어떤 값도 실측인 척 보여주지 않는다 */}
            {!loading && displaySlots.length === 0 && (
              <div className="mt-3 rounded-2xl bg-card p-5 text-center shadow-soft">
                <p className="text-[13.5px] font-semibold text-foreground">환경 데이터를 불러오지 못했어요</p>
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
                : displaySlots.map((t) => (
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
                          ["미세먼지", t.dust, ["나쁨", "매우나쁨"].includes(t.dust) ? "warn" : "neutral"],
                          ["자외선", t.uv, ["강함", "매우강함"].includes(t.uv) ? "warn" : "neutral"],
                          ["꽃가루", t.pollen, ["높음", "매우높음"].includes(t.pollen) ? "warn" : "neutral"],
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
          </section>

          {/* 하루 케어 플랜 — 세로 타임라인: 온도 + 특이사항 지표(+프로필 민감)만, 준비물 칩 */}
          <section className="mt-8">
            <h2 className="scroll-mt-14 text-[17px] font-bold tracking-[-0.01em]">하루 케어 플랜</h2>
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
                    const isNow = i === careNowIdx;
                    const notables = slotNotables(slot, cur?.conditions);
                    const prep = slotPrep[slot.time] ?? [];
                    const last = i === displaySlots.length - 1;
                    return (
                      <div key={slot.time} className="flex gap-3">
                        {/* 좌측 레일: 도트 + 연결선 */}
                        <div className="flex flex-col items-center">
                          <span
                            className={`mt-5 h-3 w-3 shrink-0 rounded-full ${
                              isNow ? "bg-primary ring-4 ring-primary/15" : "bg-border-control"
                            }`}
                            aria-hidden="true"
                          />
                          {!last && <span className="w-px flex-1 bg-border" />}
                        </div>
                        {/* 카드 — 흰 카드 문법 통일, "지금" 슬롯만 1.5px 오렌지 보더 */}
                        <div
                          className={`mb-2.5 flex-1 rounded-2xl border bg-card p-4 shadow-soft ${
                            isNow ? "border-[1.5px] border-primary" : "border-border/60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 text-[15px] break-keep">
                              <span className="font-bold tracking-[-0.01em]">
                                <span className="num">{slot.hour}</span> {careLabel(slot.time)}
                              </span>
                              {isNow && (
                                <span className="ml-1.5 align-[2px] text-[10px] font-bold tracking-[0.08em] text-accent">
                                  지금
                                </span>
                              )}
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
                                CRITICAL_PREP.has(k) ? (
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
          </section>

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
