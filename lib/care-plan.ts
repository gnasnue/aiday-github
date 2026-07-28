// 오늘 부탁 — 돌봄자에게 넘길 한 문장을 만드는 엔진.
//
// 무엇을 만드나: 오늘 하루의 시간대 슬롯을 **전이(transition)** 로 보고, 활동 뒤에 오는
// 시점에서 실패가 생길 조건을 찾아 **문장 하나**로 낸다. 준비물 나열이 아니라
// "언제 · 누가 · 무엇을"이 든 문장이다.
//
// **소비처는 돌봄 카드의 '오늘 부탁'(`handoff`) 하나다** (2026-07-29 축소).
// 종전에는 이 결과가 하루 탭의 '오늘의 실행' L2 카드로 펼쳐졌지만(action·evidence·prep),
// 계측에서 평년 날씨 발동률이 11%(36케이스 중 4)였고 이 카드의 근거였던 문제정의 §8-2의
// 대표 실패일조차 발동하지 않았다 — 아래 "알려진 한계"의 슬롯 쌍 문제 때문이다. 판단을
// 화면에 펼치는 역할은 홈 히어로가 이미 하고 있어, 여기서는 **다른 어디에도 없는 기능**인
// 전달 문구만 남겼다. `action`·`evidence`·`prep`은 현재 화면에 렌더되지 않는다(핸드오프
// 문장 조립의 중간 산물이며, 카드를 다시 세울 때 쓸 수 있게 유지한다).
//
// 알려진 한계 (되살릴 때 먼저 고칠 것):
//   원인·결과 슬롯을 "야외활동 → **바로 다음 슬롯**"으로 고정하는데, 표준 일과에서 그 구간은
//   11시→15시로 하루의 **승온** 구간이다(서울 평년 전 월에서 −2~−3°). 그래서 규칙 ②(일교차
//   ≥8°)는 구조적으로 발동할 수 없다 — 정작 하루 전체 일교차는 5~13°로 존재한다. 결과 슬롯을
//   "원인 이후 최저 기온 슬롯"으로 바꾸면 §8-2 실패일에서 2°→11°가 되어 규칙이 살아난다.
//   계측 근거(서울 평년 12개월 × 체질 3종 = 36케이스, 발동 4건): 스크립트는 `Trash Can/`에
//   로컬 보관하며 **gitignore 대상이라 저장소에 없다** — 되살릴 때는 이 주석의 수치를
//   기준으로 같은 형태의 프로브를 다시 만든다.
//
// 왜 이 형태인가 (docs/reviews/2026-07-28-review-codex-day-preview.md 조정 합의):
//   문제정의 v2 §8-2의 대표 실패는 "아침 20°에 맞춰 입혔는데 11시 28°에 땀이 젖고
//   17시 17°에 그 옷으로 떨었다"다. 실패는 **한 시점의 오판이 아니라 시점 사이의 전이**에서
//   생긴다. 그래서 슬롯 하나의 등급이 아니라 슬롯 쌍의 갭을 본다.
//   §8-4 After 시나리오의 세 번째 줄("알림장 한 줄: 산책 후 옷 갈아입혀 주세요")이
//   여태 어느 화면에도 없었다 — 전달 문구가 그 구현이다.
//
// 정직성 계약:
//   - **순위를 주장하지 않는다.** 후보 비교 엔진이 없으므로 "가장 중요한·1순위·놓치면 안 될"을
//     쓰지 않는다. 결과는 "오늘 부탁" 한 줄이고, 규칙 우선순위는 안전 순서로 결정적이다.
//   - 안전 규칙이 낸 준비물을 빼지 않는다. 과거 결과는 **순서·표현**만 조정한다.
//   - 근거로 쓴 슬롯·수치를 화면에 함께 보여준다(입력 출처 추적).

import type { HomeTimeSlot } from "@/lib/timeline";
import { canonicalPrep } from "@/lib/prep-vocab";
import { discomfortIndex, DI_WARN, HEAT_SEVERE_TEMP } from "@/lib/hero-brief";
import { hasSkin, isSweatProne } from "@/lib/domain/child-conditions";
import { withNominativeParticle } from "@/lib/korean";

/** 실행의 성격 — 전달 문구·준비물이 이 키로 갈린다 */
export type CareActionKind = "sweat_change" | "layer_gap" | "rain_pickup" | "air_indoor";

