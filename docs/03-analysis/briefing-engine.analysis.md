# briefing-engine 분석 리포트 (CHECK 단계)

> **Analysis Type**: Gap Analysis — 현재 코드(v0.3 기준선) vs 목표 Design
>
> **Project**: 아이데이 (AiDay)
> **Version**: 0.1.1.0
> **Analyst**: Claude Code (PDCA 수동 실행, 정적 분석)
> **Date**: 2026-07-07
> **Design Doc**: [briefing-engine.design.md](../02-design/features/briefing-engine.design.md)

> [!NOTE]
> 본 CHECK는 **구현(Do) 이전** 시점의 baseline 측정이다. 매치율은 "목표 Design 중 v0.3 기준선에 이미 존재하는 비율"을 뜻하며, 남은 구현 백로그의 크기를 정량화한다. 런타임 테스트(L1~L3)는 dev 서버 미기동으로 미실행 → **정적 전용 공식** 적용.

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | '하루의 첫 육아 판단'을 내 아이 기준·하루 전체 궤적으로 수행할 구조의 부재 |
| **WHO** | 김서연(만 4세·땀 많음) 유형 |
| **RISK** | 판단 근거 부정확 시 신뢰 붕괴; 안전 판정 LLM 위임 위험(P0-2) |
| **SUCCESS** | 서연 케이스 100% · 일정 교차 반영 · 비외출일 유효 브리핑 · 카드 실측 일치 |
| **SCOPE** | 엔진 코어 + 홈 카드 실데이터 + 표준 케이스 (안전·프로필·알림 제외) |

---

## Strategic Alignment Check

### PRD Alignment

| PRD Element | Expected | Implementation Status |
|-------------|----------|:---------------------:|
| Core Problem (WHY) — 하루 전체 기준 판단 | CoT로 일정 시각 교차 평가 | ⚠️ Partial — 최근접 슬롯 매핑만, CoT·보간 없음 |
| Target User (WHO) — 서연(땀 많음) | 체질 리스크 사슬 추론 | ❌ Missed — 서연 few-shot 부재 |
| Value — "판단 근거 가시화" | 홈 카드 실측값 | ❌ Missed — mock 하드코딩 |

### Success Criteria Status

| # | Criteria (from Plan) | Status | Evidence |
|---|---------------------|:------:|----------|
| SC-1 | 서연 케이스 겹쳐입기+여벌옷+땀케어 | ❌ | `report.ts:10-22` few-shot에 해당 패턴 없음 |
| SC-2 | 일정 시각 예보 반영 & 카드 값 일치 | ⚠️ | `route.ts:108-127` findSlot 최근접(보간 X); 카드는 `home:471` mock → **불일치** |
| SC-3 | 비외출일 실내 케어 브리핑 | ❌ | `route.ts:140-144` no-schedule시 hourly 나열만, 실내 케어 지시 없음 |
| SC-4 | build·lint 통과 | ✅ | 현행 통과 (변경 전) |

**Success Rate**: 0.5 / 4 (SC-2 부분)

---

## 2. Gap Analysis (Design vs 현재 구현)

### 2.1 파일/구조 (Structural)

| Design 산출물 | 현재 | Status |
|--------------|------|--------|
| `lib/forecast.ts` (보간·교차·비외출 순수함수) | 없음 | ❌ Not implemented |
| `lib/prompts/report.ts` | 존재 (few-shot만) | ⚠️ 변경 필요 |
| `app/api/report/route.ts` | 존재 (findSlot 최근접) | ⚠️ 변경 필요 |
| `app/(main)/home/page.tsx` 카드 | 존재 (mock) | ⚠️ 변경 필요 |
| `scripts/eval-briefing.ts` | 없음 | ❌ Not implemented |

**Structural Match**: 3/5 = **60%**

### 2.4 기능 심도 (Functional Depth)

| FR | 항목 | Depth | 근거 |
|----|------|:----:|------|
| FR-01 | CoT 5단계 명시 | 0 | `report.ts` 출력 규칙만, 추론 단계 지시 없음 |
| FR-02 | 체질 리스크 사슬 few-shot(서연) | 0 | 기존 few-shot은 비염·아토피·일반 일교차 |
| FR-03 | 선형 보간 | 30 | `route.ts:108` findSlot = 최근접만(보간 아님) |
| FR-04 | 비외출일 분기 | 10 | no-schedule fallback은 hourly 나열, 우천 판정·실내 지시 없음 |
| FR-05 | 홈 카드 실데이터 | 0 | `home:471` `mockWeather.timeline` 하드코딩 |
| FR-06 | 표준 케이스 회귀 | 0 | 미존재 |

**Functional Match**: 평균 ≈ **7%**

### 2.6 API 계약 (Contract)

