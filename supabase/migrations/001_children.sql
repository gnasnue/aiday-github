-- 아이 프로필 테이블
create table if not exists public.children (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  emoji       text not null default '🙂',
  gender      text check (gender in ('male', 'female', 'unknown')) default 'unknown',
  birth_year  int,
  birth_month int,
  birth_day   int,
  conditions  text[] default '{}',
  condition_etc text,
  cold_sensitivity  text,
  hot_sensitivity   text,
  sweat_level       text,
  schedule    jsonb default '{}',
  notif       jsonb default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 사용자는 자신의 아이 프로필만 접근 가능
alter table public.children enable row level security;

create policy "owner only" on public.children
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger children_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();
