-- 베타 계측 하드닝 (2026-07-19) — 프리랜딩 리뷰(보안·데이터·성능 스페셜리스트) 반영
--
-- 004/005는 이미 프로덕션 적용 상태라 수정하지 않고 이 마이그레이션으로 보강한다.
--   1) 컬럼 단위 INSERT grant — created_at/id 클라이언트 위조 차단 (아침 재방문 지표 조작 방어)
--   2) 이벤트명 화이트리스트 CHECK — lib/analytics.ts의 AnalyticsEvent 유니온과 동기화.
--      (새 이벤트 추가 시 유니온과 이 제약을 함께 갱신할 것)
--   3) FK 인덱스 — 탈퇴(auth.users 삭제) 시 events/feedback 순차 스캔 방지
--   4) 뷰 재생성: onboarding_step 캐스트 가드(중독 방어) + app_version 비교를
--      is distinct from으로(NULL 침묵 누락 방지) + security_invoker(권한 누출 심층 방어)
--   5) revoke 재실행 — create or replace/재생성 시 002 default ACL이 ALL을 재부여하는 함정 대응.
--      ⚠️ 이후 뷰를 DROP+CREATE 하는 마이그레이션은 반드시 revoke 블록을 함께 재실행할 것.

-- 1) 컬럼 단위 INSERT grant (id·created_at은 서버 default 강제)
revoke insert on public.events from anon, authenticated;
grant insert (user_id, session_id, event, props, path, app_version)
  on public.events to anon, authenticated;

revoke insert on public.feedback from anon, authenticated;
grant insert (user_id, kind, rating, message, path, props, app_version)
  on public.feedback to anon, authenticated;

-- 2) 이벤트명 화이트리스트 — lib/analytics.ts AnalyticsEvent 유니온과 1:1
alter table public.events drop constraint if exists events_event_whitelist;
alter table public.events add constraint events_event_whitelist check (event in (
  'session_start', 'page_view', 'signup_completed',
  'onboarding_step', 'onboarding_completed',
  'report_viewed', 'report_refreshed', 'report_error', 'checklist_toggled'
));

-- 3) FK 인덱스 (탈퇴 시 SET NULL/CASCADE 스캔 + user_id 집계 지원)
create index if not exists events_user_id_idx on public.events (user_id) where user_id is not null;
create index if not exists feedback_user_id_idx on public.feedback (user_id) where user_id is not null;

-- 4) 뷰 재생성 — 변경점: is distinct from 'dev', step 캐스트 가드, security_invoker
create or replace view public.beta_daily_overview
  with (security_invoker = on) as
select
  (created_at at time zone 'Asia/Seoul')::date as day,
  count(distinct session_id) filter (where event = 'session_start') as sessions,
  count(distinct user_id) filter (where event = 'session_start') as users,
  count(distinct session_id) filter (where event = 'session_start' and user_id is null) as guest_sessions,
  count(*) filter (where event = 'signup_completed') as signups,
  count(*) filter (where event = 'report_viewed') as report_views,
  count(*) filter (where event = 'report_error') as report_errors,
  count(*) filter (where event = 'checklist_toggled') as checklist_toggles
from public.events
where app_version is distinct from 'dev'
group by 1
order by 1 desc;

create or replace view public.beta_report_usefulness_daily
  with (security_invoker = on) as
select
  (created_at at time zone 'Asia/Seoul')::date as day,
  count(*) filter (where rating = 'up') as up,
  count(*) filter (where rating = 'down') as down,
  round(100.0 * count(*) filter (where rating = 'up')
        / nullif(count(*) filter (where rating is not null), 0)) as up_pct,
  count(*) filter (where message is not null) as reasons
from public.feedback
where kind = 'report' and app_version is distinct from 'dev'
group by 1
order by 1 desc;

create or replace view public.beta_morning_revisit_users
  with (security_invoker = on) as
