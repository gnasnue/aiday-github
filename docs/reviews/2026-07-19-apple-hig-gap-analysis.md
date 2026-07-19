# Apple HIG × 아이데이 갭 분석 (2026-07-19)

> Apple Human Interface Guidelines(HIG) 공식 문서와 WWDC25 신규 디자인 원칙을 학습하고,
> 아이데이 DESIGN.md·실제 화면 코드와 비교해 갭을 분석한 리포트.
> 조사 근거: 전 탭 코드 실태 조사(파일:라인 기준), DESIGN.md v3, MANIFESTO.md.

---

## 1. 애플 디자인 철학 요약 (학습 내용)

### 1-1. HIG 6대 파운데이션

| 원칙 | 의미 |
|------|------|
| **Hierarchy** | 컨트롤·인터페이스 요소가 그 아래 콘텐츠를 돋보이게 하는 명확한 시각 위계. 색·효과가 아니라 **간격·크기·적응적 컴포넌트 동작**으로 우선순위를 표현 |
| **Harmony** | 소프트웨어가 기기·시스템 경험과 자연스럽게 어우러짐. 시스템 설정(다크모드·접근성 토글)을 존중 |
| **Consistency** | 예측 가능한 패턴·용어·인터랙션. 화면 단위가 아니라 **시스템 단위**로 사고해 인지 부하를 낮춤 |
| **Clarity** | 읽기 쉬운 콘텐츠, 알아볼 수 있는 아이콘, 자명한 인터랙션. 텍스트 최소 크기·대비 기준 포함 |
| **Deference** | 크롬(장식·UI)을 최소화하고 콘텐츠와 기능이 주인공 |
| **Depth** | 레이어·시각적 분리·전환(모션)으로 정보를 조직하고 초점을 안내 |

### 1-2. 고전 iOS 설계 원칙 (여전히 유효)

- **Feedback**: 모든 행동에 즉각적·인지 가능한 반응
- **User Control**: 파괴적 행동은 확인을 거치되, 결정권은 항상 사용자에게. 되돌릴 수 있게
- **Direct Manipulation**: 콘텐츠를 직접 조작하는 제스처(스와이프·당겨서 새로고침)가 플랫폼 기대치
- **Aesthetic Integrity**: 외관이 앱의 목적과 일치 — 실용 앱은 장식을 절제하고 과업에 집중
- **비기능 컨트롤 금지**: 동작하지 않는 버튼·가짜 affordance를 노출하지 않음

### 1-3. 정량 기준 (HIG 명시)

- 터치 타겟 **최소 44×44pt**
- 본문 텍스트 최소 **11pt** (웹 환경 기준 사실상 14~15px 본문, 캡션도 11px 미만 금지)
- 텍스트 대비 **4.5:1** (대형 굵은 텍스트 3:1)
- 시스템 다크모드·`prefers-reduced-motion` 존중
- 모션은 장식이 아니라 **의미 전달 수단** — 절제, 목적성

---

## 2. 이미 잘 맞는 것 (Keep)

아이데이의 철학적 뼈대는 HIG와 강하게 정렬돼 있다. 이 부분은 지킬 것.

| HIG 원칙 | 아이데이 구현 |
|----------|--------------|
| Deference / Clarity | MANIFESTO "Decision First, Data Second" — 홈 첫 화면에서 AI hook(26px) 즉시 노출, 본문은 접힘(progressive disclosure). "환경은 주인공이 아니다"는 Deference 그 자체 |
| Hierarchy | v3 White Report — 색이 아니라 여백·크기·elevation 3단으로 위계 표현. 이모지 UI 금지 |
| Feedback | 전 화면 스켈레톤 로딩 일관, SSE 스트리밍으로 hook→본문 순차 노출, 토스트 성공/실패 안내 |
| 정직한 상태 | mock 무표기 폴백 제거, "환경 데이터를 불러오지 못했어요" 등 빈/실패 상태 정직 처리 |
| 접근성 기본기 | `<div onClick>` 0건(전부 button/Link), aria-label·aria-current·aria-pressed 광범위, :focus-visible 전역, prefers-reduced-motion 대응, 44px 터치 타겟 확보 시도(28px 버튼 after-inset 확장 포함) |
| 개인정보 신뢰 | 위치 요청은 사용자 제스처 안에서만, 거부 시 정직한 안내, 로그아웃 시 로컬 아동 건강정보 삭제, 출처 표기(기상청·에어코리아·학회) |

