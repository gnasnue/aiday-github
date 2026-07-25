# 홈 Hero Decision Brief — Figma 제작 지시서

> 산출일 2026-07-25 · 시안: [`2026-07-25-home-decision-brief-design.html`](./2026-07-25-home-decision-brief-design.html)
> 동작 프로토타입: [`2026-07-25-home-decision-brief-prototype.html`](./2026-07-25-home-decision-brief-prototype.html) — 아이 전환·상태 5종·다크·치수 오버레이·계약 상한 스트레스를 실제로 눌러볼 수 있다
> 대상: 390px 모바일 홈 (AI 판단 브리프 + 준비물 실행)
> 권위: 색·간격·반경의 단일 진실은 `app/globals.css`. 이 문서의 hex는 hsl에서 계산한 근사값이다.
> **이 문서는 명세이며 앱 코드는 변경하지 않았다** — `app/(main)/home/page.tsx`는 다른 세션이 작업 중.

## 0. 3자 일치 원칙

Figma 컴포넌트명 = 시안 CSS 클래스명 = React 컴포넌트명을 하나로 맞춘다.
디자이너가 “`PrepChecklistRow`의 `completed` variant”라고 말하면, 개발자가 리포에서 같은 이름을 검색 한 번으로 찾는다.

| 레이어 | Figma | 시안 CSS | 구현 |
|---|---|---|---|
| 히어로 | `HeroDecisionBrief` | `.hero` | `components/HeroDecisionBrief.tsx` (신규) |
| 근거 칩 | `EvidenceChip` | `.evidence-chip` | 같은 파일 내 서브 컴포넌트 |
| 근거 진입 | `DetailEntryRow` | `.detail-row` | 히어로 아래 **상세 펼침 행**(AI 본문 + 출처) |
| 준비물 행 | `PrepChecklistRow` | `.checklist__row` | 현행 체크리스트 `li` 분리 |
| 피드백 | `FeedbackRow` | `.feedback` | `components/ReportFeedback.tsx` |

---

## 1. Variables — 3개 컬렉션

### 1-1. `Primitives` (모드 없음)
원시값만. UI에서 직접 참조하지 않는다.

```
color/warm/ink-900     #26201B      color/orange/500   #F97316
color/warm/ink-600     #6E655D      color/orange/700   #C2540A
color/warm/ink-400     #9C938A      color/orange/100   #FFEDDD
color/warm/paper-50    #F6F4F2      color/green/600    #3D8B5F
color/warm/paper-100   #F3F0ED      color/green/100    #DCEFE2
color/warm/line-100    #F0EDEA      color/amber/600    #D4622A
color/warm/line-300    #E0D6C8      color/amber/100    #FBE3D4
color/white            #FFFFFF      color/blue/700     #295EA3
                                    color/blue/50      #F2F6FB
```

### 1-2. `Semantic` (모드 2개: **Light / Dark**)
컴포넌트는 **반드시 이 컬렉션만** 참조한다. 다크 모드는 값 교체로 자동 해결된다.

