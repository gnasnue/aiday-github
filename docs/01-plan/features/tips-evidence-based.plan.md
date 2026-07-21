# 건강팁(근거 기반) 구현 계획안 (Evidence-Based Health Tips)

> tips 화면(`/tips`)을 공신력 있는 기관의 리포트·가이드라인·공지에 **실제로 근거한** 콘텐츠로 재구현하기 위한 계획.
> 상태: **계획(pre-implementation)** — 2026-07-22 `/plan-eng-review` + `/plan-ceo-review`(HOLD SCOPE) 통과. **M2가 MVP 출시 단위**로 재스코핑됨(§6). M3/M4/개인화 확대는 도메인 전문가 검토 + 법률 검토 게이팅. **M2는 [PRODUCT-DECISIONS.md](../../../docs/PRODUCT-DECISIONS.md) 출시 차단(Blocker)으로 공식 등재됨** — 블로커 #42(홈 목데이터 차단)와 동일 종류의 신뢰 위반이라 공개 베타 전 완료 필수.

## 0. 배경 — 왜 지금 재구현하는가

현재 `app/(main)/tips/page.tsx`는 "대학병원·의료학회·보건복지부 등 의학적 근거 기반"이라 선언하지만, 그 약속을 세 곳에서 배신한다.

1. **환경 데이터가 목데이터.** 파일 상단 `env = { uv: 7, pm10: 62, ... }`가 하드코딩 → 홈·env·outfit이 실 API를 쓰는 것과 달리 tips만 오늘 실제 조건과 무관한 고정 팁을 노출.
2. **출처가 기관 홈페이지 링크뿐.** `대한피부과학회 — 자외선차단제 가이드 → derma.or.kr` 는 기관 존재만 증명하고 **그 문서를 가리키지 않음.**
3. **콘텐츠가 컴포넌트 인라인 + 프로필 매칭 자체 구현.** `conds.some(c => c.includes("호흡기"))` 는 `lib/domain/child-conditions.ts`가 없애려 만든 바로 그 버그 패턴(데모/구형 프로필의 짧은 문자열 "비염"을 놓침).

## 1. 핵심 원칙 (절대 흔들리지 않는 것)

- **팩트와 인용은 런타임 생성 금지.** LLM은 초안·톤 다듬기까지만. 사실 주장과 출처는 authoring 시점에 사람이 검증한다.
- **출처는 홈페이지가 아니라 문서를 이름으로 특정한다.** 딥링크가 있으면 딥링크, 없으면 정직하게 `문서명 + 연도 + 안정적 랜딩(홈페이지)` + `retrievedDate`. (§7 D6 — 한국 학회 딥링크는 태반이 회원전용·회전 CMS라 강제 불가)
- **저작권·비승인 고지:** 원문 복제 금지. 요약·의역 + 원문 링크아웃만. 근접 의역으로 기관 실명 옆에 내 문구를 붙이면 "학회가 내 문구를 승인"한 것처럼 보이므로, 출처 표기에 **"기관 원문 요약이며 표현은 아이데이 작성"** 취지의 비승인 고지를 둔다.
- **의료 경계 유지(MANIFESTO §3):** 진단·처방이 아니라 공인 기관 일반 가이드의 요약. 지시적 의료조언(약물 선복용 등)은 톤다운 + 면책 강화.

## 2. 인용 출처 방식 결정 (설계의 핵심 갈림길)

| 안 | 방식 | 판정 |
|---|---|---|
| A. LLM 런타임 생성 | Claude가 팁+출처 즉석 생성 | ❌ 가짜 인용 위험. "근거 기반"과 정면충돌 |
| B. RAG(실문서 임베딩·검색) | 기관 PDF 수집·청킹·검색 | 인프라 무겁고 원문 복제 저작권 리스크. MVP 과잉 |
| **C. 큐레이션 인용-고정 콘텐츠 DB** | 검증된 실문서를 구조화 데이터로 보관, 규칙으로 선별 | ✅ **채택** |

## 3. 아키텍처 — 3계층

### ① 콘텐츠 계층 (지식 베이스) — 레포 내 파일
`lib/tips/content/*.ts` (버전관리·PR 리뷰).

```ts
type TipSource = {
  org: string;         // "대한소아알레르기호흡기학회"
  docTitle: string;    // "「소아 천식 진료지침」" — 문서를 특정
  url: string;         // 딥링크가 있으면 딥링크, 없으면 안정적 랜딩
  pubYear: number;     // 2023
  retrievedDate: string; // "2026-07-22" — 링크·내용 확인 시점
};
```

