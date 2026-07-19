# 베타 지표 — 무엇이 쌓이고, 어떻게 보는가

베타 테스트(2026-07-20~)의 행동 계측과 지표 조회 방법. 계측 코드는 `lib/analytics.ts`,
스키마는 `supabase/migrations/004_analytics.sql`, 지표 뷰는 `005_analytics_views.sql`.

## 무엇이 쌓이나

| 테이블 | 내용 | 쓰는 쪽 |
|--------|------|---------|
| `events` | 행동 이벤트 9종 (아래) | `lib/analytics.ts`의 `track()` — 클라이언트가 직접 INSERT |
| `feedback` | 리포트 👍/👎·이유(`kind='report'`), 자유 의견(`kind='general'`) | `ReportFeedback`(홈 리포트 하단)·`FeedbackDialog`(마이페이지) |

이벤트: `session_start`(탭 세션당 1회) · `page_view` · `signup_completed` ·
`onboarding_step` · `onboarding_completed` · `report_viewed`(연령군·캐시·지연) ·
`report_refreshed` · `report_error` · `checklist_toggled`

공통 컬럼: `user_id`(게스트는 null), `session_id`, `path`, `app_version`, `created_at`.
**아이 이름·건강정보는 절대 저장하지 않는다** — 연령군(`age_band`: 1-2/3-6/7-8)만 허용.

## 지표 뷰 — SQL 복붙 없이 한 줄로

Supabase SQL Editor(또는 Claude에게 "오늘 지표 보여줘")에서:

| 뷰 | 지표 | 목표 | 읽는 법 |
|----|------|------|---------|
| `beta_daily_overview` | 일일 개요 | — | 매일 아침 첫 확인: 세션·가입·리포트·**report_errors**(0이어야 정상) |
| `beta_morning_revisit` | ⭐ 아침 재방문 (북극성) | ≥ 30% | `qualified_pct_final`(14일 창 닫힌 코호트)로 최종 판정. `qualified_pct`는 진행 참고치 |
| `beta_morning_revisit_users` | 〃 사용자별 상세 | — | 누가 습관이 붙었는지 개별 확인 (컨시어지 규모에선 이게 더 유용) |
| `beta_onboarding_completion` | 온보딩 완료율 | ≥ 60% | 온보딩 시작 세션 대비 완료 |
| `beta_onboarding_funnel` | 〃 단계별 이탈 | — | 1~5단계 도달률 — 어느 단계에서 새는지 |
| `beta_report_usefulness_daily` | 리포트 유용성 (신규) | 관찰 | `up_pct`와 `reasons`(이유 텍스트 수). 원문은 `feedback` 직접 조회 |
| `beta_checklist_interaction_daily` | 체크리스트 인터랙션 | ≥ 40% | 리포트 노출 세션 중 체크 발생 비율 |

의견 원문 읽기(매일):

```sql
select created_at, kind, rating, message, props->>'age_band' as age_band
from feedback
where app_version <> 'dev' and message is not null
order by created_at desc;
```

## 꼭 지킬 것

1. **ad-hoc 쿼리에는 반드시 `app_version <> 'dev'`** — 로컬 개발 트래픽도 같은 DB에
   쌓인다. 위 뷰들에는 이 필터가 내장되어 있으므로 뷰를 우선 사용.
2. **뷰 정의를 바꾸면 마이그레이션 파일로** — 대시보드에서 직접 고치면 리포지토리와
   어긋난다. `005_analytics_views.sql` 수정 → 재적용.
3. **events/feedback은 클라이언트에서 INSERT만 가능** (RLS + GRANT). SELECT는
   SQL Editor/MCP(소유자)에서만. `beta_*` 뷰도 클라이언트 롤 접근 회수 상태 —
   되돌리지 말 것.
4. **새 이벤트 추가 시** `lib/analytics.ts`의 `AnalyticsEvent` 유니온에 먼저 추가하고,
   이 문서의 이벤트 목록도 갱신.

## 해석 시 유의 (계측의 한계)

- `signup_completed`는 **이메일 가입만** 집계 — Google OAuth는 콜백에서 가입/로그인
  구분이 안 됨. 베타 참가자 명단과 `auth.users`를 대조해 보정.
- 게스트 행동은 `user_id`가 null — 아침 재방문(로그인 사용자 기준)에는 안 잡힌다.
- `session_start`는 탭 세션 단위(sessionStorage) — 같은 날 탭을 여러 개 열면 세션 수는
  늘지만, 아침 재방문은 "방문일" 기준이라 영향 없다.
- dev 환경 Strict Mode에서 `page_view`가 이중 기록될 수 있으나 프로덕션에는 없음.

## 매일 아침 루틴 (10분)

1. `beta_daily_overview` — 어제 방문·오류 확인. `report_errors > 0`이면 즉시 원인 조사
   (베타에서 리포트가 이틀 깨지면 습관 형성 검증 자체가 오염된다).
2. `beta_report_usefulness_daily` + 의견 원문 쿼리 — 👎와 이유를 단톡방 질문으로 연결.
3. 주 1회: `beta_onboarding_funnel`·`beta_checklist_interaction_daily`·
   `beta_morning_revisit_users` 리뷰.

베타 종료(14일) 시 `beta_morning_revisit.qualified_pct_final`을 목표치(30%)와 대조해
docs/reviews/에 판정 문서를 남긴다. 목표치 정의는
[PRODUCT-DECISIONS.md](./PRODUCT-DECISIONS.md) §1.