| Variable | Light | Dark | 용도 |
|---|---|---|---|
| `bg/page` | `#F6F4F2` | `#1B1715` | 페이지 바탕 |
| `bg/card` | `#FFFFFF` | `#252019` | Hero·체크리스트 면 |
| `bg/surface` | `#F3F0ED` | `#2E2823` | 근거 칩·아이콘 타일·세그먼트 트랙 |
| `bg/brand-tint` | `#FFEDDD` | `#3B2A1C` | 강조 준비물 타일 1곳 |
| `bg/state-caution` | `#FDF2E9` | `#2B211A` | **신규** context pill (주의) · 코드 토큰명 `--status-warn-tint` |
| `bg/state-safe` | `#EDF6F0` | `#1E2A22` | **신규** context pill (기회) · 코드 토큰명 `--status-good-tint` |
| `bg/done` | `#DCEFE2` | `#1E2E24` | 체크리스트 all-done 카드 |
| `text/primary` | `#26201B` | `#F7F1EA` | 헤드라인·제목·수치 |
| `text/secondary` | `#6E655D` | `#B4A99E` | supporting·사유 |
| `text/tertiary` | `#9C938A` | `#8A8078` | **장식 글리프 전용** — chevron·구분자. 흰 카드 대비 3.02:1로 AA 미달이므로 **의미 있는 텍스트 금지** |
| `text/action` | `#C2540A` | `#F9A25E` | **행동**: 헤드라인 준비물 단어·강조 타일 아이콘 |
| `icon/brand` | `#F97316` | `#FB8B3C` | 활성 탭 |
| `state/caution` | `#D4622A` | `#EE9163` | **근거**: context 아이콘·warn 칩 값·도트 |
| `state/safe` | `#3D8B5F` | `#7CC79C` | 완료 체크·safe 칩·“준비 끝” |
| `border/hairline` | `#F0EDEA` | `#332C27` | 행 divider **전용** |
| `border/control` | `#E0D6C8` | `#3D352E` | 체크박스 unchecked·dashed |

> **강조색 2개 규칙의 구조적 보장**: `text/action`(브랜드)과 `state/*`(판단 근거)는 **서로 다른 역할 슬롯**이다. 한 요소가 둘 다 참조하는 일은 없다. 이 규칙을 Variables 이름에 박아두면 신규 화면에서도 깨지지 않는다.

### 1-3. `Layout` (모드 없음)
```
space/4   4    radius/tile   12     size/icon-ui       20    size/tap-min  44
space/8   8    radius/row    18     size/icon-tile     18    frame/width   390
space/12  12   radius/card   20     size/icon-inline   16    frame/pad-x   20
space/16  16   radius/hero   24     size/icon-micro    14
space/20  20   radius/pill   999    size/tile          36
space/24  24                        size/checkbox      24

※ 4px 격자만 쓴다(6·10·14 같은 반 토큰 없음). 배치 리듬은 8의 배수를 기본으로 고른다.
```

---

## 2. Styles

### 2-1. Text Styles — Pretendard Variable 단일 패밀리

| Style | px / weight / tracking / line-height | 적용 |
|---|---|---|
| `Display/Headline-28` | 28 / 800 / **-0.028em** / 1.30 (=36.4px) | Hero 결론 — **화면당 1회**. 기존 `display` 26을 28로 개정하는 것이며 새 단이 아니다 |
| `Title/Page-20` | 20 / 700 / -0.02em / 1.35 | “지우의 오늘 준비” |
| `Title/Section-17` | 17 / 700 / -0.015em / 1.4 | “오늘 챙길 것” |
| `Label/Row-16` | 16 / 500 / -0.01em / 1.45 | 준비물 제목 |
| `Body/15` | 15 / 400 / 0 / **1.66** | Hero supporting |
| `Label/Strong-13` | 13 / 600 / -0.01em / 1.35 | context pill · 근거 진입 라벨(15/600은 별도) |
| `Caption/13` | 13 / 400~500 / 0 / 1.45 | 사유·메타 |
| `Chip/Label-13` | 13 / 500 / -0.01em / 1.3 | 근거 칩 라벨(값은 `Num/13` 또는 13/700) |
| `Num/13` | 13 / 700 / -0.02em / tabular-nums | 칩 값·카운터·시각 |

**한글 처리(전 스타일 공통)**
- 모든 텍스트 노드: `word-break: keep-all` 대응 = Figma에서 **어절 중간 개행이 생기지 않도록** 수동 개행 대신 폭을 조정한다.
- 헤드라인은 **의미 단위로 개행**한다: `얇게 입히고 / 겉옷을 챙겨주세요` (조사·서술어를 쪼개지 않는다). 28px·-0.028em에서 한 줄 상한은 **약 11자**(310px)다.
- **제품 텍스트 최소 13px**(BottomNav 라벨 11px만 예외 — 현행 유지). 12px은 쓰지 않는다: 이 리포는 12→13 되돌림을 이미 한 번 거쳤다. 자간은 크기가 커질수록 좁힌다(28px → -0.028em, 20px → -0.02em, 16·13px → -0.01em).
- 숫자는 `Num/*`만 사용(tabular). 한글 문장 안의 숫자에는 적용하지 않는다.

