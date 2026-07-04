---
name: plan-design-review
description: 계획 단계 디자인 리뷰. 구현 전에 계획된 UI/화면이 DESIGN.md 디자인 시스템에 부합하는지 검토. 새 화면·컴포넌트를 만들기 전 설계 검증에 사용.
---

# Plan Design Review — 계획 단계 디자인 검토

구현 **전에** 계획된 UI가 DESIGN.md에 부합하는지 검토한다. (이미 구현된 화면의 시각 감사는 /design-review 를 사용한다.)

## 진행 순서

1. **DESIGN.md 전체를 읽는다.** 이 문서가 유일한 디자인 권위(Design Authority)다.
2. 계획된 화면/컴포넌트를 다음 기준으로 점검한다:
   - **Warm Minimal 원칙**: 색상과 그림자로만 깊이 표현, 패턴·일러스트 금지 (CharacterReport의 아이 캐릭터가 유일한 예외 — 확장 금지)
   - **색상**: primary `#F5A623` 중심, 새 색상 도입은 명시적 승인 필요
   - **타이포**: Pretendard Variable, 정의된 스케일(2xl~xs) 밖의 크기 금지
   - **레이아웃**: 390px 고정 프레임 + BottomNav 구조 유지
   - **터치 타겟**: 최소 44px × 44px
   - **아이콘**: Lucide React만, OS 이모지 금지
3. 기존 컴포넌트(`components/`, `components/ui/`)로 조립 가능한지 확인한다 — 새 컴포넌트 신설은 마지막 수단.

## 산출물

- 기준 위반 항목과 대안을 표로 정리해 제시한다.
- DESIGN.md에 규정이 없는 새로운 패턴이 필요한 경우, DESIGN.md에 추가할 초안을 함께 제안한다 (사용자 승인 전 DESIGN.md를 직접 수정하지 않는다).
- 정식 리포트가 필요하면 `docs/reviews/YYYY-MM-DD-plan-design-review-<주제>.md`로 저장한다.
