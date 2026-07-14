# D2 설계안 — 이력·시계열 레이어 (리포트 영속화 + 환경 스냅샷)

- 상태: Design (구현 전)
- 작성일: 2026-07-14
- 스코프: AI 리포트·환경 데이터의 DB 영속화, 이를 통한 히스토리/추이 기반과 캐시 재설계
- 관련: [app/api/report/route.ts](../../../app/api/report/route.ts), [app/(main)/home/page.tsx](../../../app/(main)/home/page.tsx), DB 스키마 점검 D2

---

## 1. 배경 — 왜 필요한가

제품 정체성은 "**매일 반복하는** 육아 의사결정의 첫 판단 지원"이다. 그런데 매일 생성되는 판단(AI 리포트)과 그 근거(환경 데이터)가 **어디에도 남지 않는다.**

### 현재 상태

- AI 리포트는 `POST /api/report` → Claude 호출로 매번 생성되고, [home/page.tsx:263](../../../app/(main)/home/page.tsx)에서 **localStorage에 5분 TTL**로만 캐시된다: 키 `aiday:report:v9:${childId}:${today}`.
- 환경 데이터(weather·air)도 클라이언트 메모리/로컬에만 머문다.
- DB에는 `children`(프로필)만 있다.

### 이로 인한 문제

1. **이력 부재.** "지난주보다 미세먼지가 나빠졌어요", "요즘 자외선 추이" 같은 시계열 인사이트가 원천적으로 불가능. 어제 리포트조차 다시 볼 수 없다.
2. **비용·지연.** 5분 TTL이라 하루에도 같은 아이 리포트를 여러 번 Claude로 재생성한다(캐시 만료·기기 전환·localStorage 소실 시마다). forecast 기반 리포트는 사실상 하루 한 번이면 충분한데 과생성한다.
3. **기기 간 단절.** localStorage 기반이라 다른 기기·재로그인 시 오늘 리포트가 사라진다(프로필은 DB 복원되지만 리포트는 안 됨).

---

## 2. 설계 원칙

1. **DB를 하루치 정본(定本) 캐시로.** 리포트는 (아이 × 날짜 × 스키마버전)당 하나의 정본을 DB에 둔다. localStorage는 그 앞단의 빠른 레이어로 격하.
2. **근거를 함께 저장.** 리포트만이 아니라 그날의 환경 스냅샷(weather+air 입력)을 같이 남긴다 → 재현성 + 추이 기반.
3. **점진 도입.** v1은 "리포트+환경 영속화와 캐시 재설계"까지. 추이 UI·전용 환경 시계열 테이블은 phase 2로 분리.
4. **소유권은 RLS로.** 모든 이력 테이블은 `children`과 동일한 owner-scoped RLS(`TO authenticated` + `(select auth.uid()) = user_id`).

---

## 3. 스키마 설계

### 3.1 `daily_reports` (v1 핵심)

```sql
-- 004_daily_reports.sql
create table if not exists public.daily_reports (
  id             uuid primary key default gen_random_uuid(),
  child_id       uuid not null references public.children(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade, -- RLS·조회용 비정규화
  report_date    date not null,                 -- KST 기준 날짜
  schema_version int  not null default 10,       -- 리포트 페이로드 스키마 버전(캐시 키와 동기)
  model          text,                           -- 생성 모델(claude-sonnet-5 등)
  payload        jsonb not null,                 -- { hook, message, checklist[], prep{} }
  env_snapshot   jsonb,                          -- 생성 근거: { weather{…}, air{…} }
  created_at     timestamptz not null default now(),
  -- 아이·날짜·스키마당 정본 1건
  unique (child_id, report_date, schema_version)
);

create index if not exists daily_reports_child_date_idx
  on public.daily_reports (child_id, report_date desc);

alter table public.daily_reports enable row level security;

create policy "owner can access own reports" on public.daily_reports
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.daily_reports to authenticated;
```

설계 근거:
- `unique (child_id, report_date, schema_version)` → 하루 정본 1건. 스키마가 바뀌면 새 버전으로 공존(구 캐시 자동 분리).
- `user_id` 비정규화: RLS를 `children` 조인 없이 단순화(정책 성능·명확성). `child_id`의 `children`도 같은 소유자이므로 무결성은 앱/트리거로 보장.
- `env_snapshot`은 jsonb로 통째 저장(v1). 필드 단위 쿼리가 필요해지면 phase 2에서 분해.
- `payload` 스키마는 리포트 응답과 동일: `{ hook, message, checklist: string[], prep: Record<slot,string[]> }`.

### 3.2 (phase 2) `env_snapshots` — 환경 전용 시계열

리포트와 무관하게 환경 추이를 그리려면(리포트 미생성일도 포함) 별도 테이블이 낫다. v1에서는 `daily_reports.env_snapshot`으로 충분하므로 **후속**으로 둔다.

```sql
-- (phase 2 초안) 지역·시각 단위 환경 관측 스냅샷
create table public.env_snapshots (
  id uuid primary key default gen_random_uuid(),
  region text not null,           -- 관측 지역(사용자 위치)
  observed_at timestamptz not null,
  weather jsonb, air jsonb, pollen jsonb, uv jsonb,
  created_at timestamptz default now(),
  unique (region, observed_at)
);
-- 지역 단위 공용 데이터 → RLS는 읽기 전용 공개 or 서버 롤 전용(결정 필요)
```
> 미결정: `env_snapshots`는 사용자별이 아니라 지역별 공용 데이터라 RLS 모델이 다르다(읽기 공개 vs 서버 전용 기록). phase 2 착수 시 별도 설계.