### 2-2. Effect Styles
| Style | 값 | 적용 |
|---|---|---|
| `Elevation/L2-hero` | `0 1px 3px rgba(38,32,27,.05)` + `0 10px 28px -10px rgba(46,36,26,.12)` | **Hero 단 1곳** |
| `Elevation/L1-card` | `0 1px 2px rgba(38,32,27,.04)` | 체크리스트 카드·근거 진입 행·세그먼트 활성 알약 |
| `Highlight/KeyPhrase` | `inset 0 -0.28em 0 bg/brand-tint` (28px 기준 ≈ 8px 띠) | 헤드라인 키프레이즈 강조 — **색이 아니라 형태로 강조**하는 유일한 장치 |
| (없음) | — | 칩·타일·pill은 그림자 금지 |

### 2-3. Grid
`Layout Grid`: Columns 1, Margin 20, Gutter 0 → 콘텐츠 폭 **350px** 고정. 모든 카드가 이 폭을 Fill한다.

---

## 3. Components

### 3-1. `HeroDecisionBrief` — Variant `state = normal | caution | safe`

```
Auto Layout   Vertical · Fill W · Hug H
Padding       20 (4면 동일)
Gap           0  (요소별 개별 top margin: pill 0 → headline 16 → support 8 → evidence 16)
Fill          bg/card       Radius radius/hero(24 = Tailwind `rounded-3xl`, 새 토큰 불필요)
Effect        Elevation/L2-hero
실측          350 × 272px (caution · 헤드라인 2줄 · supporting 2줄 · 칩 3개)
```

| Property | 타입 | 기본값 |
|---|---|---|
| `context` | Text | `등원·야외활동 시간에 일교차가 커요` |
| `headline` | Text (강조 1구간) | `얇게 입히고 겉옷을 챙겨주세요` — 강조 구간은 **잉크 유지 + `Highlight/KeyPhrase` 밴드**. `text/action` 색 강조 금지(무채색에서 잉크보다 밝아져 강조가 역전된다) |
| `support` | Text | `지우가 땀을 많이 흘리는 편이라, …` |
| `stateIcon` | Instance swap | `Icon/Thermometer` |
| `evidence` | Instance ×2~3 | `EvidenceChip` |

**state별 차이 (그 외 모든 값 동일)**

| state | pill fill | pill 아이콘 | 아이콘 색 | 헤드라인 어법 |
|---|---|---|---|---|
| `normal` | `bg/surface` (웜 뉴트럴, 신규 토큰 없음) | `Icon/CloudSun` | `text/secondary` | “가볍게 … 챙겨주세요” |
| `caution` | `bg/state-caution` (`bg-status-warn-tint`) | 이슈 아이콘(온도계·우산·잎·먼지) | `state/caution` | “… 챙겨주세요” |
| `safe` | `bg/state-safe` (`bg-status-good-tint`) | `Icon/Sun` | `state/safe` | “… 다녀오세요” |

> **색만으로 상태를 구분하지 않는다.** 아이콘 모양 + 어법 + 근거 칩 도트 유무가 색 없이도 상태를 전달한다(무채색 검증: 시안 §5).

