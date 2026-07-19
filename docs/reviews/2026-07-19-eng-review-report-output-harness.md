# 엔지니어링 리뷰 — AI 리포트 출력 하네스 (v1 확정 계획)

- 일시: 2026-07-19 · 스킬: /plan-eng-review · 브랜치: main (착수 시 신규 feature 브랜치)
- 배경: 홈 AI 리포트의 silent-empty(파싱 실패 → 빈 페이로드를 정상 done으로 전송)와 AI 출력 검증 부재. env 지표에는 verify-env-accuracy.mjs 하네스가 있으나 리포트 출력에는 없음.

## 확정 결정 요약 (D3~D10)

| # | 결정 | 결론 |
|---|------|------|
| D3→D10 | 구조 보장 방식 | **단계화**: v1은 실패 정책+검증+계측, structured outputs(output_config.format)는 실패율 데이터 확보 후 v2 별도 PR (교차 모델 합의) |
| D4 | 검증 실패 정책 | **필드별 등급** — hook·message 필수(미완성 시 error 이벤트), checklist·prep 불량은 표시하되 당일 캐시 저장 스킵 |
| D5 | eval 실행 지점 | **매일 07시 스케줄 + 프롬프트/route 변경 PR 수동 실행** (verify-env-accuracy 패턴) |
| D6 | 규칙 단일 소스 | **REPORT_RULES 상수 모듈** — 프롬프트 템플릿과 검증기가 동일 상수·카운팅 함수 보간 |
| D7 | 헬퍼 추출 | extractField·파싱·검증을 **lib으로 추출**해 vitest 커버 |
| D8 | 감시자 자가검증 | 결정적 규칙마다 **PASS/FAIL(known-bad) 픽스처 쌍** 메타 테스트 전수 |
| D9 | 성능 | 별도 워밍 없음 — 매일 07시 eval이 워밍 겸용, ?perf=1 실측으로 후속 판단 |
| T2 | gating 범위 | 결정적 부분집합만 gating, 의미론 규칙은 **LLM-judge non-gating** |

## v1 구현 범위

1. **lib/report-rules.ts** (신규) — `REPORT_RULES` 상수(HOOK_MAX_CHARS=25, MESSAGE_MAX_CHARS=250, CHECKLIST_MIN=3/MAX=4, MASK_MIN_MONTHS=24, UMBRELLA_POP_MIN=60) + **카운팅 함수**(`**`마크업·`\n` 제거 후 순수 텍스트 기준 — 프롬프트 문구에도 동일 정의 반영). 프롬프트 템플릿(lib/prompts/report.ts)이 이 상수를 보간.
2. **lib/report-schema.ts** (신규) — zod 스키마 + `parseReportJson`(기존 3단 폴백 유지·이동 — v2에서 단순화) + `extractField` 이동 + `validateReport` 필드별 등급(full/partial/fail). `stop_reason === "max_tokens"` 잘림을 실패 등급에 포함.
3. **app/api/report/route.ts** (수정) — silent-empty 제거: 파싱/검증 실패 시 `error` 이벤트(원문 500자 로깅 유지). partial이면 done에 `cacheable:false`. perfLog outcome에 `parse_fail` 집계 태그(실패율 계측 — structured outputs v2 채택 판단 근거). **post-hook error 시맨틱**: 이미 전송된 hook은 클라이언트가 유지, 본문 영역만 오류+재시도 노출.
4. **app/(main)/home/page.tsx** (수정) — `done.cacheable === false`면 localStorage 저장 스킵. 기존 읽기 가드(582행)는 구형/외부 오염 캐시 대비 이중 방어로 유지 + 관계 주석.
5. **lib/report-invariants.ts** (신규) — **gating(결정적)**: hook·message 길이(카운팅 함수 기준), checklist 개수·"이모지 이름" 형식, prep 키 ⊆ 일정 슬롯, 자외선 숫자 정규식, <24개월+마스크 단어, 강수확률<60%+우산 항목. **non-gating(LLM-judge)**: 안심문장, 건강 특이사항 연관성, 우산 뉘앙스(40~50% "혹시 몰라" 허용), 내부 모순, 포지셔닝 톤.
6. **vitest** — schema/extractField 엣지(이스케이프·부분 JSON·빈 값·잘림) + invariants 규칙별 PASS/FAIL 픽스처 쌍(감시자 자가검증) ≈ 27+케이스.
7. **scripts/verify-report-quality.mjs** (신규) — 골든 프로필(비염·아토피·천식 영아·특이사항 없음 등) × 환경 시나리오를 프로덕션 `/api/report`에 실호출 → SSE 소비 → 결정적 불변식 gating + judge non-gating 리포트 + **hook 도착 타이밍 측정**(스트리밍 회귀 관측) + 파싱 실패율 집계. 종료코드 0/1/2. **재시도 정책**: 규칙 FAIL 시 동일 입력 최대 2회 재호출, 연속 FAIL만 FAIL. FAIL 대응: 프롬프트 드리프트 의심 → /investigate.
8. **스케줄 태스크** — 매일 07시(KST) `aiday-daily-report-quality` 등록(repo 외부, env 검증 태스크와 동일 패턴).

