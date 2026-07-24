# 감염병(유행병) 지침 팁 — Layer 1 구현 계획

상태: **계획 확정(구현 미착수)** · 작성 2026-07-24 · `/plan-eng-review` 산출물
스코프: **Layer 1(런타임 콘텐츠 모델)만.** 자동 수집(KDCA 보도자료 폴링→초안 PR)은 별도 스코프로 미룸.

## 문제

`/tips`는 오늘 환경(자외선·미세먼지·꽃가루·건조·폭염·한파) × 아이 프로필로 사람이 검증한 정적 팁을 고른다. 하지만 **역학 신호(유행병)** 는 환경과 성격이 다르고 지금 표현할 방법이 없다. 질병관리청 보도자료에 영유아·어린이 대상 유행병(수족구·독감·백일해 등) 경보가 나오면, 그 지침을 팁으로 보여줄 수 있어야 한다.

## 절대 원칙(불변)

사실·인용은 **사람이 원문 확인 후** 넣는다. 런타임 LLM 생성 금지. 이번 스코프는 **수동 작성**만이며, 이미 있는 `draft` 플래그(미검증은 dev에서만 렌더)를 안전장치로 재사용한다.

## 데이터 흐름

```
content.ts TIP_ENTRIES
  └─ 감염병 항목: category:"감염병", requires:null,
                  activeUntil:"YYYY-MM-DD"(필수), draft:true(검증 전)
        │
        ▼
select.ts selectTips (매 렌더 클라이언트 재계산, 페이로드 캐시 없음)
  ├─ [기존] draft 게이트  ── dev 아니면 skip
  ├─ [기존] activeMonths 게이트
  ├─ [신규] activeUntil 게이트 ── 파싱 실패 or KST 만료 지남 → skip (fail-closed)
  └─ requires==null → 상시 노출 (단, 위 게이트 통과분만)
        │
        ▼
page.tsx  CATEGORY_ICON["감염병"] · 하단 "가이드 기준" 자동 집계
          (감염병 음성 배너 없음 — "유행 없음"을 암시하지 않는다)
```

## 확정된 설계 결정 (리뷰)

| # | 결정 | 근거 |
|---|------|------|
| D3 | `activeUntil` 만료 경계 = **KST 마지막날 포함**. 당일 23:59 KST까지 노출, 익일 00:00 KST 만료. | `feels-like.ts`의 `new Date(Date.now()+9h)` KST 보정 관례와 일치. "마지막 날까지" 직관. |
| D4/D6 | 결측·오타 `activeUntil` = **fail-closed(숨김)** + 무결성 테스트가 감염병 항목의 `activeUntil` 존재·**실제 달력 날짜** 검증. | select.ts fail-closed 철학. 정규식만으론 `2026-02-30` 통과 → 실제 날짜 검증까지. 판별 유니온은 얕은 스코프에 과함. |
| D5 | Layer 1은 **얕게** 짓고 자동화를 다음 우선순위로. | 적시성이 진짜 가치. Layer 1은 자동화의 필수 기반이자, 수족구·독감 등 몇 주짜리 유행엔 머지 지연도 허용됨. |

## activeUntil 만료 판정 (구현 스케치)

```
// KST 자정 경계. feels-like.ts와 동일한 KST 보정 관례 사용.
// activeUntil "YYYY-MM-DD" 를 KST 익일 00:00로 해석 → 그 이전이면 활성.
const isExpired = (activeUntil, now) => {
  const [y,m,d] = activeUntil.split("-").map(Number);
  // 실제 달력 날짜 검증 (2026-02-30 등 가짜 차단): 되돌린 값이 일치해야 함
  const probe = new Date(Date.UTC(y, m-1, d));
  if (probe.getUTCFullYear()!==y || probe.getUTCMonth()!==m-1 || probe.getUTCDate()!==d)
    return true;                    // 파싱/달력 실패 → 만료로 간주(fail-closed)
  const kstNow = new Date(now.getTime() + 9*60*60*1000);
  const kstToday = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate());
  const expiryDay = Date.UTC(y, m-1, d);
  return kstToday > expiryDay;      // 만료일 당일까지 활성, 익일부터 만료
};
```
게이트는 `draft`/`activeMonths`와 같은 위치(루프 최상단, `requires==null` 분기 앞)에 둔다 — 그래야 상시 팁이라도 만료된다.

## 침묵 시맨틱 (아웃사이드 보이스 #1 — 요구사항)

