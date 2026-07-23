# TODOS

작업 중 발견됐으나 현재 스코프 밖으로 미룬 항목. 착수 전 관련 리뷰/계획 문서를 먼저 읽는다.

---

## Supabase 세션 만료 처리

- **What:** 프로필 복원(`fetchProfilesFromDb`)과 analytics(`report_viewed`/`report_error`)가 라이브 Supabase 세션에 의존한다. 세션이 만료되면 조회가 조용히 실패하고, 홈이 부분적으로 비거나 이벤트가 누락될 수 있다.
- **Why:** 시간이 지나 세션이 만료된 탭에서 앱을 다시 열 때 발생하는 "randomly 홈이 이상함"의 후보 원인. 현재 만료 감지·재인증 유도·명시적 에러 상태가 없다.
- **Pros:** 시간 기반 랜덤 붕괴 한 계통 제거. 로그인 사용자 신뢰도 상승.
- **Cons:** 인증 흐름 변경이라 회귀 위험. 재인증 UX 설계 필요.
- **Context:** 2026-07-23 홈 harness 엔지니어링 리뷰(아웃사이드 보이스 ⑨)에서 도출. 관련 파일 `lib/profile.ts`(fetchProfilesFromDb), `lib/analytics.ts`. 메모리 `project_supabase_children_grants`도 참조.
- **Depends on / blocked by:** 관측성(마일스톤 E)이 먼저 있으면 실제 만료 빈도를 측정해 우선순위를 정할 수 있음.

## 손수 짠 abort / single-flight 경쟁 커버리지

- **What:** 홈의 리포트 요청 오케스트레이션(`activeReportRef` abort at `app/(main)/home/page.tsx:574-581`, `reportGenRef`, `activeIdRef`, `primedRef`)은 프로필 전환·언마운트 중 경쟁 상태를 손으로 방어한다. 해피패스 E2E로도 유닛으로도 커버 불가.
- **Why:** 스켈레톤 잔류·stale 응답 표시 같은 "randomly" 증상의 유력 원인이지만 검증 수단이 없다.
- **Pros:** 경쟁 회귀를 조기 포착.
- **Cons:** 이 로직을 직접 테스트하기 어렵다(effect 순서·타이밍 의존).
- **Context:** 2026-07-23 리뷰(아웃사이드 보이스 ⑧). **중요:** 마일스톤 G(서버측 env 집계)가 이 클라이언트 상태기의 상당 부분을 삭제하므로, G 이후 남는 경쟁 표면을 재평가한 뒤 테스트를 짜는 게 효율적이다.
- **Depends on / blocked by:** 마일스톤 G. G 전에 이 테스트를 짜면 곧 삭제될 코드에 비계를 세우는 셈.
