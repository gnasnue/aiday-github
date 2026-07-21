# 웹 푸시 알림 구현 계획안 (Web Push Notifications)

> 웹앱(PWA)에서 유저에게 매일 아침 케어 리포트 알림을 보내기 위한 구현 계획.
> iOS 대응을 1차 기준으로 하되 코드는 안드로이드/데스크톱과 공통.
> 상태: **계획(pre-implementation)** — §6 결정 항목 확정 후 M1부터 착수.

## 0. 배경

- 현재 아이데이는 Next.js 15 웹앱/PWA. `app/manifest.ts`에 `display: "standalone"` manifest가 이미 있어 **iOS 웹 푸시 전제조건은 충족**.
- 서비스워커·푸시 관련 코드는 전무(web-push/firebase 등 의존성 0).
- `children` 테이블에 이미 `notif jsonb` 컬럼 존재 → 알림 on/off·시간 설정 슬롯으로 활용 가능.
- Supabase 클라이언트는 현재 브라우저 전용(`createBrowserClient`) → 서버 발송용 클라이언트 신규 필요.
- 스케줄은 repo 외부 Claude 스케줄 태스크(07시 env-accuracy)가 이미 존재.

### iOS 위젯은 왜 계획에서 제외되나
iOS 홈 화면 위젯은 WidgetKit(Swift/SwiftUI) 네이티브 전용으로, 웹앱/PWA로는 불가능하다.
위젯은 네이티브 앱(Capacitor 등 래퍼 + Widget Extension) 단계의 로드맵으로 분리하고,
PWA 단계에서는 **웹 푸시를 위젯의 현실적 대체재**로 삼는다.

## 1. 전체 아키텍처 & 데이터 흐름

```
[유저 기기 · iOS Safari PWA]
   ① 홈 화면에 추가(설치)  →  standalone 실행
   ② 설정에서 "알림 받기" 탭  →  Notification.requestPermission()
   ③ 서비스워커가 PushManager.subscribe(VAPID 공개키)
        └─ 구독 객체(endpoint, keys) 생성
   ④ POST /api/push/subscribe  →  Supabase에 구독 저장
                                          │
[서버 · Next.js Route + Supabase]         ▼
   ⑤ 매일 07시 스케줄러 트리거            push_subscriptions
        └─ 대상 유저의 리포트 요약 생성        (user_id, endpoint, keys…)
        └─ web-push 라이브러리로 발송  ──────┐
                                             │  (VAPID 서명 + 암호화)
[Apple Push Service (APNs 경유)]  ◀──────────┘
        └─ 기기의 서비스워커로 push 이벤트 전달
   ⑥ sw.js self.addEventListener('push') → showNotification()
   ⑦ 유저가 탭 → notificationclick → 앱(/home) 열기
```

## 2. iOS 작동 원리 & 제약 (가장 중요)

| 항목 | 내용 |
|------|------|
| **최소 버전** | iOS **16.4+** (2023.3). 이하 기기는 불가 → 폴백 UI 필요 |
| **설치 필수** | **홈 화면에 추가한 PWA(standalone)에서만** 작동. Safari 탭 상태면 권한 요청 자체가 불가 |
| **유저 제스처 필수** | `requestPermission()`은 **버튼 탭 등 사용자 액션 안에서만** 호출 가능(페이지 로드 시 자동 호출 불가) |
| **standalone 감지** | `window.matchMedia('(display-mode: standalone)').matches` 또는 `navigator.standalone`로 설치 여부 판별해 UI 분기 |
| **발송 경로** | 개발자는 표준 Web Push(VAPID)만 다루면 됨. Apple이 내부적으로 APNs로 중계 — 별도 APNs 인증서·앱스토어 불필요 |
| **아이콘/배지** | `showNotification`의 icon/badge 지정. badge는 단색 실루엣 PNG 권장 |

> iOS 대응의 핵심은 "**설치 안내 → 설치 감지 → 제스처 기반 권한요청**" 3단계 UX.
> 기술보다 이 흐름의 완성도가 성패를 가른다.

## 3. 구현 컴포넌트 (파일 단위)

**A. 서비스워커** — `public/sw.js` (신규)
- `push` 이벤트 → `showNotification(title, { body, icon, data:{url} })`
- `notificationclick` → 열린 탭 있으면 focus, 없으면 `/home` 오픈
- 최소 로직만. manifest는 이미 있으므로 next-pwa/serwist 도입은 오버 — **수동 sw.js가 가볍고 명확**

**B. 등록 & 권한 UI** — `app/(main)/me/` 내 알림 설정 섹션 + `lib/push/client.ts`
- 설치 여부·iOS 버전·권한 상태 감지 → 상태별 안내(미설치면 "홈 화면에 추가" 가이드)
- "알림 받기" 토글 → `registerServiceWorker()` → `subscribe()` → `/api/push/subscribe`
- 해제 토글 → `unsubscribe()` + `/api/push/unsubscribe`
- **DESIGN.md 준수**(구현 전 확인)

