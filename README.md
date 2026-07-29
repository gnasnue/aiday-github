# 아이데이 (AiDay)

> 매일 아침, 오늘 우리 아이에게 뭐가 필요한지 먼저 판단해 주는 AI

---

## 무엇을 만드는가

만 1~8세 자녀를 키우는 맞벌이 가정에서는 아이의 하루가 굴러가도록 기억하고, 예측하고, 판단하고, 조율하는 책임이 한 사람에게 집중됩니다. 각각은 사소해 보여도 매일 반복되고, 하나가 누락되면 아이의 생활과 부모의 직장 일정이 함께 흔들립니다. ([전체 논증](./docs/PROBLEM-THESIS.md))

아이데이는 이 구조적 문제 중 가장 빈번하고 매일 반복되는 지점에서 시작합니다 — 날씨, 미세먼지 등 환경정보는 넘치는데, 오늘 우리 아이를 위해 무엇을 해야 할지는 결국 부모가 스스로 결정해야 하는 문제. 환경 데이터를 아이 체질 기준으로 해석해 부모의 하루 첫 육아 판단(옷차림·준비물·오늘의 케어 방식)을 대신 내려주는 **데일리 케어 브리핑**을 제공합니다.

그리고 그 판단은 하루 안에서 닫힙니다 — **아침**에 판단을 받고, 그 판단을 어린이집·조부모·시터에게 **그대로 넘기고**, **저녁**에 맞았는지 한 번만 회수하면, 회수된 결과가 **다음 비슷한 날**을 미리 짚어줍니다. 아침 판단이 중심이고 나머지는 그 정확도와 전달을 위해 있습니다. ([설계 원칙](./MANIFESTO.md))

---

## 주요 기능 (MVP)

| 기능 | 상태 |
|------|------|
| 아이 프로필 기반 온보딩 (5단계) | ✅ UI + Supabase DB 저장 |
| AI 육아 판단 리포트 (홈) | ✅ Claude Sonnet 연동 |
| 환경정보 — 날씨 | ✅ 기상청 단기예보 실시간 |
| 환경정보 — 대기질 | ✅ 에어코리아 실시간 |
| 환경정보 — 꽃가루 | ✅ 기상청 꽃가루농도 실시간 (참나무·소나무) |
| 환경정보 — 자외선 | ✅ 기상청 자외선지수 실시간 |
| 오늘의 옷차림 추천 (OOTD) | ✅ 날씨 + 프로필 규칙 기반 (착장 이미지는 더미) |
| 근거 기반 건강팁 | ✅ 정적 콘텐츠 (홈 "오늘의 건강 팁" + `/tips` 전체 가이드) |
| 회원가입 / 로그인 | ✅ 이메일 + Google OAuth, 비밀번호 재설정 (Supabase) |
| 기관에 보낼 아침 메시지 (홈) | ✅ 규칙 조립 — 알림장에 붙여넣는 한 문단, 원탭 복사 (LLM 호출 없음) |
| 하루 탭 — 오늘의 마무리 | ✅ 저녁 30초 회수 → 아침 예측 ↔ 실제 대조 + 내일 아침 준비 (로컬 정본, 서버 영속화는 P1) |
| 하루 탭 — 이번 주 컨디션 예보 | ✅ 주간 예보 × 체질 × 저녁 기록으로 힘든 날 미리 호명 |
| 하루 탭 — 알림장 → 저녁 대화 거리 | ✅ 교사 알림장 붙여넣기 → 저녁에 아이에게 물어볼 질문 2~3개 (Claude, 원문 서버 미저장) |
| 하루 탭 — 돌봄 카드 | ✅ 조부모·시터에게 건네는 한 장 (텍스트/PNG 공유) |
| 환절기 케어 패스 (`/pass`) | 🔧 월 990원 **사전예약만** — 결제 연동 없음 (지불 의향 측정 도선) |

> 화면별 상세 구현 현황과 더미 데이터 잔여분은 [SPEC.md](./SPEC.md)의 "페이지 구현 현황 요약" 참조.

