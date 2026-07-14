-- children 테이블 스키마 점검 보정 (2026-07-14)
-- 정적 감사 결과 반영: 인덱스 부재 / RLS 스코프·성능 / 명시적 GRANT 부재.
-- 모두 멱등(idempotent)하게 작성 — 재실행해도 안전하다.

-- 1) 조회/정렬 인덱스
--    모든 조회가 user_id로 필터 + created_at로 정렬한다(lib/profile.ts).
--    Postgres는 FK 컬럼에 인덱스를 자동 생성하지 않으므로 명시한다.
create index if not exists children_user_id_created_idx
  on public.children (user_id, created_at);

-- 2) RLS 정책 재정의
--    - TO authenticated: anon 롤에는 정책 평가 자체를 건너뛴다(보안 명확성).
--    - (select auth.uid()): 행마다 재평가 대신 initPlan 캐싱 → RLS 성능 권장 패턴.
--    기존 "owner only" 정책과 동일한 소유권 규칙을 유지한다.
drop policy if exists "owner only" on public.children;
drop policy if exists "owner can access own children" on public.children;
create policy "owner can access own children" on public.children
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 3) 명시적 GRANT
--    Data API 접근을 기본 privilege에 암묵적으로 의존하지 않도록 명시한다.
--    (이 프로젝트는 과거 default ACL 오염으로 REST 403이 발생한 이력이 있다.)
grant select, insert, update, delete on public.children to authenticated;
