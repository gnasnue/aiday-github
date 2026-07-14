# briefing-engine (데일리 케어 브리핑 판단 엔진) Design Document

> **Summary**: CoT 5단계 프롬프트 + 순수함수 보간/교차(`lib/forecast.ts`) + 비외출일 분기 + 홈 카드 실데이터 + 표준 케이스 회귀
>
> **Project**: 아이데이 (AiDay)
> **Version**: 0.1.1.0
> **Author**: 이은상 / Claude Code (PDCA 수동 실행)
> **Date**: 2026-07-07
> **Status**: Draft
> **Planning Doc**: [briefing-engine.plan.md](./briefing-engine.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | '하루의 첫 육아 판단'을 내 아이 기준·하루 전체 궤적으로 수행할 구조의 부재 |
| **WHO** | 김서연(만 4세·땀 많음) 유형 — 아침 인지 여력이 부족한 맞벌이 부모 |
| **RISK** | 판단 근거(일정×예보 교차) 부정확 시 신뢰 붕괴; 안전 판정을 LLM에만 맡기면 위험(P0-2 의존) |
| **SUCCESS** | 서연 케이스 100% 통과 · 일정 시각 예보 교차 반영 · 비외출일 유효 브리핑 · 홈 카드 실측 일치 |
| **SCOPE** | 판단 엔진(프롬프트·route·보간) + 홈 카드 실데이터 + 표준 케이스 스크립트 (안전·프로필·알림 제외) |

---

## 1. Overview

### 1.1 Design Goals

- 각 일정 시각(등원·산책·하원)의 예보값을 **결정적으로** 산출(선형 보간)해 프롬프트 입력·홈 카드에 동일 값으로 공급 (SC-2: 판단↔UI 일치)
- LLM에는 **내부 CoT 추론**을 지시하되 출력은 JSON 스키마만 강제
- 비외출일(일정 비어있음 OR 우천) 판정을 **코드에서 선행**해 프롬프트 분기 → 빈 브리핑 방지
- 재사용·회귀 검증 대상(보간·교차)을 순수함수로 분리해 `scripts/eval-briefing.ts`가 직접 호출

### 1.2 Design Principles

- **결정적 입력, 창의적 표현**: 수치 산출(보간·교차·비외출 판정)은 코드, 문장 생성은 LLM
- **Single source of truth**: 홈 카드와 프롬프트가 같은 `lib/forecast.ts` 출력 사용
- **과설계 회피 (Option C)**: 안전 레이어(P0-2)는 타입 훅만 예약, 구현은 별도 스코프

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | A: Minimal | B: Clean | C: Pragmatic |
|----------|:-:|:-:|:-:|
| New Files | 1 | 5~6 | 2 |
| Modified Files | 3 | 4 | 3 |
| Complexity | Low | High | Medium |
| Testability | Low | High | High |
| Effort | Low | High | Medium |

**Selected**: **Option C (Pragmatic)** — **Rationale**: 보간·일정교차를 `lib/forecast.ts` 순수함수로 추출해 표준 케이스 회귀 스크립트가 직접 검증 가능하게 하면서, 프롬프트·비외출 분기는 기존 파일 최소 변경으로 유지. P0-2 안전 레이어는 타입 훅만 예약해 과설계 회피.

### 2.1 Component Diagram

```
┌──────────────────┐   hourlyForecast   ┌────────────────────┐
│  /api/weather    │ ─────────────────▶ │  home/page.tsx     │
│  (KMA proxy)     │                    │  시간대별 카드(실데이터)│
└──────────────────┘                    └─────────┬──────────┘
        │ hourlyForecast + schedule                │ POST child+weather+air
        ▼                                          ▼
┌───────────────────────────────────────────────────────────┐
│  lib/forecast.ts  (순수함수, 신규)                          │
│   • interpolateAt(hourly, "HH:MM") → number|null            │
│   • evaluateSchedule(hourly, schedule) → SlotEval[]         │
│   • detectIndoorDay(hourly, schedule) → { indoor, reason }  │
└───────────────────────┬───────────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────────┐
│  app/api/report/route.ts                                    │
│   1. forecast 순수함수로 slotEvals·indoorDay 산출           │
│   2. (P0-2 훅 예약) applySafetyRules?(...) — 이번엔 no-op     │
│   3. buildReportPrompt({ ...slotEvals, indoorDay })         │
│   4. Claude Haiku 호출 → JSON 파싱 → 폴백 체인               │
└───────────────────────┬───────────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────────┐
│  lib/prompts/report.ts  (CoT 5단계 + few-shot + 비외출 분기)│
└───────────────────────────────────────────────────────────┘

scripts/eval-briefing.ts ──▶ lib/forecast.ts (직접) + /api/report (통합)
```

### 2.2 Data Flow

```
weather.hourlyForecast + child.schedule
  → interpolateAt (각 일정 시각 온도/습도/강수 결정적 산출)
  → evaluateSchedule (등원·산책·하원 SlotEval[])
  → detectIndoorDay (일정 없음 OR PTY>0/POP 높음 → indoor)
  → buildReportPrompt (CoT 지시 + slotEvals 인용 + indoor 분기)
  → Claude Haiku (내부 CoT) → {hook, message, checklist}
  → 파싱 실패 시 recommendation-engine 폴백
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| route.ts | lib/forecast.ts | 결정적 수치 산출 |
| home/page.tsx | lib/forecast.ts (또는 원시 hourlyForecast) | 카드 렌더 + 일정 정렬 |
| eval-briefing.ts | lib/forecast.ts, lib/prompts/report.ts | 회귀 검증 |
| route.ts | lib/prompts/report.ts | 프롬프트 조립 |

---

## 3. Data Model

### 3.1 신규 타입 (lib/forecast.ts)

```typescript
export interface HourSlot {
  hour: string;            // "HH:MM" (06/09/12/15/18/21)
  temp: number;
  sky: number | null;
  pty: number | null;      // 0=없음,1=비,2=비/눈,3=눈,4=소나기
  humidity: number | null;
  windSpeed: number | null;
  pop: number | null;      // 강수확률 %
}

export interface SlotEval {
  label: string;           // "등원" | "야외활동" | "하원" | "저녁 외출"
  time: string;            // "HH:MM"
  temp: number | null;     // 선형 보간값
  humidity: number | null;
  pop: number | null;
  rain: boolean;           // pty>0
}

export interface IndoorDay {
  indoor: boolean;
  reason: "no-schedule" | "rain" | null;
}

// P0-2 예약 훅 (이번 스코프 no-op)
export type SafetyVerdict = { forcedItems: string[]; blockedPhrases: string[] };
```

### 3.2 보간 규약

- 대상 시각 `t`가 슬롯 `[a, b]` 사이면 `temp = a.temp + (b.temp - a.temp) * (t - a.hour)/(b.hour - a.hour)`
- 범위 밖(첫 슬롯 이전/마지막 이후)은 **클램프**(최근접 경계 슬롯 값)
- 슬롯 0~1개면 보간 불가 → 최근접 슬롯 or 대표값 fallback

---

## 4. API Specification

기존 `POST /api/report` 계약 **유지**(요청 body·응답 shape 불변). 내부 처리만 변경.

### 4.1 Endpoint

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/report | 브리핑 생성 (child+weather+air) | 없음(게스트 허용) |
| GET | /api/weather | hourlyForecast 포함 예보 | 없음 |

### 4.2 응답 shape (불변)

```json
{ "hook": "string", "message": "string", "checklist": ["이모지 이름", "..."] }
```

- 파싱 실패: `{ "hook":"", "message":"", "checklist":[] }` → 클라이언트가 recommendation-engine 사용
- Claude 오류: HTTP 503 + `{ "error": "..." }`

> **Note (P0-2 경계)**: 레이트리밋(429)·안전 강제 병합은 본 스코프 밖. route에 `// TODO(P0-2)` 훅 위치만 표시.

---

## 5. UI/UX Design

### 5.1 홈 "시간대별 환경" 카드 (변경)

```
시간대별 환경  →
[등원 08:30] [산책 11:00] [하원 17:00]   ← 아이 일정 정렬
[ ⛅ 20°   ] [ ☀️ 28°   ] [ 🌥 17°  ]   ← hourlyForecast 보간 실측값
```

- 일정이 있으면 **일정 시각 기준** 카드(SlotEval), 없으면 hourlyForecast 슬롯 그대로
- 각 카드 값 = 프롬프트가 인용한 값과 동일 (SC-2)

### 5.4 Page UI Checklist — 홈 (S-001)

- [ ] 카드: 일정 라벨(등원/야외활동/하원) + 시각 "HH:MM"
- [ ] 카드: 보간 기온 `${temp}°` (mock 아님)
- [ ] 카드: 미세먼지·자외선·꽃가루·습도·바람 (기존 유지)
- [ ] 일정 없음: hourlyForecast 슬롯(06~21) 렌더 (빈 카드 금지)
- [ ] AI 리포트 checklist: 서연 케이스 시 겹쳐입기+여벌옷+땀케어 항목 노출

---

## 6. Error Handling

| 상황 | 처리 |
|------|------|
| hourlyForecast 없음/1개 | 보간 skip → 대표 weather 값 사용, 카드는 단일/스켈레톤 |
| 일정 파싱 불가 | 해당 슬롯 제외, 나머지 진행 |
| Claude 파싱 실패 | 빈 응답 → recommendation-engine 폴백 (기존 동작 유지) |
| Claude 503 | "기본 추천" 라벨 + 규칙 리포트 (기존 유지) |
| 비외출일 | indoor 분기 프롬프트 → 실내 케어 브리핑 (빈 브리핑 금지) |

---

## 7. Security Considerations

- 게스트 허용 엔드포인트 — 레이트리밋은 P0-2. 이번 스코프는 입력 검증 유지(기존 body 파싱).
- 아동 건강정보는 요청 body로만 전달, 저장 없음(엔진은 stateless).

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| Unit (순수함수) | `interpolateAt`·`evaluateSchedule`·`detectIndoorDay` | tsx 스크립트 assert | Do |
| L1: Regression | 표준 케이스 브리핑 (스키마+키워드) | `scripts/eval-briefing.ts` | Do/Check |
| L2: UI | 홈 카드 실데이터 렌더 | 수동/dev 서버 | Check |

### 8.2 표준 테스트 케이스 (서연) — 고정 입력

```
입력: 만 4세·땀 많음, 등원 08:30 / 산책 11:00~12:00 / 하원 17:00,
      hourlyForecast: 06시 18° … 09시 20° … 12시 28° … 15시 24° … 18시 17°
기대(스키마): {hook:string≤25, message:string≤250, checklist:string[3~4]}
기대(키워드): checklist 문자열 결합에 (겹쳐|레이어|가디건|겉옷) AND (여벌) AND (땀) 포함
판정: 스키마 유효 && 3키워드군 모두 매칭 → PASS
```

### 8.3 보간 단위 검증

| # | 입력 | 기대 |
|---|------|------|
| 1 | interpolateAt(slots, "08:30"), 06=18/09=20 | ≈19.7 (경계 내 보간) |
| 2 | interpolateAt(slots, "05:00") | 18 (첫 슬롯 클램프) |
| 3 | detectIndoorDay([], schedule=∅) | {indoor:true, reason:"no-schedule"} |
| 4 | detectIndoorDay(pty>0 슬롯 다수, schedule) | {indoor:true, reason:"rain"} |

---

## 9. Clean Architecture

| Layer | This Feature | Location |
|-------|--------------|----------|
| Domain (순수) | 보간·교차·비외출 판정 | `lib/forecast.ts` |
| Application | 브리핑 오케스트레이션 | `app/api/report/route.ts` |
| Infra | 프롬프트 조립·LLM 호출 | `lib/prompts/report.ts`, route |
| Presentation | 홈 카드 | `app/(main)/home/page.tsx` |

의존 방향: Presentation·Application → Domain(`forecast.ts`, 외부 의존 0). ✅

---

## 11. Implementation Guide

### 11.1 File Structure

```
lib/
├── forecast.ts          # 신규 — 순수함수 (보간·교차·비외출)
├── prompts/report.ts    # 변경 — CoT + few-shot + 비외출 분기
app/api/report/route.ts  # 변경 — forecast 함수 사용, 프롬프트 파라미터 확장
app/(main)/home/page.tsx # 변경 — 카드 실데이터
scripts/eval-briefing.ts # 신규 — 표준 케이스 회귀
```

### 11.2 Implementation Order

1. [ ] `lib/forecast.ts` 순수함수 + 인라인 assert 검증
2. [ ] `lib/prompts/report.ts` CoT/few-shot/비외출 분기
3. [ ] `route.ts` forecast 함수 연결 + 프롬프트 파라미터 확장 (P0-2 훅 주석)
4. [ ] `home/page.tsx` 카드 실데이터 + 일정 정렬
5. [ ] `scripts/eval-briefing.ts` + 캐시 키 v6→v7
6. [ ] `npm run build`·`lint` + eval 통과 확인

### 11.3 Session Guide

| Module | Scope Key | Description |
|--------|-----------|-------------|
| forecast+prompt | `module-1` | 엔진 코어 (1~3) |
| ui+eval | `module-2` | 카드 실데이터 + 회귀 (4~6) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-07-07 | 초안 (Option C 선택 반영) | Claude Code |
