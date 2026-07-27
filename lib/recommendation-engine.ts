import type { ChildProfile } from "./profile";
import type { TimeSlot, WeatherData } from "./weather-api";
import { hasJongseong, withDativeParticle } from "./korean";
import {
  ageInMonths,
  canRecommendMask,
  hasRespiratory,
  hasSkin,
  isSweatProne,
  isSweatWeather,
} from "./domain/child-conditions";

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
// 강수 필드는 HomeTimeSlot에만 있고 mock TimeSlot엔 없어 선택 필드로 둔다 —
// 여벌의 이름을 젖는 원인별로 가르는 데만 쓰고, 없으면 땀 기준(상의)으로 판정한다.
type RecoSlot = Pick<TimeSlot, "wind" | "pollen" | "dust" | "humidity"> & {
  pty?: number | null;
  pop?: number | null;
  popWindow?: number | null;
  rainWindow?: boolean;
};

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

  // 꽃가루 + 미세먼지 → 마스크. 단, 만 2세(24개월) 미만 영아에게는 마스크를 권하지
  // 않는다(질식 위험) — AI 프롬프트·케어 플랜 칩(prep.ts)과 같은 canRecommendMask 기준.
  // 경고 자체가 사라지지 않도록 "실내 놀이 준비"로 대체한다.
  const maskOk = canRecommendMask(ageInMonths(profile.age, profile.birth));
  const highPollen = slots.some(
    (t) => t.pollen === "높음" || t.pollen === "매우높음"
  );
  const badDust = slots.some(
    (t) => t.dust === "나쁨" || t.dust === "매우나쁨"
  );
  if (highPollen || badDust) {
    const reason = highPollen ? "꽃가루 높음" : "미세먼지 나쁨";
    if (maskOk) {
      const text = hasRhinitis
        ? `마스크 필수 (호흡기 민감 + ${reason})`
        : `마스크 (${reason})`;
      checklist.push({ icon: "😷", text, key: "마스크" });
      itemRecommends.push("**마스크**");
    } else {
      checklist.push({
        icon: "🧸",
        text: `실내 놀이거리 (${reason} · 마스크가 어려운 나이)`,
        key: "실내놀이",
      });
      itemRecommends.push("**실내 놀이거리**");
    }
    if (highPollen) envReasons.push("__꽃가루 높음__");
    if (badDust) envReasons.push("__미세먼지 나쁨__");
  }

  // 건조 (평균 습도 < 45). 슬롯이 비면(이론상) 건조 미판정(50)으로 폴백.
  const avgHumidity = slots.length
    ? slots.reduce((s, t) => s + t.humidity, 0) / slots.length
    : 50;
  // 케어 플랜 칩(lib/prep.ts)과 같은 규칙을 쓴다 — 그쪽은 2026-07-20 실사용 지적("습도 60%
  // 넘는 여름날 보습제는 비논리")으로 습함 게이트를 넣었는데 이 폴백 경로만 빠져 있었다.
  // 그 결과 히어로가 "덥고 습함"이라 말하면서 같은 카드에서 "보습제 (건조 주의)"를 권하는
  // 자기모순이 났다(2026-07-27 실사용 제보 — 32°·습도 55%+, 피부 민감 아이).
  //  · 건조(평균 습도 < 45): 날씨 신호 → 사유도 "건조 주의"
  //  · 민감 피부: 체질 신호 → 습하지 않을 때만, 사유는 "피부 보습"(건조를 사실로 말하지 않는다)
  const isDry = avgHumidity < 45;
  const isHumid = avgHumidity >= 60;
  if (isDry || (hasSensitiveSkin && !isHumid)) {
    checklist.push({
      icon: "💧",
      text: isDry ? "보습제 (건조 주의)" : "보습제 (피부 보습)",
      key: "보습제",
    });
    if (isDry) envReasons.push("__건조함__");
    itemRecommends.push("**보습제**");
  }

  // 땀 대비 여벌 — 고온·고습이면 땀이 차 갈아입힐 옷이 필요.
  // 케어 플랜(buildPrepKeywords)과 같은 신호·임계값(땀·더위 체질이면 완화)을 써
  // 상단 체크리스트와 시간대 칩이 어긋나지 않게 한다.
  const sweatProne = isSweatProne(profile.hot, profile.sweat);
  if (isSweatWeather(weather.temp, weather.humidity, sweatProne)) {
    // 이름·사유는 케어 플랜 칩(lib/prep.ts)과 같은 기준으로 — 땀 체질 아이의 땀 체인이
    // 원인이고 비가 없을 때만 "여벌 상의", 그 외엔 "여벌 옷"(비면 하의·양말까지 젖는다).
    // 하루 중 한 슬롯이라도 비 확정 신호가 있으면 비로 본다.
    const rainToday = slots.some((t) => {
      const w = t.popWindow ?? t.pop;
      return t.rainWindow === true || (t.pty != null && t.pty > 0) || (w != null && w >= 60);
    });
    const topOnly = sweatProne && !rainToday;
    const label = topOnly ? "여벌 상의" : "여벌 옷";
    const reason = rainToday ? "비·땀 대비" : "땀 대비";
    checklist.push({ icon: "👕", text: `${label} (${reason})`, key: label });
    envReasons.push("__덥고 습함__");
    itemRecommends.push(`**${label}**`);
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
  // 발동한 환경 사유가 없으면 envPart가 빈 문자열이라 "오늘 이에요"로 깨진다(온화한 날,
  // 또는 더워도 습도가 땀 임계 미달인 날 실제 발생 — 2026-07-27). 무난한 날 문장으로
  // 분기하고, 체질만으로 잡힌 준비물(피부 민감 보습제 등)이 있으면 뒤에 잇는다.
  // 준비물조차 없으면 조사("를")만 남는 두 번째 깨짐이 있어 "평소대로"로 끝낸다.
  const head = envPart
    ? `${withDativeParticle(profile.name)} 오늘 ${envPart}이에요.`
    : `${withDativeParticle(profile.name)} 오늘 무난한 날이에요.`;
  const message = itemPart
    ? head +
      `${conditionNote} ${itemPart}${objParticle} 꼭 챙겨주세요.` +
      (itemRecommends.length > 2 ? ` ${itemRecommends[2]}도 챙겨주세요.` : "")
    : head + " 평소대로 준비하면 충분해요.";

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
