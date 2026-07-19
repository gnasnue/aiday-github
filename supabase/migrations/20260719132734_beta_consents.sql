-- 베타 참여 및 개인정보 처리 동의 이력.
-- 동의 문서 버전별로 사용자가 어떤 항목에 동의/거부했는지 보관한다.
-- 비로그인 사용자의 동의는 브라우저에만 저장하고, 로그인 후 이 테이블로 동기화한다.
create table if not exists public.user_consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  consent_type    text not null check (
    consent_type in (
      'terms_privacy',
      'beta_analytics',
      'sensitive_child_data',
      'overseas_transfer',
      'marketing'
    )
  ),
  policy_version  text not null check (char_length(policy_version) <= 32),
  agreed          boolean not null,
  agreed_at       timestamptz not null,
  source          text not null check (source in ('signup', 'onboarding', 'auth_sync')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, consent_type, policy_version)
);

create index if not exists user_consents_user_created_idx
  on public.user_consents (user_id, created_at desc);

alter table public.user_consents enable row level security;

drop policy if exists "users can read own consents" on public.user_consents;
create policy "users can read own consents" on public.user_consents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can insert own consents" on public.user_consents;
create policy "users can insert own consents" on public.user_consents
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own consents" on public.user_consents;
create policy "users can update own consents" on public.user_consents
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 002_children_grants.sql의 과거 default ACL이 새 테이블에 넓은 권한을 줄 수 있으므로
-- 명시적으로 회수한 뒤 앱에 필요한 최소 권한만 부여한다.
revoke all on public.user_consents from anon, authenticated;
grant select, insert, update on public.user_consents to authenticated;
