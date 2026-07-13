import type { HomeTimeSlot } from "./timeline";

/**
 * 시간대별 환경 카드 하단 "준비물 키워드" 규칙 엔진 (A/B 중 규칙 기반 변형).
 *
 * 원칙: "튀는" 환경(급변·극단 수치)이 있을 때만 키워드를 낸다.
 * 무난한 슬롯은 빈 배열 — 붙었을 때만 신호가 되도록 남발하지 않는다.
 * 아이 체질(온보딩 conditions)은 임계값·우선순위에 반영한다.
 */

type Candidate = { keyword: string; priority: number };

// 온보딩 신규 문자열("호흡기 민감 (비염, 천식·기관지)")과
// 구형/데모 프로필의 짧은 문자열("비염", "아토피") 모두 매칭
const RESP = /호흡기|비염|천식|기관지/;
const ALLERGY = /알레르기/;
const SKIN = /피부|아토피|건조/;

export function buildPrepKeywords(
  slot: HomeTimeSlot,
  prevSlot: HomeTimeSlot | null,
  conditions: string[] = []
): string[] {
  const hasResp = conditions.some((c) => RESP.test(c));
  const hasAllergy = conditions.some((c) => ALLERGY.test(c));
  const hasSkin = conditions.some((c) => SKIN.test(c));

  const out: Candidate[] = [];

  // 강수: 실제 강수 형태가 있거나 확률 60% 이상
  if ((slot.pty != null && slot.pty > 0) || (slot.pop != null && slot.pop >= 60)) {
    out.push({ keyword: "우산", priority: 100 });
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

  // 건조 (민감 피부면 임계값 완화 + 우선순위 상향)
  const dryThreshold = hasSkin ? 50 : 40;
  if (slot.humidity > 0 && slot.humidity <= dryThreshold) {
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
