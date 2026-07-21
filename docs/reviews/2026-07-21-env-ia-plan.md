# env 화면 IA 재구성 계획 (승인 시안 기반)

> 작성: 2026-07-21 · 시안: `docs/reviews/2026-07-21-env-ia-mockup.html` (사용자 승인)
> 근거 분석: 2026-07-21 env UI/UX 분석 세션 + 2026-07-19 Claude Design 감사(핸드오프 `2026-07-19-handoff-design-audit-실행.md`)

## 배경 — 화면 직무 정의

- **홈** = "오늘 아침, 아이에게 뭘 해줘야 하나" (판단·결론)
- **env** = "홈 판단의 근거 확인(검증) + 오늘 너머 계획(주간·주말)"
- env에서 판단을 새로 만들지 않는다. 판단 소스가 2개면 반드시 어긋난다(실측: 홈 케어플랜 강수 60% warn vs env 지수 80 "좋음").

## 새 구성 (위→아래)

```
헤더(새로고침) · 타이틀 + 위치
① 야외활동 지수 — 히어로 (화면의 유일한 판단)
   eyebrow 라벨 · 등급(display 26, 상태색) · 점수(보조, .num) ·
   게이지(상태색 단색 fill) · 이유 한 줄 · 신뢰 라인(체질 기준·공인 지수 아님·입력 근거)
② 지금 환경 지표 — 단일 카드 리스트 행 7행
   미세먼지 / 초미세먼지 / 오존 / 꽃가루 / 자외선 / 습도 / 바람
   행 문법: 아이콘 컨테이너(36px, warn 행만 warn-bg) + 지표명(16px/500)
   + 우측 등급(14px/600, warn만 상태색+도트, 보통·좋음은 neutral 차콜) + 수치(13px faint, .num)
   체질 각주: warn 행 아래 13px 한 줄 (예: "비염이 있는 지우는 KF94 마스크를 챙겨주세요")
   출처 캡션: 카드 하단 "기상청 · 에어코리아 실측 — {측정소} 기준"
③ 주간 날씨 — 현행 유지
④ 이번 주말 나들이 — 현행 유지 (프로브 버튼 스타일만 R-2 수정)

제거: WeatherNowCard(홈·outfit 담당 — 체감·습도·바람은 ②의 행으로 흡수),
      맞춤 인사이트 섹션(②의 체질 각주로 흡수),
      대기질·꽃가루·자외선·온습도 타일/게이지 3개 섹션(②로 통합)
```

## 인터랙션 상태 명세

| 요소 | 로딩 | 결측(부분) | 결측(전체) | 정상 |
|------|------|-----------|-----------|------|
| ① 지수 히어로 | 스켈레톤(h-40) | 입력 일부 결측 시 신뢰 라인에 사용 입력만 명시("대기질 지연으로 자외선·강수확률·기온 기준") | 전 입력 결측 시 카드 미표시 | 등급+게이지+이유 |
| ② 지표 카드 | 스켈레톤(h-96) | 대기질 3종 동시 결측 → "대기질" 1행으로 압축("측정소 응답 지연 — 잠시 후 자동 갱신돼요"), 개별 결측 → 해당 행 "--"·faint | 카드 대신 정직한 안내 1장("환경 데이터를 불러오지 못했어요") | 7행 |
| ② 꽃가루 행 | 〃 | 제공 기간 외(전 종 null) → "제공 기간 아님 · 참나무·소나무 4~6월" faint 행 | fetch 실패 → "불러오지 못했어요" faint 행 | 최고 등급 표시 |
| ③④ | 스켈레톤 | 현행 유지 | 현행 유지 | 현행 유지 |

- 등급 3단계 매핑은 홈과 동일 원칙: **warn·bad만 색+도트**, 보통 = status-neutral 차콜(도트 없음), 좋음·낮음 = muted-foreground. "특이사항 없음 = 색 없음".
- 히어로 게이지 fill: 좋음 = status-good / 보통 = status-neutral / 주의·나쁨 = status-warn (감사 C-3 — `bg-primary` fill 제거).

## 체질 각주 규칙

