// 이번 주 컨디션 예보 — 주간 예보를 아이 체질 기준으로 먼저 읽어, 힘들어지기 쉬운 날을
// 미리 짚는다. 하루 탭이 "오늘 할 일"에서 끝나지 않고 **내일 다시 올 이유**를 만드는 훅.
//
// 설계 원칙:
//  - 판정은 전부 결정론 규칙 — LLM 호출 없음(day-review 패턴 판정과 같은 원칙).
//  - 임계값은 새로 만들지 않는다: 일교차 8°C(hero-brief warn 승격), 더위 33°C·추위 0°C
//    (outdoor-index decisiveDeterrent 차용), 강수 60%(앱 전체 확정 강수 경계).
//  - 어휘 가드: 증상 예측·진단("감기 걸려요") 금지. 조건 서술("부담이 커지는 날") +
//    부모 자신의 기록 인용("비슷한 날 3번 중 2번 기침·콧물 기록")까지만 — day-review
//    memoryStatusCopy와 같은 선.
//  - 개인 근거는 유효 표본 ≥3(MIN_OBSERVATIONS 정렬) + 관찰 ≥2일 때만 인용한다.
//    그 전에는 체질(프로필) 기반 문장만 쓰고, 저녁 기록이 쌓일수록 정확해진다는
//    힌트로 데이터 루프를 닫는다.

import {
  hasRespiratory,
  isSweatProne,
} from "@/lib/domain/child-conditions";
import { withTopicParticle } from "@/lib/korean";
import { MIN_OBSERVATIONS, type DayReviewEntry } from "@/lib/memory/day-review";

/* ---------- 입력 ---------- */

/** `/api/weather/weekly` 응답의 하루치(sanitizeWeekly와 같은 모양의 부분집합) */
export type RadarWeekDay = {
  day: string; // "오늘" | "수" …
  date: string; // "7/30"
  high: number | null;
  low: number | null;
  rain: number; // 강수확률 %
  weekend?: boolean;
};

export type WeekRadarInput = {
  week: RadarWeekDay[];
  childName: string;
  conditions?: string[];
  hot?: string;
  sweat?: string;
  /** 저녁 결과 기록 — 개인 근거 매칭용(없으면 체질 기반 문장만) */
  entries?: DayReviewEntry[];
};

/* ---------- 출력 ---------- */

export type RadarSignalKey = "diurnal" | "heat" | "cold" | "rain";

export type RadarSignal = {
  key: RadarSignalKey;
  /** 칩 라벨 — 수치·사실만("일교차 9°"). 등급어·진단어 금지 */
  label: string;
  score: number;
};

export type RadarDay = {
  day: string;
  date: string;
  /** 주간 예보 라벨은 요일뿐이라("수") 내일 여부는 위치로 판정해 여기 새긴다 */
  isTomorrow: boolean;
  high: number | null;
  low: number | null;
  weekend: boolean;
  signals: RadarSignal[];
  score: number;
};

export type RadarEvidence = {
  /** 비슷한 조건이었던 기록 일수 */
  total: number;
  /** 그중 관찰(기침·콧물/더워함/불편)이 있던 일수 */
  hits: number;
  /** 인용 문장 — 관찰 서술까지만 */
  line: string;
};

export type RadarBrief = {
  day: RadarDay;
  /** "목요일을 먼저 챙겨주세요" — 요일 호명 */
  title: string;
  /** 조건 → 체질 연결 한 문장 */
  why: string;
  /** 미리 챙길 것 — prep-vocab 표준명 */
  actions: string[];
  /** 부모 자신의 기록 인용(표본 미달이면 null) */
  evidence: RadarEvidence | null;
};

export type WeekRadar = {
  /** 내일부터 최대 6일 — 기온이 아예 없는 날은 버린다(없는 값을 그리지 않는다) */
  days: RadarDay[];
  /** 이번 주 가장 먼저 챙길 날. 신호가 하나도 없으면 null(= 평온 주간) */
  peak: RadarBrief | null;
};

/* ---------- 임계값 (전부 차용 — 새 숫자 금지) ---------- */

const DIURNAL_WARN = 8; // lib/hero-brief.ts 일교차 warn 승격 임계
const HEAT_WARN = 33; // lib/outdoor-index.ts decisiveDeterrent 기온
const COLD_WARN = 0; // lib/hero-brief.ts 추위 warn 임계
const RAIN_WARN = 60; // 앱 전체 확정 강수(우산·실내권장) 경계

/** 개인 근거 인용에 필요한 최소 관찰 수 */
export const MIN_EVIDENCE_HITS = 2;