---

## 4. 캐시·데이터 흐름 재설계

### 현재
```
home 진입 → localStorage(5분) 히트? → 예: 사용 / 아니오: POST /api/report(Claude) → localStorage 기록
```

### 신규 (3단 캐시: 메모리 localStorage → DB → Claude)
```
home 진입
  1) localStorage 히트(짧은 TTL, 오프라인/즉시성)?  → 사용
  2) DB daily_reports (child, today, v10) 히트?      → 사용 + localStorage 미러
  3) 미스 → POST /api/report(Claude) → payload 수신
        → daily_reports UPSERT (onConflict: child_id,report_date,schema_version)
        → localStorage 미러
```

- **쓰기 위치**: v1은 **클라이언트에서** 기록한다. 리포트 수신 후 기존 브라우저 supabase 클라이언트로 `daily_reports.upsert(...)`. RLS가 소유권을 강제하므로 안전하고, `/api/report` 라우트(현재 무인증·body 기반)를 건드리지 않아 변경이 작다.
- **TTL 의미 변경**: forecast 기반 리포트는 하루 정본이 기본. "새로고침" 액션은 같은 (child,date,v)로 UPSERT 덮어쓰기 + `created_at` 갱신. localStorage TTL(현 5분)은 그대로 두되 그 뒤에 DB 레이어가 받쳐 Claude 재호출을 막는다.
- **효과**: 아이당 하루 Claude 호출 **최대 1회**로 수렴(현재는 5분마다 가능) → 비용·지연 대폭 감소.

---

## 5. 이력 기반이 여는 것 (제품 가치)

- **어제/지난 리포트 다시 보기**: `select payload, report_date from daily_reports where child_id=? order by report_date desc limit 30`.
- **환경 추이**: `env_snapshot->'air'->>'pm25'`를 날짜축으로 → "이번 주 미세먼지 추이" 카드.
- **반복 판단 근거**: "3일 연속 건조" 같은 누적 신호로 알림·추천 고도화(추천 엔진 입력 확장).

> 이 UI들은 D2 스키마 위에서 **후속 기능**으로 얹는다. 본 설계는 그 데이터 기반을 만드는 데까지.

---

## 6. 영향 범위 (수정 파일)

| 파일 | 변경 |
|------|------|
| `supabase/migrations/004_daily_reports.sql` | **신규** — 테이블·인덱스·RLS·GRANT |
| `lib/reports-history.ts` | **신규** — `saveDailyReport()`, `fetchDailyReport(childId,date)`, `fetchReportHistory(childId,limit)` (supabase 래퍼) |
| `app/(main)/home/page.tsx` | fetchReport 흐름에 DB 조회(2단)·기록(3단) 삽입. 캐시 키 `v9`→`v10` |
| `app/api/report/route.ts` | (선택) 응답에 `model`·`schemaVersion` 메타 포함해 클라이언트가 그대로 저장하게 |

- **`/api/report` 서버 쓰기 대안(미채택, phase 2 검토)**: 라우트에서 서버 supabase 클라이언트 + 세션으로 직접 기록. 신뢰성↑이나 인증 배선 추가 필요 → v1은 클라이언트 기록으로 시작.

---

## 7. 리스크 & 결정 필요

- **KST 날짜 경계**: `report_date`는 KST 자정 기준으로 계산해야 한다(서버 UTC 주의). 클라이언트 기록이면 브라우저 로컬 날짜를 쓰되 KST 고정 변환 유틸을 둔다.
- **스키마 버전 동기화**: `schema_version`(DB)과 localStorage 캐시 키 버전을 **한 상수**로 묶어 불일치를 막는다(예: `lib/reports-history.ts`의 `REPORT_SCHEMA_VERSION` export).
- **비정규화 무결성**: `daily_reports.user_id`가 `children.user_id`와 항상 일치해야 한다. 클라이언트 기록 시 현재 세션 uid로 채우고, RLS `with check`가 타 사용자 위조를 차단한다. (엄격히 하려면 트리거로 `child_id` 소유자와 대조 — phase 2.)
- **보존 정책**: 무한 누적 방지. 90일 초과 리포트 정리(cron/pg_cron)는 후속.
- **범위 판단**: v1만으로도 "이력 존재 + 비용 절감"이라는 실익이 즉시 난다. 추이 UI·env_snapshots·서버 기록은 명시적으로 phase 2로 미룬다.

---

## 8. 작업 순서 (구현 착수 시)

1. 마이그레이션 004 작성 → 로컬 적용 → `daily_reports` 조회/삽입 스모크 테스트
2. `lib/reports-history.ts` 래퍼 작성(+ `REPORT_SCHEMA_VERSION` 단일 상수)
3. home fetchReport 3단 캐시로 재배선, 캐시 키 v10
4. dev 서버로 검증: 첫 진입(Claude 호출·DB 기록) → 재진입(DB 히트, Claude 미호출) → 네트워크 탭으로 확인
5. (선택) 어제 리포트 보기 등 히스토리 UI는 별도 기능으로 분리