**선언적 임계값 테이블 채택** (D9): per-entry `trigger()` 클로저 대신 `{category, thresholds, severityBy, profileFlag, summary, recommendations, sources}` 형태의 **선언적 데이터 테이블** + 제네릭 셀렉터. 5장 규모엔 클로저가 과설계이고, 데이터 테이블이 향후 도메인 전문가 감사에 훨씬 쉽다.

### ② 선별 엔진 (순수 함수, vitest 대상) — `lib/tips/select.ts`
`selectTips(env, profile): Tip[]`
- **목데이터 제거.** 실 환경 데이터는 **공유 헬퍼 `lib/env-data.ts` `fetchEnvData(location)`**에서 받는다 (D-A1). 이 헬퍼가 위치→파라미터 매핑·타임아웃·KMA 센티널(±900) 검증을 **한 곳에** 담당. tips가 첫 소비자, home/env/outfit은 후속 이전(비차단).
- **심각도는 공인 등급 공유 소스에서 도출** (D-A2): air 등급(1~4)·UV 표준 밴드·`pollenLabel`·앱 건조 임계값(35%). 자체 숫자 cutoff 금지 → env/home과 화면 간 모순 제거.
  - ※ PM2.5 특이 메시징 보존(D10): 미세먼지 콘텐츠는 `max(pm10Grade,pm25Grade)`로 뭉개지 말고 PM2.5 등급을 별도로 참조(폐포·혈관 침투 문구의 근거).
- **프로필 매칭은 `lib/domain/child-conditions.ts` 공유** — 인라인 재구현 제거, 3중 정렬 상속.
- **나이 게이팅 연결**(D11): 마스크 권고는 정적 "만 2세 이상" 텍스트가 아니라 `canRecommendMask(ageInMonths(...))`로 아이 나이에 반응(24개월 미만 → 마스크 대신 외출 자제). AI 리포트·prep과 동일 규칙.
- **fail-closed**(D-C1): 특정 환경 신호가 결측/에러면 그 신호 조건부 팁은 **미노출**, 항상 팁(일반 위생)만 + "환경 데이터를 못 불러와 일반 가이드만 표시" 정직한 안내. 데이터 부재를 그럴듯한 오답으로 표시하지 않는다.
- **요청 취소·프로필 전환 레이스 방지**(D-CEO4, CEO 리뷰 Section 4): 프로필 전환 시 이전 fetch가 늦게 도착해 다른 아이의 tips가 잘못 표시되지 않도록, `fetchEnvData` 호출에 `AbortController` + 세대(generation) 카운터를 적용 — 응답 도착 시점 활성 프로필/세대가 요청 시점과 다르면 결과를 버린다. 화면 이탈(unmount) 시에도 동일 abort. 홈의 `AbortSignal.timeout` 패턴과 정합.
- **fail-closed 관측 이벤트**(D-CEO8, CEO 리뷰 Section 8): fail-closed가 실제로 얼마나 자주 발동하는지(=사용자가 "일반 카드만" 보는 빈도) 알 수 있도록, 발동 시 기존 `events`/`feedback` 자체 계측(§1 성공지표와 동일 인프라)에 경량 이벤트(`tips_fail_closed`, 결측 신호명 포함)를 기록한다. 신규 인프라 없이 기존 계측 확장.

### ③ 프레젠테이션 — 현재 카드 UI 유지
- 현 카드 레이아웃 유지. 출처 렌더링을 `org + 「문서명」 + 연도`로 격상 + 비승인 고지.
- 상시 '일반 위생' 카드는 **계절 중립 문구로 수정**(D7): 하드코딩 "환절기 손씻기" 제거, 언제나 맞는 위생(손씻기·수면·예방접종) 프레이밍.
- 면책 고지·카테고리 필터·프로필 배너 유지. DESIGN.md v3(상태 배지 solid 금지·상태색 틴트) 준수.
- `sevIconBox`/`sevBadge` 중복 함수 제거(동일 반환).

## 4. 신뢰·유지보수 장치 (재스코핑 반영)

- **[후속·게이팅]** 자동 출처 검증 스크립트 `scripts/verify-tips-sources.mjs` — 링크 404/리다이렉트를 리포트. ⚠️ **한계 명시**: 링크 **생존**만 검사하고 **내용 충실성(가이드라인 개정 드리프트)은 못 본다.** URL이 200이어도 원문이 개정되면 요약이 최신 합의와 어긋날 수 있음 → `retrievedDate` 기반 **6개월 재검토 주기**를 사람이 도는 것으로 보완. 이 재검토가 진짜 안전장치이며, 자동 스크립트의 초록불을 "검증됨"으로 오인하지 않는다.
- **LLM 인용 생성 금지를 코드/리뷰 규칙으로 고정.**

