// 내일 아침 준비 미리보기 — "오늘을 닫으면, 내일 아침이 준비된다"의 실물.
//
// 왜 존재하나 (docs/01-plan/features/preemptive-briefing-paywall.plan.md):
//   맘테스트 워크어라운드 1위가 "전날 확인"(41.7%)이고 설문 기능 수요 2위가 "전날 밤
//   알림"(64.7%) — 부모의 저녁 Job은 회고가 아니라 **내일 준비**다. 이 카드는 그 수동
//   노동을 대체한다: 내일 예보 × 일과 × 체질로 준비물을 저녁에 미리 완성한다.
//
// 오늘 결과의 **실반영**: 내일 준비물은 규칙 엔진(lib/prep)이 만들므로, 오늘의 결과
// 라벨(더워했다/추워했다)로 우선순위를 실제로 바꿀 수 있다 — 리포트 프롬프트 연동(P1)
// 없이도 "오늘 결과를 반영했어요"를 정직하게 말할 수 있는 첫 표면이다. 반영은
// 안전 우선순위를 지킨다: 규칙이 낸 준비물을 빼지 않고 **순서와 추가만** 조정한다.

import type { HomeTimeSlot } from "@/lib/timeline";
import { buildPrepKeywords } from "@/lib/prep";
import { canonicalPrepList } from "@/lib/prep-vocab";
import type { DayReviewEntry } from "./day-review";

export type TomorrowBrief = {
  /** 대표 슬롯 라벨 ("등원") + 시작 시각 */
  slotLabel: string;
  hour: string;
  temp: number;
  feels: number;
  /** 강수 신호 (형태 있음 또는 확률 60%↑) */
  rain: boolean;
  pop: number | null;
  /** 준비물 (표준명, 조정 반영 후) */
  preps: string[];
  /** 오늘 결과로 조정된 항목 — 있으면 화면이 "오늘 결과 반영" 근거를 붙인다 */
  adjusted: { name: string; reason: string } | null;
};

const label = (s: string) => s.replace(/시간$/, "");

/**
 * 내일 타임라인의 대표 슬롯(첫 슬롯 = 아침 등원)으로 준비 브리핑을 만든다.
 * 예보가 없으면 null — 화면은 카드를 그리지 않는다(없는 예보를 지어내지 않는다).
 */
export const buildTomorrowBrief = (
  slots: HomeTimeSlot[] | null,
  conditions: string[] = [],
  todayEntry: DayReviewEntry | null = null
): TomorrowBrief | null => {
  const slot = slots?.[0];
  if (!slot) return null;

  let preps = canonicalPrepList(buildPrepKeywords(slot, null, conditions, true));

  // 오늘 결과 실반영 — 체감 라벨에 따라 여벌·겉옷의 우선순위를 조정한다.
  // 빼는 조정은 하지 않는다(안전 규칙·당일 환경이 낸 준비물은 그대로) — 순서와 추가만.
  let adjusted: TomorrowBrief["adjusted"] = null;
  const thermal = todayEntry?.thermalOutcome;
  if (thermal === "too_warm") {
    const name = "여벌 상의";
    preps = [name, ...preps.filter((p) => p !== name)];
    adjusted = { name, reason: "오늘 더워했다는 결과를 반영해 맨 앞에 올렸어요" };
  } else if (thermal === "too_cold") {
    const name = "얇은 겉옷";
    preps = [name, ...preps.filter((p) => p !== name)];
    adjusted = { name, reason: "오늘 추워했다는 결과를 반영해 맨 앞에 올렸어요" };
  }

  return {
    slotLabel: label(slot.time),
    hour: slot.hour,
    temp: slot.temp,
    feels: slot.feels,
    rain: (slot.pty != null && slot.pty > 0) || (slot.pop != null && slot.pop >= 60),
    pop: slot.pop,
    preps: preps.slice(0, 4),
    adjusted,
  };
};