/* ---------- 신호 판정 ---------- */

const buildSignals = (
  d: RadarWeekDay,
  boost: { respiratory: boolean; sweatProne: boolean }
): RadarSignal[] => {
  const signals: RadarSignal[] = [];
  const diurnal = d.high != null && d.low != null ? d.high - d.low : null;

  if (diurnal != null && diurnal >= DIURNAL_WARN) {
    const base = 2 + (diurnal - DIURNAL_WARN) * 0.5;
    signals.push({
      key: "diurnal",
      label: `일교차 ${diurnal}°`,
      score: base * (boost.respiratory ? 1.5 : 1),
    });
  }
  if (d.high != null && d.high >= HEAT_WARN) {
    const base = 2 + (d.high - HEAT_WARN) * 0.5;
    signals.push({
      key: "heat",
      label: `낮 ${d.high}°`,
      score: base * (boost.sweatProne ? 1.5 : 1),
    });
  }
  if (d.low != null && d.low <= COLD_WARN) {
    const base = 2 + (COLD_WARN - d.low) * 0.5;
    signals.push({
      key: "cold",
      label: `아침 ${d.low}°`,
      score: base * (boost.respiratory ? 1.3 : 1),
    });
  }
  if (d.rain >= RAIN_WARN) {
    signals.push({
      key: "rain",
      label: `비 ${d.rain}%`,
      score: (1 + (d.rain - RAIN_WARN) / 20) * (boost.respiratory ? 1.2 : 1),
    });
  }
  return signals;
};

/* ---------- 개인 근거 매칭 ---------- */

/** 신호별 "비슷한 조건이었던 날" 판정 — envDigest(v7)에 기온·강수 요약이 있는 기록만 (컨디션 예보 개인 근거) */
const wasSimilarDay = (e: DayReviewEntry, key: RadarSignalKey): boolean => {
  const d = e.envDigest;
  if (!d) return false;
  switch (key) {
    case "diurnal":
      return d.tMin != null && d.tMax != null && d.tMax - d.tMin >= DIURNAL_WARN;
    case "heat":
      return d.tMax != null && d.tMax >= HEAT_WARN;
    case "cold":
      return d.tMin != null && d.tMin <= COLD_WARN;
    case "rain":
      return d.rainy === true;
  }
};

const AIRWAY_TAG_RE = /기침|콧물|코를 자주 비볐/;

const airwayObserved = (e: DayReviewEntry): boolean =>
  e.airwayOutcome === "rubbing" ||
  e.airwayOutcome === "cough" ||
  e.tags.some((t) => AIRWAY_TAG_RE.test(t));

const heatObserved = (e: DayReviewEntry): boolean =>
  e.thermalOutcome === "too_warm" || e.tags.some((t) => t.includes("땀"));

const discomfortObserved = (e: DayReviewEntry): boolean =>
  e.dayComfort === "some_discomfort" || e.dayComfort === "high_discomfort";

/**
 * 신호 키에 맞는 관찰 근거를 만든다. 우선 그 신호의 대표 관찰(더위→더워함,
 * 그 외→기침·콧물)로 세고, 미달이면 일반 불편 관찰로 폴백. 그래도 미달이면 null —
 * 근거를 지어내지 않는다.
 */
export const buildEvidence = (
  entries: DayReviewEntry[],
  key: RadarSignalKey
): RadarEvidence | null => {
  const similar = entries.filter((e) => wasSimilarDay(e, key));
  if (similar.length < MIN_OBSERVATIONS) return null;

  const flavors: { pred: (e: DayReviewEntry) => boolean; phrase: string }[] =
    key === "heat"
      ? [
          { pred: heatObserved, phrase: "더워했다는 기록이" },
          { pred: discomfortObserved, phrase: "불편해했다는 기록이" },
        ]
      : [
          { pred: airwayObserved, phrase: "기침·콧물 기록이" },
          { pred: discomfortObserved, phrase: "불편해했다는 기록이" },
        ];

  for (const f of flavors) {
    const hits = similar.filter(f.pred).length;
    if (hits >= MIN_EVIDENCE_HITS) {
      return {
        total: similar.length,
        hits,
        line: `비슷한 날 ${similar.length}번 중 ${hits}번, ${f.phrase} 있었어요.`,
      };
    }
  }
  return null;
};

/* ---------- 카피 (체질 연결 · 관찰 서술까지만) ---------- */

