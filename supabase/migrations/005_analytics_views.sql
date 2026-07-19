-- 베타 지표 뷰 세트 (2026-07-19) — docs/beta-metrics.md 참조
--
-- 원칙:
--   1) 모든 뷰는 dev 데이터(app_version = 'dev')를 제외한다 — 로컬 개발도 같은 DB에
--      기록되므로, 이 필터가 없으면 지표가 오염된다. 필터를 뷰에 내장해 실수를 차단.
--   2) 날짜·시각은 전부 KST(Asia/Seoul) 기준.
--   3) 뷰는 분석 전용 — anon/authenticated 접근을 회수한다 (002의 default ACL이
--      새 객체에 ALL을 부여하므로 반드시 명시 회수. 뷰는 소유자 권한으로 실행되어
--      회수하지 않으면 집계가 익명 사용자에게 노출된다).

-- 1) 일일 개요 — 매일 아침 가장 먼저 보는 뷰
create or replace view public.beta_daily_overview as
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
where app_version <> 'dev'
group by 1
order by 1 desc;

-- 2) 리포트 유용성 (신규 지표) — 👍 비율과 이유 수
create or replace view public.beta_report_usefulness_daily as
select
  (created_at at time zone 'Asia/Seoul')::date as day,
  count(*) filter (where rating = 'up') as up,
  count(*) filter (where rating = 'down') as down,
  round(100.0 * count(*) filter (where rating = 'up')
        / nullif(count(*) filter (where rating is not null), 0)) as up_pct,
  count(*) filter (where message is not null) as reasons
from public.feedback
where kind = 'report' and app_version <> 'dev'
group by 1
order by 1 desc;

-- 3) 아침 재방문 (북극성 지표 2) — 사용자별 상세
--    정의: 첫 방문 후 14일 내, 아침(KST 05~10시) 방문일 3일 이상.
--    window_closed = 첫 방문 후 14일이 지나 판정이 확정된 사용자.
create or replace view public.beta_morning_revisit_users as
with visits as (
  select user_id, created_at,
         (created_at at time zone 'Asia/Seoul')::date as kst_date,
         extract(hour from created_at at time zone 'Asia/Seoul')::int as kst_hour
  from public.events
  where event = 'session_start' and user_id is not null and app_version <> 'dev'
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

-- 3b) 아침 재방문 — 요약 한 줄 (목표 ≥ 30%)
--     qualified_pct는 진행 중 참고치, qualified_pct_final(판정 확정 코호트)로 최종 판정.
create or replace view public.beta_morning_revisit as
select
  count(*) as users_total,
  count(*) filter (where qualified) as users_qualified,
  round(100.0 * count(*) filter (where qualified) / nullif(count(*), 0)) as qualified_pct,
  count(*) filter (where window_closed) as users_window_closed,
  round(100.0 * count(*) filter (where qualified and window_closed)
        / nullif(count(*) filter (where window_closed), 0)) as qualified_pct_final
from public.beta_morning_revisit_users;

-- 4) 온보딩 퍼널 (지표 1의 진단) — 단계(1~5)별 도달 세션 수와 이탈 지점
create or replace view public.beta_onboarding_funnel as
with steps as (
  select session_id,
         max((props->>'step')::int) as max_step,
         bool_or(event = 'onboarding_completed') as completed
  from public.events
  where event in ('onboarding_step', 'onboarding_completed') and app_version <> 'dev'
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

-- 4b) 온보딩 완료율 요약 (목표 ≥ 60% — 정의는 온보딩 시작 세션 대비 완료)
create or replace view public.beta_onboarding_completion as
with steps as (
  select session_id, bool_or(event = 'onboarding_completed') as completed
  from public.events
  where event in ('onboarding_step', 'onboarding_completed') and app_version <> 'dev'
  group by 1
)
select
  count(*) as started_sessions,
  count(*) filter (where completed) as completed_sessions,
  round(100.0 * count(*) filter (where completed) / nullif(count(*), 0)) as completion_pct
from steps;

-- 5) 체크리스트 인터랙션 (지표 3, 목표 ≥ 40%) — 리포트 노출 세션 중 체크 발생 비율
create or replace view public.beta_checklist_interaction_daily as
with sess as (
  select
    min((created_at at time zone 'Asia/Seoul')::date) as day,
    session_id,
    bool_or(event = 'report_viewed') as saw_report,
    bool_or(event = 'checklist_toggled') as toggled
  from public.events
  where event in ('report_viewed', 'checklist_toggled') and app_version <> 'dev'
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

-- 분석 전용 — 클라이언트 롤 접근 회수 (원칙 3)
revoke all on public.beta_daily_overview,
              public.beta_report_usefulness_daily,
              public.beta_morning_revisit_users,
              public.beta_morning_revisit,
              public.beta_onboarding_funnel,
              public.beta_onboarding_completion,
              public.beta_checklist_interaction_daily
from anon, authenticated;
