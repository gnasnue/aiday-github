# D1 설계안 — 체질·질환 도메인 값의 단일 소스화(코드화)

- 상태: Design (구현 전)
- 작성일: 2026-07-14
- 스코프: `children` 테이블의 `cold_sensitivity` / `hot_sensitivity` / `sweat_level` / `conditions` 및 이 값을 읽고 쓰는 전 계층
- 관련: [supabase/migrations/001_children.sql](../../../supabase/migrations/001_children.sql), DB 스키마 점검 D1

---

## 1. 배경 — 왜 지금 고쳐야 하나

체질·질환은 이 제품의 **정체성 데이터**다("아이 체질 기준으로 환경을 해석"). 그런데 이 값이 계층마다 다른 형태로 저장·해석되고 있고, 그 결과 **이미 두 개의 잠복 버그**가 존재한다.

### 발견된 실제 버그

**버그 A — 추천 엔진의 질환 매칭이 실사용자에게 항상 실패**

온보딩은 `conditions`에 **라벨 전체 문자열**을 저장한다:
```
"호흡기 민감 (비염, 천식·기관지)", "알레르기 체질 (꽃가루·먼지)", "민감 피부 (아토피·건조·자외선)"
```
그런데 [lib/recommendation-engine.ts:36](../../../lib/recommendation-engine.ts)는 다른 문자열을 검사한다:
```ts
const hasRhinitis = conditions.includes("비염");        // ← 저장된 라벨에 "비염"만 단독으로 없음
const hasSensitiveSkin = conditions.includes("피부 민감"); // ← "민감 피부"라 순서도 다름
```
→ 온보딩으로 가입한 실사용자는 `hasRhinitis`·`hasSensitiveSkin`이 **영원히 false**. 마스크 필수 안내·보습제 추천의 질환 가중이 동작하지 않는다. (데모 프로필은 우연히 `["아토피","비염"]`·`["피부 민감"]`을 써서 일부만 맞아떨어진다 — 그래서 개발 중엔 정상으로 보인다.)

**버그 B — AI 리포트에 코드값이 그대로 주입**

`cold`/`hot`/`sweat`는 온보딩에서 이미 **코드값**(`"normal"`, `"much"`…)으로 저장된다. 그런데 [app/api/report/route.ts:125](../../../app/api/report/route.ts)는 이를 변환 없이 프롬프트에 넣는다:
```ts
child.cold ? `추위: ${child.cold}` : null   // → "추위: normal"
```
→ 한국어 프롬프트에 영어 코드(`normal`/`much`/`less`)가 섞여 들어가 Claude의 해석 품질을 떨어뜨린다. (데모는 한국어 문자열이라 여기서도 데모만 정상으로 보인다.)

### 근본 원인 — 단일 소스 부재

같은 도메인 값에 대한 정의가 **3벌로 분산**돼 서로 어긋난다:

| 계층 | cold/hot/sweat | conditions |
|------|----------------|------------|
| 온보딩 `app/onboarding/page.tsx` | 코드 정의(inline `sensitivity`/`sweatLevels`) | 라벨 문자열 정의(inline `conditions`) |
| 마이페이지 `app/(main)/me/page.tsx` | 라벨 맵 **재정의**(`sensitivityLabel`/`sweatLabel`) | 저장된 라벨 그대로 출력 |
| 리포트 `app/api/report/route.ts` | 코드를 **변환 없이** LLM에 주입(버그 B) | 라벨을 free-text로 주입(무해) |
| 추천 엔진 `lib/recommendation-engine.ts` | 미사용 | **틀린 문자열** 검사(버그 A) |
| 데모 `lib/profile.ts` | **한국어 문자열**(코드 스킴과 불일치) | 또 다른 문자열(`아토피` 등) |

---

## 2. 설계 원칙

1. **저장은 코드, 표현은 라벨.** DB엔 안정적 코드값만 저장한다. 한국어 문구는 표시 시점에 매핑한다. (이미 `gender`가 이 패턴 — `'male'`/`'female'` 저장, UI에서 "남아"/"여아" 매핑.)
2. **단일 소스(single source of truth).** 코드 목록·한국어 라벨·AI용 자연어 문구를 한 모듈에서만 정의하고, 온보딩·마이페이지·리포트·추천 엔진이 전부 여기서 import 한다.
3. **표현 채널 분리.** 같은 코드라도 소비처에 따라 필요한 문자열이 다르다: UI는 짧은 라벨("보통"), LLM은 문맥이 담긴 문구("더위를 보통으로 탐"). 둘 다 모듈이 제공한다.

---

## 3. 도메인 taxonomy (확정 값)

기존 온보딩 값에서 코드는 유지하고, 라벨/문구만 정리한다.

