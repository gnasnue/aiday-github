# Design System — aiday (AI Weather for Kids)

## Product Context
- **What this is:** 환경 데이터를 아이 체질 기준으로 해석해 부모의 하루 첫 육아 판단(옷차림·준비물·케어 방식)을 지원하는 AI 육아 앱
- **Who it's for:** 영·유아 자녀를 둔 부모 (주 사용자: 30대 엄마·아빠)
- **Space/industry:** 육아 + 날씨 정보, 한국 모바일 앱
- **Project type:** 모바일 우선 웹앱 (390px 고정 프레임, BottomNav)

## Aesthetic Direction
- **Direction:** White Report — 토스의 정보 신뢰(그레이 배경 + 순백 카드 면 분리) × 당근의 오렌지 온기(화이트 위 포인트)
- **Benchmark:** 토스(TDS)·당근(seed design), 2026-07-16 벤치마크 리뷰 — `docs/reviews/2026-07-16-DESIGN-v3-proposal.md`
- **Decoration level:** intentional — 색과 여백으로만 위계 표현. **이모지 UI 사용 전면 금지**, 일러스트 없음 (예외: outfit 코디 미리보기 캐릭터)
- **Mood:** 아이를 돌보는 부모가 아침에 빠르게 확인하는 앱. 불안을 줄이고 확신을 주는 느낌. 따뜻하지만 정확하다.
- **Memorable thing:** "오렌지 날씨 앱 — 아이 걱정이 줄어드는 느낌"

## Typography
- **폰트:** Pretendard Variable 단일 패밀리 (한국어 최적)
- **Loading:** `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css`
- **Scale (v3):**
  | 이름 | px / weight | 용도 | 규칙 |
  |------|------------|------|------|
  | display | 26 / 800 / -0.02em | 페이지 히어로 결론 전용 (홈 AI hook · env 야외활동 지수 등급) | 페이지당 1회 |
  | title-lg | 20 / 700 / -0.01em | 페이지 타이틀 | |
  | title | 17 / 700 | 섹션 헤더 | 위계 차이는 크기가 아니라 여백으로 |
  | body | 16 / 400·500 | 본문·리스트 행 | line-height 1.6 |
  | label | 14 / 500·600 | 보조·버튼(소)·링크 | |
  | caption | 13 / 400 | 메타·근거·trust line | |
  | eyebrow | 11 / 700 / +0.08em | 섹션 아이브로우 전용 | **11px 미만 전면 금지** |
- **숫자:** `.num` (tabular-nums, -0.03em, 600~700) — 온도·수치·시각 전용. 한글 문장 금지.

## Color
- **Approach:** restrained + 오렌지 역할 3분리 — **면(primary solid)** = CTA·활성 탭 아이콘 / **텍스트(accent)** = 링크·강조 수치·활성 레이블 / **배경(primary-tint)** = 선택 상태·아이콘 컨테이너. 경고는 언제나 status-warn.
- **웜 뉴트럴 원칙:** 모든 중립색은 웜톤(24~36 hue). 원본 토큰은 `app/globals.css`가 단일 진실이며 아래 hex는 근사값.

### Light Mode (v3)
| 변수 | hsl 토큰 | hex(근사) | 용도 |
|------|----------|-----------|------|
| background | `30 15% 96%` | `#F6F4F2` | 페이지 배경 (웜 그레이 페이퍼) |
| card | `0 0% 100%` | `#FFFFFF` | 카드·시트. **외곽 보더 금지** |
| primary | `25 95% 53%` | `#F97316` | 브랜드 오렌지(당근 톤). solid CTA·활성 탭 |
| primary-foreground | `0 0% 100%` | `#FFFFFF` | CTA 텍스트 — **17px bold 이상에서만 흰색** |
| primary-hover | `25 90% 47%` | `#E8630A` | primary hover |
| primary-tint | `28 100% 93%` | `#FFEDDD` | 선택 칩·아이콘 컨테이너 배경 |
| accent | `26 90% 40%` | `#C2540A` | **텍스트용 오렌지** (4.5:1 대비, 링크·강조) |
| foreground | `25 17% 13%` | `#26201B` | 본문 잉크 |
| muted-foreground | `26 8% 40%` | `#6E655D` | 보조 텍스트 |
| faint | `28 8% 58%` | `#9C938A` | 캡션·비활성·플레이스홀더 |
| muted | `27 12% 94%` | `#F3F0ED` | 뉴트럴 아이콘 컨테이너·secondary 버튼·게이지 트랙 |
| border | `27 12% 93%` | `#F0EDEA` | **카드 내부 헤어라인(divider) 전용** |
| secondary | `35 100% 94%` | `#FFF2E0` | 크림 — 히어로·이벤트 강조 화면당 1곳 한정 |