### 3-2. `EvidenceChip` — Variant `tone = neutral | warn | good`
```
Auto Layout   Horizontal · Hug · Height 36 · Gap 4 · Padding 8/12   (칩 간 gap 8)
Fill          bg/surface     Radius radius/pill     보더 없음
구성          Label(Chip/Label-13, text/secondary) + Value(13/700, text/primary) + Dot(4px, 옵션)
tone=warn     Value → state/caution, Dot 표시
tone=good     Value → state/safe,    Dot 표시
tone=neutral  Dot 숨김
```
- 칩은 **2~3개만**. 4개 이상은 “판단하지 않았다”는 신호이므로 금지.
- 3개 실측 합 = **285px**(콘텐츠 폭 310px 안에 1줄 수납). 라벨이 길어지면 wrap으로 2줄, 높이만 늘어난다.
- 값이 숫자일 때만 tabular(`Num/13`). `높음`·`없음`처럼 한글 값에는 `.num`을 쓰지 않는다(숫자 전용 규칙).
- **없는 지표는 칩을 만들지 않는다** — `—`/`정보 없음` 칩 금지. 칩이 2개 미만이면 근거 행 자체를 숨긴다.

### 3-3. `PrepChecklistRow` — Variant `state = default | pressed | completed` × `isPrimary = true | false`
```
Auto Layout   Horizontal · Fill W · min-h 56 · Gap 12 · Padding 8 top/bottom (실측 62~63px)
Border        상단 border/hairline 1px (첫 행은 없음)
구성          Checkbox(24, Hug) + IconTile(36, Hug) + Body(Fill: 제목 + 사유)
```
| state | 체크박스 | 타일 | 제목 | 행 |
|---|---|---|---|---|
| `default` | 원 24, 1.5px `border/control`, 체크 숨김 | `bg/surface` / `text/secondary`<br>(`isPrimary=true`만 `bg/brand-tint` / `text/action`) | `Label/Row-16` `text/primary` | — |
| `pressed` | 동일 | 동일 | 동일 | Fill `bg/surface` + Scale 0.99 (200ms ease-out — DESIGN.md motion short) |
| `completed` | `state/safe` 채움 + 흰 체크(14, stroke 3) | `bg/surface` / `text/tertiary` | `text/secondary` + 취소선 1.5px `text/tertiary` | — |

- **`isPrimary`는 화면에 딱 1개** — 헤드라인이 지시한 준비물. 나머지는 뉴트럴 타일.
- 완료 애니메이션은 색 전환 200ms만. 컨페티·바운스·행 이동 금지(아침에 필요한 것은 축하가 아니라 확인).
- 카드 전체 완료 시: 카드 Fill → `bg/done`, 타일·피드백 버튼 → 흰색 72%, 카운터 → “준비 끝”.

### 3-4. 그 외

| Component | Auto Layout | Variants | 비고 |
|---|---|---|---|
| `HomeHeader` | V · Fill W · Hug H · gap 8 · padding 4/20/16 | `hasMultipleChildren` | 타이틀 블록 Fill, 액션 Hug |
| `ProfileSegment` | H · Hug · gap 2 · padding 4 · 트랙 `bg/surface` radius 999 | 탭 수 × `activeIndex` | 활성 탭만 `bg/card` + `Elevation/L1` |
| `IconButton` | 44×44 고정 · 아이콘 20 중앙 | `default / hover / pressed / disabled` | `aria-label` 필수(새로고침·공유) |
| `LocationButton` | H · Hug · min-h 44 · gap 3 | `default / locating` | pin 14 + 라벨 13 + chevron 14 |
| `DetailEntryRow` | H · Fill W · min-h 64 · gap 12 · padding 12/14/12/12 | `default / pressed / expanded` | 타일·chevron Hug, 본문 Fill. **링크가 아니라 펼침 행** — chevron ▾ 180° 회전, `aria-expanded`. 펼치면 아래에 `message`(16/400/1.6) + 출처(13/400)가 붙는다. `/env`로 보내면 AI 본문이 도달할 화면이 없어 사라진다 |
| `SectionHeader` | H · Fill W · baseline | `meta = counter / done / none` | 타이틀 Fill, 메타 Hug |
| `FeedbackRow` | H · Fill W · space-between · padding-top 14 | `idle / rated-up / rated-down / sent` | 상단 hairline, 버튼 36 |
| `BottomNav` | H · Fill W · space-around · padding 8/4/10 | 5탭 × active | 활성 `icon/brand` |