### 3.1 민감도 (cold, hot 공통)

| code | UI 라벨 | AI 문구(추위) | AI 문구(더위) |
|------|---------|---------------|---------------|
| `very-much` | 매우 많이 탐 | 추위를 매우 많이 탐 | 더위를 매우 많이 탐 |
| `much` | 조금 많이 탐 | 추위를 조금 많이 탐 | 더위를 조금 많이 탐 |
| `normal` | 보통 | 추위 반응은 보통 | 더위 반응은 보통 |
| `less` | 조금 덜 탐 | 추위를 조금 덜 탐 | 더위를 조금 덜 탐 |
| `very-less` | 매우 덜 탐 | 추위를 매우 덜 탐 | 더위를 매우 덜 탐 |

### 3.2 땀 분비 (sweat)

| code | UI 라벨 | AI 문구 |
|------|---------|---------|
| `very-much` | 매우 많음 | 땀이 매우 많음 |
| `much` | 조금 많음 | 땀이 조금 많음 |
| `normal` | 보통 | 땀은 보통 |
| `less` | 적은 편 | 땀이 적은 편 |

### 3.3 질환·체질 (conditions) — 신규 코드 도입

| code | UI 라벨 (온보딩 표기 유지) | AI 문구 | 추천 엔진 신호 |
|------|---------------------------|---------|----------------|
| `respiratory` | 호흡기 민감 (비염, 천식·기관지) | 비염·천식 등 호흡기 민감 | `hasRhinitis` |
| `allergy` | 알레르기 체질 (꽃가루·먼지) | 꽃가루·먼지 알레르기 체질 | `hasPollenAllergy` |
| `sensitive_skin` | 민감 피부 (아토피·건조·자외선) | 아토피·건조 등 민감 피부 | `hasSensitiveSkin` |
| `none` | 해당없음 | (문구 없음) | — |
| `etc` | 기타 | `condition_etc` 자유 입력값 사용 | — |

---

## 4. 코드 구조 — 신규 단일 소스 모듈

`lib/domain/child-attributes.ts` (신규):

```ts
// ── 민감도 ──────────────────────────────────────────
export const SENSITIVITY_CODES = ["very-much", "much", "normal", "less", "very-less"] as const;
export type SensitivityCode = (typeof SENSITIVITY_CODES)[number];

export const SENSITIVITY_LABEL: Record<SensitivityCode, string> = {
  "very-much": "매우 많이 탐", much: "조금 많이 탐", normal: "보통",
  less: "조금 덜 탐", "very-less": "매우 덜 탐",
};

// UI Select용 옵션(온보딩이 소비)
export const SENSITIVITY_OPTIONS = SENSITIVITY_CODES.map((v) => ({ v, l: SENSITIVITY_LABEL[v] }));

// ── 땀 ──────────────────────────────────────────────
export const SWEAT_CODES = ["very-much", "much", "normal", "less"] as const;
export type SweatCode = (typeof SWEAT_CODES)[number];
export const SWEAT_LABEL: Record<SweatCode, string> = { /* … */ };
export const SWEAT_OPTIONS = SWEAT_CODES.map((v) => ({ v, l: SWEAT_LABEL[v] }));

// ── 질환 ────────────────────────────────────────────
export const CONDITION_CODES = ["respiratory", "allergy", "sensitive_skin", "none", "etc"] as const;
export type ConditionCode = (typeof CONDITION_CODES)[number];
export const CONDITION_LABEL: Record<ConditionCode, string> = { /* … */ };
export const CONDITION_OPTIONS = CONDITION_CODES.map((v) => ({ v, l: CONDITION_LABEL[v] }));

// ── AI 프롬프트용 자연어 변환 ─────────────────────────
export function sensitivityPhrase(kind: "cold" | "hot", code?: string): string | null { /* … */ }
export function sweatPhrase(code?: string): string | null { /* … */ }
export function conditionsToPhrase(codes: string[], etc?: string): string { /* … */ }

// ── 하위호환: 구 라벨 → 코드 (데이터 이관·런타임 방어) ──
export function normalizeConditionLegacy(value: string): ConditionCode | null { /* 아래 5.2 매핑 */ }
```

`ChildProfile`(lib/profile.ts) 타입을 좁힌다:
```ts
cold?: SensitivityCode;
hot?: SensitivityCode;
sweat?: SweatCode;
conditions?: ConditionCode[];
```

---

## 5. 스키마 변경 & 데이터 이관

### 5.1 스키마 (신규 마이그레이션)

