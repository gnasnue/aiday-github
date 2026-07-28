# 잠자리 루틴 (오늘의 마무리) — 24시간 Vertical Slice 구현 계획

> ⚠️ **대체됨 (2026-07-28):** 사용자 방향 교정으로 [day-review-family-memory.plan.md](day-review-family-memory.plan.md)가 이 계획을 대체한다.
> 포인트는 잠자리 루틴이 아니라 **아침 판단 리뷰 + 아이 하루 리캡으로 Family Memory 원료를 축적**하는 것(PRD S-003).
> 이 문서의 잠자리 실행(TTS 단계 안내) 설계는 P2 참조 자료로 보존한다 — 삭제 금지.

> 2026-07-27 작성. 최종 심사(비즈니스 모델 40 · 제품 완결성 40 · 발표 20) 대응.
> 목표: "정보 제공 → 실행 지원" 확장 가능성을 **하나의 닫힌 제품 루프**로 증명한다.
> 새 서비스 완성이 아니라, `홈 진입 → 루틴 시작 → 단계 안내(음성) → 부모 입력 → 완료 → 다음 실행 조정`이
> 45~60초 안에 끊김 없이 데모되는 것이 성공 기준.

---

## 0. 사전 분석 결과 (핸드오프 프롬프트 Phase A 보고)

- **사용 기술:** Next.js 15 App Router + TypeScript + Tailwind(토큰은 `app/globals.css` 단일 진실) + shadcn/ui + Lucide/LineIcon. 상태관리 라이브러리 없음(useState/useEffect + localStorage). 신규 의존성 불필요.
- **홈 화면 파일:** `app/(main)/home/page.tsx` (2,089줄). 히어로(`components/HeroDecisionBrief.tsx`)·체크리스트(`PrepChecklistCard.tsx`)·케어 플랜이 캐시 v31·evidence chip 계약·프라임/스트리밍 로직과 정교하게 얽혀 있음 — **회귀 위험 최고 지대**.
- **잠자리 화면 파일:** ❗ **이 레포에 존재하지 않는다.** `잠자리|루틴|bedtime|취침` 전수 grep 결과 리서치 문서 4건뿐, 화면·컴포넌트·라우트 0건. 핸드오프 프롬프트의 "기존에 만족했던 `[잠자리]` 화면 유지" 전제는 성립하지 않으므로 **DESIGN.md 문법으로 신규 제작**한다. (다른 폴더에 시안이 있다면 공유 시 콘텐츠만 이식.)
- **재사용 가능한 것:** 디자인 토큰 전부, `PageHeader`, CTA/리스트 행/게이지 문법(DESIGN.md), `lib/hero-brief.ts`의 더위 판정(`discomfortIndex`·`DI_WARN`·`HEAT_SEVERE_TEMP` — 홈이 이미 import 중), `lib/date.ts localDateStr`, 라우트 그룹 구조(`(main)` 밖 라우트는 BottomNav 없음 — onboarding 선례).
- **수정 파일:** `app/(main)/home/page.tsx` (진입 카드 1섹션 삽입, **10줄 내외 목표**), `SPEC.md`(P-09 추가), `CHANGELOG.md [Unreleased]`.
- **신규 파일:** §4 참조 (lib 3 + 컴포넌트 1 + 라우트 1 + 테스트 1).
- **위험 요소:** §8 참조.

---

## 1. 핵심 설계 결정 3가지 (초안 대비 변경점)

### 결정 1 — 홈 히어로는 **건드리지 않는다**. 진입은 별도 "오늘의 마무리" 카드로.

초안 P0-1은 히어로를 루틴 중심으로 재구성하라고 하지만 기각을 권고한다. 근거:

1. **포지셔닝 훼손:** 히어로 = "아침의 첫 육아 판단"(MANIFESTO 2층 웨지, 북극성 지표의 대상). 이걸 저녁 루틴으로 바꾸면 기존 가치를 지우고 새 가치를 얹는 것 — 심사에는 "확장"이 아니라 "피벗"으로 읽힌다.
2. **회귀 위험:** 히어로는 캐시 v31·evidence chip 계약(DESIGN.md 단일 진실 표)·스트리밍·프라임이 얽힌 최다 사고 지대. 24시간 내 안정 데모가 최우선인데 여기를 여는 것은 자충수.
3. **내러티브가 오히려 좋아진다:** `아침 판단(히어로) → 하루 케어 플랜 → 오늘의 마무리(신규)` — 홈 한 화면이 그대로 "하루의 운영"이 되고, 발표에서 "판단 에이전트 → 실행 에이전트" 확장 스토리가 스크롤 한 번으로 증명된다.

