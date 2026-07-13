// 온보딩·프로필 편집 페이지가 공유하는 선택지 상수와 시간 옵션 생성기

export const conditions = [
  "호흡기 민감 (비염, 천식·기관지)",
  "알레르기 체질 (꽃가루·먼지)",
  "민감 피부 (아토피·건조·자외선)",
  "해당없음",
  "기타",
];

export const sensitivity = [
  { v: "very-much", l: "매우 많이 탐" },
  { v: "much", l: "조금 많이 탐" },
  { v: "normal", l: "보통" },
  { v: "less", l: "조금 덜 탐" },
  { v: "very-less", l: "매우 덜 탐" },
];

export const sweatLevels = [
  { v: "very-much", l: "매우 많음" },
  { v: "much", l: "조금 많음" },
  { v: "normal", l: "보통" },
  { v: "less", l: "적은 편" },
];

export const halfHour = (from: number, to: number) => {
  const out: string[] = [];
  for (let h = from; h <= to; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    if (h < to) out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
};

// 구형(데모·초기) 프로필은 민감도를 한국어 라벨로 저장했다 — 코드값으로 정규화
const legacySensitivity: Record<string, string> = {
  "추위를 많이 타요": "much",
  "더위를 많이 타요": "much",
  "보통이에요": "normal",
  "추위를 잘 안 타요": "less",
  "더위를 잘 안 타요": "less",
};
const legacySweat: Record<string, string> = {
  많아요: "much",
  보통이에요: "normal",
  적어요: "less",
};

export const normalizeSensitivity = (v?: string): string => {
  if (!v) return "";
  if (sensitivity.some((o) => o.v === v)) return v;
  return legacySensitivity[v] ?? "";
};

export const normalizeSweat = (v?: string): string => {
  if (!v) return "";
  if (sweatLevels.some((o) => o.v === v)) return v;
  return legacySweat[v] ?? "";
};

// 구형 프로필의 건강 정보는 "아토피"·"비염" 같은 단일 키워드로 저장돼 있다 —
// 현행 선택지로 매핑하고, 매핑 불가 항목은 etc로 분리해 '기타'로 흡수시킨다
const legacyConditionMap: Record<string, string> = {
  비염: "호흡기 민감 (비염, 천식·기관지)",
  천식: "호흡기 민감 (비염, 천식·기관지)",
  알레르기: "알레르기 체질 (꽃가루·먼지)",
  "꽃가루 알레르기": "알레르기 체질 (꽃가루·먼지)",
  아토피: "민감 피부 (아토피·건조·자외선)",
  "피부 민감": "민감 피부 (아토피·건조·자외선)",
  건조: "민감 피부 (아토피·건조·자외선)",
};

export const normalizeConditions = (
  list?: string[]
): { conds: string[]; etc: string[] } => {
  const conds: string[] = [];
  const etc: string[] = [];
  for (const c of (list ?? []).filter(Boolean)) {
    if (conditions.includes(c)) {
      if (!conds.includes(c)) conds.push(c);
      continue;
    }
    const mapped = legacyConditionMap[c];
    if (mapped) {
      if (!conds.includes(mapped)) conds.push(mapped);
    } else {
      etc.push(c);
    }
  }
  return { conds, etc };
};
