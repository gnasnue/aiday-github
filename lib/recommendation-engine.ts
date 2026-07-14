import type { ChildProfile } from "./profile";
import type { TimeSlot, WeatherData } from "./weather-api";
import { uvLevel } from "./timeline";
import { withDativeParticle } from "./korean";
import { hasRespiratory, hasSkin } from "./domain/child-conditions";

// 환경 신호 판정에 필요한 최소 슬롯 형태 — 홈의 실측 타임라인(HomeTimeSlot)도 만족
export type EnvSlot = Pick<TimeSlot, "dust" | "pollen" | "humidity" | "wind">;

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

export function buildRecommendation(
  profile: ChildProfile,
  weather: WeatherData,
  slots?: EnvSlot[]
): Recommendation {
  // 실측 타임라인이 있으면 그것으로 판정 — 없을 때만 weather.timeline(mock) 폴백
  const timeline: EnvSlot[] = slots?.length ? slots : weather.timeline;
  const conditions = profile.conditions ?? [];
  const hasRhinitis = hasRespiratory(conditions);
  const hasSensitiveSkin = hasSkin(conditions);

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
  const hasStrongWind = timeline.some((t) => t.wind === "강함");
  if (hasStrongWind) {
    checklist.push({ icon: "🧣", text: "목수건 (오후 바람 강함)", key: "목수건" });
    envReasons.push("__바람 강함__");
    itemRecommends.push("**목수건**");
  }

  // 꽃가루 + 미세먼지 → 마스크
  const highPollen = timeline.some(
    (t) => t.pollen === "높음" || t.pollen === "매우높음"
  );
  const badDust = timeline.some(
    (t) => t.dust === "나쁨" || t.dust === "매우나쁨"
  );
  if (highPollen || badDust) {
    const reason = highPollen ? "꽃가루 높음" : "미세먼지 나쁨";
    const text = hasRhinitis
      ? `마스크 필수 (호흡기 민감 + ${reason})`
      : `마스크 (${reason})`;
    checklist.push({ icon: "😷", text, key: "마스크" });
    if (highPollen) envReasons.push("__꽃가루 높음__");
    if (badDust) envReasons.push("__미세먼지 나쁨__");
    itemRecommends.push("**마스크**");
  }

  // 건조 (평균 습도 < 45)
  const avgHumidity =
    timeline.reduce((s, t) => s + t.humidity, 0) / timeline.length;
  if (avgHumidity < 45 || hasSensitiveSkin) {
    checklist.push({ icon: "💧", text: "보습제 (건조 주의)", key: "보습제" });
    if (avgHumidity < 45) envReasons.push("__건조함__");
    itemRecommends.push("**보습제**");
  }

  // 메시지 조합
  const conditionNote = hasRhinitis ? " 호흡기가 예민하니" : "";
  const envPart = envReasons.slice(0, 2).join("이고 오후엔 ");
  const itemPart = itemRecommends.slice(0, 2).join("와 ");
  const message =
    `${withDativeParticle(profile.name)} 오늘 ${envPart}이에요.${conditionNote} ${itemPart}을 꼭 챙겨주세요.` +
    (itemRecommends.length > 2 ? ` ${itemRecommends[2]}도 챙겨주세요.` : "");

  const badges = buildBadges(weather);

  return { checklist, message, badges };
}

function buildBadges(weather: WeatherData): Badge[] {
  const dustWarn = weather.dustLevel === "나쁨" || weather.dustLevel === "매우나쁨";
  const pollenWarn = weather.pollenLevel === "높음" || weather.pollenLevel === "매우높음";
  // 자외선: 시간대별 카드와 동일한 4단계 매핑·임계값 공유
  const uvValue = uvLevel(weather.uvIndex);
  const uvWarn = uvValue === "강함" || uvValue === "매우강함";
  const humidityWarn = weather.humidity < 40;
  const windWarn = weather.windSpeed === "강함";

  return [
    { label: "미세먼지", value: weather.dustLevel, tone: dustWarn ? "warn" : "ok" },
    { label: "꽃가루", value: weather.pollenLevel, tone: pollenWarn ? "warn" : "ok" },
    { label: "자외선", value: uvValue, tone: uvWarn ? "warn" : "ok" },
    { label: "습도", value: humidityWarn ? "낮음" : "적정", tone: humidityWarn ? "warn" : "ok" },
    { label: "바람", value: weather.windSpeed, tone: windWarn ? "warn" : "ok" },
  ];
}