---

## 3. 갭 분석

### GAP 1 — Consistency: 같은 컨트롤이 탭마다 다르게 동작 🔴

HIG: "예측 가능한 패턴으로 학습한 행동을 앱 전체에 적용할 수 있어야 한다."

- **위치 컨트롤 3종 분열**: home은 실제 Geolocation 요청(`home/page.tsx:1306→867`), env는 "위치 변경은 준비 중이에요" 토스트(`env/page.tsx:370`), me도 토스트(`me/page.tsx:273`). 같은 모양의 컨트롤이 탭마다 다른 결과 → 사용자 학습 파괴.
- **위치 데이터 자체도 분열**: home만 `aiday:location:v1` 사용, env/outfit/tips는 서울 하드코딩. 홈에서 위치를 바꿔도 다른 탭 데이터는 그대로 — 시스템 단위 일관성(Harmony) 위반.
- **활성 상태 색 규칙 분열**: 프로필 탭 활성 = `bg-primary-tint text-foreground`(home:1289) vs tips 필터 활성 = `text-accent`(tips:320).
- **새로고침 배치 분열**: home은 카드 헤더 내부(1347), env는 PageHeader 우측(351).
- **토큰 밖 하드코딩**: outfit "AI코디 추천" 배지 `text-red-500`(outfit:457) — DESIGN.md 시맨틱 토큰 체계 이탈.

### GAP 2 — Clarity: 자체 규칙(11px 미만 금지)조차 위반하는 텍스트 🔴

HIG 최소 텍스트 기준과 DESIGN.md "11px 미만 전면 금지"를 동시에 위반.

- `text-[10px]`: outfit 배지(456), home 케어플랜 "곧/다음" 마커(1672), onboarding "추천" 배지(582).
- 알파 감산 텍스트(`text-muted-foreground/70·/80`)가 대비 4.5:1을 깨뜨릴 소지(home:978, globals eyebrow).

### GAP 3 — 비기능 컨트롤(가짜 affordance) 노출 🔴

HIG: 동작하지 않는 컨트롤을 노출하지 않는다. outfit의 "구매 연동 준비 중" 처리(가짜 affordance 금지 주석)와 스스로 모순.

- 홈 헤더 알림 벨 → "새 알림이 없어요" 토스트만(home:1259)
- 홈 설정 버튼 → "설정 페이지는 준비 중이에요"(home:1266)
- env 위치 버튼 → "준비 중"(env:370), me 위치 설정 → "준비 중"(me:273)

### GAP 4 — Harmony: 다크모드 토큰은 있으나 도달 불가 🟠

HIG: 시스템 외관 설정을 존중. `.dark` 토큰이 globals.css에 정의돼 있으나 `dark:` 유틸 0건, ThemeProvider 부재, 토글 없음 → 어떤 경로로도 다크모드 진입 불가. "지원하는 척"인 상태.

### GAP 5 — User Control: 파괴적 행동이 네이티브 confirm() 🟠

me 프로필 삭제·로그아웃이 `window.confirm()`(me:171,180). HIG는 파괴적 액션을 명확히 구분(빨간 강조)한 스타일드 다이얼로그 + 안전한 기본 포커스를 요구. 브라우저 confirm은 스타일·접근성·문구 제어 불가, 앱의 신뢰 톤과 단절.

### GAP 6 — Direct Manipulation: 플랫폼 표준 제스처 부재 🟡

스와이프·pull-to-refresh 전무(grep 0건). "매일 아침 최신 데이터 확인" 앱에서 당겨서 새로고침은 iOS 사용자의 근육 기억. 현재는 카드 헤더 안의 작은 새로고침 버튼만 존재.

### GAP 7 — Hierarchy: env 페이지 정보 과적 🟡

env는 8개 섹션 수직 나열(맞춤 인사이트→지금날씨→야외활동지수→대기질 3그리드→꽃가루→자외선/습도→주간→주말). HIG Hierarchy는 적응적 우선순위(오늘 문제가 되는 지표를 위로)를 권장. MANIFESTO "수치보다 해석"과도 결이 어긋남 — 현재는 수치 백과사전에 가까움.

