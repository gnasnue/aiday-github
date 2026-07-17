import type { HomeTimeSlot } from "./timeline";
import {
  hasRespiratory,
  hasAllergy as hasAllergyCondition,
  hasSkin as hasSkinCondition,
  isSweatWeather,
} from "./domain/child-conditions";

/**
 * 시간대별 환경 카드 하단 "준비물 키워드" 규칙 엔진 (A/B 중 규칙 기반 변형).
 *
 * 원칙: "튀는" 환경(급변·극단 수치)이 있을 때만 키워드를 낸다.
 * 무난한 슬롯은 빈 배열 — 붙었을 때만 신호가 되도록 남발하지 않는다.
 * 아이 체질(온보딩 conditions)은 임계값·우선순위에 반영한다.
 */

type Candidate = { keyword: string; priority: number };

export function buildPrepKeywords(
  slot: HomeTimeSlot,
  prevSlot: HomeTimeSlot | null,
  conditions: string[] = [],
  // 대표 슬롯(하루 첫 슬롯) 여부. 체질 기반 "상시" 키워드(예: 아토피 보습제)는
  // 시간대와 무관한 상수 신호라 이 슬롯에서만 켜, 전 슬롯 반복 노출을 막는다.
  isPrimarySlot = false,
  // 땀·더위 체질(프로필 hot/sweat). "여벌 옷" 등 땀 대비 준비물의 임계값을 낮춘다.
  sweatProne = false
): string[] {
  const hasResp = hasRespiratory(conditions);
  const hasAllergy = hasAllergyCondition(conditions);
  const hasSkin = hasSkinCondition(conditions);

  const out: Candidate[] = [];

  // 강수: 노출 창(이 슬롯~다음 슬롯) 기준 2단계 판정.
  //  - 강수형태 예보 또는 창 max 확률 ≥60%: 확정 신호 (시간대 카드의 강수확률 warn 임계값 60과 동일)
  //  - 창 max 확률 40~50%: 예비 신호 — 낮은 우선순위라 더 급한 신호(폭염·미세먼지 등)가 있으면
  //    슬롯당 2개 경쟁에서 밀려나고, 한가한 슬롯에서만 노출된다.
  // 종전 "슬롯 정시값 ≥30%"는 여름 흐린 날 배경 수준(30%)에 전 슬롯 최우선 발화해 신호가 죽었고,
  // 정시값만 봐서 시점이 어긋난 소나기 예보(창 안 80%)는 놓치는 문제가 있었다.
  const windowPop = slot.popWindow ?? slot.pop;
  const windowRain = slot.rainWindow || (slot.pty != null && slot.pty > 0);
  if (windowRain || (windowPop != null && windowPop >= 60)) {
    out.push({ keyword: "우산", priority: 100 });
  } else if (windowPop != null && windowPop >= 40) {
    out.push({ keyword: "우산", priority: 55 });
  }

  // 폭염권 기온 — 모자는 햇빛 차단 목적이므로 자외선이 낮은 시간대(저녁 등)엔 제외
  if (slot.temp >= 31) {
    out.push({ keyword: "물병", priority: 90 });
    if (slot.uv !== "낮음") out.push({ keyword: "모자", priority: 60 });
  }
  // 한파권 기온
  if (slot.temp <= 0) {
    out.push({ keyword: "방한용품", priority: 90 });
  }

  // 땀 대비 여벌 옷 — 고온·고습이면 땀이 차 갈아입힐 옷이 필요하다.
  // 상단 AI 리포트가 "27도·습도 높음"에서 여벌 옷을 권하는 신호를 규칙으로 재현.
  // 임계값은 상단(buildRecommendation)과 공유하는 isSweatWeather에 단일화돼 있다.
  if (isSweatWeather(slot.temp, slot.humidity, sweatProne)) {
    out.push({ keyword: "여벌 옷", priority: 58 });
  }

  // 직전 슬롯 대비 기온 급변 (±5°C)
  if (prevSlot && Math.abs(slot.temp - prevSlot.temp) >= 5) {
    out.push({ keyword: "얇은 겉옷", priority: 80 });
  }

  // 미세먼지·꽃가루 → 마스크 (호흡기·알레르기 체질이면 우선순위 상향)
  const dustBad = slot.dust === "나쁨" || slot.dust === "매우나쁨";
  const pollenHigh = slot.pollen === "높음" || slot.pollen === "매우높음";
  if (dustBad || (pollenHigh && (hasResp || hasAllergy))) {
    out.push({ keyword: "마스크", priority: hasResp || hasAllergy ? 95 : 70 });
  } else if (pollenHigh) {
    out.push({ keyword: "마스크", priority: 55 });
  }

  // 자외선 (민감 피부면 우선순위 상향)
  if (slot.uv === "강함" || slot.uv === "매우강함") {
    out.push({ keyword: "선크림", priority: hasSkin ? 85 : 65 });
  }

  // 건조 → 보습제. 상단 체크리스트와 정합:
  //  - 습도 < 45%: 날씨 기반 신호(상단 건조 임계값과 동일; 종전 ≤40에서 완화). 해당 슬롯마다 노출.
  //  - 민감 피부(아토피 등): 체질 기반 상시 신호. 대표 슬롯에서만 노출해 반복을 막는다.
  const dry = slot.humidity > 0 && slot.humidity < 45;
  if (dry || (hasSkin && isPrimarySlot)) {
    out.push({ keyword: "보습제", priority: hasSkin ? 85 : 50 });
  }

  // 강풍
  if (slot.wind === "강함") {
    out.push({ keyword: "바람막이", priority: 45 });
  }

  // 중복 제거(높은 우선순위 유지) 후 상위 2개
  const seen = new Map<string, Candidate>();
  for (const c of out) {
    const prev = seen.get(c.keyword);
    if (!prev || c.priority > prev.priority) seen.set(c.keyword, c);
  }
  return [...seen.values()]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 2)
    .map((c) => c.keyword);
}
