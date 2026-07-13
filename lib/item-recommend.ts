import type { ItemArt } from "@/components/ItemIllustration";

/**
 * 홈 "오늘의 추천 아이템" 규칙 엔진.
 *
 * 원칙: 아이템은 독립 추천이 아니라 홈 상단 신호의 파생이다.
 * 오늘의 체크리스트(AI 리포트 or 규칙 엔진) > 시간대별 준비물 키워드 > 아이 체질
 * 순으로 매칭해, 위 섹션과 결론이 어긋나는 아이템이 나오지 않게 한다.
 * (예: 체크리스트가 마스크를 말하는데 아이템이 선크림만 보여주는 상황 방지)
 */

export interface RecommendedItem {
  art: ItemArt;
  name: string;
  price: string;
  /** 카드에 표시할 추천 근거 한 줄 */
  reason: string;
}

type CatalogEntry = {
  art: ItemArt;
  name: string;
  price: string;
  /** 체크리스트 문구·준비물 키워드와 매칭할 패턴 */
  match: RegExp;
  /** 체크리스트에 구체적 근거가 없을 때 쓰는 아이템 고유 목적 (짧게) */
  note: string;
};

// 가격은 커머스 미연동 프로토타입용 고정값 (링크 연결은 추후)
const CATALOG: CatalogEntry[] = [
  { art: "mask", name: "키즈 KF94 마스크", price: "12,500원", match: /마스크/, note: "호흡기 보호" },
  { art: "umbrella", name: "키즈 경량 우산", price: "13,900원", match: /우산|비옷|☂|☔/, note: "비 대비" },
  { art: "sunscreen", name: "유아 자외선차단제", price: "16,900원", match: /선크림|차단제|자외선/, note: "자외선 차단" },
  { art: "cardigan", name: "얇은 가디건", price: "29,900원", match: /가디건|긴팔|겉옷|외투|바람막이|여벌/, note: "일교차 대비" },
  { art: "muffler", name: "유아 면 목수건", price: "9,900원", match: /목수건|목도리|방한/, note: "목 보온" },
  { art: "cap", name: "챙 넓은 키즈 모자", price: "15,900원", match: /모자|🧢|👒/, note: "햇빛 차단" },
  { art: "bottle", name: "어린이 보온 물병", price: "21,900원", match: /물병|물통/, note: "수분 보충" },
  { art: "lotion", name: "민감 피부 보습로션", price: "18,000원", match: /보습|로션|건조/, note: "피부 보습" },
];

// 노출 개수: 상위 신호 매칭분 우선, 부족하면 카탈로그로 채워 6개 내외 유지
const MAX_ITEMS = 6;

// 체크리스트 문구의 괄호 안 맥락을 근거로 추출 (예: "우산 (소나기 확률 60%)" → "소나기 확률 60%")
const contextOf = (text: string): string | null => {
  const m = text.match(/[(（]([^)）]+)[)）]/);
  return m ? m[1].trim() : null;
};

// 체질 문자열 매칭 (온보딩 신규 문구·구형 데모 프로필 모두 대응 — lib/prep.ts와 동일 기준)
const RESP = /호흡기|비염|천식|기관지|알레르기/;
const SKIN = /피부|아토피|건조/;

type Scored = { entry: CatalogEntry; priority: number; reason: string };

export function buildItemRecommendations(params: {
  /** "😷 마스크 필수 (비염 + 꽃가루 높음)" 형태의 체크리스트 문구들 */
  checklist: string[];
  /** 시간대(등원시간 등) → 준비물 키워드 목록 */
  prepBySlot: Record<string, string[]>;
  conditions?: string[];
}): RecommendedItem[] {
  const { checklist, prepBySlot, conditions = [] } = params;
  const scored = new Map<ItemArt, Scored>();
  const add = (entry: CatalogEntry, priority: number, reason: string) => {
    const prev = scored.get(entry.art);
    if (!prev || priority > prev.priority) scored.set(entry.art, { entry, priority, reason });
  };

  // 1순위: 오늘의 체크리스트 — 홈 최상단 결론과 직결.
  // 근거는 체크리스트에 담긴 실제 맥락(괄호 안)을 그대로, 없으면 아이템 고유 목적.
  for (const text of checklist) {
    for (const entry of CATALOG) {
      if (entry.match.test(text)) add(entry, 300, contextOf(text) ?? entry.note);
    }
  }

  // 2순위: 시간대별 준비물 키워드 — 언제·왜 필요한지 함께 표시
  for (const [slot, keywords] of Object.entries(prepBySlot)) {
    const when = slot.replace(/시간$/, ""); // "하원시간" → "하원"
    for (const keyword of keywords) {
      for (const entry of CATALOG) {
        if (entry.match.test(keyword)) add(entry, 200, `${when} · ${entry.note}`);
      }
    }
  }

  // 3순위: 아이 체질 상비템 — 매칭이 적어도 섹션이 비지 않게
  const hasResp = conditions.some((c) => RESP.test(c));
  const hasSkin = conditions.some((c) => SKIN.test(c));
  if (hasResp) add(CATALOG.find((e) => e.art === "mask")!, 100, "호흡기 상비템");
  if (hasSkin) add(CATALOG.find((e) => e.art === "lotion")!, 100, "피부 보습 상비템");

  const picked = [...scored.values()]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_ITEMS);

  // 부족하면 카탈로그 잔여로 채워 6개 내외 유지 (근거는 아이템 고유 목적)
  for (const entry of CATALOG) {
    if (picked.length >= MAX_ITEMS) break;
    if (!picked.some((s) => s.entry.art === entry.art)) {
      picked.push({ entry, priority: 0, reason: entry.note });
    }
  }

  return picked.map(({ entry, reason }) => ({
    art: entry.art,
    name: entry.name,
    price: entry.price,
    reason,
  }));
}
