import type { ChildProfile } from "./profile";
import type { TimeSlot, WeatherData } from "./weather-api";
import { hasJongseong, withDativeParticle } from "./korean";
import { hasRespiratory, hasSkin, isSweatProne } from "./domain/child-conditions";

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

// 규칙 기반 추천의 시간대 판정에 필요한 필드만 추린 최소 형태.
// 홈의 실측 슬롯(HomeTimeSlot)과 mock(TimeSlot) 양쪽을 모두 받기 위한 구조적 타입.
type RecoSlot = Pick<TimeSlot, "wind" | "pollen" | "dust" | "humidity">;

// slots: 체크리스트·메시지의 근거가 되는 시간대 데이터. 홈은 실측 슬롯을 넘겨
// 상단 칩(실측)과 어긋나지 않게 한다. 미지정 시 weather.timeline(mock 포함)으로 폴백.
export function buildRecommendation(
  profile: ChildProfile,
  weather: WeatherData,
  slots: ReadonlyArray<RecoSlot> = weather.timeline
): Recommendation {
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
  const hasStrongWind = slots.some((t) => t.wind === "강함");
  if (hasStrongWind) {
    checklist.push({ icon: "🧣", text: "목수건 (오후 바람 강함)", key: "목수건" });
    envReasons.push("__바람 강함__");
    itemRecommends.push("**목수건**");
  }

  // 꽃가루 + 미세먼지 → 마스크
  const highPollen = slots.some(
    (t) => t.pollen === "높음" || t.pollen === "매우높음"
  );
  const badDust = slots.some(
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

  // 건조 (평균 습도 < 45). 슬롯이 비면(이론상) 건조 미판정(50)으로 폴백.
  const avgHumidity = slots.length
    ? slots.reduce((s, t) => s + t.humidity, 0) / slots.length
    : 50;
  if (avgHumidity < 45 || hasSensitiveSkin) {
    checklist.push({ icon: "💧", text: "보습제 (건조 주의)", key: "보습제" });
    if (avgHumidity < 45) envReasons.push("__건조함__");
    itemRecommends.push("**보습제**");
  }

  // 땀 대비 여벌 옷 — 고온·고습이면 땀이 차 갈아입힐 옷이 필요.
  // 케어 플랜(buildPrepKeywords)과 같은 신호·임계값(땀·더위 체질이면 완화)을 써
  // 상단 체크리스트와 시간대 칩이 어긋나지 않게 한다.
  const sweatProne = isSweatProne(profile.hot, profile.sweat);
  if (weather.temp >= (sweatProne ? 26 : 28) && weather.humidity >= (sweatProne ? 60 : 70)) {
    checklist.push({ icon: "👕", text: "여벌 옷 (땀 대비)", key: "여벌옷" });
    envReasons.push("__덥고 습함__");
    itemRecommends.push("**여벌 옷**");
  }

  // 메시지 조합
  const conditionNote = hasRhinitis ? " 호흡기가 예민하니" : "";
  const envPart = envReasons.slice(0, 2).join("이고 오후엔 ");
  // 준비물명은 **마크다운**으로 감싸져 있어, 받침 판정 시 별표를 제거하고 마지막 한글로 본다.
  const core = (w: string) => w.replace(/\*/g, "");
  const items = itemRecommends.slice(0, 2);
  const itemPart =
    items.length === 2
      ? `${items[0]}${hasJongseong(core(items[0])) ? "과" : "와"} ${items[1]}`
      : items[0] ?? "";
  const lastItem = items[items.length - 1] ?? "";
  const objParticle = hasJongseong(core(lastItem)) ? "을" : "를";
  const message =
    `${withDativeParticle(profile.name)} 오늘 ${envPart}이에요.${conditionNote} ${itemPart}${objParticle} 꼭 챙겨주세요.` +
    (itemRecommends.length > 2 ? ` ${itemRecommends[2]}도 챙겨주세요.` : "");

  const badges = buildBadges(weather);

  return { checklist, message, badges };
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