- 각주는 **warn 등급 행에만** 노출 (경고 + 개인화가 동시에 성립할 때).
- 미세·초미세·꽃가루 warn + 호흡기·알레르기 프로필 → 마스크 각주. 단 `canRecommendMask`(만 2세 미만 금지) 미충족 시 "만 2세 미만은 마스크 대신 외출을 줄여주세요"로 대체(안전 규칙 3중 정렬 유지, `lib/domain/child-conditions.ts`).
- 자외선 warn + 피부 민감 → 선크림·모자 각주. 습도 건조 warn + 피부 민감 → 보습 각주.
- 프로필 조건이 없으면 각주 없음(등급만).

## 접근성

- 지표 행은 비인터랙티브 정보 행 — `<dl>`/`<ul>` 시맨틱, 도트는 `aria-hidden`.
- 등급은 색+텍스트 이중 전달(텍스트 자체가 등급명이므로 색맹 안전).
- 히어로 게이지: `role="meter" aria-valuenow aria-valuemin aria-valuemax` + sr-only 등급 텍스트.
- 터치 타겟(감사 C-9): 위치 버튼·"기상청 출처" 링크 `min-h-11`(44px) 확보.

## DESIGN.md 개정 (승인 완료 — 2026-07-21)

1. **display(26px) 용도**: "홈 AI 결론(hook) 전용" → "페이지 히어로 결론 전용, 페이지당 1회" (env 야외활동 지수 등급 포함).
2. **L2 shadow-card**: "홈 AI 리포트 카드 단 한 곳" → "화면당 히어로 카드 1곳" (홈 AI 리포트 · env 야외활동 지수).
3. Decisions Log에 본 재구성 기록.

## 구현 항목

- [ ] `app/(main)/env/page.tsx` — 상기 구성으로 재구성. 섹션 간격 mt-7(스케일 밖) → 24/32 스케일. 수치 전부 `.num`. R-2: 프로브 버튼 `bg-primary` 13px 흰 텍스트 → `bg-primary-tint text-accent`(17px bold 미만 흰 텍스트 금지 규칙 준수).
- [ ] `DESIGN.md` — 개정 2건 + Decisions Log.
- [ ] `SPEC.md` P-05 — 새 구성 반영.
- [ ] 검증: `npm run lint` · `npm run build` · `npm test` · dev 서버 390px 실화면 확인(A/B 상태).

## NOT in scope (명시 보류)

| 항목 | 사유 |
|------|------|
| 야외활동 지수 산식 모순(습도 92%·강수 60%에 80 "좋음") | 로직 조사 필요 — 별도 /investigate 태스크. IA 재구성과 독립 |
| 꽃가루·자외선·주간 API 서울 고정(`WEEKEND_REGION`) | 위치 v2 스코프 (감사 PR-A-2 잔여분) |
| 캡션 11px→13px 광범위 승격(감사 S-1) | 핸드오프에서 별도 PR-D로 분리됨 |
| 홈 "현재 환경 한 줄" 5→3 축소(감사 PR-C-3) | 홈 스코프 — 이번 PR은 env만 |

## What already exists (재사용)

- 리스트 행 문법(DESIGN.md Component Grammar, 당근 패턴) — ②의 골격
- `lib/outdoor-index.ts` computeOutdoorIndex — 히어로 데이터 소스(산식 변경 없음)
- `levelTone`·`gradeToLabel`·`uvLabel`·`pollenGradeLabel`·`humidityLabel` — env 내 기존 헬퍼 유지
- `lib/domain/child-conditions.ts` hasRespiratory/hasAllergy/hasSkin/canRecommendMask — 각주 판정
- 주간 날씨·주말 나들이 섹션 코드 — 그대로 유지

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 7/10 → 9/10, 6 decisions |

Pass별: IA 8→9(구성·순서 확정) · States 6→9(상태 테이블 추가) · Journey 8→9(검증/계획 여정 명시) · AI Slop 9(타일 그리드 제거가 곧 개선) · Design System 9(개정 2건으로 정합) · Responsive/A11y 7→9(meter·sr-only·44px 추가) · Decisions 6건 확정, 0건 미결.

**VERDICT:** DESIGN CLEARED — 구현 진행 가능 (eng review는 diff 완성 후 /review로 대체 예정)

NO UNRESOLVED DECISIONS