### Semantic (환경 상태 — 유지)
3단계 원칙: good(좋음·낮음·적정) / neutral(보통·약함 = 특이사항 없음) / warn·bad(주의·나쁨). 상태 용도 오렌지는 항상 "컬러 텍스트 + 도트" — solid 채움은 브랜드 전용.

| 상태 | hex(근사) | 용도 |
|------|-----------|------|
| status-good | `#3D8B5F` | 좋음, 완료 |
| status-neutral | `#756A5F` | 보통·특이사항 없음 (색 없음이 곧 정보) |
| status-warn | `#D4622A` | 주의, 오염 경고 |
| status-bad | `#BF2C22` | 위험, 심한 오염 |
| status-info | `#295EA3` | 일반 정보 |

### Dark Mode
- 배경·카드 hue 유지(24~26), primary `25 95% 58%`, accent(텍스트 오렌지) `26 95% 62%`, primary-tint `25 40% 20%`, faint `30 8% 50%`. 나머지는 globals.css `.dark` 블록 참조.

## Surface — 3단 Elevation (카드 보더 폐지)
| 레벨 | 문법 | 용도 |
|------|------|------|
| L0 | `bg-background` | 페이지 바탕. 섹션 구분은 여백(24/32/48px)만 |
| L1 | `rounded-2xl bg-card p-5 shadow-soft` | 일반 카드. 내부 구분은 `border-t border-border` / `divide-y divide-border` 헤어라인 |
| L2 | `rounded-2xl bg-card p-5 shadow-card` | 화면당 히어로 카드 1곳 (홈 AI 리포트 · env 야외활동 지수) |

- `rounded-2xl` = **20px** (tailwind.config 오버라이드, 카드 표준)
- 그림자 토큰: `shadow-soft`(초경량 flat) / `shadow-card`(히어로) — globals.css 참조
- **금지:** 카드 외곽 `border border-border`, 그라데이션 게이지·버튼 (칩·컨트롤의 기능적 보더는 허용: chip-good/warn, border-control 체크박스, dashed 추가 버튼)

