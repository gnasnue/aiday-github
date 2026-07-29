# 아이데이(AiDay) E2E 테스트 계획

| 항목 | 내용 |
|---|---|
| 대상 | 라이브 서비스 https://myaiday.co (실 프로덕션 Supabase DB, 실 Claude Sonnet API) — 2026-07-29 도메인 변경, 구 `aiday-demo.vercel.app`. 이 문서 아래 본문과 2026-07-24 리포트에 남은 구 도메인 표기는 당시 기록이다 |
| 도구 | Playwright (`@playwright/test`), 헤드리스 실행 |
| 작성일 | 2026-07-24 |
| 작성자 | QA Agent (독립 세션, 소스코드 수정 금지) |
| 기준 문서 | `PRD.md` v2.8 (코드베이스 동기화), `SPEC.md`, `docs/PRODUCT-DECISIONS.md` |

## 1. 범위와 원칙

- 이 계획은 PRD.md와 실제 코드(`app/`, `lib/`)를 대조해 작성했다. PRD가 "미구현/재평가"로 명시한 항목(`daily_briefings` 서버 단일 원본, S-003 저녁 결과 피드백, `notifications_log`)은 테스트 케이스로 만들지 않고 test-cases.md에 N/A로만 기록한다.
- 실제 코드 동작이 PRD 서술과 다른 경우(예: 지역 처리 GPS 방식, 홈 추천 아이템/종합 솔루션 섹션 제거) 실제 동작을 기준으로 케이스를 설계한다.
- 사용자 역할은 2종뿐이다: **게스트**(비로그인, 데모 프로필 2개 + localStorage 프로필), **로그인 사용자**(이메일 또는 Google). 별도 관리자 역할 없음.
- 전역 `middleware.ts`가 존재하지 않음을 코드에서 확인(`find . -maxdepth 1 -iname "middleware*"` 결과 없음, `app/(main)/layout.tsx`에도 인증 가드 없음) — "권한 없는 사용자 접근" 케이스는 실제 라이브 사이트에 대한 실행 결과로 검증한다(가정 금지).

## 2. 비용·레이트리밋 통제 방침 (중요)

`/api/report`는 실제 Claude Sonnet을 호출한다(과금 발생). 아래 원칙으로 실행 비용을 통제한다.

1. **에러 주입 테스트는 전부 네트워크 모킹.** 날씨 502, 잘못된 JSON, 타임아웃 등 "서버/네트워크 오류" 케이스는 `page.route()`로 `/api/weather`·`/api/air`·`/api/uv`·`/api/pollen`·`/api/report`를 모킹해 실제 LLM 호출 비용 없이 클라이언트 회복력만 검증한다.
2. **실제 리포트 생성이 필요한 케이스는 최소 횟수만.** 온보딩 완료→홈 진입(1회), 홈 리포트 실제 생성 확인(1회), 체크리스트 토글(리포트 재생성 없이 로컬 상태만 변경이라 추가 비용 없음)만 실 Claude 호출을 발생시킨다.
3. **게스트 레이트리밋(10회/일) 소진 테스트는 실제로 수행하되(P0 요구사항), UI의 60초 수동 새로고침 쿨다운을 우회해 `request` 컨텍스트로 `/api/report`에 최소 유효 payload(`{child:{name,age,gender}, weather:{...}}` — 라우트가 `child`·`weather`의 존재만 검사하고 세부 필드는 런타임에 강제하지 않음, `app/api/report/route.ts:144-198` 확인)를 직접 반복 POST해 429에 도달할 때까지 루프(상한 15회 안전장치)로 확인한다.** 이는 실제 서버 카운터를 대상으로 하는 정직한 검증이며, UI 클릭 반복보다 빠르고 정확하다. 이 테스트는 반드시 스위트 마지막에 실행해 다른 게스트 시나리오를 막지 않게 한다.
4. **로그인 사용자 레이트리밋(20회/일)은 실제로 소진하지 않는다.** 20회 연속 실 Claude 호출은 비용·소요시간 대비 얻는 정보가 적어(코드 경로가 게스트와 동일한 `checkReportRateLimit` 함수를 공유 — `lib/rate-limit.ts`), `/api/report`를 모킹한 429 응답으로 UI 문구·배지 차이만 검증한다. 실제 20회 소진은 수행하지 않았음을 test-report.md에 명시한다.
5. 같은 시나리오를 반복하는 루프(리트라이 폭주 등)는 만들지 않는다.

## 3. 환경 구성