**배치:** "오늘의 케어 플랜" 섹션 바로 아래, 섹션 간격 32px. 시간대 게이팅 없이 상시 노출(P0 — 심사 시연은 낮에 이뤄지므로 시간 조건은 P1). L2 히어로는 화면당 1곳 규칙이 있으므로 진입 카드는 **L1**(`rounded-2xl bg-card p-5 shadow-soft`).

### 결정 2 — 실행·결과는 **단일 라우트 + 상태머신**. 새 백엔드·새 라이브러리 0.

- 라우트: `app/routine/bedtime/page.tsx` — `(main)` 그룹 **밖**이라 BottomNav가 없는 전체 화면 집중 모드가 공짜로 확보된다(onboarding과 동일 패턴).
- 화면 전환은 라우팅이 아니라 내부 상태(`phase: "running" | "done"`)로 처리 — 데모 중 네비게이션 엣지케이스(뒤로가기, 새로고침 복원)를 원천 차단. 데이터는 정적 상수 + localStorage만. **네트워크 의존 0 = 데모장 와이파이가 죽어도 루틴은 돈다.**

### 결정 3 — "내일 조정"을 localStorage로 **홈 카드에 되먹임**한다 (닫힌 루프의 증거).

결과 화면이 규칙 기반 조정(`adjustMin`, 사유)을 `aiday:bedtime:plan`에 쓰고, 홈 진입 카드가 이를 읽어 다음 진입 때 문구가 바뀐다:

> (완료 전) "20:20에 시작해요 · 오늘 더위에 체력 소모가 컸을 거예요"
> (완료 후) "어제 씻기에 시간이 더 걸렸어요 · 오늘은 20:15에 시작할게요"

데모에서 루틴 완료 → 홈 복귀 → **카드 문구가 실제로 바뀐 것**을 보여주는 것이 "닫힌 제품 루프"의 결정적 한 컷이다. 비용은 read/write 각 1곳으로 저렴하므로 P0에 포함한다.

추가로, 진입 카드의 기본 보조 문구는 **홈이 이미 들고 있는 환경 데이터에서 파생**한다(더위 warn일 때 "체력 소모" 사유 + 5분 일찍). 환경×체질이라는 기존 코어가 저녁 루틴의 입력이 됨을 보여줘 신규 기능이 bolt-on이 아니라 같은 제품임을 증명한다. 판정은 홈이 이미 계산하는 값(`discomfortIndex ≥ DI_WARN` 등)을 boolean prop 하나로 내려보내면 끝.

**정직성 가드(MANIFESTO 안티패턴):** 제품 문구는 "내일은 5분 일찍 시작할게요"까지만 — "AI가 학습했다"류 표현 금지. 발표에서도 "현재는 규칙 기반, 실행 데이터가 쌓이는 구조 위에 학습을 얹는 것이 다음 단계"로 정직하게 말한다.

---

## 2. P0 상세 명세

### P0-1. 홈 진입 카드 — `components/RoutineEntryCard.tsx`

| 요소 | 명세 |
|------|------|
| 섹션 헤더 | eyebrow 11/700 `오늘의 마무리` (기존 섹션 문법과 동일) |
| 카드 | L1. 내부: 타이틀 title-lg 20/700 `잠자리 루틴, 20:20에 시작해요`(시각은 `.num`) |
| 보조 문구 | caption~label, muted-foreground. 우선순위: ① 어제 세션의 조정 사유 ② 오늘 더위 warn 사유 ③ 기본 "21:00 취침 목표예요" |
| 단계 미리보기 | 놀이 마무리 → 씻기 → 잠옷 입기 → 책 한 권 → 불 끄기. 칩 5개(`bg-muted` 13px) 또는 한 줄 텍스트 — 390px에서 2줄 이내 |
| CTA | `잠자리 루틴 시작` — h-12 rounded-[14px] bg-primary 17/700 (홈 유일의 solid CTA → 오렌지 3분리 규칙상 적법하고 시각적으로도 유일하게 튄다) |
| 마운트 | localStorage 읽기는 useEffect 이후(홈의 하이드레이션 패턴 준수 — SSR 첫 렌더는 기본값) |

props: `{ heatWarn: boolean }` 하나. plan/세션은 컴포넌트가 직접 localStorage에서 읽는다(홈 diff 최소화).

### P0-2. 실행 화면 — `app/routine/bedtime/page.tsx` ("use client")

구조(위→아래): 헤더(X 닫기=44px 타깃 → `/home`, `잠자리 준비`, `목표 21:00` caption) → 진행률(단계 n/5 + 단색 트랙 `bg-muted`/fill `bg-primary` 게이지, 그라데이션 금지) → **현재 단계 카드(L2 — 이 화면의 히어로 1곳)**: 단계 타이틀 display 26~28/800, `childMessage` body 16~17(한 행동 + 한 선택만), 남은 시간 mm:ss `.num` 카운트다운(참고용, 만료돼도 아무것도 강제하지 않음) → 버튼 영역:

