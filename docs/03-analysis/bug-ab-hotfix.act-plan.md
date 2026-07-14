# 버그 A/B 핫픽스 — Act Plan (엔지니어링 리뷰 반영 최종본)

- 상태: Ready to implement
- 작성일: 2026-07-14
- 검증: /plan-eng-review (아웃사이드 보이스 포함). D1 설계에서 분리한 핫픽스.
- 관련: [child-attributes-codification.design.md](../02-design/features/child-attributes-codification.design.md)

---

## 확정된 두 버그 (근거 인용)

**버그 A — 질환 매칭이 실사용자에게 미발동.** 온보딩은 `conditions`에 라벨 전체를 저장(`"호흡기 민감 (비염, 천식·기관지)"`, `"민감 피부 (아토피·건조·자외선)"`)하는데, 3개 소비자가 다른 짧은 문자열을 검사한다:
- [recommendation-engine.ts:36-37](../../lib/recommendation-engine.ts) — `includes("비염")` / `includes("피부 민감")`
- [CharacterReport.tsx:31-32](../../components/CharacterReport.tsx) — 동일 (주석 :28 "엔진 미러링")
- [outfit/page.tsx:64-65](../../app/(main)/outfit/page.tsx) — 동일

**버그 B — 코드값이 AI 프롬프트에 누출.** [report/route.ts:125-129](../../app/api/report/route.ts)가 `추위: ${child.cold}`로 코드(`"normal"`)를 그대로 한국어 프롬프트에 주입.

---

## 리뷰로 확정된 설계 결정

- **D-결정 1 (아키텍처)**: 새 캐논 코드 모듈이 아니라, **기존 정규식 predicate를 공유 모듈로 끌어올려** 통일. (아웃사이드 보이스가 새 모듈 = 다섯 번째 어휘임을 지적 → 채택)
- **D-결정 2 (동작 폭)**: **넓은 기준으로 통일** — `호흡기 전체`. 엔진도 [prep.ts:15-17](../../lib/prep.ts)·[item-recommend.ts:52-53](../../lib/item-recommend.ts)가 이미 쓰는 넓은 regex에 맞춘다(사용자 선택). 이건 의도된 **동작 개선**이며 앱 전체 일관성을 확보한다.

### 동작 변화 (사용자에게 보이는 것)
- 천식·기관지·알레르기 아이가 미세먼지/꽃가루 날 **마스크 안내(필수 문구)**를 받게 됨 (종전엔 비염만).
- 아토피·건조 체질 아이가 **보습제 안내**를 받게 됨 (종전엔 "피부 민감" 정확 일치만).
- 데모-1(`["아토피","비염"]`)도 이제 마스크+보습 둘 다 받음(종전 비염만).

### 매칭 정의 (기존 넓은 regex 재사용)
```
hasRespiratory(conditions) = 어떤 항목이 /호흡기|비염|천식|기관지/ 매칭
hasAllergy(conditions)     = 어떤 항목이 /알레르기/ 매칭
hasSkin(conditions)        = 어떤 항목이 /피부|아토피|건조/ 매칭
```
- 온보딩 신규 라벨 + 구형/데모 짧은 문자열을 **둘 다** 잡음 (prep.ts 주석이 명시한 기준 그대로).
- `알레르기`는 prep.ts가 독립 신호로 쓰므로 **분리 유지**(RESP에 접붙이지 않음). item-recommend.ts는 종전 `hasRespiratory || hasAllergy`로 기존 동작 보존.
- 3개 깨진 소비자: `hasRhinitis`→`hasRespiratory`, `hasSensitiveSkin`→`hasSkin`로 교체.

### 버그 B 변환 (raw-string fallback 필수)
```
const SENS_PHRASE = { "very-much":"매우 많이 탐", much:"조금 많이 탐", normal:"보통", less:"조금 덜 탐", "very-less":"매우 덜 탐" };
const SWEAT_PHRASE = { "very-much":"매우 많음", much:"조금 많음", normal:"보통", less:"적은 편" };
phrase = MAP[value] ?? value   // ← 데모/구형 한국어 문자열은 그대로 통과 (regression 방지)
```
> 아웃사이드 보이스 지적: 실사용자=코드, 데모=한국어 문장(`"보통이에요"`)로 **세 어휘**가 공존. fallback이 없으면 데모 리포트가 빈 값으로 퇴행한다.

---