### GAP 8 — Depth: 상태 전환에 의미 전달 모션 부재 🟡

라우트 전환·리포트 펼침이 즉시 점프. HIG Depth는 "어디서 왔는지"를 알려주는 절제된 전환을 권장. 현재 모션은 진입 fade뿐 (minimal-functional 방침 자체는 타당 — 펼침/전환 딱 두 곳만 보강 여지).

### GAP 9 — Navigation: 상태가 URL이 아닌 localStorage 🟡

활성 프로필·위치가 전부 localStorage. 딥링크·공유·새로고침 복원 관점에서 상태가 URL에 없음. 웹앱 특성상 치명적이진 않으나, 향후 공유 기능(홈 공유 버튼 존재)과 충돌 소지.

---

## 4. 개선사항 (우선순위)

### P1 — 자체 규칙 위반이자 HIG 기본 위반 (즉시)

1. **10px 텍스트 3건 제거** → eyebrow 토큰(11px/700) 또는 label로 승격. `text-red-500` → status 토큰 교체. *(반나절, 회귀 위험 없음)*
2. **위치 상태 전역화**: `aiday:location:v1`을 env/outfit/tips가 공유하도록 lib 훅 추출. env·me의 "준비 중" 위치 버튼은 홈과 동일한 실제 동작으로 통일하거나 제거.
3. **비기능 컨트롤 정리**: 알림 벨·설정 버튼은 기능 나올 때까지 숨김(YAGNI). "탭하면 사과하는 버튼"은 신뢰 자산을 깎음 — 베타 지표(신뢰) 관점에서도 마이너스.
4. **`window.confirm` → 스타일드 AlertDialog** (shadcn alert-dialog): 파괴적 액션 빨간 강조 + 취소가 기본 포커스.

### P2 — Harmony·플랫폼 기대치 (베타 기간 내)

5. **다크모드 결단**: (a) `prefers-color-scheme` 연결 + `.dark` 적용 경로 구축, 또는 (b) 지원 보류를 명시하고 토큰 정리. 어중간한 현 상태가 최악. 아침 사용 앱 특성상 (a) 권장 — 새벽 수유·이른 기상 맥락에서 다크모드 가치 큼.
6. **Pull-to-refresh** (home·env): 기존 60초 쿨다운 로직 재사용. 웹 구현 비용 있으므로 우선 home만.
7. **활성 상태 문법 단일화**: "선택 칩 = bg-primary-tint + text-accent" 규칙을 DESIGN.md에 명문화하고 프로필 탭/tips 필터 정렬 (프로필 탭의 "이름이 붉게 안 읽히게" 예외는 결정 로그에 기록).

### P3 — Hierarchy·Depth 고도화 (베타 피드백 후)

8. **env 적응형 재정렬**: 오늘 warn/bad인 지표 섹션을 상단으로, 정상 지표는 요약 행으로 축약(탭하면 펼침). HIG Hierarchy + MANIFESTO "수치보다 해석" 동시 충족.
9. **리포트 펼침 height 전환**(200ms ease-out) — Depth 보강 최소 단위. reduced-motion 대응은 기존 전역 규칙이 커버.
10. **프로필/위치 상태의 URL 반영 검토** — 공유 기능 확장 전 선행 결정.

---

## 5. 결론

아이데이는 **철학 층위(Deference·Clarity·정직한 피드백)에서는 HIG와 이미 강하게 정렬**돼 있다 — MANIFESTO의 "Decision First"는 사실상 Deference의 육아 도메인 번역이다. 갭은 철학이 아니라 **집행 층위**에 있다: 탭 간 일관성 분열(위치·활성색·새로고침), 자체 규칙 위반(10px, 임의 색), 가짜 affordance, 도달 불가능한 다크모드. P1 네 건은 모두 저위험·반나절급 작업으로, 베타 기간의 "전문성 부족" 평가 대응(v3 개정 동기)과 같은 축에 있다.

### 참고 소스
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Liquid Glass: Hierarchy, Harmony, Consistency (createwithswift)](https://www.createwithswift.com/liquid-glass-redefining-design-through-hierarchy-harmony-and-consistency/)
- [WWDC25 — Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