---

## 4. Hug / Fill 규칙 — 텍스트가 길어져도 깨지지 않게

| 노드 | 설정 | 한계와 처리 |
|---|---|---|
| `Hero / ContextPill` | **Hug** (텍스트만큼) | 폭 310px 초과 시 2줄 wrap. pill 높이만 증가 |
| `Hero / Headline` | **Fill W · Hug H** | 3줄까지 허용. 4줄 이상 → 28px로 강등. AI hook 25자 제한이 상한을 보장(`lib/prompts/report.ts:115`) |
| `Hero / SupportingCopy` | **Fill W · Hug H** | 줄 수 무제한(카드가 Hug로 늘어남). **truncate 금지** — 개인화 근거를 자르면 유료 서비스의 핵심이 사라진다 |
| `Hero / EvidenceRow` | H · **wrap 허용** · gap 6 | 칩 각각 Hug. 3개 합 298px |
| `PrepChecklistRow / Body` | **Fill** (226px) | 제목 1줄 고정(표준 어휘 최장 5자), 사유 2줄까지 wrap |
| `HomeHeader / Title` | **Fill** | 이름 6자까지 1줄, 초과 시 truncate(전체 이름은 세그먼트에서 확인) |
| `ProfileSegment` | **Hug** · 부모는 가로 스크롤 | 아이 3명 이상이면 스크롤, 위치 버튼은 고정 |

절대 좌표 배치는 **0건**이어야 한다. 시안에서 절대 배치는 §2 주석 번호 뿐이며, 이는 문서용 요소로 제작 대상이 아니다.

---

## 5. 제작 순서 (Figma)

1. `Primitives` → `Semantic`(Light/Dark) → `Layout` 컬렉션 생성. **Semantic만 컴포넌트에서 참조.**
2. Text Styles 9개, Effect Styles 2개 생성.
3. 390 프레임 + Layout Grid(margin 20).
4. 원자 컴포넌트: `IconButton` → `EvidenceChip` → `IconTile` → `Checkbox`.
5. 조합 컴포넌트: `PrepChecklistRow`(6 variant) → `HeroDecisionBrief`(3 variant) → `DetailEntryRow` → `SectionHeader` → `FeedbackRow`.
6. 화면 조립: `Home / 390 · state=caution`을 기준으로, `normal`·`safe`는 variant 전환만.
7. 다크 모드 검증: Semantic 모드 전환 1회로 전 화면이 성립하는지 확인.
8. 레이어명 정리 — 시안 §8 트리와 1:1 대조.

## 6. 구현 매핑 (개발)

- **AI 계약 변경 0**: 현행 hook은 `"[공감] — [행동]"` 구조이고(`lib/prompts/report.ts:115`) 홈은 이미 `splitHook()`로 대시 기준 2분할한다(`app/(main)/home/page.tsx:183-192`).
  → `splitHook(hook)[0]` = **context pill**, `[1]` = **headline**. 프롬프트·캐시 스키마 수정 없이 붙는다.
  → 브리프 예시처럼 완결된 조건 문장을 원하면 프롬프트에 `context` 필드를 추가하고 **캐시 키 버전을 올린다**(`CLAUDE.md` 캐시 키 규칙).
- **근거 칩 데이터**: 홈이 이미 가진 `nowWeatherItems`·등급 값에서 3개 선택. 새 API 호출 없음.
- **강조 타일 1개**: 헤드라인이 지시한 준비물(= hook의 1순위 이슈, `report.ts` 규칙 5). 헤드라인이 물건을 지목하지 않으면 `isCriticalPrep`(`lib/prep.ts:134`) 첫 항목으로 폴백.
- **어휘**: 표시 전 `canonicalPrep()` 통과 필수 — `여벌 옷`·`물통`·`선크림`(`lib/prep-vocab.ts`).
- **체크 상태 키**: 인덱스가 아니라 표준화된 준비물명 기준(목록 교체 시 오체크 방지, 2026-07-20 결정).
- **Tailwind 대응**: `bg-card` `bg-muted` `bg-primary-tint` `text-accent` `text-muted-foreground` `text-faint` `border-border` `border-border-control` `shadow-card` `shadow-soft` `rounded-2xl`. 신규 필요: `rounded-[24px]`(Hero), `bg-state-caution|normal|safe`(3토큰), `text-[30px]`(display-lg).