## 수정 파일 (8) — 대부분 기계적 통합

| 파일 | 변경 |
|------|------|
| `lib/domain/child-conditions.ts` | **신규** — `hasRespiratory`/`hasAllergy`/`hasSkin`(넓은) + `sensitivityPhrase`/`sweatPhrase`(fallback 포함) |
| `lib/recommendation-engine.ts` | `includes(...)` → 모듈 predicate (버그 A) |
| `components/CharacterReport.tsx` | `includes(...)` → 모듈 predicate (버그 A) |
| `app/(main)/outfit/page.tsx` | `includes(...)` → 모듈 predicate (버그 A) |
| `lib/prep.ts` | 로컬 `RESP`/`ALLERGY`/`SKIN` const 제거 → 모듈 import (DRY 통합) |
| `lib/item-recommend.ts` | 로컬 regex 제거 → 모듈 import, 기존 동작 보존(resp‖allergy) (DRY 통합) |
| `app/api/report/route.ts` | cold/hot/sweat를 phrase 헬퍼로 변환 후 주입 (버그 B) |
| `app/(main)/home/page.tsx` | 리포트 캐시 키 `v9` → `v10` (버그 B로 프롬프트 변경) |

> 넓은 기준 채택으로 prep·item의 기존 넓은 regex를 그대로 재사용 → 3개 깨진 소비자 수정 + 2개 중복 정의 통합이 **한 모듈**로 수렴하는 순 DRY 이득.

---

## NOT in scope (의도적 보류)

- **D1 전체 코드화** (conditions→DB 코드, CHECK 제약, 데이터 이관): 별도 작업. 핫픽스는 문자열 결합을 남긴 채 버그만 정지.
- **conditions → LLM 경로**: [route.ts:122-123](../../app/api/report/route.ts)는 라벨을 자연어로 넘겨 Claude가 잘 읽음. **건드리지 않는다**(정규화하면 문맥 손실).
- **me/page.tsx 라벨 맵 dedup**: UI용 짧은 라벨("보통")이라 리포트용 문구와 별개 → TODO.

---

## 실패 모드 (production)

| 코드패스 | 실패 방식 | 테스트 | 에러 처리 | 사용자 체감 |
|----------|-----------|--------|-----------|-------------|
| phrase 변환 | 새 코드 추가 시 map 미갱신 → fallback이 영어 코드 통과(조용한 누출 재발) | 없음 | fallback | 리포트에 영어 노출(조용) |
| 넓은 regex | 온보딩 라벨 어휘가 완전히 바뀌면 조용히 미매칭 (넓은 매칭이라 종전보다 견고) | 없음 | 없음 | 안내 누락(조용) → **D1이 근본 제거** |

두 실패 모두 **조용한(silent)** 유형. 테스트가 없어 회귀 감지가 안 됨 → 아래 테스트 갭 참조.

---

## 테스트 갭 (강한 권고)

프로젝트에 테스트 러너가 없다(CLAUDE.md "테스트 스위트는 아직 없다"). 그런데 `hasRespiratory`/`hasSkin`/`sensitivityPhrase`는 **순수 함수**이고, 버그 A/B는 정확히 **회귀 테스트가 잡았을 유형**이다.

권고: 최소 vitest 도입 + `lib/domain/child-conditions.test.ts` 1개.
- 온보딩 라벨 3종 × 데모 문자열 3종 → 각 predicate 기대값
- phrase: 코드 5종 매핑 + 데모 한국어 fallback 통과 + undefined 처리

> 러너 도입이 핫픽스 범위를 넘는다면, 핫픽스와 별개 PR로 분리 가능. 다만 이 함수들은 러너 도입의 첫 대상으로 이상적.

---

## 구현 순서

1. `lib/domain/child-conditions.ts` 작성 (넓은 predicate + phrase)
2. prep.ts·item-recommend.ts를 모듈 import로 전환 (동작 보존 확인 — 통합의 기준선)
3. 3개 소비자(engine·CharacterReport·outfit) predicate 교체 — dev로 데모/온보딩 프로필 양쪽 확인
4. report/route.ts phrase 적용 — 프롬프트에 한국어만 들어가는지 확인
5. home 캐시 키 v10
6. `npm run build` + `npm run lint` 통과
7. (권고) vitest + 단위 테스트

---

## 병렬화
순차 구현 권장(공유 모듈 1을 나머지가 의존). 병렬 이득 없음.
