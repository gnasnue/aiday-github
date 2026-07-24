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

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | out of credits |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_resolved | scope reduced to Layer 1; 2 arch/quality issues folded; 2 cross-model tensions resolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE VOICE:** Codex out of credits → Claude subagent ran. Surfaced 8 points; #5(전략)·#3/#4(타입·검증) resolved via D5/D6; #1(침묵)·#6(출처)·#7(캐시) folded as plan requirements; #2(activeUntil 유지 리마인더) deferred to automation scope.
- **CROSS-MODEL:** 2 tensions. #5 scope (review: Layer 1 first / outside voice: automation is the value) → resolved A (Layer 1 shallow + automation next). #3 enforcement (review: test / outside voice: type union) → resolved A (test+runtime+calendar-validation).
- **VERDICT:** ENG CLEARED (SCOPE_REDUCED) — ready to implement Layer 1. 구현 미착수 상태로 계획만 확정.

NO UNRESOLVED DECISIONS