## Component Grammar
- **리스트 행 (당근 패턴):** 높이 ≥56px, `아이콘 컨테이너(36px, rounded-xl, bg-muted 뉴트럴 / bg-primary-tint 강조) + 16px/500 레이블 + ChevronRight(text-faint)`. 행 사이 divider. 마이·설정·출처·카테고리 목록에 카드 나열 대신 사용.
- **CTA 버튼 (토스 패턴):** h-12~52px, rounded-[14px], `bg-primary text-primary-foreground` 17px/700. secondary는 `bg-muted text-foreground`.
- **칩:** 활성 = `bg-primary-tint text-accent`(solid 채움 금지), 비활성 = `bg-card text-muted-foreground shadow-soft`. 상태 칩은 흰 배경 + 상태색 텍스트 + 도트(기존 유지).
- **세그먼트(전환 컨트롤, 토스 패턴):** 상호배타 선택지 2개 이상을 한 덩어리로 전환할 때. `bg-muted rounded-full p-1` 트랙 + 활성 옵션 `bg-card rounded-full shadow-soft text-foreground`(700), 비활성 옵션 `text-muted-foreground`(500). 옵션 내부 높이 36px·트랙 포함 44px, 프레스 `active:scale-[0.97]`. 색 신호가 아니라 "떠오른 흰 알약" 형태로 선택을 전달한다(홈 프로필 전환 등 — 칩보다 컨트롤 어포던스가 필요할 때).
- **게이지:** 단색 트랙(`bg-muted`) + 상태색 단색 fill. 그라데이션 금지.
- **아바타:** 이니셜 원(`bg-avatar text-avatar-foreground`, name.charAt(0)) — 이모지 아바타 금지.
- **상태 판정 텍스트 노출 금지 (하루 케어 플랜 등 타임라인 카드):** "지금"·"곧"·"다음"·"N시간 M분 후"·"기본 시간" 등 하이라이트 판정 로직의 내부 상태를 카드에 **보이는 텍스트로 렌더하지 않는다**. 현재/임박 슬롯 표시는 시각 요소(오렌지 아웃라인·도트 강조)로만 하고, 접근성은 `aria-current` + `sr-only`로 전달한다. 특정 문자열의 문제가 아니라 **범주 규칙** — 새 상태 라벨(예: "완료", "지남")을 추가하는 것도 위반이다. (2026-07-20, 3회 재발 후 확정)
- **시각 강조 적용 기준 시간 (케어 플랜, 2026-07-19 확정 W=90):** 강조는 슬롯 시각 **±90분 밴드 안에서만** 적용한다 — `[start, start+90]`(구간 슬롯은 `[start, end]`)=지금(오렌지 1.5px 아웃라인+도트), `[start−90, start)`=곧(옅은 강조 `border-primary/40`). **어느 밴드에도 안 드는 빈칸에서는 어떤 슬롯도 강조하지 않는다**(전 슬롯 중립) — "다음" 앞보기 강조는 결정 위반. 근거: 기상청 3시간 해상도의 데이터 유효 상한(±2h)보다 안쪽에서만 "지금"을 주장.

## Spacing
- **Base unit:** 4px — 스케일 밖 임의값(5px·9px·11px 등) 지양
- **Density:** comfortable (모바일 터치 타겟 최소 44px)
- **Scale:** 2xs 4 / xs 8 / sm 12 / md 16 / lg 24 / xl 32 / 2xl 48 (Tailwind p-1~p-12)
- **섹션 간격:** 중요도에 따라 24/32/48px 구분 (모두 같은 mt-8 금지)
- **BottomNav 높이:** 64px, **페이지 상단 여백:** 56px

## Layout
- **Approach:** grid-disciplined — 390px 고정 모바일 컬럼
- **Max content width:** 390px, **Horizontal padding:** 20px (px-5)
- **Border radius:** (기준 토큰 `--radius: 0.875rem`)
  | 클래스 | px | 용도 |
  |------|-----|------|
  | rounded-sm | 10px | 뱃지, 태그 |
  | rounded-md | 12px | 인풋, 버튼 |
  | rounded-xl | 12px | 아이콘 컨테이너 |
  | rounded-2xl | **20px** | **카드 표준** (v3 오버라이드) |
  | rounded-full | 9999px | 알약 칩, 아바타 |

## Icons
- **라이브러리:** Lucide React + 커스텀 `LineIcon`(의류·육아 도메인) 단일 세트. **raw 이모지 UI 사용 전면 금지** (2026-07-16 v3에서 71건 제거)
- **크기:** UI 20px, BottomNav 22px, 인라인 16px, 컨테이너 내 18px
- **스타일:** strokeWidth 1.75 (LineIcon은 세트 기본 1.5), 활성: text-primary, 비활성: text-muted-foreground
- **컨테이너:** 36px rounded-xl — 강조 `bg-primary-tint text-accent`, 뉴트럴 `bg-muted text-muted-foreground`, 상태 `bg-status-*-bg text-status-*`

## Motion
- **Approach:** minimal-functional — 이해를 돕는 전환만
- **Easing:** enter: ease-out, exit: ease-in, move: ease-in-out
- **Duration:** micro 100ms / short 200ms / medium 300ms
- **금지:** 스크롤 드리븐, 루프, 과도한 bounce