## NOT in scope (검토 후 명시 이연)

- **structured outputs(output_config.format) 채택** — 실패율 데이터(eval 집계 1~2주) 확보 후 v2. 채택 시 필수: hook 도착 타이밍 회귀 측정, 게이트웨이 패스스루 실호출 확인, 3단 폴백 단순화. (미검증 전제 3개: JSON 키 출력 순서는 API 계약 아님 / 게이트웨이 silent drop / 스키마 첫 컴파일 지연)
- **LLM-judge gating** — v1은 non-gating 리포트만. 오탐률 관찰 후 승격 판단.
- **CI(PR) 자동 게이트** — 실모델 비용·비결정성 때문에 수동 실행으로 시작.
- **env 검증 다지역·UV·꽃가루 확장** — 별건 TODO.
- **TODOS.md 신설** — 구현 PR에서 아래 TODO 2건과 함께 생성.

## What already exists (재사용)

- zod ^3.25.76 (신규 의존성 0), vitest 관례(lib/*.test.ts 6개)
- verify-env-accuracy.mjs — 하네스 템플릿(임계값·종료코드·키 로딩·스케줄) 그대로 복제
- 프롬프트 출력 규칙(lib/prompts/report.ts:71-82) = 불변식 명세, FEW_SHOT 5개 = 골든 픽스처 시드
- page.tsx:582 캐시 읽기 가드 — 유지(이중 방어)
- perf 계측 체계(?perf=1, perfLog) — 실패율·hook 타이밍 계측에 재사용

## TODO (구현 PR에서 TODOS.md로)

1. **structured outputs v2 채택 판단** — What: eval이 집계한 파싱 실패율로 output_config.format 채택 결정. Why: 실패 "예방"은 v1에 없음(표면화만). Pros: 유효 JSON 보장·폴백 단순화. Cons: 키 순서·게이트웨이·컴파일 지연 리스크. Context: SDK 0.102.0에 타입 존재 확인, Sonnet 5 지원 확인, 스트리밍 호환. Depends on: v1 eval 2주 데이터.
2. **verify-env-accuracy 다지역·UV·꽃가루 확장** — What: 서울시청 하드코딩·날씨/대기질 한정을 위치 v1(#115) 다지역과 UV·꽃가루로 일반화. Why: 위치 기능 출시로 검증 사각 발생. Depends on: 없음.

## Failure modes (신규 코드패스별)

| 경로 | 프로덕션 실패 시나리오 | 테스트 | 에러 처리 | 사용자 가시성 |
|------|----------------------|--------|-----------|---------------|
| parseReportJson 실패 | 모델이 비JSON 출력 | vitest+eval | error 이벤트 | 오류 UI+재시도 ✓ |
| max_tokens 잘림 | 200인데 불완전 JSON | vitest(잘림 픽스처) | 등급 처리 | partial 또는 오류 ✓ |
| post-hook 검증 실패 | hook 표시 후 message 미완 | eval 3경로 | hook 유지+본문 오류 | 명시적 ✓ |
| partial 캐시 오염 | 불량 페이로드 당일 재표시 | vitest+E2E(/qa) | cacheable:false | 재방문 시 재생성 ✓ |
| eval 자체 버그(좀비 감시자) | 오답을 PASS 인증 | known-bad 메타 테스트 | — | — ✓ |
| eval flaky FAIL | 확률적 출력 오탐 | 재시도 2회 정책 | 연속 FAIL만 판정 | 알람 피로 방지 ✓ |

**크리티컬 갭: 0** (전 경로 테스트+처리+가시성 확보).

## 병렬화 전략

| 단계 | 모듈 | 의존 |
|------|------|------|
| S1 rules+schema+invariants+vitest | lib/ | — |
| S2a route+page 수정 | app/ | S1 |
| S2b eval 스크립트 | scripts/ | S1 (S2a의 cacheable 시맨틱 참조) |
| S3 스케줄 등록·프로덕션 확인 | repo 외부 | S2a+S2b |

Lane A: S1 → S2a / Lane B: S1 → S2b — **S2a·S2b 병렬 가능**(모듈 비중첩). S3은 머지 후.

## Implementation Tasks

- [ ] **T1 (P1, human: ~2h / CC: ~10min)** — lib — REPORT_RULES 상수+카운팅 함수 모듈 생성, 프롬프트 템플릿 보간 전환
  - Surfaced by: 코드 품질 이슈 4 (규칙 이중 정의) + 외부 시선 #6 (카운팅 사양)
  - Files: lib/report-rules.ts(신규), lib/prompts/report.ts
  - Verify: npm test (rules 소비 테스트)
- [ ] **T2 (P1, human: ~4h / CC: ~20min)** — lib — report-schema.ts: zod+parseReportJson+extractField 이동+validateReport 등급(max_tokens 포함)
  - Surfaced by: 아키텍처 이슈 1·2, 코드 품질 이슈 5, 외부 시선 #8
  - Files: lib/report-schema.ts(신규), app/api/report/route.ts
  - Verify: npm test (엣지 픽스처)
- [ ] **T3 (P1, human: ~3h / CC: ~15min)** — app — route.ts silent-empty 제거: error 이벤트·cacheable 플래그·parse_fail 계측·post-hook 시맨틱
  - Surfaced by: 아키텍처 이슈 1·2 + 외부 시선 #2
  - Files: app/api/report/route.ts
  - Verify: dev 서버 실구동 + eval 스크립트 로컬(--base) 3경로
- [ ] **T4 (P1, human: ~1h / CC: ~5min)** — app — page.tsx cacheable 가드 + 기존 가드 관계 주석
  - Surfaced by: 외부 시선 #7
  - Files: app/(main)/home/page.tsx
  - Verify: /qa (partial 시 캐시 미저장 → 재방문 재생성)
- [ ] **T5 (P1, human: ~6h / CC: ~30min)** — lib — report-invariants.ts 결정적 규칙 + PASS/FAIL 픽스처 쌍 전수
  - Surfaced by: 테스트 리뷰 (커버리지 갭 11) + 이슈 6 (메타 테스트) + T2 (gating 범위)
  - Files: lib/report-invariants.ts(신규), lib/report-invariants.test.ts(신규)
  - Verify: npm test
- [ ] **T6 (P1, human: ~1일 / CC: ~40min)** — scripts — verify-report-quality.mjs: 골든 프로필×시나리오·SSE 소비·gating/non-gating 분리·hook 타이밍·재시도 정책·실패율 집계
  - Surfaced by: 아키텍처 이슈 3 + 외부 시선 #1·#5
  - Files: scripts/verify-report-quality.mjs(신규)
  - Verify: node scripts/verify-report-quality.mjs --base http://localhost:3000
- [ ] **T7 (P2, human: ~30min / CC: ~5min)** — ops — 매일 07시 스케줄 태스크 등록 + 프로덕션 첫 실행 확인
  - Surfaced by: 아키텍처 이슈 3 + 성능 이슈 7 (워밍 겸용)
  - Files: ~/.claude/scheduled-tasks (repo 외부)
  - Verify: 다음날 07시 실행 로그
- [ ] **T8 (P2, human: ~30min / CC: ~5min)** — docs — TODOS.md 신설(TODO 2건) + SPEC.md 하네스 항목 반영 + CHANGELOG/VERSION
  - Surfaced by: 필수 산출물 (TODO 캡처)
  - Files: TODOS.md(신규), SPEC.md, CHANGELOG.md, VERSION
  - Verify: /ship 게이트 (build·lint)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | (not installed — Claude subagent 대체) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 7 issues + 외부 시선 8건 반영, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** 외부 시선(Claude subagent)과 3개 긴장점(T1 채택 시퀀싱·T2 gating 범위·T3 보완 5건) — 전부 사용자 승인 하에 수용, structured outputs는 v2로 단계화.
- **VERDICT:** ENG CLEARED — ready to implement (v1 범위).

NO UNRESOLVED DECISIONS
