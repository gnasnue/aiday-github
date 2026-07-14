# briefing-engine (데일리 케어 브리핑 판단 엔진) Planning Document

> **Summary**: 4개 판단 축을 '오늘 하루 전체' 기준으로 결합해, 부모의 하루 첫 육아 판단을 완료된 상태로 제공하는 판단 엔진 고도화
>
> **Project**: 아이데이 (AiDay)
> **Version**: 0.1.1.0
> **Author**: 이은상 / Claude Code (PDCA 수동 실행)
> **Date**: 2026-07-07
> **Status**: Draft
> **PRD**: [PRD.md](../../../PRD.md) §05 P0-1

---

## Executive Summary

| 관점 | 내용 |
|------|------|
| **Problem** | 판단 입력은 4축(환경 궤적·체질·일정·이력)이나, 현재 프롬프트는 명시적 CoT·체질 리스크 사슬·비외출일 분기가 없고 홈 시간대별 카드가 목데이터라, '하루 전체' 기준 판단이 불완전하다 |
| **Solution** | 프롬프트를 CoT 5단계(궤적→교차→리스크→우선순위→액션)로 재설계 + 체질 리스크 few-shot 추가 + 비외출일 분기 + 일정 시각 예보 선형 보간 + 홈 카드 실데이터 연동 + 표준 테스트 케이스 회귀 스크립트 |
| **Function/UX Effect** | 브리핑이 등원·산책·하원 각 시각의 예보를 명시적으로 교차 평가하고, 홈 "시간대별 환경" 카드가 그 판단 근거를 실측값으로 노출한다 |
| **Core Value** | "판단은 끝나 있고 부모는 확인만" — 하루 첫 육아 판단의 완결성 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 매일 새로 발생하는 '하루의 첫 육아 판단'을 내 아이 기준·하루 전체 궤적으로 수행해 줄 구조의 부재 |
| **WHO** | 김서연(만 4세·땀 많음 자녀) 유형 — 바쁜 아침 인지 여력이 부족한 맞벌이 부모 |
| **RISK** | 판단 근거(일정×시간대 예보 교차)가 부정확하면 오추천 → 신뢰 붕괴. 안전 판정을 LLM에만 맡기면 위험(P0-2 의존) |
| **SUCCESS** | 표준 테스트 케이스(서연) 100% 통과 · 일정 시각 예보 교차 반영 · 비외출일 유효 브리핑 · 홈 카드 실측값 일치 |
| **SCOPE** | 판단 엔진(프롬프트·route·보간) + 홈 시간대별 카드 실데이터 연동 + 표준 테스트 케이스 스크립트. **안전 규칙 레이어(P0-2)·프로필 정규화(P0-3)·알림(P0-4)은 제외** |

---

## 1. Overview

### 1.1 Purpose

부모가 아침에 확인하는 브리핑이 '현재 기온' 한 값이 아니라 **등원·산책·하원 각 시각의 예보를 아이 체질·일정과 교차 평가한 결론**이 되도록 판단 엔진을 고도화한다.

### 1.2 Background

프로토타입 v0.3은 홈 AI 리포트(Claude Haiku 실연동)·환경정보 4종 실데이터를 이미 갖췄으나, 리포트 프롬프트가 시간대별 궤적·체질 리스크 사슬을 명시적으로 추론하지 않고, 홈 "시간대별 환경" 카드는 `weather-mock.ts`의 하드코딩 값을 보여준다. PRD §05 P0-1은 이 기준선 위에 "하루 전체 기준 판단"을 쌓는 핵심 범위다.

### 1.3 Related Documents

- PRD: [PRD.md](../../../PRD.md) §05(P0-1)·§07(S-001)·§08(판단 엔진 명세)
- MANIFESTO: [MANIFESTO.md](../../../MANIFESTO.md)
- Design: [briefing-engine.design.md](./briefing-engine.design.md)

---

## 2. Scope

### 2.1 In Scope

