// 돌봄 카드 — Family Memory를 **앱 밖으로 내보내는** 한 장.
//
// 왜 만드나: 아이를 남에게 맡길 때마다 부모는 같은 설명을 반복한다("땀이 많아서 산책
// 뒤엔 갈아입혀 주세요", "피부가 예민해서…"). 맘테스트에서 이 노동은 행동으로 확인된다 —
// 배우자·가족과 역할 분담 25.0%, 실패 후속 노동 '기관에 추가 전달' 16.7%. PROBLEM-THESIS
// 1층("가족 운영의 기억·판단·조율이 한 사람에게 집중")이 가장 날것으로 드러나는 지점이다.
//
// 그래서 반응 지도를 화면 안에 두지 않고 **조부모·시터·어린이집에 건넬 수 있는 물건**으로
// 만든다. 대시보드는 우리(제품)의 진척을 보여주지만, 카드는 부모의 노동을 실제로 덜어낸다.
//
// 정직성 계약 (day-review와 동일 규칙):
//   - **근거 있는 항목만 싣는다.** 프로필 입력 = 부모가 알려준 것 / 기록 = 관찰 n건.
//     추정·진단·"학습했다"는 넣지 않는다.
//   - 관찰 항목에는 반드시 근거 수(n번 중 m번)를 함께 적는다 — 받는 사람이 신뢰도를
//     스스로 판단할 수 있어야 한다.
//   - 오늘 부탁은 오늘의 실행이 있을 때만. 없으면 그 줄을 만들지 않는다.

import type { ChildProfile } from "@/lib/profile";
import type { CarePlan } from "@/lib/care-plan";
import { hasAllergy, hasRespiratory, hasSkin, isSweatProne } from "@/lib/domain/child-conditions";
import { buildTraitMap, type DayReviewEntry } from "./day-review";

export type CareCardLine = {
  /** 항목 라벨 — "더운 날" */
  label: string;
  /** 돌봄자가 읽고 바로 행동할 수 있는 문장 */
  text: string;
  /** 이 줄의 출처 — 받는 사람이 신뢰도를 판단하는 근거 */
  source: "프로필" | "기록";
  /** 기록 출처일 때의 근거 ("비슷한 날 4번 중 3번") */
  evidence?: string;
};

export type CareCard = {
  childName: string;
  /** "만 4세" 등 — 없으면 생략 */
  ageLabel: string | null;
  dateLabel: string;
  /** 부모가 알려준 것 (프로필) */
  profileLines: CareCardLine[];
  /** 기록에서 확인된 것 (관찰) */
  observedLines: CareCardLine[];
  /** 오늘 부탁 — 오늘의 실행이 있을 때만 */
  todayRequest: string | null;
};

const dateLabel = (d = new Date()) =>
  `${d.getMonth() + 1}월 ${d.getDate()}일 (${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]})`;

/**
 * 돌봄 카드를 만든다. 프로필만 있어도 성립한다 — 첫날부터 건넬 수 있어야
 * "기록이 쌓여야 쓸모 있다"는 콜드 스타트를 만들지 않는다.
 */
export const buildCareCard = (input: {
  child: ChildProfile;
  entries: DayReviewEntry[];
  plan?: CarePlan | null;
  now?: Date;
}): CareCard => {
  const { child, entries, plan, now = new Date() } = input;
  const conditions = child.conditions ?? [];

  // ── 부모가 알려준 것 (프로필) — 돌봄자에게 필요한 것만 행동 문장으로 ──
  const profileLines: CareCardLine[] = [];
  if (isSweatProne(child.hot, child.sweat)) {
    profileLines.push({
      label: "땀",
      text: "땀이 많은 편이에요. 활동 뒤 옷이 젖었는지 한 번 봐주세요.",
      source: "프로필",
    });
  }
  if (hasSkin(conditions)) {
    profileLines.push({
      label: "피부",
      text: "피부가 예민해요. 젖은 옷이 오래 닿지 않게 해주세요.",
      source: "프로필",
    });
  }
  if (hasRespiratory(conditions) || hasAllergy(conditions)) {
    profileLines.push({
      label: "호흡기",
      text: "코·목이 예민한 편이에요. 야외활동 뒤 기침·콧물이 있으면 알려주세요.",
      source: "프로필",
    });
  }
  if (child.cold?.includes("많이")) {
    profileLines.push({ label: "추위", text: "추위를 잘 타요. 한 겹 더 챙겨주세요.", source: "프로필" });
  }

  // ── 기록에서 확인된 것 — buildTraitMap의 확정(confirmed) 항목만 ──
  // 관찰 중(watching)은 카드에 싣지 않는다. 남에게 건네는 문서라 확신의 문턱이 더 높다.
  const observedLines: CareCardLine[] = buildTraitMap(entries)
    .filter((t) => t.state === "confirmed")
    .map((t) => ({
      label: t.title.replace(/ 반응$/, ""),
      text: traitSentence(t.key, t.title),
      source: "기록" as const,
      evidence: t.desc,
    }));

  return {
    childName: child.name,
    ageLabel: child.age ?? null,
    dateLabel: dateLabel(now),
    profileLines,
    observedLines,
    todayRequest: plan?.handoff ?? null,
  };
};

/** 관찰 항목 → 돌봄자용 행동 문장 (진단·단정 없이) */
const traitSentence = (key: string, title: string): string => {
  switch (key) {
    case "heat":
      return "더운 날 활동 뒤 더워하는 편이에요. 젖은 옷은 갈아입혀 주세요.";
    case "cold":
      return "추운 날 추워하는 편이에요. 한 겹 더 챙겨주세요.";
    case "airway":
      return "야외활동 뒤 코·기침 반응이 있었어요. 돌아오면 세안을 도와주세요.";
    default:
      return `${title}이 도움이 됐어요.`;
  }
};

/** 카드에 실을 내용이 하나도 없으면 공유를 권하지 않는다 */
export const isCareCardEmpty = (card: CareCard): boolean =>
  card.profileLines.length === 0 && card.observedLines.length === 0 && !card.todayRequest;

/**
 * 이미지 공유가 막힌 환경(데스크톱·구형 브라우저)의 텍스트 폴백.
 * 카톡·문자에 붙여넣을 수 있는 형태로 만든다.
 */
export const careCardToText = (card: CareCard): string => {
  const lines = [`[${card.childName} 돌봄 카드] ${card.dateLabel}`];
  if (card.todayRequest) lines.push("", `오늘 부탁: ${card.todayRequest}`);
  if (card.profileLines.length) {
    lines.push("", "알아두면 좋은 것");
    card.profileLines.forEach((l) => lines.push(`· ${l.text}`));
  }
  if (card.observedLines.length) {
    lines.push("", "그동안의 기록에서");
    card.observedLines.forEach((l) => lines.push(`· ${l.text} (${l.evidence})`));
  }
  lines.push("", "AiDay에서 보냈어요 · 기록에 근거한 관찰이며 진단이 아니에요");
  return lines.join("\n");
};