const whyLine = (
  signal: RadarSignal,
  d: RadarDay,
  name: string,
  boost: { respiratory: boolean; sweatProne: boolean }
): string => {
  const diurnal = d.high != null && d.low != null ? d.high - d.low : null;
  switch (signal.key) {
    case "diurnal":
      // "찬 공기" 같은 계절 한정 서술 금지 — 한여름 일교차(25→35°)에도 참이어야 한다
      return boost.respiratory
        ? `하루 안에 기온이 ${diurnal}° 출렁이는 날이에요 — 호흡기가 민감한 ${withTopicParticle(name)} 이런 날 컨디션이 흔들리기 쉬워요.`
        : `하루 안에 기온이 ${diurnal}° 출렁이는 날이에요 — 아침과 낮의 옷차림 차이를 미리 맞춰두면 편해요.`;
    case "heat":
      return boost.sweatProne
        ? `낮 기온이 ${d.high}°까지 올라요 — 땀이 많은 ${name}에게 특히 지치기 쉬운 날이에요.`
        : `낮 기온이 ${d.high}°까지 올라요 — 한낮 야외활동은 짧게 잡는 편이 좋아요.`;
    case "cold":
      return boost.respiratory
        ? `아침 기온이 ${d.low}°까지 내려가요 — 호흡기가 민감한 ${name}에게 찬 공기가 부담이 되기 쉬워요.`
        : `아침 기온이 ${d.low}°까지 내려가요 — 등원길 보온을 미리 챙겨두면 편해요.`;
    case "rain":
      return `비 올 확률이 높은 날이에요 — 젖은 옷으로 보내는 시간이 길어지지 않게 준비해두면 좋아요.`;
  }
};

/** 미리 챙길 것 — prep-vocab 표준명만 쓴다 */
const actionsFor = (
  key: RadarSignalKey,
  boost: { respiratory: boolean; sweatProne: boolean }
): string[] => {
  switch (key) {
    case "diurnal":
      // 목수건은 한랭 전용 어휘 — 여름 일교차에도 뜨는 신호라 겉옷 한 겹만 고정
      return ["얇은 겉옷"];
    case "heat":
      return boost.sweatProne ? ["물통", "여벌 상의"] : ["물통"];
    case "cold":
      return boost.respiratory ? ["따뜻한 외투", "목수건"] : ["따뜻한 외투"];
    case "rain":
      return ["우산", "여벌 옷"];
  }
};

/* ---------- 빌더 ---------- */

/**
 * 주간 예보(오늘 포함 7일) → 내일부터의 컨디션 레이더.
 * 오늘은 홈 히어로가 담당하므로 제외한다. 기온이 하나도 없는 날(중기예보 결측)은
 * 스트립에서 버린다 — 없는 값을 그리지 않는다.
 */
export function buildWeekRadar(input: WeekRadarInput): WeekRadar {
  const boost = {
    respiratory: hasRespiratory(input.conditions),
    sweatProne: isSweatProne(input.hot, input.sweat),
  };

  const days: RadarDay[] = input.week
    .slice(1) // 오늘 제외
    .map((d, i) => ({ ...d, isTomorrow: i === 0 }))
    .filter((d) => d.high != null || d.low != null)
    .map((d) => {
      const signals = buildSignals(d, boost);
      return {
        day: d.day,
        date: d.date,
        isTomorrow: d.isTomorrow,
        high: d.high,
        low: d.low,
        weekend: !!d.weekend,
        signals,
        score: signals.reduce((s, x) => s + x.score, 0),
      };
    });

  const candidates = days.filter((d) => d.signals.length > 0);
  if (!candidates.length) return { days, peak: null };

  // 최고점 우선, 동점이면 가까운 날 — days는 이미 날짜순
  const peakDay = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  const topSignal = peakDay.signals.reduce((a, b) => (b.score > a.score ? b : a));

  const dayName = peakDay.isTomorrow ? "내일" : `${peakDay.day}요일`;
  const evidence = input.entries?.length
    ? buildEvidence(input.entries, topSignal.key)
    : null;

  return {
    days,
    peak: {
      day: peakDay,
      // 요일·"내일" 모두 ㄹ 받침으로 끝나 목적격 조사는 항상 "을"
      title: `${dayName}을 먼저 챙겨주세요`,
      why: whyLine(topSignal, peakDay, input.childName, boost),
      actions: actionsFor(topSignal.key, boost),
      evidence,
    },
  };
}

/** 근거가 아직 없을 때의 루프 힌트 — 저녁 기록이 예보를 개인화한다는 사실 안내 */
export const radarHint = (name: string): string =>
  `저녁에 하루 결과를 알려줄수록, 이 예보가 ${name} 기준으로 정확해져요.`;
