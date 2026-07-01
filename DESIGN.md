# Design System — aiday (AI Weather for Kids)

## Product Context
- **What this is:** 날씨 기반 아이 옷차림·건강 케어 추천 앱
- **Who it's for:** 영·유아 자녀를 둔 부모 (주 사용자: 30대 엄마·아빠)
- **Space/industry:** 육아 + 날씨 정보, 한국 모바일 앱
- **Project type:** 모바일 우선 웹앱 (390px 고정 프레임, BottomNav)

## Aesthetic Direction
- **Direction:** Warm Minimal — 오렌지의 따뜻함을 유지하되, 불필요한 장식 없이 정보를 명확하게
- **Decoration level:** intentional — 색상과 그림자로만 깊이 표현, 패턴이나 일러스트 없음
  - **예외:** 홈 화면 "오늘의 종합 솔루션" 카드(`components/CharacterReport.tsx`)의 아이 캐릭터 일러스트는 유일한 허용 예외. 신체 부위별 준비물(머리·목·피부·옷차림)을 아이콘 목록보다 직관적으로 전달하기 위한 의도적 선택. 다른 화면/컴포넌트로 확장 금지.
- **Mood:** 아이를 돌보는 부모가 아침에 빠르게 확인하는 앱. 불안을 줄이고 확신을 주는 느낌. 따뜻하지만 정확하다.
- **Memorable thing:** "오렌지 날씨 앱 — 아이 걱정이 줄어드는 느낌"

## Typography
- **Display/Hero:** Pretendard Variable (weight 700–800) — 한국어 최적, 가독성·모던함 균형
- **Body:** Pretendard Variable (weight 400–500) — 동일 폰트 패밀리로 통일감
- **UI/Labels:** Pretendard Variable (weight 500–600)
- **Data/Tables:** Pretendard Variable (tabular-nums feature) — 온도·수치 표시
- **Code:** 해당 없음 (개발자 도구 용도 아님)
- **Loading:** `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css`
- **Scale:**
  | 이름 | rem | px | 용도 |
  |------|-----|-----|------|
  | 2xl  | 1.75rem | 28px | 페이지 타이틀 (날씨 온도) |
  | xl   | 1.375rem | 22px | 섹션 헤더 |
  | lg   | 1.125rem | 18px | 카드 타이틀 |
  | md   | 1rem | 16px | 본문 기본 |
  | sm   | 0.875rem | 14px | 보조 텍스트, 레이블 |
  | xs   | 0.75rem | 12px | 캡션, 태그, BottomNav |

## Color
- **Approach:** restrained — 오렌지 하나가 전부를 이끈다. 색이 드물수록 오렌지가 빛난다.

### Light Mode
| 변수 | hex | 용도 |
|------|-----|------|
| primary | `#F5A623` | 브랜드 오렌지. 버튼 CTA, 활성 상태 |
| primary-foreground | `#1A0F00` | primary 위 텍스트 (어두운 갈색, 대비 ≥ 4.5:1) |
| accent | `#D45A00` | 강조 (경고, 중요 정보), hover 상태 |
| background | `#FAFAFA` | 페이지 배경 |
| card | `#FFFFFF` | 카드·시트 배경 |
| secondary | `#FFF3E0` | 따뜻한 크림 (카드 배경 변형, 태그) |
| soft | `#FFF8F0` | 가장 연한 크림 (섹션 구분) |
| foreground | `#1A1A1A` | 기본 본문 텍스트 |
| muted-foreground | `#666666` | 보조 텍스트 |
| border | `#E8E8E8` | 구분선 |
| muted | `#F5F5F5` | 비활성 배경 |

### Semantic
| 상태 | hex | 용도 |
|------|-----|------|
| success | `#2E7D32` | 좋음, 완료 |
| warning | `#E65100` | 주의, 오염 경고 |
| error | `#C62828` | 위험, 심한 오염 |
| info | `#1565C0` | 일반 정보 |

### Dark Mode
- primary: 동일 `#F5A623` 유지
- primary-foreground: `#1A0F00` 유지
- background: `#1A1A1A`
- card: `#252525`
- foreground: `#F5F5F5`
- muted-foreground: `#A0A0A0`
- border: `#383838`
- accent: `#FF7020` (다크에서 10% 밝게)