| 버튼 | 스타일 | 동작 |
|------|-------|------|
| 음성으로 듣기 | secondary(`bg-muted`) + `Volume2` 아이콘, 재생 중 `aria-pressed` + 아이콘 교체 | `childMessage` TTS |
| 완료했어요 | primary h-12 (화면 유일 핵심 CTA) | `completedStepIds` 추가 → 다음 단계 |
| 한 번 더 말해줘요 | secondary | `retryCount`++ → `retryMessage` TTS |
| 오늘은 건너뛸게요 | 텍스트 버튼 14/600 muted-foreground (faint 금지 — 의미 텍스트) | `skippedStepIds` 추가 → 다음 단계 |

단계 데이터·타입은 초안의 `RoutineStep`/`RoutineSession` 그대로 채택, `lib/routine/bedtime.ts`에 정적 상수 5단계 + `childMessage`/`retryMessage` 전부 작성. 단계 전환 시 TTS `cancel()`. 마지막 단계 처리 후 `phase="done"`.

※ "상태 판정 텍스트 금지" 규칙은 케어 플랜(타임라인 카드) 범주 규칙이다. 실행 화면의 진행률·카운트다운은 사용자가 명시 요청한 실행 UI로 범주가 다름 — 단, 홈 진입 카드에는 "지금/곧"류 텍스트를 절대 넣지 않는다.

### P0-3. 음성 안내 — `lib/routine/tts.ts`

```ts
isSupported(): boolean           // typeof window !== "undefined" && "speechSynthesis" in window
speak(text, { onEnd }): void     // cancel() 후 발화. ko 보이스 우선(voices.find(v => v.lang.startsWith("ko")))
cancel(): void
```

- `getVoices()`가 빈 배열이면 `voiceschanged` 1회 대기 후 재시도, 그래도 없으면 기본 보이스로 발화.
- 미지원/실패 시 버튼 disabled + "이 브라우저는 음성을 지원하지 않아요" caption — **텍스트 흐름은 무조건 정상 동작**.
- 발화는 항상 버튼 탭(사용자 제스처)에서만 시작 — 모바일 Safari 자동재생 제약 회피.
- 언마운트·단계 전환 cleanup에서 `cancel()`.

### P0-4. 세션 기록 — `lib/routine/session-store.ts`

- 키: `aiday:bedtime:sessions`(최근 7개 배열), `aiday:bedtime:plan`(내일 조정). **`aiday:` 접두어** — PRODUCT-DECISIONS §3-4 네임스페이스 결정 준수.
- 전부 try/catch(시크릿 모드 등 localStorage 불가 시 무기록으로 정상 진행).

### P0-5. 결과 화면 (같은 라우트의 `phase="done"`)

- 타이틀: `오늘 잠자리 준비를 마쳤어요` + 요약 4행(완료 단계 수 / 건너뛴 단계 / 다시 안내 횟수 / 소요시간 — 리스트 행 문법).
- 인사이트(규칙, `lib/routine/bedtime.ts` 순수 함수 `buildInsight(session)`):
  - retry 0: "오늘은 AiDay의 안내만으로 루틴을 잘 마쳤어요."
  - retry 1~2: "조금의 도움이 필요했지만 끝까지 완료했어요."
  - retry ≥3: "오늘은 전환이 평소보다 어려웠어요. 내일은 첫 예고를 5분 일찍 시작할게요." → plan에 `adjustMin: -5` 기록
  - 씻기 skip: "오늘은 씻기 단계를 건너뛰었어요. 내일은 빠른 씻기 모드로 준비할게요." (plan 사유 기록)
- CTA: `완료` → `/home` (돌아간 홈 카드가 조정 문구로 바뀌어 있음 = 데모 마무리 컷).
- **vitest**: `buildInsight`·조정 규칙 경계값 6~8케이스 (`lib/routine/bedtime.test.ts`) — "lib 로직은 vitest" 레포 관행.

---

## 3. 구현 금지 (초안 §5 승계 + 레포 특수)

초안의 금지 목록 전부(LLM 연동·음성인식·유료 TTS·신규 DB·인증 개편 등) + **`/api/report`·캐시 키 v31·hero-brief 로직·BottomNav 5탭 구성을 건드리지 않는다.** 새 탭 추가 금지(5탭 그리드·allowed 배열 변경은 범위 밖, 진입은 홈 카드가 유일).

## 4. 파일 계획

