---
name: qa
description: QA 실행 후 발견된 문제를 수정까지 한다. 사이트 동작 테스트, 배포 전 점검, "한번 다 돌려봐" 요청에 사용. 리포트만 원하면 /qa-only.
---

# QA — 테스트 및 수정

앱을 실제로 구동해 전 화면을 점검하고, 발견된 문제를 수정한다.

## 진행 순서

1. `npm run dev`로 서버를 띄운다 (환경 변수가 없으면 mock/에러 화면 동작을 점검 대상에 포함).
2. **전 화면 순회** — 각 화면에서 렌더링 오류, 콘솔 에러, 깨진 레이아웃, 로딩/에러 상태를 확인한다:
   - `/` (랜딩) → `/login`, `/signup`, `/reset-password`
   - `/onboarding` (7단계 전부 진행)
   - `/home` (AI 리포트 로딩·skeleton·완료 상태), `/env`, `/outfit`, `/tips`, `/me`
3. **API 직접 점검**: `/api/weather`, `/api/air`, `/api/pollen`, `/api/uv`, `/api/report` — 정상 응답과 비정상 파라미터(없는 지역 등) fallback 동작.
4. **DESIGN.md 정합성**: 순회 중 DESIGN.md 기준(터치 타겟 44px, primary `#F5A623`, Pretendard, Lucide 아이콘, 390px 프레임)에 어긋나는 코드를 발견하면 반드시 flag한다 (AGENTS.md 규정).
5. `npm run lint` 와 `npm run build` 통과 확인.

## 수정 및 보고

- 발견된 문제는 심각도(P0~P3)를 매기고, **P0·P1은 즉시 수정**한다. P2·P3은 수정 여부를 사용자에게 묻는다.
- 수정 후 해당 화면을 다시 구동해 회귀가 없는지 확인한다.
- 최종 보고: 점검 항목 체크리스트 + 발견/수정/보류 목록. 수정 사항은 CHANGELOG.md에 기록한다.