환경 신호는 `calmSignals`로 "확인했지만 괜찮다"를 말할 수 있지만, 감염병은 폴링을 안 하므로 **"활성 유행 없음"을 주장할 자격이 없다.** 따라서:
- 감염병 팁이 0개일 때 **어떤 음성/안심 배너도 띄우지 않는다.** 침묵은 "확인 안 함"이지 "유행 없음"이 아니다.
- 화면 카피 어디에도 "유행병 없음/안전" 류 완전성 암시 금지.

## 출처 제약 (아웃사이드 보이스 #6 — 요구사항)

- 감염병 팁 출처 `org`는 **질병관리청(또는 국가건강정보포털)** 로 제약.
- 무결성 테스트: 모든 `category:"감염병"` 항목의 `sources[].org`가 질병관리청 계열인지 검증.

## 테스트 커버리지

```
[+] lib/tips/select.ts — selectTips activeUntil 게이트
  ├── [GAP→작성] 만료 전(activeUntil 미래): 감염병 팁 노출
  ├── [GAP→작성] 만료 후(activeUntil 과거): 숨김
  ├── [GAP→작성] KST 경계일: activeUntil 당일 23:59 노출 / 익일 00:00 숨김
  ├── [GAP→작성] activeUntil 결측: 숨김(fail-closed)
  ├── [GAP→작성] activeUntil 오타/가짜날짜(2026-02-30): 숨김(fail-closed)
  └── [GAP→작성] 감염병 팁도 profileFlag 매칭 시 심각도 상승(해당 시)

[+] lib/tips/select.test.ts — 콘텐츠 무결성
  ├── [GAP→작성] 감염병 항목은 activeUntil 존재 + 실제 달력 날짜
  └── [GAP→작성] 감염병 항목 출처 org = 질병관리청 계열

COVERAGE 목표: 신규 코드패스 100%
```

## 실패 모드

| 코드패스 | 실패 시나리오 | 테스트 | 에러처리 | 사용자 체감 |
|----------|--------------|--------|----------|-------------|
| activeUntil 파싱 | 오타·가짜날짜 | 있음(작성) | fail-closed 숨김 | 팁 안 보임(안전 측) |
| 만료 판정 | KST 경계 오차 | 있음(작성) | KST 보정 | 하루 늦거나 이르지 않음 |
| 상시+만료 상호작용 | requires:null이 게이트 우회 | 있음(작성) | 게이트를 분기 앞에 배치 | 만료 팁 잔존 방지 |

**critical gap 없음** — 모든 신규 패스에 테스트 + fail-closed 에러처리 + 조용한 실패가 안전 방향.

## What already exists (재사용)

- `draft` 플래그 + dev-only 게이팅 → 미검증 초안 안전 작성에 그대로 재사용.
- `activeMonths` 게이트 → `activeUntil`은 같은 패턴의 형제(1회성 만료).
- 무결성 테스트 스위트(출처 규율) → 감염병 항목 검증 규칙만 추가.
- `page.tsx` CATEGORY_ICON·"가이드 기준" 자동 집계 → 아이콘 1개만 추가.

## NOT in scope (명시적 보류)