## 7. 검수 체크리스트 (구현 후 390px 라이트/다크)

- [ ] 첫 화면(844px)에 Hero 전체 + 근거 진입 + 체크리스트 헤더 + 2행이 보인다
- [ ] `shadow-card`는 화면에 1개뿐, 24px radius도 Hero뿐
- [ ] 강조 오렌지 요소 = 헤드라인 준비물 단어 + 강조 타일 1개 + 활성 탭. 그 외 0개
- [ ] 상태 판정 텍스트(“지금·곧·다음·N시간 후·기본 시간”) 0건
- [ ] 이모지 0건, 그라데이션 0건, 카드 외곽 보더 0건
- [ ] 12px 미만 텍스트 0건
- [ ] 터치 타깃 44px 미달 0건(새로고침·공유·위치·세그먼트·체크리스트 행)
- [ ] 그레이스케일 스크린샷에서 결론 → 이유 → 근거 → 실행 순서가 유지된다
- [ ] 헤드라인 3줄·사유 2줄·이름 6자 케이스에서 레이아웃이 깨지지 않는다
- [ ] 다크 모드에서 상태 tint 3종이 서로 구분된다


---

## 8. Edge States — 반드시 함께 만든다

목업에 없지만 아침에 자주 보이는 상태들. 컴포넌트 variant 또는 별도 프레임으로 만든다.

| 상태 | 규칙 |
|---|---|
| `fallback` (AI 실패·한도) | 결론은 **`Title/Page-20`**으로 낮춘다 — `Display/Headline-28`은 **AI 판단 전용**이고 규칙 기반 추천이 빌려 쓰면 신뢰가 오염된다. pill은 뉴트럴 + “기상청 예보 기준 기본 추천”, 하단에 “AI 판단 다시 받기” 44px 버튼. **근거 칩은 실측 데이터라 그대로 유지.** |
| `loading` | 정적 `bg/surface` 블록. 실제 요소와 같은 높이(pill 36 / 결론 26×2 / 근거 36 / 행 46)로 **레이아웃 시프트 0**. shimmer·펄스 없음. 캐시 리포트가 있으면 스켈레톤을 건너뛴다. |
| `provisional` (00~06시 생성) | supporting 아래 `Caption/13` `text/secondary` 한 줄: “전날 밤 예보 기준이에요 — 아침 6시 이후 당일 예보로 자동 갱신돼요”. 면책이 아니라 관리 능력의 신호. |
| `limit` (생성 한도) | 근거 진입 행 자리에 `bg/brand-tint` 배너 1개. 게스트만 CTA. Hero는 마지막 판단 유지. |
| `missing` (지표 결측) | 없는 지표는 **칩을 만들지 않는다**. `—`/`정보 없음` 칩 금지. 칩 2개 미만이면 근거 행을 숨긴다. |

## 9. 이번 작업에서 발견한 문서-코드 불일치 (별건 처리 권장)

- **`DESIGN.md:28` eyebrow 자간이 코드와 다르다** — 문서는 `11 / 700 / +0.08em`이지만 `app/globals.css:213-215`의 `.eyebrow`는 `tracking-[0.14em]`이다. `DESIGN.md:33`이 “원본 토큰은 globals.css가 단일 진실”이라고 스스로 규정하므로 **문서를 0.14em으로 정정**하는 것이 맞다. 이 화면은 eyebrow를 쓰지 않으므로 이번 변경과 무관하며, 별도 커밋을 권한다.
- **`components/ShareReportCard.tsx`가 아직 v2 토큰** — 별도 hex·그라데이션·카드 외곽 보더·이모지 아이콘을 쓴다(2026-07-23 리뷰에서도 지적됨). 홈 화면 밖이지만 사용자에게 전달되는 산출물이라, 이 Hero가 확정되면 **공유 이미지 v3 동기화**를 별건으로 진행해야 한다.