라이브 데모: [aiday-demo.vercel.app](https://aiday-demo.vercel.app) (Vercel 배포)

---

## 기술 스택

| 영역 | 스택 |
|------|------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Auth / DB | Supabase (Google OAuth, PostgreSQL + RLS) |
| AI | Claude Sonnet (`claude-sonnet-5`) |
| 환경 데이터 | 기상청 단기예보 API, 에어코리아, 기상청 꽃가루농도위험지수 |
| 스타일 | Tailwind CSS + shadcn/ui |

---

## 로컬 실행

```bash
git clone https://github.com/gnasnue/aiday-github.git
cd aiday-github
npm install
cp .env.example .env.local   # 환경 변수 설정 후
npm run dev
```

### 필수 환경 변수 (`.env.local`)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# 공공데이터포털 (data.go.kr) — 단일 키로 모두 사용
KMA_API_KEY=...
AIRKOREA_API_KEY=...
POLLEN_API_KEY=...

# Anthropic
ANTHROPIC_API_KEY=...
# 선택: AI 게이트웨이/프록시 경유 시 엔드포인트 (미설정 시 Anthropic 기본 주소)
# ANTHROPIC_BASE_URL=...
```

### DB 마이그레이션

Supabase Dashboard → SQL Editor에서 실행:

```bash
supabase/migrations/001_children.sql
```

---

## 개발 로드맵

### ✅ 완료 — 동작하는 프로토타입 (v0.3)
Supabase Auth·온보딩 데이터 DB 저장, 환경 API 4종(날씨·대기질·꽃가루·자외선) 실연동,
Claude AI 리포트, 규칙 기반 옷차림 추천

### 🔨 현재 — 데일리 케어 브리핑 고도화 (6주, [PRD.md](./PRD.md))
판단 엔진 고도화(시간대별 환경 궤적 × 아이 일정 교차 평가), 안전·비용 보호 레이어,
자체 Supabase 계측 → **7일 컨시어지 테스트(수동 발송) 후 Go/No-go 판정**
(자동 알림·PWA·카카오톡은 테스트 통과 후 착수 — PRD v2.7 범위 하향 반영)

### 🔁 함께 진행 — 하루 루프 최소 구현 (2026-07-28~29 착수, 측정 목적)
하루 탭(저녁 회수·컨디션 예보·돌봄 카드)·알림장 루프(아침 전달 문구 + 저녁 대화 거리)·
환절기 케어 패스 사전예약. **기능 완성이 아니라 행동률·지불 의향 측정을 위한 쐐기**이며,
동의 베타에서 게이트 미달 시 다듬지 않고 제거한다 ([게이트 §3-7·§3-8](./docs/PRODUCT-DECISIONS.md))

### 🔭 이후 — Post-MVP ([MANIFESTO.md](./MANIFESTO.md) 스코프)
Family Memory Engine(수용/거부 이력 기반 개인화 학습 — 현재는 로컬 원료 수집 단계),
알림장·준비물 공지 통합의 다음 단계(붙여넣기 → 준비물·일정 등 행정 판단을 아침 판단에 합류),
Co-parenting 협업(보호자 간 판단·준비물 동기화), 래퍼앱 → 네이티브 앱 전환

---

## API 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/weather?lat=&lon=` | 기상청 단기예보 (기온·하늘·강수확률 등) |
| `GET /api/air?station=종로구` | 에어코리아 실시간 대기질 (PM10·PM2.5·통합지수) |
| `GET /api/pollen?region=서울` | 기상청 꽃가루농도위험지수 |
| `GET /api/uv?region=서울` | 기상청 자외선지수 |
| `GET /api/weather/weekly?region=&lat=&lon=` | 주간 예보 7일 (단기 D0~D2 + 중기 D+3~ 병합) |
| `POST /api/report` | Claude AI 육아 판단 리포트 생성 (레이트리밋: 로그인 20회/일, 게스트 IP 10회/일) |
| `POST /api/noteboard` | 알림장 → 저녁 대화 거리 생성 (로그인 필수, 5회/일, 원문 미저장) |

## 문서

| 문서 | 설명 |
|------|------|
| [MANIFESTO.md](./MANIFESTO.md) | 서비스가 존재하는 이유와 설계 원칙 (Core Truth 2층 구조) |
| [docs/PROBLEM-THESIS.md](./docs/PROBLEM-THESIS.md) | 상위 문제 논증 — 왜 이 문제가 중요한가, 반론과 답변, 근거 위계, 미검증 가설 |
| [docs/문제정의-프레임워크-v3.md](./docs/문제정의-프레임워크-v3.md) | 문제정의 원천 문서 — 상위 문제→증상→진입점, JTBD·5 Why·판단 4축 (페르소나 상세는 [v2](./docs/문제정의-프레임워크-v2.md) 보존) |
| [docs/validation/](./docs/validation/) | 자체 검증 원본 — 가설검증 설문(n=17, 2026-05) · 문제검증 맘테스트(n=36, 2026-07) |
| [docs/research/2026-07-working-mom-social-listening.md](./docs/research/2026-07-working-mom-social-listening.md) | 소셜 리스닝·공식 통계 교차검증 (보조 근거, 조사 한계 명시) |
| [PRD.md](./PRD.md) | 데일리 케어 브리핑 고도화 PRD — 6주 스코프·P0·KPI |
| [SPEC.md](./SPEC.md) | 페이지별 기능 명세 및 구현 현황 |
| [DESIGN.md](./DESIGN.md) | 디자인 시스템 (폰트·색상·컴포넌트 원칙) |
| [docs/PRODUCT-DECISIONS.md](./docs/PRODUCT-DECISIONS.md) | 성공 지표 · 출시 기준 · 확정된 제품 결정 |
| [supabase/migrations/](./supabase/migrations/) | DB 스키마 마이그레이션 |

---

*For investors: AiDay is an AI Parenting Decision Agent that combines environmental data with individual child profiles to deliver personalized daily care guidance.*