- [ ] `lib/prompts/report.ts` — CoT 5단계 추론 지시 명시 (환경 궤적 → 일정 교차 → 체질 리스크 사슬 → 위험 우선순위 → 실행 액션 3~4개)
- [ ] 체질 리스크 사슬 few-shot 추가 (땀 많음 × 일교차 = 서연 케이스)
- [ ] 비외출일 분기 프롬프트 + 실내 케어 few-shot (판정: **일정 비어있음 OR 우천 예보**)
- [ ] `app/api/report/route.ts` — 일정 시각 예보 **선형 보간** 함수로 `findSlot`(최근접) 대체
- [ ] 홈 "시간대별 환경" 카드를 `mockWeather.timeline` → `/api/weather` `hourlyForecast` 실데이터로 교체
- [ ] `scripts/eval-briefing.ts` — 표준 테스트 케이스 고정 입력 + **스키마+키워드 검사** 판정
- [ ] 리포트 캐시 키 버전 상향 (스키마/프롬프트 변경 반영)

### 2.2 Out of Scope

- 규칙 기반 **안전 레이어**(`lib/safety-rules.ts`) — P0-2 별도 범위 (단, 엔진이 병합받을 인터페이스는 design에서 예약)
- 표현 안전 필터, `/api/report` 레이트리밋 — P0-2
- 프로필 값 포맷 정규화·매칭 버그 — P0-3
- Family Memory 판단 반영 (④축) — 수집만, 엔진 제외
- 알림 발송·PWA — P0-4

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 프롬프트에 CoT 5단계를 명시하고, 각 일정 시각의 예보값을 판단 근거로 인용하게 한다 | High | Pending |
| FR-02 | 체질 태그('땀 많음' 등)를 리스크 사슬(땀→젖은 옷→체온 급강하)로 연결하는 few-shot을 추가한다 | High | Pending |
| FR-03 | 일정 시각(예: 08:30)의 예보값을 인접 3시간 슬롯 선형 보간으로 산출한다 | High | Pending |
| FR-04 | 일정 비어있음 OR 우천 예보 시 실내 케어 브리핑으로 분기한다 (빈 브리핑 금지) | High | Pending |
| FR-05 | 홈 "시간대별 환경" 카드를 `hourlyForecast` 실데이터로 렌더링하고, 아이 일정 시각과 정렬한다 | Medium | Pending |
| FR-06 | 표준 테스트 케이스(서연)를 고정 입력 스크립트로 실행, 스키마+키워드 검사로 통과 판정한다 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 브리핑 생성 p95 ≤ 10초 (Claude 포함), 실패 시 fallback 3초 이내 | Vercel 로그 / 수동 계측 |
| Reliability | 브리핑 JSON 파싱 성공률 ≥ 97% | route.ts 파싱 분기 로그 |
| Cost | temperature 0~1.0 준수(현재 1.0), max_tokens 유지 | 코드 리뷰 |
| Regression | 표준 테스트 케이스 100% 통과가 판단 엔진 PR 머지 조건 | `scripts/eval-briefing.ts` |

---

## 4. Success Criteria

### 4.1 Definition of Done (PRD 수락 기준 매핑)

- [ ] **SC-1** 서연 케이스(만 4세·땀 많음, 등원 08:30/산책 11~12/하원 17:00, 예보 20°→28°→17°) 브리핑에 **[겹쳐 입기]+[여벌 옷]+[땀 케어]** 모두 포함
- [ ] **SC-2** 일정 등록 아이 → 각 일정 시각 예보값이 판단에 반영되고 홈 시간대별 카드 값과 일치
- [ ] **SC-3** 일정 비어있음·우천 예보 → 실내 케어 가이드 포함된 유효 브리핑 생성
- [ ] **SC-4** `npm run build` · `npm run lint` 통과

### 4.2 Quality Criteria