## Spacing
- **Base unit:** 4px
- **Density:** comfortable (모바일 터치 타겟 최소 44px)
- **Scale:**
  | 이름 | px | Tailwind |
  |------|-----|---------|
  | 2xs | 4px | p-1 |
  | xs | 8px | p-2 |
  | sm | 12px | p-3 |
  | md | 16px | p-4 |
  | lg | 24px | p-6 |
  | xl | 32px | p-8 |
  | 2xl | 48px | p-12 |
- **터치 타겟:** 모든 인터랙티브 요소 최소 44×44px
- **BottomNav 높이:** 64px (py-2.5 = 10px 위아래, 아이콘+레이블)
- **페이지 상단 여백:** 56px (BottomNav 높이 + 여유)

## Layout
- **Approach:** grid-disciplined — 390px 고정 모바일 컬럼, 벗어나지 않음
- **Grid:** 단일 컬럼 (모바일 전용 앱)
- **Max content width:** 390px
- **Horizontal padding:** 20px (px-5)
- **Border radius:**
  | 이름 | px | 용도 |
  |------|-----|------|
  | sm | 6px | 뱃지, 태그 |
  | md | 10px | 인풋, 소형 카드 |
  | lg | 14px | 카드, 버튼 |
  | xl | 20px | 바텀시트, 대형 카드 |
  | full | 9999px | 알약형 버튼, 아바타 |

## Icons
- **라이브러리:** Lucide React (이미 설치됨)
- **크기:** UI 아이콘 20px, BottomNav 22px, 인라인 16px
- **BottomNav 아이콘 매핑:**
  | 탭 | Lucide 아이콘 |
  |----|--------------|
  | 홈 | `Home` |
  | 환경정보 | `Wind` |
  | 옷차림 | `Shirt` |
  | 건강팁 | `Heart` |
  | 마이 | `User` |
- **스타일:** strokeWidth=1.75, 활성 상태: text-accent, 비활성: text-muted-foreground

## Motion
- **Approach:** minimal-functional — 이해를 돕는 전환만. 아침에 빠르게 보는 앱이므로 과도한 애니메이션 없음.
- **Easing:** enter: ease-out, exit: ease-in, move: ease-in-out
- **Duration:**
  | 이름 | ms | 용도 |
  |------|----|------|
  | micro | 100ms | 버튼 hover, 탭 전환 |
  | short | 200ms | 카드 나타남, 아코디언 |
  | medium | 300ms | 페이지 전환 |
- **금지:** 스크롤 드리븐 애니메이션, 루프 애니메이션, 과도한 bounce 효과

## Known Issues (코드 수정 필요)
1. ~~**Font 로딩 없음**~~ — 완료 (Pretendard CDN 추가됨)
2. **App.css 잔재** — Vite 기본 템플릿 CSS 삭제 필요 (`#root`, `.logo` 등)
3. **BottomNav 이모지** — Lucide 아이콘으로 교체 필요
4. ~~**Primary 대비**~~ — 완료 (`primary: #F5A623`, `primary-foreground: #1A0F00`으로 수정됨)

## Decisions Log
| 날짜 | 결정 | 근거 |
|------|------|------|
| 2026-06-06 | 초기 디자인 시스템 생성 | /design-consultation — 기존 오렌지 시스템 계승·정제 |
| 2026-06-06 | primary-foreground를 어두운 갈색으로 변경 | WCAG 4.5:1 대비비 확보 |
| 2026-06-06 | BottomNav Lucide 아이콘 교체 권장 | OS별 이모지 렌더링 불일치 해소 |
| 2026-06-06 | 타이포그래피 스케일 6단계 정의 | Tailwind 기본값 의존 탈피, 일관성 확보 |
| 2026-07-01 | CharacterReport 캐릭터 일러스트를 "일러스트 없음" 규칙의 유일한 예외로 인정 | /design-review — 신체 부위 매핑 안내는 일러스트가 아이콘보다 직관적. 단, calloutsData가 실제 weather/conditions와 무관한 고정값이었던 버그를 같은 세션에서 수정 (지금은 실데이터 연동) |
