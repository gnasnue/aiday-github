-- 알림장 루프 계측 이벤트 화이트리스트 확장 (2026-07-29)
--
-- 배경: `events.event`는 006_analytics_hardening.sql의 CHECK 제약으로 고정된 화이트리스트다.
-- `lib/analytics.ts`의 AnalyticsEvent 유니온에만 추가하면 INSERT가 **조용히 실패**한다
-- (fire-and-forget 설계라 사용자에겐 아무 영향이 없고, 그래서 더 늦게 발견된다).
--
-- 추가하는 6개는 승인 설계안(kathe-feat-pass-monthly-me-design-20260729)의 측정 도구다.
-- 이 기능의 P0 목적은 기능 완성이 아니라 **행동률 측정**이므로, 이벤트가 안 들어가면
-- 기능 자체의 존재 이유가 사라진다:
--   · noteboard_shown      저녁 카드 노출 = 사용률의 분모
--   · noteboard_submitted  붙여넣고 생성 누름 = 분자(핵심 행동)
--   · noteboard_generated  생성 성공 (분자 대비 성공률 = 신뢰성)
--   · noteboard_error      실패 감시
--   · noteboard_shared     대화 거리 공유·복사 = 실제 효용 신호
--   · morning_message_copied  아침 메시지 복사 = C 루프 사용률
--
-- ⚠️ `lib/analytics.ts`의 유니온과 1:1로 유지한다. 한쪽만 바뀌면 계측이 조용히 끊긴다.
alter table public.events drop constraint if exists events_event_whitelist;
alter table public.events add constraint events_event_whitelist check (event in (
  'session_start', 'page_view', 'signup_completed',
  'onboarding_step', 'onboarding_completed',
  'report_viewed', 'report_refreshed', 'report_error', 'checklist_toggled',
  -- 알림장 루프 (2026-07-29)
  'noteboard_shown', 'noteboard_submitted', 'noteboard_generated',
  'noteboard_error', 'noteboard_shared', 'morning_message_copied'
));