- [ ] `scripts/eval-briefing.ts` 통과(스키마 유효 + 키워드 3종 포함)
- [ ] Zero lint errors
- [ ] 캐시 키 버전 상향으로 구형 캐시 무효화

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| LLM이 CoT를 출력에 노출(내부 추론이 message로 유출) | Medium | Medium | CoT는 '내부 사고'로 지시, 출력은 JSON 스키마만 강제. eval에서 스키마 검사 |
| 선형 보간이 슬롯 부족(예: 21시 이후 일정)에서 외삽 오류 | Medium | Low | 경계 클램프(범위 밖은 최근접 슬롯), 단위 테스트로 경계 검증 |
| 안전 판정(P0-2 미착수)을 엔진이 대체하려다 위험 표현 생성 | High | Medium | design에서 safety-rules 병합 인터페이스만 예약, 이번 스코프는 개인화 해석에 한정. 위험 임계 문구는 few-shot에서 회피 |
| 홈 카드 실데이터 전환 시 mockWeather 의존 컴포넌트(CharacterReport 등) 회귀 | Medium | Medium | §6 Impact Analysis에서 소비자 전수 조사 |
| 표준 케이스 통과를 위한 프롬프트 과적합(다른 케이스 품질 저하) | Medium | Medium | few-shot은 사슬 '패턴'만 제시, 특정 문구 하드코딩 금지 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `lib/prompts/report.ts` | Prompt module | CoT 지시·few-shot·비외출일 분기 추가 |
| `app/api/report/route.ts` | API route | 선형 보간 함수 도입, scheduleSummary 생성 로직 변경 |
| `app/(main)/home/page.tsx` | UI page | 시간대별 카드 데이터 소스 mock→실데이터 |
| `lib/weather-mock.ts` | Mock data | 홈 카드에서 참조 제거(추후 완전 제거 검토) |
| `scripts/eval-briefing.ts` | New script | 신규 — 표준 테스트 케이스 회귀 |
| report 캐시 키 (`aiday:report:vN`) | Cache key | v6 → v7 상향 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `mockWeather` | READ | `home/page.tsx:13,71,124,471` (초기 state·timeline 카드) | Breaking — timeline은 실데이터로, 초기 state fallback만 유지 |
| `mockWeather` | READ | `CharacterReport`(props.weather=weatherData) | Needs verification — weatherData는 유지되므로 영향 적음 |
| `buildReportPrompt` | CALL | `route.ts:146` | None — 시그니처 확장(선택 파라미터)로 하위호환 |
| `hourlyForecast` | READ | `route.ts:106` (findSlot) | 변경 — 보간 함수로 대체, 계약(필드)은 동일 |
| `aiday:report:v6` 캐시 | READ/WRITE | `home/page.tsx:153` | 버전 상향으로 무효화 (의도적) |

### 6.3 Verification

- [ ] `mockWeather.timeline` 참조처가 홈 카드 외에 없는지 확인 (grep)
- [ ] `CharacterReport`가 timeline 실데이터 부재 시에도 렌더되는지 확인
- [ ] 캐시 키 상향이 다른 캐시 페이로드에 영향 없는지 확인

---

## 7. Architecture Considerations

### 7.1 Project Level

Dynamic (Next.js 15 App Router + Supabase). 신규 레이어 추가 없이 기존 `lib/`·`app/api/` 구조 내 변경.

### 7.2 Key Architectural Decisions (플랜 단계 잠정 — design에서 확정)

| Decision | Options | 잠정 | Rationale |
|----------|---------|------|-----------|
| CoT 위치 | 프롬프트 내 지시 / 서버 다단계 호출 | 프롬프트 내 | 비용·지연 최소, Haiku 단일 호출 유지 |
| 보간 로직 위치 | route.ts 인라인 / `lib/forecast.ts` 분리 | design에서 결정 | 테스트 용이성 vs 최소 변경 |
| 비외출일 판정 위치 | route.ts / 프롬프트 | route.ts 선행 판정 → 프롬프트 분기 플래그 | 결정성 확보 |

---

## 8. Convention Prerequisites

- [x] `CLAUDE.md` 컨벤션 존재 (커밋·캐시 키·외부 API 제약)
- [x] 캐시 키 버전 규칙: 스키마 변경 시 상향 (CLAUDE.md)
- [x] 외부 API 제약: Anthropic temperature 0~1.0
- [ ] 테스트 스위트 부재 → `scripts/eval-briefing.ts`는 `tsx` 단독 실행 스크립트로 작성

---

## 9. Next Steps

1. [ ] Design 문서 작성 (`briefing-engine.design.md`) — 3 아키텍처 옵션 + 보간 배치 확정
2. [ ] Check: 현재 코드 vs Design 갭 분석
3. [ ] Act: 갭 기반 수정 우선순위 도출

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-07-07 | 초안 (PDCA 수동 실행, 체크포인트 1+2 반영) | Claude Code |