| # | 계약 | Design | Server | Client | 결과 |
|---|------|:------:|:------:|:------:|:----:|
| 1 | POST /api/report {hook,message,checklist} | ✅ | ✅ `route.ts:173` | ✅ `home:197` | PASS |
| 2 | report 요청에 hourlyForecast 포함 | ✅ | ✅ 수신 | ✅ `home:167,187` w 원시 전달 | PASS |
| 3 | server가 hourlyForecast 사용 | ✅ | ⚠️ findSlot(보간X) | — | PARTIAL |
| 4 | GET /api/weather hourlyForecast → 홈 카드 | ✅ | ✅ 제공 | ❌ `home:471` mock 사용 | **FAIL** |

**Contract Match**: ≈ **60%**

### 2.8 Match Rate Summary (정적 전용)

```
┌─────────────────────────────────────────────┐
│  Structural Match:  60%                      │
│  Functional Match:   7%                      │
│  Contract Match:    60%                      │
│  ─────────────────────────────────────────── │
│  Overall Match:     ≈ 39%                    │
│  = (Structural×0.2)+(Functional×0.4)+(Contract×0.4)
│  = 12 + 2.8 + 24 = 38.8%                     │
└─────────────────────────────────────────────┘
```

> baseline 39% → 목표 90%+. 남은 61%p가 이번 구현 백로그.

---

## 3. Code Quality / 관찰 사항

| 유형 | 파일 | 내용 | 심각도 |
|------|------|------|:----:|
| 정확도 | `route.ts:112` | `findSlot` = 최근접 슬롯 → 08:30이 09시(또는 06시) 값으로 판단, 일교차 오차 | 🟡 Important |
| 데이터 정합 | `home:471` vs `route.ts` | 카드(mock)와 프롬프트(실데이터) 판단 근거 **불일치** — 신뢰선("실측 데이터") 문구와 모순 | 🔴 Critical |
| 확장성 | `route.ts` | 안전 규칙(P0-2) 선행 병합 지점 부재 → 위험 임계 시 LLM 출력에만 의존 | 🟡 Important (P0-2 스코프) |
| 폴백 | `route.ts:178-192` | JSON 파싱 2단계 폴백 + 빈 응답→엔진 폴백 존재 | ✅ 양호 |
| 제약 준수 | `route.ts:161` | temperature 1.0 (Anthropic 0~1.0 준수) | ✅ 양호 |

---

## 6. 확장 영향 (Impact 재확인)

`mockWeather.timeline` 소비자가 홈 카드 외에도 존재 → FR-05 전환 시 회귀 범위:

| 소비자 | 위치 | 영향 |
|--------|------|------|
| 홈 시간대별 카드 | `home:471` | 직접 교체 대상 |
| CharacterReport | `CharacterReport.tsx:24-29` (`weather.timeline`) | weatherData.timeline이 여전히 mock → **본 스코프에선 유지**(엔진 무관), 단 장기 정합 필요 |
| env / tips 페이지 | `env/page.tsx`, `tips/page.tsx` | 본 스코프 밖 — mock 유지, 별도 정리 백로그 |

→ **결론**: FR-05는 홈 카드만 실데이터로 교체하고, `mockWeather` 완전 제거는 별도 백로그로 분리(과범위 방지).

---

## 9. 권장 조치 (ACT 백로그 우선순위)

### 9.1 Critical (엔진 코어 — 즉시)

| 우선 | 항목 | 파일 | FR |
|------|------|------|----|
| 🔴 1 | `lib/forecast.ts` 선형 보간 + 일정 교차 + 비외출 판정 순수함수 | 신규 | FR-03/04 |
| 🔴 2 | CoT 5단계 + 서연 체질 리스크 few-shot + 비외출 분기 | `report.ts` | FR-01/02/04 |
| 🔴 3 | route가 forecast 함수 사용 + 프롬프트 파라미터 확장 (P0-2 훅 주석) | `route.ts` | FR-03/04 |
| 🔴 4 | 카드↔프롬프트 판단 근거 불일치 해소 (홈 카드 실데이터) | `home:471` | FR-05 |

### 9.2 Short-term

| 우선 | 항목 | 파일 |
|------|------|------|
| 🟡 5 | `scripts/eval-briefing.ts` 스키마+키워드 회귀 + 캐시 키 v6→v7 | 신규/`home:153` |
| 🟡 6 | 보간 경계 클램프 단위 검증 | `forecast.ts` |

### 9.3 Long-term (백로그, 본 스코프 밖)

| 항목 | 비고 |
|------|------|
| `mockWeather` 완전 제거 (CharacterReport·env·tips 정합) | 별도 PR |
| 안전 규칙 레이어 `lib/safety-rules.ts` 병합 | P0-2 |

---

## 11. Next Steps

- [ ] **ACT(iterate)**: 9.1 Critical 4건 구현 여부 결정 (Checkpoint 5)
- [ ] 구현 후 재-CHECK로 매치율 재측정 (목표 ≥ 90%)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-07-07 | 초안 (정적 갭 분석, baseline 39%) | Claude Code |