```sql
-- 003_children_attribute_codes.sql
-- cold/hot/sweat: 코드값만 허용하도록 CHECK 추가(현재 데이터는 이미 코드값)
alter table public.children
  add constraint children_cold_code   check (cold_sensitivity is null or cold_sensitivity in ('very-much','much','normal','less','very-less')),
  add constraint children_hot_code    check (hot_sensitivity  is null or hot_sensitivity  in ('very-much','much','normal','less','very-less')),
  add constraint children_sweat_code  check (sweat_level      is null or sweat_level      in ('very-much','much','normal','less'));

-- conditions: 코드 배열로 이관 후 CHECK (아래 5.2 이관을 먼저 실행)
alter table public.children
  add constraint children_conditions_codes
  check (conditions <@ array['respiratory','allergy','sensitive_skin','none','etc']::text[]);
```

### 5.2 conditions 데이터 이관 (구 라벨 → 코드)

기존 DB 행의 `conditions`는 라벨 문자열이므로 **CHECK 추가 전에** 변환해야 한다.

```sql
-- 라벨 → 코드 치환 (이관 스크립트, CHECK 제약 추가 전에 실행)
update public.children set conditions = (
  select array_agg(distinct case
    when c like '호흡기%'   then 'respiratory'
    when c like '알레르기%' then 'allergy'
    when c like '민감 피부%' or c like '피부%' or c = '아토피' or c = '비염' then 'sensitive_skin'
    when c = '해당없음'     then 'none'
    when c = '기타'         then 'etc'
    else null end)
  from unnest(conditions) as c
  where /* null 제거 */ true
);
```
> ⚠️ 미결정: `데모/구 문자열`("아토피","비염")의 매핑 규칙은 위처럼 근사치로 잡았다. 실데이터가 있으면 이관 전 `select distinct unnest(conditions) from children`로 실제 분포를 확인해 매핑표를 확정한다. 실사용자 수가 적으면(데모 앱) 리스크는 낮다.

### 5.3 cold/hot/sweat는 이관 불필요
DB 실데이터는 이미 코드값이다(온보딩 경로). 변환 대상은 **`lib/profile.ts`의 데모 프로필 하드코딩 문자열뿐**이며 이건 DB에 들어가지 않으므로 코드 수정으로 끝난다.

---

## 6. 영향 범위 (수정 파일)

| 파일 | 변경 |
|------|------|
| `lib/domain/child-attributes.ts` | **신규** — 단일 소스 |
| `app/onboarding/page.tsx` | inline `sensitivity`/`sweatLevels`/`conditions` 제거 → 모듈 `*_OPTIONS` import. `conds`에 code 저장 |
| `app/(main)/me/page.tsx` | 로컬 `sensitivityLabel`/`sweatLabel` 제거 → `SENSITIVITY_LABEL`/`SWEAT_LABEL`. `condStr`은 `CONDITION_LABEL`로 매핑 |
| `app/api/report/route.ts` | `tempSensitivity`·`conditions`를 `sensitivityPhrase`/`conditionsToPhrase`로 변환 후 주입 (**버그 B 수정**) |
| `lib/recommendation-engine.ts` | `conditions.includes("비염")` → `conditions.includes("respiratory")` 등 코드 검사 (**버그 A 수정**) |
| `lib/profile.ts` | 타입 좁히기 + `defaultProfiles`를 코드값으로 교체 |
| `supabase/migrations/003_*.sql` | CHECK 제약 + 이관 |

---

## 7. 리스크 & 결정 필요

- **캐시 무효화**: 리포트 캐시 키(`aiday:report:v9:…`)는 프롬프트 입력이 바뀌므로 **v10으로 올려야** 한다(CLAUDE.md 캐시 키 규칙). 온보딩 localStorage(`aiweather:onboarding`)에 구 값이 남아 있을 수 있어 런타임 `normalizeConditionLegacy` 방어를 둔다.
- **이관 순서 의존성**: 5.2(데이터 변환) → 5.1의 conditions CHECK 순서를 반드시 지켜야 한다. 순서가 틀리면 CHECK 위반으로 실패.
- **범위 판단**: 버그 A/B는 코드화와 무관하게 **지금 당장 고칠 수 있는 실버그**다. 코드화 전체가 부담이면 (1) 버그 A/B 핫픽스 먼저, (2) 코드화 리팩터링은 후속으로 분리 가능.

---

## 8. 작업 순서 (구현 착수 시)

1. `lib/domain/child-attributes.ts` 작성 + 단위적으로 타입 통과
2. 추천 엔진·리포트 라우트 수정 (버그 A/B 즉시 해소) — dev 서버로 검증
3. 온보딩·마이페이지·데모를 모듈 기반으로 리팩터링
4. 마이그레이션 003 작성 → 이관 스크립트 실행 → CHECK 추가
5. 리포트 캐시 키 v10
6. `/qa`로 온보딩→홈→마이페이지 전 흐름 회귀
