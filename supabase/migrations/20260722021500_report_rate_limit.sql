-- /api/report 레이트리밋 (2026-07-22) — 출시 차단 항목 "공개 엔드포인트 보호"
--
-- 인증 없이 열려 있는 /api/report는 호출당 Claude 비용이 발생한다. 결정 문서 3-1에 따라
-- 게스트 호출은 계속 허용하되(둘러보기 = 핵심 가치 시연) 상한을 둔다.
--   · 게스트: IP 기준 일 10회   · 로그인 사용자: user_id 기준 일 20회
-- 로그인 사용자를 별도 버킷으로 두는 이유 — 사무실·공용 와이파이(CGNAT)에서 여러 가구가
-- 같은 IP를 쓸 때 서로의 한도를 잡아먹는 오탐을 막는다.
--
-- 개인정보: IP 원문은 저장하지 않는다. 서버가 솔트를 섞어 해시한 값만 버킷 키로 쓴다
-- (lib/rate-limit.ts). 따라서 이 테이블만으로는 특정 IP를 역추적할 수 없다.

create table if not exists public.report_usage (
  bucket text not null,             -- 'u:<user_id>' 또는 'ip:<salted sha256>'
  day date not null,                -- KST 기준 날짜 (앱 전역 관례)
  count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket, day)
);

-- 오래된 행 정리용. 행 수는 (고유 IP·사용자) × 일수라 베타 규모에선 미미하지만,
-- 나중에 cron으로 `delete from report_usage where day < current_date - 30`을 돌릴 때 쓴다.
create index if not exists report_usage_day_idx on public.report_usage (day);

-- 클라이언트는 이 테이블에 어떤 경로로도 접근할 수 없다. RLS를 켜고 정책을 두지 않으며,
-- 002의 default ACL이 새 테이블에 ALL을 재부여하는 함정이 있으므로 revoke를 명시한다.
alter table public.report_usage enable row level security;
revoke all on public.report_usage from public, anon, authenticated;

-- 원자적 증가 + 판정을 한 번의 왕복으로. 홈 리포트는 지연에 민감해 조회·갱신을 나누지 않는다.
-- 한도를 넘은 호출도 계속 증가시킨다 — 차단 상태가 그대로 유지돼야 하기 때문.
create or replace function public.bump_report_usage(p_bucket text, p_day date, p_limit int)
returns table (usage_count int, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.report_usage as u (bucket, day, count)
  values (p_bucket, p_day, 1)
  on conflict (bucket, day) do update
    set count = u.count + 1, updated_at = now()
  returning u.count into v_count;

  return query select v_count, v_count <= p_limit;
end;
$$;

-- security definer 함수는 실행 권한을 좁히지 않으면 우회 경로가 된다. anon/authenticated가
-- 임의 버킷 키로 직접 호출해 남의 한도를 소진시키는 그리핑을 막기 위해 service_role만 허용한다.
revoke all on function public.bump_report_usage(text, date, int) from public, anon, authenticated;
grant execute on function public.bump_report_usage(text, date, int) to service_role;
