// 아이 체질·질환 판정과 민감도 코드→한국어 변환의 단일 소스.
//
// 온보딩 신규 라벨("호흡기 민감 (비염, 천식·기관지)")과 구형/데모 프로필의 짧은
// 문자열("비염", "아토피")을 모두 매칭한다. 종전에는 이 정규식이 lib/prep.ts와
// lib/item-recommend.ts에 중복돼 있었고, recommendation-engine·CharacterReport·
// outfit은 `includes("비염")`처럼 온보딩 라벨과 어긋나는 검사를 써서 실사용자에게
// 질환 가중이 발동하지 않았다(버그 A). 여기로 통합해 모든 소비자가 같은 기준을 쓴다.

const RESP = /호흡기|비염|천식|기관지/;
const ALLERGY = /알레르기/;
const SKIN = /피부|아토피|건조/;

export const hasRespiratory = (conditions: string[] = []): boolean =>
  conditions.some((c) => RESP.test(c));
export const hasAllergy = (conditions: string[] = []): boolean =>
  conditions.some((c) => ALLERGY.test(c));
export const hasSkin = (conditions: string[] = []): boolean =>
  conditions.some((c) => SKIN.test(c));

// 나이(개월) 판정 — birth(연·월)가 있으면 정확히, 없으면 age 문자열("만 4세"·"16개월")
// 파싱으로 폴백. 생월 미상은 연말 출생으로 간주해 나이를 낮게 잡는다(케어 가이드는
// 낮게 잡는 쪽이 안전 — calcAge와 동일 원칙). 판정 불가 시 null.
// now 주입은 테스트용.
export const ageInMonths = (
  age?: string,
  birth?: { year?: string; month?: string },
  now: Date = new Date()
): number | null => {
  if (birth?.year) {
    const y = parseInt(birth.year, 10);
    if (!Number.isNaN(y)) {
      const m = birth.month ? parseInt(birth.month, 10) : NaN;
      const bm = Number.isNaN(m) ? 12 : m;
      return Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - bm));
    }
  }
  const mm = age?.match(/(\d+)\s*개월/);
  if (mm) return parseInt(mm[1], 10);
  const ym = age?.match(/(\d+)\s*(?:세|살)/);
  if (ym) return parseInt(ym[1], 10) * 12;
  return null;
};

// 마스크 권장 가능 연령 — 만 2세(24개월) 미만 영아에게는 질식 위험으로 마스크를
// 권하지 않는다(대신 외출 자제·실내 대체). AI 프롬프트(lib/prompts/report.ts)의
// 동일 규칙과 삼중 정렬: AI·규칙 체크리스트(recommendation-engine)·케어 플랜 칩(prep)이
// 모두 이 함수를 기준으로 한다. 나이 판정 불가(null)면 기존 동작 유지(권장 허용).
export const canRecommendMask = (months: number | null): boolean =>
  months == null || months >= 24;

// 땀·더위 체질 판정 — "땀 대비 여벌 옷" 같은 준비물의 임계값 완화에 쓴다.
// 온보딩 코드(much/very-much)와 구형 한국어 라벨("많이 타요"·"많아요")을 모두 인식.
export const isSweatProne = (hot?: string, sweat?: string): boolean => {
  const prone = (v?: string) =>
    !!v && (v === "much" || v === "very-much" || v.includes("많"));
  return prone(hot) || prone(sweat);
};

// 땀이 차는 날씨 판정 — 고온·고습(땀·더위 체질이면 임계값 완화).
// "여벌 옷" 준비물의 단일 기준. prep.ts(케어 플랜)·recommendation-engine.ts(상단
// 체크리스트)가 이 함수를 공유해, 임계값이 두 곳에 중복돼 드리프트하는 것을 막는다.
export const isSweatWeather = (
  temp: number,
  humidity: number,
  sweatProne: boolean
): boolean => temp >= (sweatProne ? 26 : 28) && humidity >= (sweatProne ? 60 : 70);

// 민감도/땀 코드 → 한국어 문구. 실사용자는 온보딩에서 코드("normal", "much"…)를
// 저장하지만, 데모/구형 프로필은 한국어 문장("보통이에요")을 저장하므로 매핑 실패 시
// 원문을 그대로 통과시켜 리포트 퇴행을 막는다(버그 B).
const SENSITIVITY_PHRASE: Record<string, string> = {
  "very-much": "매우 많이 탐",
  much: "조금 많이 탐",
  normal: "보통",
  less: "조금 덜 탐",
  "very-less": "매우 덜 탐",
};

const SWEAT_PHRASE: Record<string, string> = {
  "very-much": "매우 많음",
  much: "조금 많음",
  normal: "보통",
  less: "적은 편",
};

export const sensitivityPhrase = (value?: string): string | undefined =>
  value ? SENSITIVITY_PHRASE[value] ?? value : undefined;

export const sweatPhrase = (value?: string): string | undefined =>
  value ? SWEAT_PHRASE[value] ?? value : undefined;