---

## 10. 키프레이즈 하이라이트 — Figma 구현 예외

코드에서는 인라인 `box-shadow: inset 0 -0.28em 0 var(--primary-tint)` + `box-decoration-break: clone` 한 줄이면 끝난다. 그런데 **Figma에는 텍스트 런(run) 단위 배경이 없다.** 따라서 시안에서만 다음 예외를 허용한다.

- `Hero/Headline` 프레임 안에 `Highlight/KeyPhrase` 사각형(Fill `bg/brand-tint`, 높이 8px, radius 0)을 키프레이즈 글자 뒤에 **절대 배치**한다. 이 문서의 “절대좌표 금지” 규칙에 대한 **유일한 예외**이며, 이유는 장식이 아니라 **Figma의 표현 한계**다.
- 개발자는 이 사각형을 그대로 구현하지 말고 위의 `box-shadow` 한 줄로 옮긴다(줄바꿈·자동 폭이 공짜로 따라온다).
- 키프레이즈를 별도 텍스트 레이어로 쪼개지 말 것 — 한국어 줄바꿈(`keep-all`)이 깨진다.

## 11. Auto Layout 실무 함정 (Figma 한정)

- **`min-width: 0` 강제** — Fill 텍스트의 부모가 Horizontal Auto Layout이면 Figma는 자식 최소폭을 텍스트 내용으로 잡아 형제(아이콘·카운터)를 밀어낸다. `TitleBlock`·`DetailEntryRow/Body`·`PrepChecklistRow/Body`·`SectionHeader/Title`에 min-width 0을 명시한다.
- **max-width는 하드코딩 금지, `Layout` 변수로**:
  `maxw/hero-text 310`(=350−20−20) · `maxw/title 250`(=350−44−44−12) · `maxw/prep-text 226`(=350−20−24−12−36−12−20) · `maxw/detail-sub 246`.
- **truncate(1줄 + …) 대상** — 계량·라벨성 단문만: 헤더 메타·위치 라벨·`DetailEntryRow/Sub`·`PrepChecklistRow/Title`·`EvidenceChip/Label`.
- **wrap(Auto height) + truncate 절대 금지 대상** — 판단 문장 전부: `Hero/Context`·`Hero/Headline`·`Hero/Supporting`·`PrepChecklistRow/Reason`·`FeedbackRow/Question`. 판단을 자르면 제품이 사라진다.
- **줄 수 계약(콘텐츠 상한)** — Headline ≤ 24자·최대 3줄(28px에서 한 줄 약 11자) / **Context ≤ 20자·1줄** / **Supporting ≤ 60자·2줄** / `PrepRow/Reason` ≤ 34자·2줄 / `DetailEntryRow/Sub` ≤ 18자·**1줄 고정**.
  이 수치는 임의값이 아니라 **첫 화면 보존선에서 역산한 값**이다(프로토타입 실측):

  | 콘텐츠 | Hero | 헤더 하단 | 첫 행 하단 | Safari(≈671) | 스탠드얼론(736) |
  |---|---|---|---|---|---|
  | 기본(2줄·2줄·1줄) | 272px | y=599 | y=670 | 첫 행까지 | 둘째 행까지 |
  | 계약 상한(3줄·2줄·1줄) | 308px | y=635 | y=707 | 헤더까지 | 첫 행까지 |
  | 계약 위반(3줄·3줄·2줄) | 375px | y=703 | y=774 | 근거 행까지 | 헤더까지 |

  → **계약을 지키면 “체크할 것이 있다”는 신호(헤더+카운터)가 항상 첫 화면에 남는다.** Context를 2줄로 허용하거나 Supporting을 3줄로 늘리는 순간 그 보장이 깨진다. 따라서 이 상한은 문구 취향이 아니라 **레이아웃 계약**이다 — AI 프롬프트의 자수 제한(`hook` 25자)과 같은 층위로 다뤄야 한다.