## 5. authoring/검증 주체 결정

- **MVP(M2): 엔지니어 큐레이션 + 정직한 "문서명+연도" 출처.**
- **게이팅(M3 이후 착수 전 필수):** ① 소아과/피부과 등 **도메인 전문가 내용 검토 루프**, ② 지시적 의료조언·"근거 기반" 뱃지·개인화 노출에 대한 **법률(의료법·의료광고·저작권) 검토**. 전문가·법률 게이트 통과 전에는 출처 딥링크 강화(M3)·개인화 확대·검증 자동화(M4)를 착수하지 않는다.

## 6. 구현 순서 (마일스톤 — 2026-07-22 재스코핑)

- **M1 — 데이터/엔진 추출:** `lib/tips/content/*.ts`(선언적 테이블) + `lib/tips/select.ts` 순수 함수 + `lib/env-data.ts` 공유 헬퍼. 유닛 테스트 동반.
- **M2 — 실데이터 연결 (★ MVP 출시 단위):** 목 `env` 제거, `fetchEnvData` 연결, 공인 등급 기반 severity, `child-conditions` 프로필 매칭 + 나이 게이팅, fail-closed, 계절 중립 일반 카드, 출처를 정직한 "문서명+연도(+홈페이지)" + 비승인 고지로 격상.
- **M3 — [게이팅] 출처 딥링크 강화 + 개인화 확대:** 전문가+법률 게이트 통과 후. 딥링크는 확보 가능한 문서에만(불가하면 "문서명+연도" 유지).
- **M4 — [게이팅] 검증 자동화:** 링크-생존 스크립트 + 사람 6개월 재검토 주기. M3와 함께 게이트 뒤.

## 7. 결정 항목

