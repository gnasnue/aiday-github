import type { ChildProfile } from "./profile";
import type { WeatherData } from "./weather-api";
import { withDativeParticle } from "./korean";

export interface CheckItem {
  icon: string;
  text: string;
  key: string;
}

export interface Badge {
  label: string;
  value: string;
  tone: "ok" | "warn";
}

export interface Recommendation {
  checklist: CheckItem[];
  message: string;
  badges: Badge[];
}

export interface ZoneCallout {
  id: string;
  zone: "head" | "neck" | "skin" | "outfit";
  title: string;
  desc: string;
  emoji: string;
  tone: "warn" | "ok";
}

// 타임라인에서 파생되는 판정 신호 — 체크리스트·종합솔루션이 공유하는 유일한 기준
function deriveSignals(weather: WeatherData) {
  const timeline = weather.timeline;
  return {
    highPollen: timeline.some((t) => t.pollen === "높음" || t.pollen === "매우높음"),
    badDust: timeline.some((t) => t.dust === "나쁨" || t.dust === "매우나쁨"),
    hasStrongWind: timeline.some((t) => t.wind === "강함"),
    avgHumidity:
      timeline.reduce((s, t) => s + t.humidity, 0) / (timeline.length || 1),
    tempRange: timeline.length
      ? Math.max(...timeline.map((t) => t.temp)) - Math.min(...timeline.map((t) => t.temp))
      : 0,
  };
}

export function buildRecommendation(profile: ChildProfile, weather: WeatherData): Recommendation {
  const conditions = profile.conditions ?? [];
  const hasRhinitis = conditions.includes("비염");
  const hasSensitiveSkin = conditions.includes("피부 민감");
  const { highPollen, badDust, hasStrongWind, avgHumidity } = deriveSignals(weather);

  const checklist: CheckItem[] = [];
  const envReasons: string[] = [];
  const itemRecommends: string[] = [];

  // 기온 기반 옷차림
  if (weather.temp < 10) {
    checklist.push({ icon: "🧥", text: "두꺼운 외투", key: "외투" });
    envReasons.push("__기온이 낮음__");
    itemRecommends.push("**외투**");
  } else if (weather.temp < 17) {
    checklist.push({ icon: "👕", text: "긴팔 + 얇은 가디건", key: "가디건" });
    envReasons.push("__쌀쌀한 날씨__");
    itemRecommends.push("**가디건**");
  }

  // 바람
  if (hasStrongWind) {
    checklist.push({ icon: "🧣", text: "목수건 (오후 바람 강함)", key: "목수건" });
    envReasons.push("__바람 강함__");
    itemRecommends.push("**목수건**");
  }

  // 꽃가루 + 미세먼지 → 마스크
  if (highPollen || badDust) {
    const reason = highPollen ? "꽃가루 높음" : "미세먼지 나쁨";
    const text = hasRhinitis
      ? `마스크 필수 (비염 + ${reason})`
      : `마스크 (${reason})`;
    checklist.push({ icon: "😷", text, key: "마스크" });
    if (highPollen) envReasons.push("__꽃가루 높음__");
    if (badDust) envReasons.push("__미세먼지 나쁨__");
    itemRecommends.push("**마스크**");
  }

  // 건조 (평균 습도 < 45)
  if (avgHumidity < 45 || hasSensitiveSkin) {
    checklist.push({ icon: "💧", text: "보습제 (건조 주의)", key: "보습제" });
    if (avgHumidity < 45) envReasons.push("__건조함__");
    itemRecommends.push("**보습제**");
  }

  // 메시지 조합
  const conditionNote = hasRhinitis ? " 비염이 있으니" : "";
  const envPart = envReasons.slice(0, 2).join("이고 오후엔 ");
  const itemPart = itemRecommends.slice(0, 2).join("와 ");
  const message =
    `${withDativeParticle(profile.name)} 오늘 ${envPart}이에요.${conditionNote} ${itemPart}을 꼭 챙겨주세요.` +
    (itemRecommends.length > 2 ? ` ${itemRecommends[2]}도 챙겨주세요.` : "");

  const badges = buildBadges(weather);

  return { checklist, message, badges };
}

// 종합솔루션(CharacterReport) 콜아웃 판정. 표시는 컴포넌트가, 판정은 여기서만 한다 —
// "오늘 챙길 것" 체크리스트와 같은 deriveSignals를 쓰므로 두 UI의 결론이 갈라지지 않는다.
export function buildZoneCallouts(weather: WeatherData, conditions: string[]): ZoneCallout[] {
  const hasRhinitis = conditions.includes("비염");
  const hasSensitiveSkin = conditions.includes("피부 민감");
  const { highPollen, badDust, hasStrongWind, avgHumidity, tempRange } = deriveSignals(weather);

  const head: ZoneCallout =
    highPollen || badDust
      ? {
          id: "head",
          zone: "head",
          title: highPollen ? "꽃가루 높음" : "미세먼지 나쁨",
          desc: hasRhinitis ? "마스크 필수 챙기기" : "마스크 챙기기",
          emoji: "😷",
          tone: "warn",
        }
      : { id: "head", zone: "head", title: "공기 양호", desc: "마스크 없이 괜찮아요", emoji: "🌤️", tone: "ok" };

  const neck: ZoneCallout = hasStrongWind
    ? { id: "neck", zone: "neck", title: "오후 바람 강함", desc: "목수건 챙기기", emoji: "🧣", tone: "warn" }
    : { id: "neck", zone: "neck", title: "바람 약함", desc: "목수건 없이 괜찮아요", emoji: "🍃", tone: "ok" };

  const skin: ZoneCallout =
    avgHumidity < 45 || hasSensitiveSkin
      ? { id: "skin", zone: "skin", title: "건조함 주의", desc: "보습제 발라주기", emoji: "💧", tone: "warn" }
      : { id: "skin", zone: "skin", title: "습도 적정", desc: "평소처럼 관리해주세요", emoji: "✨", tone: "ok" };

  const outfit: ZoneCallout =
    tempRange >= 8
      ? { id: "outfit", zone: "outfit", title: "일교차 큼", desc: "얇은 가디건", emoji: "🧥", tone: "warn" }
      : weather.temp < 10
        ? { id: "outfit", zone: "outfit", title: "쌀쌀한 날씨", desc: "두꺼운 외투", emoji: "🧥", tone: "warn" }
        : { id: "outfit", zone: "outfit", title: "일교차 적음", desc: "평소 옷차림 괜찮아요", emoji: "👕", tone: "ok" };

  return [head, neck, skin, outfit];
}

function buildBadges(weather: WeatherData): Badge[] {
  const dustWarn = weather.dustLevel === "나쁨" || weather.dustLevel === "매우나쁨";
  const pollenWarn = weather.pollenLevel === "높음" || weather.pollenLevel === "매우높음";
  const uvWarn = weather.uvIndex >= 6;
  const humidityWarn = weather.humidity < 40;
  const windWarn = weather.windSpeed === "강함";

  return [
    { label: "미세먼지", value: weather.dustLevel, tone: dustWarn ? "warn" : "ok" },
    { label: "꽃가루", value: weather.pollenLevel, tone: pollenWarn ? "warn" : "ok" },
    { label: "자외선", value: uvWarn ? "강함" : "보통", tone: uvWarn ? "warn" : "ok" },
    { label: "습도", value: humidityWarn ? "낮음" : "적정", tone: humidityWarn ? "warn" : "ok" },
    { label: "바람", value: weather.windSpeed, tone: windWarn ? "warn" : "ok" },
  ];
}