export type CarePlan = {
  kind: CareActionKind;
  /** 실행문 — 화면 헤드라인. "11시 야외활동 뒤, …해 주세요" */
  action: string;
  /** 근거 2행: 원인 슬롯 → 결과 슬롯 */
  evidence: [CareEvidence, CareEvidence];
  /** 내가 챙길 것 (표준명, 1~2개) */
  prep: string[];
  /** 돌봄자에게 보낼 문구 — 시각·행동·이유가 든 완결 문장 */
  handoff: string;
  /** 어린이집 재원 추정 여부 — 전달 대상 라벨을 가른다 */
  atDaycare: boolean;
};

export type CareEvidence = {
  /** "야외활동 11:00" */
  slot: string;
  /** "30°" 또는 "30° · 습도 85%" */
  value: string;
  /** 이 시점이 왜 문제인가 — 한 줄 */
  why: string;
};

export type CarePlanInput = {
  slots: HomeTimeSlot[];
  childName: string;
  conditions?: string[];
  hot?: string;
  sweat?: string;
  /** 일과가 전부 기본값이면 시각을 단정하지 않는다(거짓 정밀도 금지) */
  scheduleIsDefault?: boolean;
};

const label = (s: string) => s.replace(/시간$/, "");

/** 땀이 마르지 못하는 조건 — 히어로·케어 플랜과 같은 임계를 쓴다(새 숫자를 만들지 않는다) */
const isHotSlot = (s: HomeTimeSlot): boolean => {
  const di = discomfortIndex(s.temp, s.humidity);
  return (di != null && di >= DI_WARN) || s.temp >= HEAT_SEVERE_TEMP;
};

/**
 * 오늘 부탁 1개를 만든다. 만들 수 없으면 null — 없는 위험을 지어내지 않는다.
 *
 * 규칙 우선순위(안전 순서, 결정적):
 *   ① 젖은 옷 + 이후 기온 하락  ② 활동↔이후 일교차  ③ 이후 시점 비  ④ 활동 시점 대기질·꽃가루
 * 앞의 규칙이 성립하면 뒤는 보지 않는다. "가장 중요하다"는 주장이 아니라 안전 순서다.
 */