## 12. 검수 항목 추가 (§7과 함께 본다)

- [ ] 키프레이즈 밴드가 **그레이스케일 스크린샷에서도 띠로 보인다**
- [ ] 헤드라인 키프레이즈에 `text/action`(주황 글자)이 쓰이지 않았다
- [ ] `DetailEntryRow/Sub`(판단 기준)가 **1줄**로 유지된다 — 아이 이름이 길면 “체질” 앞 이름을 생략하고 “우리 아이 체질 · 등원 08:30 기준”으로 대체
- [ ] trust line이 **접힘 상태에서도** 보인다(현행은 펼침에서만 렌더 — `app/(main)/home/page.tsx:1613-1618`)


---

## 13. 구현 현황 (Phase 0 완료 · 2026-07-25)

히어로를 홈에 배선하기 전, **충돌 없이 만들 수 있는 부분**을 먼저 구현했다. `app/(main)/home/page.tsx`는 손대지 않았다(다른 세션의 미커밋 변경이 같은 구간에 있다).

**신규 파일**

| 파일 | 역할 |
|---|---|
| `lib/hero-brief.ts` | 파생 로직 — `toBrief`(hook → 조건+결론) · `prepNeedles` · `highlightHeadline` · `pickPrimaryPrep` · `pickEvidence` · `heroState` · `splitPrepText` |
| `lib/hero-brief.test.ts` | 유닛 테스트 28건. 입력 문구는 `lib/prompts/report.ts` few-shot에서 가져왔다 |
| `components/HeroDecisionBrief.tsx` | 상태 4종(normal·caution·safe·fallback) · 하이라이트 밴드 · 근거 칩 · 재시도 |
| `components/PrepChecklistCard.tsx` | 행 3상태 + all-done · accent 타일 1개 · 피드백 슬롯 |
| `components/PrepIcon.tsx` | 준비물 이름 → 아이콘 18px 매핑 |

**토큰 2개 추가** — `app/globals.css`(라이트·다크) + `tailwind.config.ts`. 이름은 기존 `status-*` 계열에 맞춰 `--status-warn-tint` / `--status-good-tint`로 정했다(`state` vs `status` 혼동 방지).

**검증**: `tsc --noEmit` 0 · ESLint 0 · vitest **298 passed**(기존 270 + 신규 28) · Tailwind 빌드로 신규 클래스 6종 생성 확인. `rounded-3xl`이 정확히 `1.5rem`(24px)이라 **Hero radius에 새 토큰이 필요 없다**는 것도 확인했다.

**Phase 0에서 로직 결함 2건을 테스트가 잡았다**

1. `pickPrimaryPrep`이 hook "**겉옷**"과 체크리스트 "**얇은 겉옷**"을 매칭하지 못했다. hook은 25자 제한 때문에 수식어를 떨구는데, 그러면 헤드라인 강조와 accent 타일이 **서로 다른 항목**을 가리켜 “결론과 실행이 같은 단어”라는 설계 전제가 깨진다. → 핵심 명사(마지막 어절)까지 후보에 넣는 `prepNeedles`를 만들어 **두 함수가 같은 규칙을 공유**하게 했다.
2. 체크리스트 divider를 `button`에 `first:border-t-0`으로 걸어 **모든 행의 상단선이 사라졌다**(button은 li의 유일한 자식이라 `first:`가 항상 참). → `li`로 옮겼다.

**Phase 1(배선) 남은 작업**: `home/page.tsx` 1450~1747 교체 · 로컬 `splitHook`·`checklistIcon` 사본 제거 · `DESIGN.md` Decisions Log 기록 · `/design-review` 픽셀 검수 → PR.
