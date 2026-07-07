# briefing-engine ACT 구현 계획 (iterate plan)

> **Type**: ACT 단계 산출물 — 코드 미수정, 구현 계획만 (Checkpoint 5: "구현 계획만")
> **Date**: 2026-07-07 · **Author**: Claude Code (PDCA 수동 실행)
> **선행**: [analysis](./briefing-engine.analysis.md) baseline 39% → 목표 ≥ 90%
> **실행 방법**: 아래 계획을 feature 브랜치에서 module 단위로 구현 후 재-CHECK

---

## 요약

CHECK가 도출한 Critical 4 + Short-term 2를 **2개 module·2개 PR**로 분할한다. module-1(엔진 코어)이 표준 케이스 통과의 핵심이며 리스크가 가장 낮다.

| PR | Module | 파일 | 완료 조건 |
|----|--------|------|-----------|
| PR-1 | module-1 엔진 코어 | `lib/forecast.ts`(신규)·`lib/prompts/report.ts`·`app/api/report/route.ts` | eval 스크립트 통과 + build·lint |
| PR-2 | module-2 UI+회귀 | `app/(main)/home/page.tsx`·`scripts/eval-briefing.ts`(신규)·캐시 키 | 카드 실측값=프롬프트 값, eval CI화 |

---

## PR-1 · module-1 — 엔진 코어

### 1. `lib/forecast.ts` (신규, 순수함수)

```typescript
export interface HourSlot { hour: string; temp: number; sky: number|null;
  pty: number|null; humidity: number|null; windSpeed: number|null; pop: number|null; }
export interface SlotEval { label: string; time: string; temp: number|null;
  humidity: number|null; pop: number|null; rain: boolean; }
export interface IndoorDay { indoor: boolean; reason: "no-schedule"|"rain"|null; }

// "HH:MM" → 분. 슬롯 [a,b] 선형 보간, 범위 밖은 경계 클램프, 슬롯<2면 최근접.
export function interpolateAt(slots: HourSlot[], time: string): { temp:number|null; humidity:number|null; pop:number|null } {}
// schedule 각 시각(등원·야외·하원·저녁)에 interpolateAt 적용 → SlotEval[]
export function evaluateSchedule(slots: HourSlot[], schedule?: Record<string,string|undefined>): SlotEval[] {}
// 일정 전무 → no-schedule / 일정 시각 슬롯의 pty>0 다수 또는 pop≥60 → rain
export function detectIndoorDay(slots: HourSlot[], schedule?: Record<string,string|undefined>): IndoorDay {}
```

**검증(파일 하단 인라인 assert, `tsx lib/forecast.ts`)**:
- `interpolateAt([06=18,09=20], "08:30").temp ≈ 19.7`
- `interpolateAt([...], "05:00").temp === 18` (클램프)
- `detectIndoorDay([], undefined) === {indoor:true, reason:"no-schedule"}`
- `detectIndoorDay(rainSlots, sched).reason === "rain"`

### 2. `lib/prompts/report.ts`

- `REPORT_SYSTEM_PROMPT`에 **내부 CoT 지시** 추가: "다음 순서로 내부적으로 추론하되, 출력은 JSON만: ①환경 궤적 ②일정 시각별 교차점 ③체질 리스크 사슬 ④위험 우선순위 ⑤실행 액션 3~4개". (CoT는 message에 노출 금지)
- `FEW_SHOT`에 **서연 케이스 추가**: `땀 많음 × 일교차(등원20°→산책28°→하원17°)` → `checklist:["🧥 얇은 겉옷(겹쳐입기)","👕 여벌 티셔츠 1장","💦 땀 케어 — 산책 후 갈아입히기"]`. 문구는 사슬 '패턴'만, 특정 문장 하드코딩 금지(과적합 방지).
- `buildReportPrompt` 파라미터에 `slotEvals: SlotEval[]`, `indoorDay: IndoorDay` 추가(선택, 하위호환). indoor면 "실내 케어(습도·환기·보습) 중심" 분기 지시 + 실내 few-shot.

### 3. `app/api/report/route.ts`

- `findSlot`/`slotLine`(:108-144) → `lib/forecast.ts`의 `evaluateSchedule`·`detectIndoorDay`로 대체.
- `scheduleSummary`를 SlotEval 기반으로 생성(보간 온도 인용).
- `buildReportPrompt({ ..., slotEvals, indoorDay })` 호출.
- **P0-2 훅 예약**: `// TODO(P0-2): const safety = applySafetyRules(air, weather); checklist 강제 병합 + 표현 필터` 주석만.
- 나머지(파싱 폴백·503) 유지.

**완료 조건**: `npm run build`·`lint` + `scripts/eval-briefing.ts` PASS.

---

## PR-2 · module-2 — UI + 회귀

### 4. `app/(main)/home/page.tsx`

- 시간대별 카드(:471) `mockWeather.timeline` → **`hourlyForecast` 기반**으로 교체.
  - 일정 있으면 `evaluateSchedule` 결과(등원/산책/하원 라벨+보간 온도), 없으면 hourlyForecast 슬롯.
  - 카드 온도 = 프롬프트 인용 값과 동일(SC-2). 신뢰선 "실측 데이터" 문구와 정합.
- `weatherRawRef.current`의 hourlyForecast 재사용(추가 fetch 금지).
- **범위 한정**: `mockWeather` 완전 제거는 하지 않음(CharacterReport·env·tips 회귀 방지) → 별도 백로그.

### 5. `scripts/eval-briefing.ts` (신규)

- 서연 고정 입력 → `/api/report` 호출(또는 프롬프트 조립부 직접) → 판정:
  - 스키마: `hook`(≤25자)·`message`(≤250자)·`checklist`(3~4 string)
  - 키워드: checklist 결합에 `(겹쳐|레이어|가디건|겉옷)` AND `(여벌)` AND `(땀)`
  - 실패 시 non-zero exit → 판단 엔진 PR 머지 게이트.

### 6. 캐시 키

- `home/page.tsx:153` `aiday:report:v6` → **`v7`** (프롬프트/스키마 변경 반영, CLAUDE.md 캐시 컨벤션).

---

## 재-CHECK 예상

| 지표 | baseline | PR-1 후 | PR-2 후 |
|------|:--:|:--:|:--:|
| Structural | 60% | 80% | 100% |
| Functional | 7% | ~65% | ~95% |
| Contract | 60% | 75% | 100% |
| **Overall** | **39%** | **~72%** | **~97%** |

---

## 다음 액션

1. feature 브랜치 `feat/briefing-engine-cot` 생성
2. PR-1(module-1) 구현 → eval·build·lint → 이은상 리뷰·머지
3. PR-2(module-2) 구현 → 재-CHECK로 매치율 확인
4. (별도) P0-2 안전 레이어 착수 시 route의 `TODO(P0-2)` 훅에 연결

> 실제 구현이 필요하면 "PR-1 구현해줘" 또는 (bkit 활성화 후) `/pdca do briefing-engine --scope module-1`.
