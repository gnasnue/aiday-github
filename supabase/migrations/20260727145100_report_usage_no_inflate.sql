-- report_usage: 한도를 넘긴 요청은 카운터를 더 부풀리지 않는다 (2026-07-27)
--
-- 종전 함수는 차단된 호출도 계속 +1 했다("차단 상태가 유지돼야 하기 때문"). 그런데 차단
-- 유지에 증가는 필요하지 않다 — count가 한도를 넘긴 사실만 남아 있으면 판정은 그대로 false다.
-- 반면 부작용이 실제로 있었다: 홈 폴백 카드가 "AI 판단 다시 받기"를 계속 노출해, 429를 받은
-- 사용자가 누를 때마다 카운터만 올랐다(2026-07-27 실사용: 한도 20인데 count 34 — 초과 14회가
-- 전부 이미 막힌 재시도였다). 숫자가 부풀면 "정상 사용량이 한도를 넘겼나"라는 진단이 불가능해진다.
--
-- 그래서 상한을 p_limit + 1로 고정한다. 넘겼다는 사실은 남고(allowed=false 고정), 그 이상
-- 오르지 않으므로 count는 "그날 실제 생성 시도 횟수"로 계속 읽힌다.
--   · count 1..p_limit        → allowed=true  (정상 생성)
--   · count = p_limit + 1     → allowed=false (한도 초과 — 이 값에서 멈춘다)
-- 시그니처는 그대로다(lib/rate-limit.ts 호출부 변경 없음).
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
    -- 이미 한도를 넘긴 버킷은 그 값에서 멈춘다. `> p_limit`이지 `>= p_limit`가 아니다 —
    -- count = p_limit는 아직 허용 구간이라 다음 호출이 p_limit + 1로 올라가 차단돼야 한다.
    set count = case when u.count > p_limit then u.count else u.count + 1 end,
        updated_at = now()
  returning u.count into v_count;

  return query select v_count, v_count <= p_limit;
end;
$$;

revoke all on function public.bump_report_usage(text, date, int) from public, anon, authenticated;
grant execute on function public.bump_report_usage(text, date, int) to service_role;
