-- children 테이블 REST 접근이 403으로 실패하던 문제 복구.
-- anon/authenticated/service_role의 테이블 DML 권한(SELECT/INSERT/UPDATE/DELETE)이
-- 회수돼 있어 PostgREST 요청이 전부 permission denied(403)였다. 그 결과 온보딩
-- DB 저장이 조용히 실패하고, 로그인 후 홈이 로컬 fallback(데모 프로필)을 표시했다.
-- RLS 정책('owner only')은 그대로 유지되므로 실제 행 접근은 여전히
-- auth.uid() = user_id 로만 제한된다 (권한 복구가 데이터 노출로 이어지지 않는다).
grant select, insert, update, delete on public.children
  to anon, authenticated, service_role;

-- public 스키마의 postgres 기본 권한(default ACL)도 같이 오염돼 있어
-- 이후 postgres로 생성하는 새 테이블도 같은 403이 재발한다. 표준 baseline 복구.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