- `playwright.config.ts`: `baseURL: "https://myaiday.co"`(2026-07-29 변경), `screenshot: "only-on-failure"`, `video: "retain-on-failure"`, `trace: "retain-on-failure"`, 산출물은 `test-results/`에 쌓은 뒤 `screenshots/`·`traces/`로 후처리 복사(스크립트 `scripts/collect-artifacts.mjs` 또는 실행 후 수동 복사).
- 프로젝트(뷰포트):
  - `mobile` — 390×844 (DESIGN.md 모바일 고정 프레임 기준). 실 리포트 생성·레이트리밋 등 **비용이 발생하는 테스트는 이 프로젝트에서만 실행**(desktop과 중복 실행 시 Claude 호출이 2배가 되므로).
  - `desktop` — 1280×800. 레이아웃 스모크, 모킹 기반 에러 케이스 등 **비용 없는 테스트만** 실행.
- 실행: `npx playwright test` (헤드리스, `--headed`/`--ui` 미사용). 실패 시 스크린샷/비디오/트레이스 자동 보존.
- 테스트 계정: `aiday-qa-test+{timestamp}@example.com` 패턴으로 실제 Supabase에 생성(삭제하지 않음, 방치).
- Google OAuth: 자동화하지 않음 — "수동 테스트 필요(BLOCKED — 외부 OAuth)"로 기록.
- 실제 이메일 인증 필요 시: 받은편지함 확인하지 않고 "이메일 인증 대기 — 실메일 확인 불가로 BLOCKED"로 기록, 게스트 모드를 핵심 플로우의 대체 검증 경로로 사용.

## 4. 리스크 기반 우선순위

| 우선순위 | 기준 |
|---|---|
| P0 | 로그인/세션, 게스트·로그인 권한 차등(레이트리밋), 핵심 데이터 등록(온보딩), 핵심 업무 완료(AI 브리핑+체크리스트), 저장 결과 확인(프로필 편집) |
| P1 | 에러 처리(외부 API 장애), 잘못된 입력, 경계값, 새로고침/뒤로가기, 중복 클릭, 반응형, 데이터 없음/많음 |
| P2 | 탐색적 확인(카피 정합, 네비게이션 세부, N/A 처리된 미구현 항목 재확인) |

## 5. 테스트 유형 커버리지

핵심 업무 흐름 / 정상 사용 / 잘못된 입력 / 빈 값·경계값 / 권한 없는 접근 / 중복 등록·중복 클릭 / 새로고침·뒤로가기 / 작업 중 이탈 / 세션 만료(모킹) / 모바일·데스크톱 / 데이터 없음 / 데이터 많음(다중 프로필·긴 체크리스트) / 서버·네트워크 오류(모킹) — 상세는 `test-cases.md` 참조.

## 6. 산출물 매핑

문서(`test-plan.md`·`test-cases.md`·`test-report.md`·`최종보고서.md`)는 `docs/test/`에, 테스트 코드·설정·아티팩트는 저장소 루트에 둔다(Playwright 관례 — `testDir`·스펙 내 스크린샷 경로가 루트 기준으로 고정돼 있어 코드는 옮기지 않았다).

| 산출물 | 경로(저장소 루트 기준) |
|---|---|
| 테스트 계획 | `docs/test/test-plan.md` (본 문서) |
| 테스트 케이스 | `docs/test/test-cases.md` |
| Playwright 설정 | `playwright.config.ts` |
| 테스트 코드 | `tests/e2e/*.spec.ts` |
| 스크린샷 | `screenshots/` |
| 트레이스 | `traces/` |
| 결과 리포트 | `docs/test/test-report.md` |
| 최종 요약 | `docs/test/최종보고서.md` |

## 7. 진행 순서

1. test-plan.md·test-cases.md 작성 (본 단계)
2. Playwright 셋업 (`playwright.config.ts`, 프로젝트 2종)
3. P0 스펙 작성 (`auth`, `guest-access`, `onboarding`, `home-report`, `profile-edit`)
4. P0 실행(모바일 프로젝트, 헤드리스, 백그라운드) → 1차 결과 확인
5. P1 스펙 작성 (`error-handling`, `landing`, `responsive`, `rate-limit`)
6. 레이트리밋 스펙은 마지막에 별도 실행(게스트 쿼터 소진 후 다른 게스트 테스트가 영향받지 않도록)
7. 전체 실행 → 아티팩트 수집 → `test-report.md` 작성
8. `최종보고서.md` 작성 후 종료(추가 수정 없음)
