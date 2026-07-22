-- Supabase 보안 어드바이저 경고 대응 (2026-07-22)
--
-- 1) public.rls_auto_enable() — SECURITY DEFINER 함수가 anon·authenticated에 노출
--    Postgres는 새 함수에 EXECUTE 권한을 PUBLIC에 기본 부여하고(현재 proacl NULL,
--    즉 명시적 GRANT 없이 기본값 상태), 린터는 이를 공개 RPC로 간주해 경고한다.
--
--    실제 조사 결과 이 함수는 `returns event_trigger` 이며 이벤트 트리거
--    `ensure_rls`에 연결되어, public 스키마에 CREATE TABLE이 실행될 때마다
--    해당 테이블에 RLS를 자동으로 켜 주는 안전장치다. 반환 타입이 event_trigger인
--    함수는 이벤트 트리거로만 호출될 수 있어 RPC로는 실행되지 않는다.
--    따라서 경고는 린터의 보수적 휴리스틱에 가깝다.
--
--    다만 회수해도 잃는 것이 없다. 이벤트 트리거는 EXECUTE 권한과 무관하게
--    소유자(postgres) 권한으로 발화하므로 ensure_rls 동작은 그대로 유지되고,
--    앱 코드에도 .rpc() 호출이 한 곳도 없다. 경고를 없애고 노출면을 줄인다.
--    lint: 0028_anon_security_definer_function_executable
--
-- 2) public.set_updated_at() — search_path 미설정
--    search_path가 고정되지 않으면 호출자가 조작한 스키마의 객체로 해석될 수 있다.
--    lint: 0011_function_search_path_mutable
--
-- 참고: public.report_usage의 "RLS Enabled No Policy"(INFO)는 의도된 상태다.
--       클라이언트 접근을 전면 차단하고 service_role로만 접근하므로 건드리지 않는다.

-- ---------------------------------------------------------------------------
-- 1) rls_auto_enable 실행 권한 회수
-- ---------------------------------------------------------------------------
-- 이 함수와 ensure_rls 이벤트 트리거는 리포지토리 마이그레이션이 만든 객체가
-- 아니다(대시보드/도구에서 생성). 따라서 마이그레이션만으로 재구축한 DB에는
-- 존재하지 않을 수 있어, 존재할 때만 처리하고 오버로드 시그니처도 함께 훑는다.
do $$
declare
  fn record;
  found_any boolean := false;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
  loop
    found_any := true;
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    raise notice 'rls_auto_enable: 실행 권한 회수 완료 — %', fn.sig;
  end loop;

  if not found_any then
    raise notice 'rls_auto_enable: 대상 함수 없음 — 건너뜀';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) set_updated_at search_path 고정
-- ---------------------------------------------------------------------------
-- 본문이 now()와 NEW 레코드 필드만 쓴다(001_children.sql). now()는 pg_catalog
-- 소속이라 search_path가 비어 있어도 항상 해석되므로, public을 남기지 않고
-- 빈 문자열로 고정하는 편이 더 엄격하며 동작에는 영향이 없다.
alter function public.set_updated_at() set search_path = '';