## Decisions Log
| 날짜 | 결정 | 근거 |
|------|------|------|
| 2026-06-06 | 초기 디자인 시스템 생성 | /design-consultation — 기존 오렌지 시스템 계승·정제 |
| 2026-06-06 | primary-foreground를 어두운 갈색으로 변경 | WCAG 4.5:1 대비비 확보 (v3에서 흰색+17px bold 규칙으로 개정) |
| 2026-06-06 | BottomNav Lucide 아이콘 교체 권장 | OS별 이모지 렌더링 불일치 해소 |
| 2026-07-01 | CharacterReport 캐릭터 일러스트를 "일러스트 없음" 규칙의 유일한 예외로 인정 | /design-review — 신체 부위 매핑 안내는 일러스트가 직관적 |
| 2026-07-13 | 카드 표준 문법 확정: `rounded-2xl border border-border/60 bg-card p-5 shadow-soft` | /design-review 랜딩 일관성 감사 (v3에서 보더 폐지로 개정) |
| 2026-07-15 | 카드 elevation 2단 규칙(히어로 shadow-card) | 홈 1c 리스타일 (v3 3단 elevation으로 흡수) |
| 2026-07-16 | **v3 "White Report" 전면 개정** — 토스·당근 벤치마크. 배경 웜 그레이 #F6F4F2, primary #F5A623→#F97316 심화, 오렌지 역할 3분리(solid/text/tint), 카드 보더 폐지·3단 elevation, 타이포 7단 스케일(display 26 / title 17), 이모지 UI 전면 금지(71건 제거), 리스트 행 문법 도입 | 베타 평가 "전문성 부족" 대응. /design-consultation — `docs/reviews/2026-07-16-DESIGN-v3-proposal.md`, before/after: `docs/reviews/2026-07-16-design-v3-toss-karrot-before-after.html` |
| 2026-07-19 | outfit "AI코디 추천" 배지 `text-red-500` → `bg-primary-tint text-accent` 토큰화 (빨강=status-bad 오독 방지, 브랜드 강조로 정정) | Apple HIG 갭 분석 P1 — `docs/reviews/2026-07-19-apple-hig-gap-analysis.md` |
| 2026-07-20 | 케어 플랜 카드 상태 판정 텍스트 전면 금지(범주 규칙) — "곧/다음 · N시간 후" 카운트다운 포함 제거, 시각 강조+sr-only만. 같은 날 2차 정정: 시각 강조도 확정 기준 시간(±90분 밴드) 밖 빈칸에선 무강조 — #120·#122가 빈칸 "다음" 슬롯에 붙인 옅은 강조 제거 | 동일 지시 3회 재발("지금"→#122, "기본 시간"→#122, "다음 · 7시간 50분 후"→금번). 문자열 단위 제거로는 재발 — Component Grammar에 범주 규칙로 영속화. 밴드 기준은 2026-07-19 W=90 승인 설계 원복 |
| 2026-07-20 | 케어 플랜 타이틀 "하루 케어 플랜"→"오늘의 케어 플랜". 준비물 칩 강조를 아이템 화이트리스트({우산·마스크·선크림})에서 **신호 긴급도 판정**(`lib/prep.ts isCriticalPrep`)으로 교체 — 확정 강수·폭염 물병·한파 방한·미세먼지 나쁨 마스크·매우강함 선크림만 chip-warn. 보습제 체질 상시 신호는 습도 60%↑에서 억제 + 우선순위 85→52 강등 | 실사용 지적: 습도 90% 여름 아침 "보습제" 추천은 비논리, 예비 신호(강수 45%) 우산까지 오렌지 강조는 과잉·폭염 물병은 누락. 강조=긴급도라는 의미 정합 확보, vitest 회귀 15건 고정 |
| 2026-07-19 | **예외 인정**: signup·login의 Google 로그인 버튼은 Google 공식 브랜드 가이드라인 색상(`#747775`·`#1F1F1F`)·Roboto 폰트를 의도적으로 하드코딩 — 디자인 토큰 체계의 유일한 승인 예외 | 서드파티 브랜드 버튼 규격 준수 요구 |
| 2026-07-19 | **세그먼트(전환 컨트롤) 문법 신설** — 홈 프로필 전환을 칩→세그먼트 컨트롤로. 배경색만 남은 활성 칩이 "누를 수 있는 버튼"으로 안 읽힌다는 피드백 → 색이 아니라 "떠오른 흰 알약" 형태로 어포던스 표현 | /design-consultation |
| 2026-07-20 | **준비물 어휘 단일화 + 안전 규칙 3중 정렬** — 준비물 표준명 사전 `lib/prep-vocab.ts` 신설(물병→물통, 자외선차단제→선크림 등), AI 생성물은 표시·강조 판정 전 표준화. 마스크 연령 규칙(만 2세 미만 금지)을 `canRecommendMask`로 도메인화해 AI 프롬프트·규칙 체크리스트·케어 플랜 칩이 공유 — 미달 시 "실내놀이"로 대체(경고 소실 방지). 체크리스트 체크 상태는 인덱스→key 기준(목록 교체 시 오체크 방지) | 준비물 파이프라인 점검: 표면 4개(hook·message·체크리스트·칩)를 엔진 3개(AI·규칙 폴백·규칙 슬롯)가 나눠 채우며 어휘·안전 규칙이 어긋나던 구조 결함. vitest 15건 추가 |
| 2026-07-21 | **env 화면 IA 재구성** — 직무 재정의(홈=판단, env=근거+계획): WeatherNowCard·맞춤 인사이트 섹션 제거, 대기질·꽃가루·자외선·온습도 3섹션을 "지금 환경 지표" 단일 카드 리스트 행으로 통합(등급 우선·warn만 색+도트·체질 각주는 warn 행에만·결측 압축), 야외활동 지수를 히어로로 승격. 규칙 개정 2건: display 26 용도를 "페이지 히어로 결론"으로 확장, shadow-card를 "화면당 히어로 1곳"으로. 게이지 fill 브랜드 오렌지 제거(상태색만, 감사 C-3), env 프로브 버튼 primary-tint 전환(R-2), 위치 버튼 44px(C-9) | /plan-design-review — `docs/reviews/2026-07-21-env-ia-plan.md`, 승인 시안 `docs/reviews/2026-07-21-env-ia-mockup.html`. 판단 이원화로 인한 화면 간 모순(홈 강수 60% warn vs env 지수 80 "좋음") 해소가 동기 |
| 2026-07-22 | **홈 시각 완성도 폴리싱 F1~F7** — (F1) 타입 위계 3단화: 체크리스트 항목 14.5/bold→16/500(리스트행), 카드 라벨 15→14, 스케일 밖 값 제거. (F2) 케어 플랜 카드 resting 보더 제거 — `border-[1.5px]` 베이스 + resting `border-transparent`로 환경 타임라인 카드와 표면(그림자만) 통일, 지금/곧 강조 시 레이아웃 시프트 0. (F3) AI 카드 내부 `px-0.5` 제거로 좌측선 x40 통일. (F5) 섹션 간격 균일 mt-8→중요도 차등(히어로→환경 48 / 환경↔케어 32). (F6) 현재환경 한 줄 값 semibold/foreground→medium/muted로 톤다운(hook 강조). **(F7) 히어로 헤더 밴드 `secondary`(크림)→`primary-tint`(피치)로 웜톤 통일** — 한 카드 안 크림+피치 두 웜 액센트가 탁해 보이던 문제 해소, 아이콘 타일과 동일 브랜드 톤. **secondary(크림)는 홈에서 미사용이 됨**(다른 화면 히어로·이벤트 강조 토큰으로 존치). F4(케어 카드 레일 들여쓰기)는 정당한 타임라인 패턴이라 유지 | /design-review(승인 게이트) — "실제 유료 육아 앱 수준" 시각 완성도 요청. 브랜치 `codex/home-design-polish`, 커밋 F1·F2·F3·F5·F6·F7 원자 분리 |