- [x] **D1** 리뷰 대상: 계획 문서 (2026-07-22)
- [x] **D2** 인용 정직성: 문서명 특정 + (가능 시)딥링크, 폴백은 문서명+연도+홈페이지
- [x] **D3** authoring/검증: 엔지니어 큐레이션 + 링크검증, 전문가·법률은 M3 게이트
- [x] **D4** 저장 위치: 레포 내 파일(`lib/tips/`)
- [x] **D-A1** 환경 fetch: 공유 헬퍼 `lib/env-data.ts` 신규, tips만 우선 연결
- [x] **D-A2** 심각도: 공인 등급 공유 소스에서 도출(자체 cutoff 금지)
- [x] **D-C1** 결측/에러: fail-closed + 정직한 안내
- [x] **D4-재스코핑** 외부 목소리 수용 — M2 먼저 출시, M3/M4/개인화는 전문가+법률 게이팅
- [x] **D7** 상시 일반 카드: 계절 중립 문구로 수정
- [x] **D9** 콘텐츠는 선언적 임계값 테이블(클로저 아님)
- [x] **D10** 미세먼지는 PM2.5 등급 별도 참조(등급 뭉개기 금지)
- [x] **D11** 마스크 권고 나이 게이팅(canRecommendMask) 연결
- [x] **D-CEO2** PRODUCT-DECISIONS.md 출시 차단(Blocker)에 공식 등재 (블로커 #42와 동일 취급)
- [x] **D-CEO4** fetchEnvData에 AbortController+세대 카운터로 프로필전환/이탈 레이스 방지
- [x] **D-CEO8** fail-closed 발동을 기존 events/feedback 계측에 경량 이벤트로 기록
- [ ] MVP 팁 토픽 범위: 현행 5(자외선·미세먼지·꽃가루·건조·일반)에 기온(폭염·한파) 추가 여부 — M2 착수 시 확정

## What already exists (재사용 현황)

| 기존 자산 | 계획의 처리 |
|---|---|
| `lib/domain/child-conditions.ts` (hasResp/Allergy/Skin, canRecommendMask, ageInMonths) | ✅ 재사용 (인라인 매칭 제거) |
| `lib/useLocation.ts` 전역 위치 | ✅ 재사용 |
| env·outfit·home의 4개 API fetch (3가지 다른 구현) | ⚠️ `lib/env-data.ts`로 통합, tips 우선 소비 (D-A1) |
| `lib/outdoor-index.ts` / `lib/timeline.ts`(dustLabel·pollenLabel) 등급 산식 | ✅ severity 소스로 재사용 (D-A2) |
| 현재 tips 카드 UI·필터·면책·프로필 배너 | ✅ 유지, 출처 렌더만 격상 |

## NOT in scope (의도적 보류)

- **M3 출처 딥링크 강화** — 한국 학회 딥링크 불가 태반 + 법률/전문가 게이트 선행 필요.
- **M4 검증 자동화(스케줄 태스크)** — 내용 드리프트를 못 잡는 자동화를 사람 검토보다 먼저 만들지 않는다.
- **개인화 확대**(질환별 세분 조언) — 의료법·라이어빌리티 검토 전 보류.
- **home/env/outfit의 `fetchEnvData` 이전** — 비차단 후속(가장 불안정한 home은 별도 PR).
- **꽃가루 잡초(weed)** — API가 항상 null(기상청 V3 미제공), 계산 자연 제외.
- **LLM 기반 팁/출처 생성** — 설계 원칙상 영구 제외.

## Failure modes (신규 코드패스별)

| 코드패스 | 실패 시나리오 | 테스트 | 에러 처리 | 사용자 경험 |
|---|---|---|---|---|
| `fetchEnvData` KMA 센티널 | ±900 센티널이 실측 위장 통과 | ✅ 요구(env-data.test) | ✅ 센티널 범위 검증 | 결측 처리로 표시 |
| `fetchEnvData` 개별 소스 타임아웃 | 한 API 지연/502 | ✅ 요구 | ✅ 부분 결과 반환 | fail-closed(해당 팁 침묵) |
| `selectTips` 나이 게이팅 | 24개월 미만에 마스크 권고 | ✅ **CRITICAL** | ✅ canRecommendMask | 마스크 대신 외출 자제 |
| `selectTips` fail-closed | 신호 결측인데 조건부 팁 노출 | ✅ **CRITICAL** | ✅ 미노출 | 일반 카드 + 정직한 안내 |
| 위치 3중 불일치 | station/region/latlon 어긋남 | ✅ 요구(회귀) | 헬퍼 중앙화 | 화면 간 일관 |

→ 위 CRITICAL 2건은 테스트 AND 에러 처리 AND 사용자 피드백을 모두 요구 — 침묵 실패 없음.

## Implementation Tasks
이 리뷰의 findings에서 합성. Claude Code/Codex로 실행, 완료 시 체크.

- [ ] **T1 (P1, human: ~3h / CC: ~25min)** — lib/env-data — 공유 `fetchEnvData(location)` 추출
  - Surfaced by: Architecture A1 — env fetch 3중 복제 + 위치 3중 불일치·센티널 중앙화
  - Files: `lib/env-data.ts`, `lib/env-data.test.ts`, `app/(main)/tips/page.tsx`
  - Verify: `npm test`(센티널·위치매핑 회귀), tips가 실데이터 표시
- [ ] **T1b (P1, human: ~1h / CC: ~10min)** — lib/env-data — AbortController + 세대 카운터로 레이스 방지
  - Surfaced by: CEO 리뷰 Section 4 — 프로필 전환 중 이전 fetch 응답이 늦게 도착해 다른 아이 tips 표시 위험, 화면 이탈 시 미정리
  - Files: `lib/env-data.ts`, `app/(main)/tips/page.tsx`
  - Verify: 프로필 A→B 빠른 전환 후 B의 tips만 표시(A 응답 지연 시뮬레이션 테스트), unmount 시 abort 호출 확인
- [ ] **T2 (P1, human: ~4h / CC: ~30min)** — lib/tips — 선언적 콘텐츠 테이블 + `selectTips` 순수 함수
  - Surfaced by: Architecture/Code Quality — 인라인 콘텐츠·목데이터·자체 cutoff 제거, 공인 등급 기반
  - Files: `lib/tips/content/*.ts`, `lib/tips/select.ts`, `lib/tips/select.test.ts`
  - Verify: `npm test` 브랜치 100%(UV/PM/꽃가루/건조/일반 × 프로필 on/off × 나이 경계 × 결측)
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** — lib/tips — fail-closed + 나이 게이팅
  - Surfaced by: Code Quality C1 + 외부 목소리 P3 — 결측 시 조건부 팁 침묵, 마스크 나이 반응
  - Files: `lib/tips/select.ts`(+테스트)
  - Verify: 결측 입력→일반 카드만; 12개월 프로필→마스크 미권고
- [ ] **T4 (P2, human: ~1h / CC: ~10min)** — tips/page — 실 로딩·에러/결측 + 계절 중립 일반 카드 + 출처 렌더 격상
  - Surfaced by: Code Quality + 외부 목소리 P2 — 가짜 setTimeout 로딩·하드코딩 "환절기" 제거
  - Files: `app/(main)/tips/page.tsx`
  - Verify: dev 서버 tips 화면 — 로딩/에러/정상 3상태, 7월에 "환절기" 문구 없음
- [ ] **T5 (P2, human: ~30min / CC: ~5min)** — tips 출처 — "문서명+연도(+홈페이지)" + 비승인 고지로 콘텐츠 교체
  - Surfaced by: 외부 목소리 P1(저작권/승인) — 홈페이지-only 링크를 정직한 문서 특정으로
  - Files: `lib/tips/content/*.ts`
  - Verify: 모든 tip에 org+문서명+연도, 링크 200
- [ ] **T6 (P3, follow-up)** — 게이팅 문서화 — M3/M4 착수 전 전문가+법률 게이트 체크리스트
  - Surfaced by: 외부 목소리 P1(의료법·충실성) — 재검토 주기·법률 검토를 태스크로 고정
  - Files: 본 계획 §5, 후속 이슈
- [ ] **T7 (P2, human: ~30min / CC: ~5min)** — fail-closed 관측 이벤트 기록
  - Surfaced by: CEO 리뷰 Section 8 — fail-closed 발동 빈도를 알 방법이 없으면 데이터 홀이 흔한지 판단 불가
  - Files: `lib/tips/select.ts` 또는 `app/(main)/tips/page.tsx`(발동 지점), 기존 `events`/`feedback` 계측 경로 재사용
  - Verify: 결측 시뮬레이션 → `tips_fail_closed` 이벤트(결측 신호명 포함) 기록 확인

## 8. 검증 (수용 기준 — M2)

- tips가 **오늘 실제 환경값**(env 화면과 동일 출처·등급)에 따라 팁을 노출한다(목데이터 0, 화면 간 등급 일치).
- 데모·구형·온보딩 프로필 모두에서 프로필 매칭·나이 게이팅이 올바르게 발동한다.
- 환경 데이터 결측/에러 시 조건부 팁이 침묵하고 정직한 안내가 뜬다(fail-closed).
- 노출된 모든 출처가 홈페이지가 아니라 **특정 문서**(문서명+연도)를 가리키고 비승인 고지가 있다.
- `npm run build` · `npm run lint` · `npm test`(select·env-data) 통과.

## NOT in scope (CEO 리뷰 추가분)

- **Approach B(홈 판단 근거 드릴다운으로 tips 재구성)** — 방향성은 옳지만 IA 변경 범위가 커 M2(정직화 최소)로 먼저 신뢰 위반을 제거하고, 수요가 `/api/feedback` 프로브로 확인되면 재검토.
- **Approach C(공개 베타 전 tips 탭 숨김)** — 이미 M2가 최고가치·최저위험으로 확정된 상태라 숨기는 것보다 고치는 비용이 더 낮음.
- **Section 3 보안 위협모델 확장** — 신규 사용자 입력·엔드포인트가 없어 위협 표면 불변, 별도 조치 불요.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean (HOLD_SCOPE) | Approach A(정직화 최소) 채택; Blocker #42 편입 결정; Section 4·8 신규 발견 2건(레이스 방지·관측 이벤트) 계획 반영 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open→resolved | 5 issues raised, 5 resolved; 2 critical failure-mode gaps (테스트+에러처리로 커버 요구) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — (CEO Section 11 통과, 구현 후 실행 권장) |
| Outside Voice | Claude subagent | Independent 2nd opinion | 1 | issues_found | 4×P1, 3×P2, 3×P3; 재스코핑(M2-first)로 수용 |

- **CODEX:** Codex 미설치 → Claude 서브에이전트로 대체 실행(엔지니어링 리뷰 단계).
- **CROSS-MODEL:** 3개 충돌 모두 사용자 결정으로 해소 — 딥링크(정직한 폴백 수용), 검증(생존≠충실성 명시), 스코프(M2-first 재스코핑 수용).
- **VERDICT:** CEO + ENG CLEARED — M2 구현 착수 가능. tips M2는 PRODUCT-DECISIONS.md 출시 차단(Blocker)으로 공식 등재됨. 구현 완료 후 `/plan-design-review`(UI 폴리싱) 권장.

NO UNRESOLVED DECISIONS
