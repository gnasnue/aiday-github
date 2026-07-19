-- children 테이블 스키마 하드닝 (2026-07-14, DB 스키마 점검 후속)
--
-- 선행 마이그레이션과의 관계:
--   001_children.sql        : 테이블 + RLS 'owner only' 정책(FOR ALL, 전 롤 대상)
--   002_children_grants.sql : 403 복구 — anon/authenticated/service_role에 DML grant + default ACL 복구
-- 이 마이그레이션은 그 위에 (1) 조회 인덱스, (2) RLS 스코프·성능 강화,
-- (3) 최소 권한 원칙(anon 회수)을 얹는다. 모두 재실행 안전(idempotent).
--
-- ⚠️ 미적용 상태. 적용 방법은 파일 하단 주석 참조. 적용 전 스테이징에서 먼저 검증할 것.

-- 1) 조회/정렬 인덱스
--    모든 조회가 user_id로 필터 + created_at로 정렬한다(lib/profile.ts fetchProfilesFromDb).
--    Postgres는 FK 컬럼에 인덱스를 자동 생성하지 않으므로 명시한다.
create index if not exists children_user_id_created_idx
  on public.children (user_id, created_at);

-- 2) RLS 정책 재정의 (001의 'owner only'를 대체)
--    - TO authenticated: 로그인 사용자로만 정책을 한정한다. 소유권 규칙(auth.uid() = user_id)은 동일.
--    - (select auth.uid()): 행마다 재평가 대신 statement당 1회 캐싱 → Supabase RLS 성능 권장 패턴.
drop policy if exists "owner only" on public.children;
drop policy if exists "owner can access own children" on public.children;
create policy "owner can access own children" on public.children
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 3) 최소 권한 — anon DML 회수
--    002가 403 복구를 위해 anon에도 DML을 grant했으나, children은 전적으로 로그인 사용자
--    전용이다(비로그인 흐름은 fetchProfilesFromDb에서 no-auth로 조기 반환 — DB 접근 없음).
--    (2)에서 RLS를 TO authenticated로 좁혔으므로 anon grant는 죽은 권한이자 불필요한 공격면 →
--    회수한다(실측 결과 anon에 TRUNCATE·TRIGGER·REFERENCES까지 부여돼 있어 전체 회수).
--    authenticated/service_role 권한은 유지한다(002 baseline).
revoke all on public.children from anon;
grant select, insert, update, delete on public.children to authenticated;

-- 적용:
--   supabase db push                         (프로젝트 링크 시)
--   또는 Supabase 대시보드 SQL Editor에 이 파일 내용을 붙여 실행
-- 검증(적용 후):
--   select indexname from pg_indexes where tablename='children';               -- 인덱스 존재
--   select polname, roles from pg_policies where tablename='children';         -- authenticated 스코프
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name='children';                                            -- anon 부재 확인