with visits as (
  select user_id, created_at,
         (created_at at time zone 'Asia/Seoul')::date as kst_date,
         extract(hour from created_at at time zone 'Asia/Seoul')::int as kst_hour
  from public.events
  where event = 'session_start' and user_id is not null
    and app_version is distinct from 'dev'
),
firsts as (
  select user_id, min(created_at) as first_at from visits group by 1
),
agg as (
  select f.user_id, f.first_at,
         count(distinct v.kst_date) filter (
           where v.kst_hour >= 5 and v.kst_hour < 10
             and v.created_at < f.first_at + interval '14 days'
         ) as morning_days_14d
  from firsts f
  join visits v using (user_id)
  group by 1, 2
)
select
  user_id,
  (first_at at time zone 'Asia/Seoul')::date as first_day,
  morning_days_14d,
  morning_days_14d >= 3 as qualified,
  first_at + interval '14 days' <= now() as window_closed
from agg;

create or replace view public.beta_morning_revisit
  with (security_invoker = on) as
select
  count(*) as users_total,
  count(*) filter (where qualified) as users_qualified,
  round(100.0 * count(*) filter (where qualified) / nullif(count(*), 0)) as qualified_pct,
  count(*) filter (where window_closed) as users_window_closed,
  round(100.0 * count(*) filter (where qualified and window_closed)
        / nullif(count(*) filter (where window_closed), 0)) as qualified_pct_final
from public.beta_morning_revisit_users;

-- step 캐스트 가드: 클라이언트가 조작 가능한 props를 직접 ::int 하지 않는다 —
-- 비숫자 step 한 건이 뷰 전체를 조회 불능으로 만드는 중독 벡터 차단 (1~2자리만 유효).
-- generate_series(1, 5)의 5는 app/onboarding/page.tsx의 TOTAL(현 5단계)과 동기화 필요.
create or replace view public.beta_onboarding_funnel
  with (security_invoker = on) as
with steps as (
  select session_id,
         max(case when props->>'step' ~ '^[0-9]{1,2}$'
                  then (props->>'step')::int end) as max_step,
         bool_or(event = 'onboarding_completed') as completed
  from public.events
  where event in ('onboarding_step', 'onboarding_completed')
    and app_version is distinct from 'dev'
  group by 1
)
select
  n.step,
  count(*) filter (where s.max_step >= n.step or s.completed) as sessions_reached,
  round(100.0 * count(*) filter (where s.max_step >= n.step or s.completed)
        / nullif(count(*), 0)) as pct
from steps s
cross join generate_series(1, 5) as n(step)
group by n.step
order by n.step;

create or replace view public.beta_onboarding_completion
  with (security_invoker = on) as
with steps as (
  select session_id, bool_or(event = 'onboarding_completed') as completed
  from public.events
  where event in ('onboarding_step', 'onboarding_completed')
    and app_version is distinct from 'dev'
  group by 1
)
select
  count(*) as started_sessions,
  count(*) filter (where completed) as completed_sessions,
  round(100.0 * count(*) filter (where completed) / nullif(count(*), 0)) as completion_pct
from steps;

create or replace view public.beta_checklist_interaction_daily
  with (security_invoker = on) as
with sess as (
  select
    min((created_at at time zone 'Asia/Seoul')::date) as day,
    session_id,
    bool_or(event = 'report_viewed') as saw_report,
    bool_or(event = 'checklist_toggled') as toggled
  from public.events
  where event in ('report_viewed', 'checklist_toggled')
    and app_version is distinct from 'dev'
  group by session_id
)
select
  day,
  count(*) filter (where saw_report) as report_sessions,
  count(*) filter (where saw_report and toggled) as interacted_sessions,
  round(100.0 * count(*) filter (where saw_report and toggled)
        / nullif(count(*) filter (where saw_report), 0)) as interaction_pct
from sess
group by 1
order by 1 desc;

-- 5) revoke 재실행 (default ACL 재부여 함정 대응)
revoke all on public.beta_daily_overview,
              public.beta_report_usefulness_daily,
              public.beta_morning_revisit_users,
              public.beta_morning_revisit,
              public.beta_onboarding_funnel,
              public.beta_onboarding_completion,
              public.beta_checklist_interaction_daily
from anon, authenticated;

-- 주의: security_invoker=on이므로 뷰 조회는 호출자 권한으로 events/feedback RLS를 탄다.
-- 분석은 종전대로 SQL Editor/MCP(소유자 — RLS 미적용)에서 수행하면 동일하게 동작한다.
