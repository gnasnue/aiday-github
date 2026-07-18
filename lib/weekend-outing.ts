// 주말 나들이 판단 — "이번 주말 이 날씨엔 실내가 나을까 실외가 나을까"
//
// AiDay 코어(환경 데이터를 아이 체질로 해석해 판단 지원)의 연장. 장소 "검색"이 아니라
// 날씨 × 체질로 거른 소수 큐레이션 + 실내/실외 판단만 준다.
//
// 데이터 한계(의도적):
//  - 주말이 미래일이라 미세먼지·자외선·꽃가루 예보가 없다 → 판단은 강수확률·기온·하늘상태 기반.
//  - 장소는 손 큐레이션한 서울 시드(광고 아님). 서울 외 지역은 장소를 숨기고 판단만 노출한다.
//  - 임계값은 홈 케어플랜 우산 기준과 정합: 강수확률 ≥60%(또는 강수 아이콘) → 실내 권장.

import { hasRespiratory, hasAllergy, hasSkin } from "@/lib/domain/child-conditions";

export type WeekendVerdict = "indoor" | "outdoor" | "caution";

export interface WeekendJudgment {
  day: string; // 요일 라벨 (예: "토", "일")
  date: string; // 월/일 (예: "7/19")
  verdict: WeekendVerdict;
  rain: number; // 강수확률 %
  high: number | null;
  low: number | null;
  reason: string; // 판단 근거 한 줄
}

export interface OutingPlace {
  name: string;
  area: string; // 자치구 등 대략 위치
  note: string; // 왜 이 조건에 좋은지 한 줄
  kind: "indoor" | "outdoor";
}

// 주간 API가 내려주는 하루치 값의 최소 형태 (env WeekDay와 호환)
export interface WeekendDaySource {
  day: string;
  date: string;
  icon: string; // 이모지 코드 (🌧️ 🌨️ 🌦️ 등 강수 계열 포함)
  high: number | null;
  low: number | null;
  rain: number; // 강수확률 %
  weekend: boolean;
}

const PRECIP_ICONS = new Set(["🌧️", "🌨️", "🌦️"]);

/**
 * 하루치 주말 날씨 → 실내/실외 판단.
 * - 강수 아이콘 또는 강수확률 ≥60% → indoor (비 피하기, 홈 우산 기준과 동일)
 * - 강수확률 40~50% 또는 기온 극단(≤2° / ≥33°) → caution (실외 가능하나 대비)
 * - 그 외 → outdoor
 */
export function judgeWeekendDay(d: WeekendDaySource): WeekendJudgment {
  const precip = PRECIP_ICONS.has(d.icon);
  const hot = d.high != null && d.high >= 33;
  const cold = d.low != null && d.low <= 2;

  let verdict: WeekendVerdict;
  let reason: string;

  if (precip || d.rain >= 60) {
    verdict = "indoor";
    reason = precip ? "비 소식이 있어 실내가 편해요" : `강수확률 ${d.rain}%로 실내를 권해요`;
  } else if (d.rain >= 40) {
    verdict = "caution";
    reason = `강수확률 ${d.rain}% — 실외도 가능하지만 우산·대안을 챙기세요`;
  } else if (hot) {
    verdict = "caution";
    reason = `한낮 ${d.high}°로 더워요 — 그늘·물놀이 위주 실외나 실내가 좋아요`;
  } else if (cold) {
    verdict = "caution";
    reason = `아침 ${d.low}°로 추워요 — 짧게 실외 또는 실내가 좋아요`;
  } else {
    verdict = "outdoor";
    reason = "나들이하기 무난한 날씨예요";
  }

  return { day: d.day, date: d.date, verdict, rain: d.rain, high: d.high, low: d.low, reason };
}

// 서울 큐레이션 시드 — 잘 알려진 공공·기관 위주(대가성 후기·광고 아님). 총 6곳.
const SEOUL_SEED: OutingPlace[] = [
  { name: "국립중앙박물관 어린이박물관", area: "용산구", note: "체험형 전시, 비와도 하루 놀기 좋아요", kind: "indoor" },
  { name: "서울상상나라", area: "광진구", note: "영유아 체험 놀이터, 실내라 날씨 무관", kind: "indoor" },
  { name: "국립어린이과학관", area: "종로구", note: "만지며 노는 과학 전시, 실내 쾌적", kind: "indoor" },
  { name: "서울숲", area: "성동구", note: "넓은 잔디·사슴방사장, 맑은 날 뛰놀기 좋아요", kind: "outdoor" },
  { name: "어린이대공원", area: "광진구", note: "동물원·놀이동산 무료, 유아 동반 편해요", kind: "outdoor" },
  { name: "북서울꿈의숲", area: "강북구", note: "잔디언덕·전망대, 한적하게 산책하기 좋아요", kind: "outdoor" },
];

/**
 * 판단에 맞는 장소 2~3개 선택. verdict가 caution이면 실내·실외를 섞어 대안 폭을 준다.
 * region이 서울이 아니면 시드가 없으므로 빈 배열(호출부에서 장소 섹션을 숨긴다).
 */
export function pickOutingPlaces(
  verdict: WeekendVerdict,
  region: string,
  limit = 3
): OutingPlace[] {
  if (region !== "서울") return [];
  if (verdict === "indoor") return SEOUL_SEED.filter((p) => p.kind === "indoor").slice(0, limit);
  if (verdict === "outdoor") return SEOUL_SEED.filter((p) => p.kind === "outdoor").slice(0, limit);
  // caution: 실내 1~2 + 실외 1 섞기
  const indoor = SEOUL_SEED.filter((p) => p.kind === "indoor").slice(0, 2);
  const outdoor = SEOUL_SEED.filter((p) => p.kind === "outdoor").slice(0, 1);
  return [...indoor, ...outdoor].slice(0, limit);
}

/**
 * 아이 체질 기반 한 줄(있을 때만). 없으면 null → 호출부에서 줄을 생략(값 지어내지 않음).
 */
export function weekendConstitutionNote(
  verdict: WeekendVerdict,
  conditions: string[] | undefined
): string | null {
  if (!conditions || conditions.length === 0) return null;
  // 공용 판정 헬퍼 사용 — 온보딩 신규 라벨과 구형 짧은 문자열("비염"·"아토피")을 모두 매칭
  const resp = hasRespiratory(conditions);
  const allergy = hasAllergy(conditions);
  const skin = hasSkin(conditions);

  if ((verdict === "indoor" || verdict === "caution") && (resp || allergy)) {
    return "호흡기·알레르기가 민감한 아이라 비 오는 날 실내가 더 안심돼요";
  }
  if (verdict === "outdoor" && (resp || allergy)) {
    return "야외에선 꽃가루·미세먼지가 오를 수 있으니 상태를 보고 나가세요";
  }
  if (verdict === "outdoor" && skin) {
    return "피부가 민감한 아이라 나가기 전 보습·자외선 차단을 챙기세요";
  }
  return null;
}

// 지도 검색 링크 (네이버 지도 웹 검색 — 외부 앱/사이트로 위임, 앱 내 커머스 아님)
export function mapSearchUrl(placeName: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(placeName)}`;
}