export const buildCarePlan = (input: CarePlanInput): CarePlan | null => {
  const { slots, childName, conditions = [], hot, sweat } = input;
  if (slots.length < 2) return null;

  // 활동 슬롯 = 야외활동 라벨이 있으면 그것, 없으면 체감이 가장 높은 슬롯
  const outdoorIdx = slots.findIndex((s) => s.time.includes("야외활동"));
  const peakIdx =
    outdoorIdx >= 0
      ? outdoorIdx
      : slots.reduce((best, s, i) => (s.feels > slots[best].feels ? i : best), 0);
  const cause = slots[peakIdx];
  // 결과 슬롯 = 원인 이후의 첫 슬롯(하원·저녁). 없으면 만들 수 없다.
  const effect = slots[peakIdx + 1];
  if (!effect) return null;

  const atDaycare = slots.some((s) => s.time.includes("등원") || s.time.includes("하원"));
  const sweaty = isSweatProne(hot, sweat);
  const skinSensitive = hasSkin(conditions);
  const tempDrop = cause.temp - effect.temp;
  const causeAt = `${label(cause.time)} ${cause.hour}`;
  const effectAt = `${label(effect.time)} ${effect.hour}`;
  const name = childName;

  // ① 젖은 옷: 활동이 더운 시점이고, 그 뒤에 (a) 기온이 떨어지거나 (b) 젖은 옷이 오래
  //    닿을 아이(땀 많음·피부 민감)다.
  //    (b)를 함께 보는 이유: 한여름은 하루 종일 더워 기온 하락이 없지만, 그때도 젖은 옷은
  //    피부를 자극하고 체온을 뺏는다. 하락에만 걸면 정작 땀이 가장 많은 계절에 룰이
  //    한 번도 발동하지 않는다(2026-07-29 실측에서 발견 — 같은 날 AI 리포트는 이미
  //    "놀이 뒤 여벌 상의로 갈아입히고"를 말하고 있었다).
  const wetMatters = tempDrop >= 3 || sweaty || skinSensitive;
  if (isHotSlot(cause) && wetMatters) {
    const cools = tempDrop >= 3;
    return {
      kind: "sweat_change",
      action: `${cause.hour} ${label(cause.time)} 뒤, 젖은 옷을 갈아입혀 달라고 전달하세요`,
      evidence: [
        {
          slot: causeAt,
          value: `${cause.temp}° · 습도 ${cause.humidity}%`,
          why: sweaty
            ? `땀이 많은 ${name}는 옷이 젖기 쉬워요`
            : "습해서 땀이 잘 마르지 않아요",
        },
        {
          slot: effectAt,
          value: cools ? `${effect.temp}°` : `습도 ${effect.humidity}%`,
          why: cools
            ? `${tempDrop}° 떨어져요 — 젖은 옷은 체온을 함께 떨어뜨려요`
            : skinSensitive
              ? "젖은 옷이 오래 닿으면 예민한 피부를 자극해요"
              : "젖은 옷을 오래 입고 있으면 체온을 뺏겨요",
        },
      ],
      prep: [canonicalPrep("여벌 상의")],
      handoff: cools
        ? `${cause.hour} ${label(cause.time)} 뒤 ${withNominativeParticle(name)} 땀에 젖으면 가방의 여벌 상의로 갈아입혀 주세요. ${effect.hour}에는 ${effect.temp}°까지 내려가요.`
        : `${cause.hour} ${label(cause.time)} 뒤 ${withNominativeParticle(name)} 땀에 젖으면 가방의 여벌 상의로 갈아입혀 주세요. 오늘은 습해서 땀이 잘 마르지 않아요.`,
      atDaycare,
    };
  }

  // ② 일교차: 활동과 이후의 기온 차가 커 옷 한 겹의 시점이 갈린다
  if (tempDrop >= 8) {
    return {
      kind: "layer_gap",
      action: `${effect.hour} ${label(effect.time)} 전에, 겉옷을 입혀 달라고 전달하세요`,
      evidence: [
        { slot: causeAt, value: `${cause.temp}°`, why: "이 시각엔 겉옷이 필요 없어요" },
        {
          slot: effectAt,
          value: `${effect.temp}°`,
          why: `${tempDrop}° 떨어져요 — 이 시각엔 한 겹이 필요해요`,
        },
      ],
      prep: [canonicalPrep("얇은 겉옷")],
      handoff: `오늘 일교차가 커요. ${effect.hour} ${label(effect.time)} 전에 ${withNominativeParticle(name)} 가방의 얇은 겉옷을 입도록 도와주세요. ${cause.hour}엔 ${cause.temp}°인데 ${effect.hour}엔 ${effect.temp}°예요.`,
      atDaycare,
    };
  }

  // ③ 이후 시점 비: 귀가 경로가 젖는다
  const effectRain = (effect.pty != null && effect.pty > 0) || (effect.pop ?? 0) >= 60;
  if (effectRain) {
    return {
      kind: "rain_pickup",
      action: `${effect.hour} ${label(effect.time)}에 비가 와요 — 우산을 미리 맡겨두세요`,
      evidence: [
        { slot: causeAt, value: `${cause.temp}°`, why: "이 시각엔 비 소식이 없어요" },
        {
          slot: effectAt,
          value: effect.pop != null ? `강수 ${effect.pop}%` : "비 소식",
          why: "젖은 채로 귀가하면 체온이 떨어져요",
        },
      ],
      prep: [canonicalPrep("우산")],
      handoff: `${effect.hour} ${label(effect.time)} 무렵 비 소식이 있어요. 가방에 우산을 넣어두었으니 ${withNominativeParticle(name)} 챙길 수 있게 도와주세요.`,
      atDaycare,
    };
  }

  // ④ 활동 시점 대기질·꽃가루: 실내 대체와 귀가 후 케어
  const airBad = cause.dust === "나쁨" || cause.dust === "매우나쁨";
  const pollenHigh = cause.pollen === "높음" || cause.pollen === "매우높음";
  if (airBad || pollenHigh) {
    const signal = airBad ? `미세먼지 ${cause.dust}` : `꽃가루 ${cause.pollen}`;
    return {
      kind: "air_indoor",
      action: `${cause.hour} ${label(cause.time)}은 실내 위주로 부탁드리세요`,
      evidence: [
        { slot: causeAt, value: signal, why: "이 시각에 노출이 가장 커요" },
        {
          slot: effectAt,
          value: `${effect.temp}°`,
          why: "돌아온 뒤 세안·환기로 남은 노출을 줄여요",
        },
      ],
      prep: [canonicalPrep("실내놀이")],
      handoff: `오늘 ${signal}이에요. ${cause.hour} ${label(cause.time)}은 가능하면 실내 위주로 부탁드려요.`,
      atDaycare,
    };
  }

  return null;
};
