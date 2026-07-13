# 디자인 리뷰 — 랜딩 페이지 히어로 이하 섹션 (리포트 전용, 수정 없음)

- **일시:** 2026-07-13
- **대상:** https://aiday-demo.vercel.app/ (소스: `app/page.tsx`)
- **범위:** 히어로 이하 — Pain points / Differentiators / Reviews / Footer
- **사용자 피드백:** 히어로는 만족. 이하 섹션은 "일관성 없고 중구난방, 어설픈 느낌" → professional SaaS 수준으로 개선 가능한지 검토
- **방법:** 배포 사이트 렌더 스타일 추출(computed styles) + `app/page.tsx`·`app/globals.css`·DESIGN.md 대조

## 총평

**"중구난방" 느낌의 실체는 두 세대의 디자인이 한 페이지에 공존하는 것.** 7월 홈 리스타일(PR #66~#71 계열)로 웜 보더 토큰, 2겹 웜 섀도우, `.eyebrow`, 상태 칩 등 정제된 어휘가 globals.css에 이미 존재하고 히어로는 그 톤을 따라갔지만, 이하 섹션들은 리스타일 이전 패턴(제각각인 카드 문법, Tailwind 기본 타이포, 매직넘버 패딩)이 그대로 남아 있다. **리라이트가 아니라 "히어로의 문법을 아래로 전파"하는 소폭 수정으로 충분히 professional SaaS 수준에 도달 가능하다.**

- **Design Score (히어로 이하): C+** — 치명적 결함은 없으나 일관성 부재가 체감 품질을 깎음
- **AI Slop Score: C** — 섹션마다 같은 높이·같은 centered H2·카드 나열의 쿠키커터 리듬

## 발견 사항 (영향도 순)

### HIGH

**F-01. 카드 문법이 한 페이지에 3종** — `app/page.tsx:87,103,125`
- Pain: 흰 배경 + 1px 보더 + `px-5 py-4`
- Diffs: `bg-background`(off-white) + 무보더 + `p-5`
- Reviews: `bg-background` + 무보더 + `p-6` **+ `py-[14px]` 매직넘버 오버라이드**
- 배경색·보더 유무·패딩이 섹션마다 다르다. professional SaaS의 핵심은 카드 스펙 하나를 정해 반복하는 것. → **카드 스펙 1개로 통일** (권장: `bg-card` + 1px 웜 보더 + `shadow-soft` + `p-5`, radius는 DESIGN.md lg=14px).

**F-02. 섹션 리듬이 단조롭고 배경 교차에 위계가 없음** — `app/page.tsx:80,96,118`
- 모든 섹션 `py-12`(48px) 동일, 모든 H2 24px centered 동일 → 쿠키커터 리듬(AI slop 패턴 #10).
- 배경: secondary(히어로) → 투명 → soft → secondary → background. 크림 3종이 의미 없이 번갈아 나옴.
- → 배경 위계 규칙 수립: 기본은 `background`, 강조 섹션 1곳만 크림. 섹션 상단에 `.eyebrow`(이미 globals.css:207에 정의됨, 홈과 어휘 통일)를 넣어 리듬 부여.

**F-03. 클로징 CTA 부재** — `app/page.tsx:137-140`
- Reviews 섹션 후 바로 footer. 끝까지 스크롤한(가장 전환 의향 높은) 사용자에게 남은 CTA가 헤더의 작은 "무료 시작"뿐.
- → 리뷰 아래 클로징 CTA 섹션 추가 (짧은 리마인드 문장 + "무료로 시작하기" 풀폭 버튼). 전환 관점에서 가장 실질적인 개선.

### MEDIUM

**F-04. 타이포 스케일이 DESIGN.md와 불일치**
- DESIGN.md: 섹션 헤더 xl=22px, 페이지 타이틀 2xl=28px. 실제 렌더: H1 30px(`text-3xl`), H2 24px(`text-2xl`) — Tailwind 기본값 사용, 자체 스케일 미적용.
- → 랜딩·홈 공통으로 자체 스케일 준수 (또는 DESIGN.md 스케일을 현실에 맞게 개정 후 준수 — 어느 쪽이든 한쪽으로).

**F-05. 리뷰 카드 내부 정렬 3종 + 세리프 폰트 혼입** — `app/page.tsx:125-132`
- 장식 따옴표 좌측(`self-start`), 본문 중앙(`text-center`), 출처 우측(`self-end`) — 한 카드에 좌·중·우.
- 따옴표가 `font-serif`(ui-serif/Georgia) — "Pretendard 단일 패밀리" 원칙(DESIGN.md Typography) 위반. 렌더된 폰트 패밀리 추출에서 실제로 2개 패밀리 검출됨.
- → 본문 좌측 정렬 통일, 따옴표는 제거하거나 Pretendard 그대로 크게. `py-[14px]` 제거.

**F-06. 수동 줄바꿈(`\n` + `whitespace-pre-line`) 불균일** — `app/page.tsx:16-17,23-25`
- Diffs 4개 중 2개만 수동 개행, Reviews는 3개 전부 수동 개행. 뷰포트·폰트 렌더링에 따라 어색한 단 낙차(rag) 발생.
- → 수동 개행 제거하고 `break-keep`에 위임.

**F-07. Diffs 아이콘 처리가 어정쩡** — `app/page.tsx:104-105`
- 20px 아이콘이 컨테이너 없이 텍스트 옆에 맨몸으로 붙음. 시각 앵커 역할을 못해 섹션이 밋밋("어설픈" 인상의 한 원인).
- → 단, "icon-in-colored-circle 그리드"는 대표적 AI slop 패턴이므로 원형 배지로 가지 말 것. 아이콘 크기 상향(24px) + 고정폭 정렬, 또는 `soft` 배경의 각진 라운드(sm=6px) 컨테이너 등 의도적 처리.

### POLISH

**F-08. Footer 죽은 링크** — `app/page.tsx:144-145`: 이용약관·개인정보처리방침이 `href="#"`. 신뢰 손상. 준비 전이면 페이지 스텁이라도 연결.

**F-09. 가상 후기의 신뢰 리스크** — 출시 전 서비스에 실사용 후기 형식("6세 아들 엄마") 표기. "베타 참여 부모님의 이야기" 등 정직한 라벨 권장. (제품 판단 사항 — CEO 리뷰 영역)

**F-10. DESIGN.md 색 토큰 문서 부채** — DESIGN.md는 `border: #E8E8E8`(무채색)인데 실제 globals.css는 웜 보더(`32 24% 89%` ≈ #EAE3DC). 홈 리스타일 때 코드만 갱신되고 문서가 안 따라옴. 문서 동기화 필요.

## 권장 실행 순서 (수정 착수 시)

1. **카드 스펙 통일** (F-01, F-05) — CSS/클래스 수정 위주, 위험도 낮음
2. **섹션 템플릿 통일** (F-02, F-04) — eyebrow + H2 스케일 + 배경 위계
3. **클로징 CTA 추가** (F-03) — 유일한 구조 추가
4. **디테일 정리** (F-06, F-07, F-08) + DESIGN.md 동기화 (F-10)

전부 `app/page.tsx` + globals.css 범위. 신규 페이지·컴포넌트 대공사 불필요. 예상 규모: PR 1개.

## 비고

- 브라우저 스크린샷 렌더러가 세션 내내 타임아웃되어(페이지 자체는 정상 로드) 시각 증거는 computed-style 추출 + 소스 대조로 대체함.
- 리포트 전용 실행 — 코드 수정 없음 (사용자 요청).
