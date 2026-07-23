# 엔지니어링 리뷰 — 홈 반복 붕괴 진단 & harness 보강 계획

- 일자: 2026-07-23
- 스킬: /plan-eng-review (Claude Opus 4.8) + 아웃사이드 보이스(Claude 서브에이전트)
- 대상: "홈이 이틀에 한 번 꼴로(코드 수정 후 + randomly) 깨진다"의 구조적 진단과 5단계 harness 계획
- 결과: 계획 대폭 개정 — 9개 쟁점 결정, 3개 교차모델 텐션 반영

---

## 진단 재구성 (리뷰 후)

원 진단은 A계통(회귀)·B계통(랜덤 외부) 2분법이었으나, 리뷰 결과 **둘의 뿌리가 같다**:
최근 재발 버그(#154 NO_DATA 오분류, #152 재시도 부재)는 순수 외부 flakiness가 아니라
**외부 응답을 분류·처리하는 경계 로직의 미검증 결함**이다. 근거 `app/(main)/home/page.tsx:421`
`const ok = r && !r.error;`. 이 경계(라우트 핸들러 + 분류기)에 테스트가 0개.

아웃사이드 보이스가 **제3의 계통**을 추가: 1,832줄 단일 클라 컴포넌트의 **렌더 단계 throw →
화이트스크린**. 실제 출처는 (a) 낡은 localStorage blob JSON.parse 후 렌더 사용, (b) 배포 후
버전 스큐, (c) 하이드레이션 불일치. + **관측성 부재**(에러 트래킹 없음)로 "랜덤" 미지 버그를
사후에만 발견 → 사이클이 안 끊김.

---

## 확정된 계획 (지렛대·의존 순)

| # | 마일스톤 | 근거 쟁점 |
|---|----------|-----------|
| A | **CI + 경계 계약 테스트** (build+lint+test 게이트 + weather/air/uv/pollen 라우트·분류기에 fixture 테스트: 200/502/NO_DATA/빈값이 각각 올바른 상태로 매핑). **env 라우트 `maxDuration` 감사**(현재 리포트만 60; 프록시들은 8s 타임아웃 vs Vercel ~10s 천장 → 콜드스타트 타임아웃=#154 증상) 포함. | 이슈1, 아웃사이드⑥ |
| B | **순수 로직 lib 추출 + 유닛 테스트** (envSignature·envChanged·slotNotables·splitHook → `lib/`). **회귀 테스트 #154·#152를 CRITICAL로** 여기 배치. | 이슈4, IRON RULE |
| C | **섹션별 명시 empty/error 상태 + 테스트**. 경량 전역 `error.tsx`(청크로드·버전스큐 + 리로드). **방어적 localStorage 캡시 읽기(파싱 후 스키마 검증) + /api/version·BUILD_ID 버전게이트 테스트**. | 이슈2, 이슈8, 아웃사이드③④ |
| D | **Playwright E2E** — 해피패스 + 전 API 사망(mock 502) → 셸+섹션 폴백 렌더. 외부 API는 반드시 mock. | 이슈5 |
| E | **관측성** — window.onerror/unhandledrejection 수집 + 알림. 경량 자체 엔드포인트로 시작(외부 전송 시 승인·PII 검토). 다른 마일스톤과 병렬. | 이슈7, 아웃사이드① |
| F | **배포 후 카나리** — LLM 안 타는 셸+섹션 렌더 헬스체크(토큰 예산 보호). | 이슈6 |
| G | **(테스트 다음 바로 다음 마일스톤으로 승격)** 서버측 환경 데이터 집계 = 단일 엔드포인트 + 소스별 상태. 클라 fan-in 상태기·손수 짠 single-flight/abort 경쟁을 삭제. | 이슈3, 이슈9, 아웃사이드⑦⑧ |

> 카나리(F)가 셸 전용이라 #152/#154를 못 잡는다는 아웃사이드⑤ 지적: 그 회귀는 F가 아니라
> A(회귀 계약 테스트)+D(E2E)가 잡는다. F는 렌더/버전스큐 등 **다른** 프로덕션 실패 탐지용 —
> 역할 분담이므로 F는 셸 전용 유지.

---

## Step 0 — 스코프

신규 서비스 0개, 신규 파일 4~6개 → 8파일/2서비스 스멜 미발동. 스코프 축소 게이트 미발동.

## NOT in scope (명시적 연기)

- **G(서버 집계) 즉시 착수** — 안전망(동작 테스트) 없이 큰 구조변경은 회귀 위험. 테스트 뒤 다음 마일스톤.
- **error.tsx 섹션별 중첩 경계** — 흔한 증상(빈칸·스켈레톤 멈춤)은 throw가 아니라 폴백 상태라 과투자. C의 섹션 상태로 대체.
- **Sentry 등 외부 에러 서비스 확정** — E는 경량 자체 엔드포인트로 시작; 외부 전송은 별도 승인·PII 검토.
- **Supabase 세션 만료 처리** — TODO(아래).
- **1,832줄 컴포넌트 전면 분해** — B 추출을 첫 조각으로, G 이후 점진.

## What already exists (재사용)

- `lib/` 유닛 테스트 15개(feels-like·timeline·prep·report-freshness 등) — B·A 패턴 그대로 확장.
- `scripts/verify-env-accuracy.mjs` + 매일 07시 스케줄 태스크 — **데이터 정합성** 카나리. F(렌더 헬스체크)는 이와 별개 역할이므로 중복 아님.
- `package.json`에 `test`(vitest)·`lint`·`build` 스크립트 존재 — A는 이걸 CI에서 실행만 하면 됨(신규 스크립트 불필요).
- `lib/analytics.ts` `report_error` 이벤트 — E의 기반이나, `.catch(()=>{})` 무음 실패라 전역 수집·알림 보강 필요.
- `app/providers.tsx` 버전 게이트 리로드 — C에서 테스트로 고정.
- `docs/report-eval/` + eval-report.mjs — 리포트 프롬프트 변경 시 [→EVAL](이번 계획엔 프롬프트 변경 없음).

## 실패 모드 (신규 코드패스별)

| 코드패스 | 현실적 실패 | 테스트? | 에러 처리? | 사용자 체감 |
|----------|-------------|---------|------------|-------------|
| 라우트 분류기 | NO_DATA를 성공 오인(#154 재발) | A에서 커버 | 있음(개정됨) | 섹션 빈칸(가시) |
| 클라 리포트 fetch | 콜드 fresh-fetch 실패(#152 재발) | B 회귀 | 재시도+폴백 | "기본 추천" 라벨(가시) |
| env 프록시 라우트 | Vercel maxDuration 초과 타임아웃 | **A 감사 전엔 GAP** | 8s 타임아웃→null | 섹션 빈칸(가시) |
| localStorage 읽기 | 낡은 blob → 렌더 throw | C 검증 | **현재 없음→C 추가** | **화이트스크린(무음)← 크리티컬** |
| 버전 게이트 | BUILD_ID 미설정→스테일 번들 | C 테스트 | 리로드(조건부) | 구버전 잔상(반가시) |
| single-flight/abort | 프로필 전환 중 경쟁 | E2E 한계 | ref 가드 | 스켈레톤 잔류(반가시) → **G가 삭제** |

**크리티컬 갭:** localStorage 읽기 throw는 테스트·에러처리·가시성 3박자 모두 결여였음 → C로 해소.

## 병렬화 (worktree)

| 레인 | 마일스톤 | 모듈 | 의존 |
|------|----------|------|------|
| A레인 | A → B | `.github/`, `app/api/`, `lib/` | A 먼저(게이트) |
| B레인 | C | `app/(main)/`, `app/providers.tsx` | A 이후 |
| C레인 | D | `e2e/`(신규) | A 이후 |
| D레인 | E | 관측성 훅 | 독립·전 구간 병렬 |
| — | F, G | — | D·전 테스트 이후 순차 |

실행: A 완료 → B·C 레인 병렬 착수(모듈 분리: lib vs app), D레인 병렬. E는 처음부터 병렬. G는 마지막.

## Implementation Tasks

- [ ] **T1 (P1)** — CI — `.github/workflows/ci.yml`로 build+lint+test 게이트
  - Files: `.github/workflows/ci.yml`  · Verify: PR에서 액션 통과
- [ ] **T2 (P1)** — 라우트 경계 계약 테스트 — 200/502/NO_DATA/빈값 → 상태 매핑
  - Files: `app/api/*/route.test.ts`(신규)  · Verify: `npm test`
- [ ] **T3 (P1)** — env 라우트 `maxDuration` 감사·설정
  - Files: `app/api/{weather,air,uv,pollen}/route.ts`
- [ ] **T4 (P1, CRITICAL 회귀)** — #154 NO_DATA→빈칸, #152 콜드실패→정직폴백 회귀 테스트
  - Files: `lib/*.test.ts`, `app/api/weather/route.test.ts`
- [ ] **T5 (P1)** — 순수 로직 lib 추출 + 유닛 테스트
  - Files: `lib/home-*.ts`(신규), `page.tsx`
- [ ] **T6 (P1, CRITICAL)** — 방어적 localStorage 캡시 읽기(스키마 검증) — 화이트스크린 차단
  - Files: `app/(main)/home/page.tsx`
- [ ] **T7 (P2)** — 섹션별 명시 empty/error 상태 + 경량 `error.tsx`
  - Files: `app/(main)/error.tsx`(신규), `page.tsx`
- [ ] **T8 (P2)** — 버전 게이트/BUILD_ID 테스트
  - Files: `app/providers.test.tsx`(신규), `app/api/version/`
- [ ] **T9 (P2)** — Playwright E2E(해피 + 전API사망), 외부 mock
  - Files: `playwright.config.ts`(신규), `e2e/home.spec.ts`
- [ ] **T10 (P2)** — 전역 에러 수집 + 알림(경량 자체 엔드포인트)
  - Files: `app/error-report/`(신규), `lib/analytics.ts`
- [ ] **T11 (P3)** — 배포 후 LLM-free 카나리
- [ ] **T12 (P3, 다음 마일스톤)** — 서버측 env 집계 단일 엔드포인트

## TODOS (사용자 확정 대기)

1. Supabase 세션 만료 처리 — 프로필 복원·analytics가 라이브 세션 의존, 시간 기반 "랜덤" 트리거.
2. 손수 짠 abort/single-flight 경쟁 커버리지 — G(집계)가 상당 부분 삭제하므로 G 이후 재평가.

## Completion Summary

- Step 0: 스코프 그대로(축소 게이트 미발동)
- Architecture: 3건 (경계 재구성 / error.tsx 우선순위 / fan-in 지렛대)
- Code Quality: 1건 (순수 로직 추출)
- Test: 다이어그램 산출, 홈 실패면 0% 커버 → 11갭(E2E 2, 회귀-CRITICAL 2)
- Performance: 1건 (카나리 토큰 비용)
- Outside voice: 실행(Claude 서브에이전트) — 10건, 텐션 3건 반영
- 크리티컬 갭: 1건(localStorage 읽기 throw)
- 병렬화: 4레인(A→B·C·D 병렬, E 상시 병렬, F·G 순차)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open→folded | 6 issues + 3 cross-model tensions, all resolved |
| Outside Voice | Claude subagent | Independent 2nd opinion | 1 | issues_found | 10 misses; 4 folded, 3 tensions decided, 2→TODO |

**CROSS-MODEL:** 3 tensions (error.tsx 우선순위 / fan-in 순서 / 카나리 충실도) — 모두 종합안으로 수렴, 사용자 결정 반영.
**VERDICT:** ENG CLEARED — 계획 개정 완료, 구현 준비됨. UI 변경 포함(C·D) → 원하면 /plan-design-review.

NO UNRESOLVED DECISIONS
