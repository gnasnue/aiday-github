-- 당일 AI 리포트 서버 저장소 (2026-07-27) — 홈 히어로가 기기별로 폴백에 추락하던 결함의 수정
--
-- 배경: 리포트 캐시가 브라우저 localStorage 전용이었다. 그래서 같은 사용자가 폰으로 들어오면
-- PC에서 아침에 만든 리포트가 없는 것과 같고(저장소가 분리), 하루 생성 한도(report_usage)를
-- 소진한 뒤에는 **캐시 없는 기기에서 히어로가 반드시 규칙 폴백("기본 추천")으로 추락**했다.
-- 서비스의 첫 화면이자 핵심 표면이 "그날 두 번째 기기"라는 흔한 조건에서 깨지던 구조.
--
-- 이 테이블은 그 캐시를 서버로 올린 것이다 — 하루 한 아이당 한 건. 조회는 Claude 호출도,
-- 한도 소진도 아니다(생성만 비용이다). 따라서:
--   · 기기·브라우저를 바꿔도 오늘의 판단은 하나로 같다 (제품 의도: "오늘의 리포트"는 하루 1건)
--   · 한도를 소진해도 당일 리포트는 계속 보인다 — 한도는 "새로 쓰기"만 막는다
--
-- 신선도 판정(env_sig·profile_sig·generated_at)은 클라이언트가 localStorage 캐시에 쓰는 것과
-- 같은 값·같은 규칙이다(app/(main)/home/page.tsx). 서버 캐시는 로컬 캐시의 교차기기 사본이며,
-- 새로운 신선도 의미를 만들지 않는다 — 판정이 두 갈래가 되면 그게 다음 버그가 된다.
create table if not exists public.daily_reports (
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- children.id(uuid) 또는 게스트 시절 로컬 프로필 id를 그대로 받으므로 text.
  -- children FK를 걸지 않는 이유: 로컬 전용 프로필도 로그인 후 같은 키로 조회돼야 한다.
  child_id    text not null,
  day         date not null,               -- 기기 로컬 기준 YYYY-MM-DD (lib/date.ts localDateStr)
  -- 페이로드 스키마 버전(로컬 캐시 키의 `v27`과 같은 값). 프롬프트·페이로드 규격이 바뀌면
  -- 이 값이 올라가고, 클라이언트는 현재 버전이 아닌 행을 무시한다 — 로컬 캐시 키에만 버전을
  -- 두고 서버 행에 두지 않으면, 규격 변경 당일 구형 리포트가 서버에서 되살아난다.
  cache_version text not null default '',
  hook        text not null default '',
  message     text not null,
  checklist   text[] not null default '{}',
  env_sig     text not null default '',    -- 생성 시점 환경 스냅샷 서명 (급변 감지)
  profile_sig text not null default '',    -- 생성 시점 판단 입력 서명 (체질·일과 변경 감지)
  generated_at timestamptz not null default now(),
  primary key (user_id, child_id, day)
);

-- 사용자는 자신의 리포트만 접근 가능. children과 같은 패턴(003_children_hardening):
-- TO authenticated로 한정하고 (select auth.uid())로 statement당 1회 평가한다.
alter table public.daily_reports enable row level security;

drop policy if exists "owner can access own daily reports" on public.daily_reports;
create policy "owner can access own daily reports" on public.daily_reports
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 최소 권한 — 로그인 사용자 전용이다(게스트는 localStorage만 쓴다).
-- 002의 default ACL이 새 테이블에 ALL을 재부여하는 함정이 있어 anon 회수를 명시한다.
revoke all on public.daily_reports from anon, public;
grant select, insert, update, delete on public.daily_reports to authenticated;

-- 보존 정리용(나중에 `delete from daily_reports where day < current_date - 30` cron).
create index if not exists daily_reports_day_idx on public.daily_reports (day);

-- 적용:
--   supabase db push   또는 Supabase 대시보드 SQL Editor
-- 검증(적용 후):
--   select polname, roles from pg_policies where tablename='daily_reports';
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name='daily_reports';   -- anon 부재 확인
