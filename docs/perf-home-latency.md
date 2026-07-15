# 홈 지연 계측 (`?perf=1`)

로그인 후 home 진입 → AI 리포트가 화면에 안정될 때까지의 구간을 분해 측정하는 경량 계측. "home 뜬 뒤 AI 카드가 오래 스켈레톤"인 원인을 숫자로 가르기 위해 도입(2026-07 홈 지연 조사).

관련 코드: [`lib/perf.ts`](../lib/perf.ts), [`app/(main)/home/page.tsx`](<../app/(main)/home/page.tsx>), [`app/api/report/route.ts`](../app/api/report/route.ts), [`app/auth/landing/page.tsx`](../app/auth/landing/page.tsx)

## 켜고 끄기

- `/home?perf=1`로 진입 → 활성화(이후 세션에서 계속 유지, `localStorage["aiday:perf"]`).
- `/home?perf=0` → 해제.
- 계측이 활성이면 `/auth/landing`이 `/home?perf=1`로 이동시켜 재로그인에도 유지된다.
- **마킹 자체는 항상 수행**(오버헤드 미미)하고, 콘솔 출력만 게이팅한다.

## 어디를 보나

1. **브라우저 콘솔**(계측 활성 시) — 요청 완료마다 한 줄 요약 + `console.table`.
2. **서버 로그(Vercel)** — 리포트 요청마다 한 줄. `x-perf-id` 헤더가 붙은 계측 요청만 남으므로 일반 사용자 트래픽은 로그를 오염시키지 않는다.
3. **매칭** — 클라이언트·서버 로그 모두 `[perfId]`(8자)를 포함한다. 같은 perfId끼리 이으면 한 요청의 클라이언트/서버 타이밍을 함께 볼 수 있다.

## 클라이언트 로그 읽기

예: `[perf] home 진입 → AI 리포트 (done) [f012920c] — 총 5642ms | env_start Δ0/Σ0 · weather_ok Δ27/Σ27 · uv_ok Δ6/Σ33 · air_ok Δ4/Σ37 · pollen_ok Δ65/Σ102 · env_full_gate Δ0/Σ102 · report_fetch_start Δ27/Σ129 · report_hook Δ1847/Σ1976 · report_done Δ3666/Σ5642`

- **Δ** = 직전 마커 대비, **Σ** = 세션 시작(env_start) 대비 누적. 동시 착수한 4개 환경 API는 완료 마커의 Δ가 "완료 간격"일 뿐이므로, **응답시간에 가까운 값은 Σ**다.

| 마커 | 의미 |
|---|---|
| `env_start` | home 마운트 직후 환경 API 착수 |
| `weather_ok` / `air_ok` / `uv_ok` / `pollen_ok` | 각 환경 API 완료. 실패·타임아웃이면 `_err` / `_timeout` |
| `env_primary_gate` | weather+air 게이트 통과(화면 셸 표시 가능) |
| `env_full_gate` | uv+pollen까지 통과(AI 착수·캐시 확인 관문) |
| `report_fetch_start` | 캐시 미스 → `/api/report` 요청 착수 |
| `report_hook` | 첫 가시 콘텐츠(헤드라인) 도착, 스켈레톤 해제 |
| `report_done` | 전체 페이로드 수신·정착 |
| `cache_hit` | 당일 캐시 히트로 즉시 표시(네트워크 없음) |

**outcome**(괄호): `done` · `cache_hit` · `aborted`(취소됨) · `superseded`(더 새 요청에 밀림) · `http_<status>` · `stream_error` · `empty` · `exception`.

참고: `[perf] landing(프로필 조회 포함)→home env_start [id]: Nms` — landing 마운트~home 착수 구간(로그인 인증 왕복은 미포함).

## 서버 로그 읽기

예: `[perf/report] [f012920c] done · streamStart 7 · firstDelta 1055 · hook 1434 · done 4338ms · (firstDelta→hook 379ms) · endpoint=https://gw.letsur.ai`

- `received→streamStart` : 핸들러 진입~SDK 스트림 생성(≈0, SDK 초기화)
- `received→firstDelta` : 모델 첫 토큰까지 — **콜드스타트 이후 prefill + 게이트웨이 연결 + TTFT**
- `firstDelta→hook` : hook 문자열 생성 시간(모델 생성)
- `received→done` : 전체 생성
- `endpoint` : 실제 호출 대상(게이트웨이 경유 여부 확인)
- outcome: `done` · `client_aborted`(클라이언트 취소로 상류까지 abort) · `api_error` · `connection_error` · `config_error` · `input_error` · `build_error`

## 진단 가이드 — "5~10초"가 어디서 오나

| 관찰 | 해석 |
|---|---|
| `env_full_gate`의 Σ가 큼 | uv/pollen **콜드미스**(공공 API). 캐시·AI 착수를 둘 다 이 뒤로 미룸 |
| 클라 `report_hook` ≫ 서버 `received→hook` | 차이 = **Vercel 콜드스타트 + 네트워크** |
| 서버 `received→firstDelta`가 큼 | **게이트웨이/prefill** |
| `firstDelta→hook`가 큼 | 모델 **생성** 시간 |

> 로컬 dev는 라우트 최초 컴파일 + warm 서버 캐시가 섞여 절대값이 비대표적이다. **운영 실측은 배포 후 `/home?perf=1`을 한 번 열어** 브라우저 콘솔 + Vercel 로그를 perfId로 매칭해 읽는다.

## 조사 요약 (2026-07)

- **직렬 워터폴**: `환경 API 4개 → (uv+pollen 게이트) → 캐시 확인/AI 착수 → SSE hook`. 당일 캐시가 있어도 uv+pollen 완료 뒤에야 읽혀, 재방문자도 콜드미스 API만큼 기다린다. AI 착수도 같은 게이트 뒤.
- **게이트웨이**: 리포트는 `ANTHROPIC_BASE_URL`(gw.letsur.ai) 경유. TTFB의 상당 부분이 `received→firstDelta`.
- 이번 변경은 **계측 + 견고성 수정**(Safari 호환·stale 방어·중복 생성 취소)까지다. **워터폴 자체의 최적화**(캐시를 마운트 즉시 읽기, uv/pollen stale-while-revalidate 등)는 운영 실측으로 우선순위를 정한 뒤 진행하는 후속 과제.