- **자동 수집 파이프라인** 전체(KDCA 게시판 폴링·HTML 파싱·아동 관련성 분류·자동 PR·스케줄 태스크) — Layer 2, 별도 스코프. 적시성의 핵심이나 기반(Layer 1) 검증 후 착수.
- **활성 기간 유지 리마인더** — `activeUntil`이 다가오면 재검토를 알리는 CI/스케줄 알림. (아웃사이드 보이스 #2: 종료일은 미리 모르므로 수동 갱신 필요 → 자동화와 함께 다룸.)
- **판별 유니온 타입 리팩터** — 컴파일러 강제(D6에서 테스트+런타임으로 대체).
- **캐시 키 갱신** — 불필요. tips 선택은 클라 useMemo 재계산이라 팁 출력 페이로드 캐시 없음(확인 완료).

## Implementation Tasks

- [ ] **T1 (P1, human: ~40min / CC: ~10min)** — lib/tips — `activeUntil` 게이트 + KST 만료 판정 + 달력 검증
  - Surfaced by: Architecture(D3) + Code Quality(D4/D6)
  - Files: `lib/tips/content.ts`(TipEntry에 `activeUntil?`), `lib/tips/select.ts`(게이트+`isExpired`)
  - Verify: 신규 유닛 테스트(만료 전/후/KST 경계/결측/가짜날짜)
- [ ] **T2 (P1, human: ~20min / CC: ~5min)** — content — `감염병` 카테고리 + 아이콘 + 무결성 테스트
  - Surfaced by: Architecture, 출처 제약(#6)
  - Files: `lib/tips/content.ts`(TipCategory), `app/(main)/tips/page.tsx`(CATEGORY_ICON), `lib/tips/select.test.ts`(activeUntil 존재·달력·출처 org 검증)
  - Verify: `npm test`
- [ ] **T3 (P2, human: ~15min / CC: ~5min)** — UX — 감염병 음성 배너 금지 확인 + 예시 draft 항목 1개
  - Surfaced by: 침묵 시맨틱(#1)
  - Files: `app/(main)/tips/page.tsx`(배너 로직 점검), `lib/tips/content.ts`(draft 예시)
  - Verify: dev 렌더 + 0개일 때 배너 없음 확인

## 병렬화

Sequential implementation, no parallelization opportunity — 전부 `lib/tips` + 단일 페이지를 건드림.

## Layer 2 — 자동화 검토 결론 (보류, 2026-07-24)

Layer 1 배포(#160) 후 Layer 2(자동 감시)를 `/plan-eng-review`로 검토한 결과 **지금 짓지 않기로 결정**했다. 나중에 재탐색하지 않도록 이유를 남긴다.

**검토한 두 접근:**
- **B) KDCA 보도자료 스크래핑 + LLM 아동필터 + 자동 PR + 스케줄 태스크** — 질병관리청 보도자료는 깨끗한 실시간 API/RSS가 없어 HTML 스크래핑 필요(정부 사이트 개편에 취약), 새 서비스 3개+·운영 부담 큼.
- **A) 질병관리청 표본감시 OPEN API를 env-style 런타임 신호로 붙이고 큐레이션 팁을 연령별 임계값으로 게이팅** — 스크래핑·자동PR·스케줄 제거. 처음엔 유력해 보였으나 아웃사이드 보이스가 근본 결함을 드러냄.

**A를 접은 이유 (아웃사이드 보이스, 검증됨):**
1. **적시성 모순** — 표본감시는 주 단위·1~2주 지연 발표. "지금 유행" 신호를 뒤늦은 데이터로 만드는 셈이라, Layer 2를 정당화하던 적시성 논리와 정면 충돌.
2. **"env 패턴 재사용"은 거짓** — 표본감시는 (질병별 × 연령별) 임계값 + 새 데이터 소스 + 신호 자체의 연령 파라미터화 필요. env 신호(단일 스칼라·flat enum·나이는 심각도만 조정)와 다른 종류.
3. **activeUntil 게이트 충돌** — Layer 1은 activeUntil 없는 감염병 팁을 fail-closed로 숨기고 테스트가 강제. 표본감시 게이팅 팁은 자연스러운 activeUntil이 없어 두 층이 싸움.
4. 질병별 지표 비대칭(독감=의사환자분율 유행기준 / 수족구=천분율 추세 / RSV=병원체 감시, 다른 API), 히스테리시스 부재(주간 데이터 flapping), 지역 입도 불일치(전국 vs 아이 지역), 캐시 주기 상이(주간 → 장기 서버캐시, env 핫패스 금지).

**결정 근거:** 이미 배포된 **수동 Layer 1이 A보다 더 적시적이고 단순**하다 — 사람이 유행 보도를 본 날 draft로 팁을 올리고 activeUntil을 정확히 지정, KDCA 원문으로 검증 후 머지. 자동화는 이보다 나은지 불확실하고 복잡도만 크다.

**재검토 트리거(re-open criteria):** "수동 작성이 실사용에서 유의미하게 느리다/누락된다"는 근거가 쌓이면 그때 자동화를 재검토한다. 그 경우에도 접근 A의 4개 결함(적시성·신호형태·게이트충돌·지표비대칭)을 먼저 해소해야 한다.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | out of credits (both runs) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | no_build | R1: Layer 1 (구현·배포 #160). R2: Layer 2 자동화 검토 → 보류 결정 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE VOICE (R2):** Codex out of credits → Claude subagent. 표본감시 접근 A의 8개 결함 제시. #1(적시성 모순)·#2(env 패턴 아님)·#3(activeUntil 충돌)이 load-bearing.
- **CROSS-MODEL (R2):** 리뷰는 "표본감시 A가 스크래핑 B보다 단순·견고"라 판단했으나, 아웃사이드 보이스가 "A는 지연·복잡·게이트충돌로 수동 Layer 1보다 나을 게 없다"고 반박 → 사용자 결정 **B(지금 안 짓기)** 로 수렴.
- **VERDICT:** NO-BUILD — Layer 2 자동화 보류. 수동 Layer 1(배포 완료)이 현 시점 정답. 재검토 트리거는 위 참조.

NO UNRESOLVED DECISIONS