**C. Supabase 스키마** — `supabase/migrations/007_push_subscriptions.sql` (신규)
```sql
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz default now()
);
-- RLS: 본인 것만 (children 패턴과 동일)
```
- 알림 on/off·시간대는 **기존 `children.notif` jsonb** 활용(예: `{ enabled: true, time: "07:00" }`)

**D. 서버 API** (신규)
- `app/api/push/subscribe/route.ts` — 구독 upsert(endpoint unique)
- `app/api/push/unsubscribe/route.ts` — 삭제
- `lib/supabase-server.ts` (신규) — **서비스 롤 키** 서버 클라이언트(발송 시 전체 구독 조회용)

**E. 발송 로직** — `lib/push/send.ts` + `app/api/push/dispatch/route.ts` (신규)
- `web-push` 라이브러리(신규 의존성) + VAPID 키로 서명·발송
- 리포트 요약 문구 생성(기존 `/api/report` 로직 재사용 or 경량 요약)
- **410/404 응답 구독은 자동 정리**(만료 구독 삭제)
- dispatch 라우트는 `CRON_SECRET` 헤더로 보호

**F. 스케줄러** — 두 옵션(§6에서 결정)
- **옵션1 Vercel Cron** — `vercel.json`에 `0 22 * * *`(UTC=KST 07시) → `/api/push/dispatch` 호출. 표준적·자체완결
- **옵션2 기존 Claude 스케줄 태스크** — env-accuracy처럼 repo 외부에서 dispatch 호출. 인프라 추가 없음

**G. 환경변수** — `.env.example` 추가
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
SUPABASE_SERVICE_ROLE_KEY=...   # 서버 발송용
CRON_SECRET=...                 # dispatch 보호
```

## 4. 유저 경험 플로우

```
me 화면 진입
 ├─ iOS<16.4      → "이 기기는 미지원, 이메일 알림은 어때요?" (폴백)
 ├─ 미설치        → "① 공유 → ② 홈 화면에 추가" 일러스트 가이드
 └─ 설치됨        → [알림 받기] 토글
                      ├─ 권한 허용 → 구독 저장 → "매일 아침 7시 알려드려요" ✅
                      └─ 거부       → "iOS 설정 > 알림에서 켤 수 있어요" 안내
```

## 5. 마일스톤 (단계별 배포 가능)

| 단계 | 범위 | 산출물 |
|------|------|--------|
| **M1** 기반 | sw.js + manifest 검증 + 권한요청 UI + 구독 저장(마이그레이션·subscribe API) | "구독까지" 동작 |
| **M2** 발송 | web-push + dispatch API + 수동 테스트 발송 | 버튼으로 나에게 테스트 푸시 |
| **M3** 자동화 | 스케줄러 연결 + 07시 리포트 요약 발송 + 만료 정리 | 매일 자동 알림 |
| **M4** 폴리싱 | iOS 버전/설치 폴백 UX + notif 설정(시간·on/off) + DESIGN.md QA | 출시 품질 |

## 6. 결정이 필요한 항목 (구현 착수 전)

1. **스케줄러**: Vercel Cron vs 기존 Claude 스케줄 태스크
2. **발송 내용**: 매일 리포트 요약(개인화, Claude 호출 비용↑) vs 고정 문구("오늘 리포트 준비됐어요", 저비용)
3. **범위**: iOS만 우선 vs 안드로이드/데스크톱도 함께(코드는 거의 공통이라 함께 권장)
4. **PWA 라이브러리**: 수동 sw.js(추천) vs serwist 도입

## 7. 리스크 & 유의점

- **도달률**: iOS는 설치 유저에게만 도달 → 알림 가치 제안을 온보딩에서 명확히 전달해야 구독 전환율 확보.
- **비용**: 개인화 발송 시 유저 수 × Claude 호출. M3에서 고정 문구로 시작해 비용 검증 후 개인화 확대 권장.
- **캐시 키**: 발송 페이로드 스키마 변경 시 관련 캐시 키 버전 관리(CLAUDE.md 컨벤션).
- **권한 재요청 불가**: iOS는 거부 후 앱 내 재요청 불가 → 최초 권한 요청 타이밍(가치 인지 후)이 중요.
- **보안**: 서비스 롤 키·VAPID 개인키·CRON_SECRET는 서버 전용 환경변수로만 관리.

## 8. 다음 단계 (Next step)

> **권장: 구현 착수 전 `/plan-eng-review`로 아키텍처를 먼저 검증한다.**
> §6의 결정 항목(스케줄러, 발송 내용, 범위, PWA 라이브러리)과 §3의 파일 단위 설계,
> §7의 리스크를 엔지니어링 리뷰로 점검한 뒤 M1부터 착수할 것.
> 스코프·우선순위가 불확실하면 `/plan-ceo-review`를 먼저 돌려도 된다.
