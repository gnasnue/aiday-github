-- 베타 테스트 행동 계측: events(행동 로그) + feedback(의견·리포트 평가) (2026-07-19)
--
-- 설계 원칙:
--   1) append-only — 클라이언트는 INSERT만 가능, SELECT/UPDATE/DELETE 불가.
--      분석은 Supabase SQL Editor/MCP(소유자 권한)에서만 수행한다.
--   2) 민감정보 배제 — 아이 이름·건강정보는 저장하지 않는다. props에는 연령군(1-2/3-6/7-8)
--      같은 비식별 값만 넣는다 (lib/analytics.ts에서 강제).
--   3) 게스트 허용 — "먼저 둘러볼게요" 흐름도 계측해야 하므로 anon insert를 허용하되
--      user_id는 null로만 (본인 사칭 방지). 남용 방어는 길이/크기 check 제약으로 최소화.
--   4) 002에서 복구한 default ACL이 새 테이블에 ALL을 부여하므로,
--      최소 권한 원칙에 따라 revoke 후 insert만 재부여한다 (003과 같은 원칙).

-- 1) events — 행동 이벤트 로그
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  -- 탈퇴 시 행동 로그는 익명화 보존(set null) — 지표 집계 연속성 유지.
  -- 개인정보처리방침에 "행동 로그는 탈퇴 시 비식별화" 명시 필요.
  user_id     uuid references auth.users(id) on delete set null,
  session_id  text not null check (char_length(session_id) <= 64),
  event       text not null check (char_length(event) <= 64),
  props       jsonb not null default '{}' check (pg_column_size(props) <= 2048),
  path        text check (char_length(path) <= 200),
  app_version text check (char_length(app_version) <= 64),
  created_at  timestamptz not null default now()
);

-- 지표 집계용 인덱스: 기간 스캔 + 이벤트별 집계 (베타 규모에선 과하지 않게 2개만)
create index if not exists events_created_idx on public.events (created_at);
create index if not exists events_event_created_idx on public.events (event, created_at);

alter table public.events enable row level security;

-- INSERT만 허용. 로그인 사용자는 본인 user_id로만, 게스트는 user_id null로만.
drop policy if exists "authenticated insert own events" on public.events;
create policy "authenticated insert own events" on public.events
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "anon insert null-user events" on public.events;
create policy "anon insert null-user events" on public.events
  for insert to anon
  with check (user_id is null);

revoke all on public.events from anon, authenticated;
grant insert on public.events to anon, authenticated;

-- 2) feedback — 리포트 유용성 평가(👍/👎) + 자유 의견
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  -- 자유 텍스트에 개인정보가 섞일 수 있으므로 탈퇴 시 함께 삭제(cascade)
  user_id     uuid references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('report', 'general')),
  rating      text check (rating in ('up', 'down')),
  message     text check (char_length(message) <= 2000),
  path        text check (char_length(path) <= 200),
  props       jsonb not null default '{}' check (pg_column_size(props) <= 2048),
  app_version text check (char_length(app_version) <= 64),
  created_at  timestamptz not null default now(),
  -- 평가(rating) 또는 내용(message) 중 하나는 있어야 빈 행 적재를 막는다
  constraint feedback_has_content check (rating is not null or message is not null)
);

create index if not exists feedback_created_idx on public.feedback (created_at);

alter table public.feedback enable row level security;

drop policy if exists "authenticated insert own feedback" on public.feedback;
create policy "authenticated insert own feedback" on public.feedback
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "anon insert null-user feedback" on public.feedback;
create policy "anon insert null-user feedback" on public.feedback
  for insert to anon
  with check (user_id is null);

revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to anon, authenticated;

-- 검증(적용 후):
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name in ('events','feedback') and grantee in ('anon','authenticated');
--     → INSERT만 나와야 함
--   select polname, roles, cmd from pg_policies where tablename in ('events','feedback');
