# 🌤️ 아이데이 (AiDay)

> 매일 아침 우리 아이 외출 준비를 판단해 주는 AI

---

## 무엇을 만드는가

날씨, 미세먼지 등 환경정보는 넘치는데, 오늘 우리 아이를 위해 무엇을 해야 할지는 결국 부모가 스스로 결정해야 합니다.

아이데이는 환경 데이터를 아이 체질 기준으로 해석해, 부모가 바로 행동할 수 있는 육아 가이드를 제공합니다.

---

## 주요 기능 (MVP)

| 기능 | 상태 |
|------|------|
| 아이 프로필 기반 온보딩 (7단계) | ✅ UI 완성 |
| AI 외출 판단 리포트 (홈) | 🔧 더미 데이터 |
| 환경정보 (미세먼지·꽃가루·자외선·습도) | 🔧 더미 데이터 |
| 오늘의 옷차림 추천 (OOTD) | 🔧 더미 데이터 |
| 근거 기반 건강팁 | ✅ 정적 콘텐츠 |
| 회원가입 / 로그인 | ✅ UI 완성 |

프로토타입 데모: [aiday2026.lovable.app](https://aiday2026.lovable.app)

---

## 기술 스택

| 영역 | 스택 |
|------|------|
| Frontend | React + TypeScript (Lovable) |
| Backend | Supabase (예정) |
| AI | Claude API (예정) |
| 환경 데이터 | 기상청 API, 에어코리아 (예정) |

---

## 로컬 실행

```bash
git clone https://github.com/gnasnue/aiday-github.git
cd aiday-github
npm install
npm run dev
```

---

## 개발 로드맵

### Phase 1 — 동작하는 백본
Supabase Auth 연동, 온보딩 데이터 DB 저장, 기상청·에어코리아 API 연동

### Phase 2 — AI Agent 고도화
Claude API 연동으로 홈 AI 리포트 실제 생성, 아이 프로필 기반 개인화 정밀도 향상.
Family Memory Engine(아이 건강 이력 누적 + 부모 선호 모델) 구축 시작.

### Phase 3 — 판단 범위 확장
알림장·준비물 공지 OCR 통합으로 환경 판단 + 행정 판단을 하나의 맥락으로 연결.
(키즈노트·아이엠이 제공하지 못하는 Context Engine 구현)

### Phase 4 — Co-parenting 협업
두 보호자 간 정보 비대칭 해소. 외출 판단·준비물 확인을 양쪽 모두에게 동기화.

---

## 문서

| 문서 | 설명 |
|------|------|
| [MANIFESTO.md](./MANIFESTO.md) | 서비스가 존재하는 이유와 설계 원칙 |
| [SPEC.md](./SPEC.md) | 페이지별 기능 명세 및 구현 현황 |

---

*For investors: AiDay is an AI Parenting Decision Agent that combines environmental data with individual child profiles to deliver personalized daily care guidance.*