| 구분 | 파일 | 내용 |
|------|------|------|
| 신규 | `lib/routine/bedtime.ts` | 타입·5단계 정적 데이터·buildInsight·조정 규칙 (순수) |
| 신규 | `lib/routine/bedtime.test.ts` | 인사이트·조정 vitest |
| 신규 | `lib/routine/tts.ts` | SpeechSynthesis 래퍼 |
| 신규 | `lib/routine/session-store.ts` | localStorage 세션·플랜 저장 |
| 신규 | `components/RoutineEntryCard.tsx` | 홈 진입 카드 |
| 신규 | `app/routine/bedtime/page.tsx` | 실행+결과 화면 |
| 수정 | `app/(main)/home/page.tsx` | import 1 + 섹션 렌더 1 + heatWarn 파생 1 (~10줄) |
| 수정 | `SPEC.md` | P-09 잠자리 루틴 섹션(데모 슬라이스임을 명시) |
| 수정 | `CHANGELOG.md` | [Unreleased]에 누적 (VERSION은 릴리스 때만 — ship 관행) |

## 5. 24시간 타임라인

| 구간 | 작업 |
|------|------|
| 0–2h | `lib/routine/*` 3파일 + vitest 통과 (화면 없이 로직 확정) |
| 2–6h | 실행+결과 화면 전체 (정적 데이터로 즉시 개발 가능) |
| 6–8h | 홈 진입 카드 + 홈 삽입 + plan 되먹임 배선 |
| 8–10h | TTS 실기기/실브라우저 확인, 390px·다크모드·긴 텍스트 폴리싱 |
| 10–12h | `npm run lint` + `npm test` + `npm run build` + 회귀 확인(홈·env·outfit·tips·me 스모크), 새로고침·localStorage 삭제 상태 확인 |
| 12h~ | 버퍼: /design-review 폴리싱 → /ship (feature 브랜치 → PR). 남으면 P1 |

## 6. 데모 시나리오 (45~60초)

1. 홈: 아침 판단 히어로(기존 가치) → 스크롤 → "오늘의 마무리" 카드: "오늘 더위에 체력 소모가 컸을 거예요, 20:15에 시작해요" (5s)
2. `잠자리 루틴 시작` 탭 → 전체화면 실행 모드 (5s)
3. 1단계 "놀이 마무리" — `음성으로 듣기` → AiDay가 아이에게 말한다 (10s)
4. `완료했어요` ×2 → 3단계에서 `한 번 더 말해줘요`(retry 시연) → 나머지 완료 (15s)
5. 결과: 요약 + "내일은 첫 예고를 5분 일찍 시작할게요" (10s)
6. `완료` → 홈 복귀 → **진입 카드 문구가 조정돼 있음** — "판단이 실행으로, 실행이 다음 판단으로" 한 문장으로 마무리 (10s)

## 7. 심사 기준 매핑

- **비즈니스 모델 40:** ① 무료(아침 판단) → 프리미엄(저녁 실행·개인화 조정) 업셀 구조의 실물 ② 터치포인트 1회/일 → 2회/일 = 습관 루프·리텐션 배가(북극성 지표 확장) ③ 실행 데이터(개입 횟수·소요시간·단계별 시간)는 경쟁자가 못 베끼는 개인화 데이터 자산(2026-07-23 리서치: 해자=실행) — 발표 슬라이드 근거 3종.
- **제품 완결성 40:** 문제 발생 → 개입 → 사용자 행동 → 결과 → **다음 실행 조정**까지 닫힌 루프가 실제로 돈다. 목업이 아니라 상태·기록·되먹임이 있는 제품. 기존 5화면 무회귀.
- **발표 20:** 60초 무네트워크 데모(와이파이 리스크 0), 음성이 "부모 대신 말해주는 AI"를 청각적으로 각인.

## 8. 위험 요소와 대응

| 위험 | 대응 |
|------|------|
| 홈(2,089줄) 회귀 | 삽입 ~10줄로 제한, 히어로·캐시·케어 플랜 로직 무접촉. 스모크 필수 |
| TTS 보이스 부재/품질 | 발표 기기·브라우저에서 사전 리허설(체크리스트에 명시). 실패해도 텍스트 100% 동작 |
| 하이드레이션 불일치 | localStorage 읽기는 마운트 effect 이후(홈 기존 패턴) |
| 루틴 중 새로고침 | 처음부터 재시작(수용). 진행 중 세션 복원은 P1 |
| dev 중 build 금지 | `npm run build`는 dev 서버 내린 뒤 실행(distDir 손상 이력) |

## 9. P1 (P0 검증 완료 + 사용자 승인 후에만)

1. 오늘 상태 선택(평소대로/늦었어요/피곤해요) — 더위 warn 날 "피곤해요" 기본 선택으로 환경 연결 강화
2. 상태별 루틴 조정(책 축소·문장 단축)
3. 최근 3회 기록·개입 횟수 추이(결과 화면 하단)
4. `track()` 계측 이벤트(routine_started/step_completed/routine_completed)
5. 진행 중 세션 sessionStorage 복원, 진입 카드 저녁 시간대 강조
