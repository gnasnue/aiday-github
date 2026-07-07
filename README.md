# 아이데이 (AiDay)

> 매일 아침, 오늘 우리 아이에게 뭐가 필요한지 먼저 판단해 주는 AI

---

## 무엇을 만드는가

날씨, 미세먼지 등 환경정보는 넘치는데, 오늘 우리 아이를 위해 무엇을 해야 할지는 결국 부모가 스스로 결정해야 합니다.

아이데이는 환경 데이터를 아이 체질 기준으로 해석해 부모의 하루 첫 육아 판단(옷차림·준비물·오늘의 케어 방식)을 대신 내려주는 **데일리 케어 브리핑**을 제공합니다.

---

## 주요 기능 (MVP)

| 기능 | 상태 |
|------|------|
| 아이 프로필 기반 온보딩 (7단계) | ✅ UI + Supabase DB 저장 |
| AI 육아 판단 리포트 (홈) | ✅ Claude Haiku 연동 |
| 환경정보 — 날씨 | ✅ 기상청 단기예보 실시간 |
| 환경정보 — 대기질 | ✅ 에어코리아 실시간 |
| 환경정보 — 꽃가루 | ✅ 기상청 꽃가루농도 실시간 (참나무·소나무) |
| 환경정보 — 자외선 | ✅ 기상청 자외선지수 실시간 |
| 오늘의 옷차림 추천 (OOTD) | ✅ 날씨 + 프로필 규칙 기반 (착장 이미지는 더미) |
| 근거 기반 건강팁 | ✅ 정적 콘텐츠 |
| 회원가입 / 로그인 | ✅ 이메일 + Google OAuth, 비밀번호 재설정 (Supabase) |

> 화면별 상세 구현 현황과 더미 데이터 잔여분은 [SPEC.md](./SPEC.md)의 "페이지 구현 현황 요약" 참조.

라이브 데모: [aiday-demo.vercel.app](https://aiday-demo.vercel.app) (Vercel 배포)

---

## 기술 스택

| 영역 | 스택 |
|------|------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Auth / DB | Supabase (Google OAuth, PostgreSQL + RLS) |
| AI | Claude Haiku (`claude-haiku-4-5`) |
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

### 🔨 현재 — 데일리 케어 브리핑 고도화 (6주, [prd.md](./prd.md))
판단 엔진 고도화(시간대별 환경 궤적 × 아이 일정 교차 평가), 안전·비용 보호 레이어,
선제 알림(웹 푸시 2종 + 카카오톡 나에게 보내기), PWA 전환, PostHog 계측 → **공개 베타**

### 🔭 이후 — Post-MVP ([MANIFESTO.md](./MANIFESTO.md) 스코프)
Family Memory Engine(수용/거부 이력 기반 개인화 학습), 알림장·준비물 공지 OCR 통합
(환경 판단 + 행정 판단을 하나의 맥락으로), Co-parenting 협업(보호자 간 판단·준비물 동기화),
래퍼앱 → 네이티브 앱 전환

---

## API 엔드포인트

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/weather?lat=&lon=` | 기상청 단기예보 (기온·하늘·강수확률 등) |
| `GET /api/air?station=종로구` | 에어코리아 실시간 대기질 (PM10·PM2.5·통합지수) |
| `GET /api/pollen?region=서울` | 기상청 꽃가루농도위험지수 |
| `GET /api/uv?region=서울` | 기상청 자외선지수 |
| `POST /api/report` | Claude AI 육아 판단 리포트 생성 |

## 문서

| 문서 | 설명 |
|------|------|
| [MANIFESTO.md](./MANIFESTO.md) | 서비스가 존재하는 이유와 설계 원칙 |
| [prd.md](./prd.md) | 데일리 케어 브리핑 고도화 PRD — 6주 스코프·P0·KPI |
| [docs/문제정의-프레임워크-v2.md](./docs/문제정의-프레임워크-v2.md) | 문제정의 원천 문서 — 페르소나·판단 4축·KPI 체계의 근거 |
| [SPEC.md](./SPEC.md) | 페이지별 기능 명세 및 구현 현황 |
| [DESIGN.md](./DESIGN.md) | 디자인 시스템 (폰트·색상·컴포넌트 원칙) |
| [docs/PRODUCT-DECISIONS.md](./docs/PRODUCT-DECISIONS.md) | 성공 지표 · 출시 기준 · 확정된 제품 결정 |
| [supabase/migrations/](./supabase/migrations/) | DB 스키마 마이그레이션 |

---

*For investors: AiDay is an AI Parenting Decision Agent that combines environmental data with individual child profiles to deliver personalized daily care guidance.*
