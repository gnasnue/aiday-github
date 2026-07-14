# Codex 작성 문서 지도

> 마지막 정리: 2026-07-13
>
> 이 문서는 Codex가 생성한 검토·계획 산출물의 **현재 효력과 보관 위치**만 안내한다.
> 제품의 공식 기준은 `MANIFESTO.md`, `PRD.md`, `SPEC.md`, `DESIGN.md`, `docs/PRODUCT-DECISIONS.md`다.

## 현재 참고할 문서

| 목적 | 문서 | 상태 |
| --- | --- | --- |
| 남은 4주 의사결정과 실행 순서 | [4주 집중 전략](./reviews/2026-07-12-ceo-review-4주-집중전략.md) | **현재 최우선 판단** |
| 현재 로컬·GitHub 구조의 기술 판단 | [아키텍처 엔지니어링 리뷰](./reviews/2026-07-13-eng-review-현재-아키텍처.md) | 브리핑 수직 슬라이스 착수 전 참고 |
| 현재 MVP 단계의 제품 판단 | [CEO 현재 단계 리뷰](./reviews/2026-07-12-ceo-review-current-stage.md) | PRD v2.7의 근거 |
| 현재 MVP 단계의 기술 판단 | [엔지니어링 현재 단계 리뷰](./reviews/2026-07-12-eng-review-current-stage.md) | PRD v2.7의 근거 |
| 현재 MVP 단계의 디자인 판단 | [디자인 현재 단계 리뷰](./reviews/2026-07-12-plan-design-review-current-stage.md) | PRD v2.7의 근거 |
| PRD를 새로 작성할지에 대한 과거 결정 | [2026-07-04 CEO 리뷰](./reviews/2026-07-04-ceo-review-prd-작성.md) | `PRODUCT-DECISIONS.md`에서 참조하는 이력 |

## 보관 문서

아래 문서는 당시 판단의 근거를 보존하지만, 현재 계획이나 구현의 기준으로 사용하지 않는다.

| 묶음 | 보관 위치 | 보관 이유 |
| --- | --- | --- |
| 2026-06 AI 리포트 API 3종 리뷰 | [`archive/codex/reviews/2026-06`](./archive/codex/reviews/2026-06/) | 초기 스트리밍 전환 시점의 해결된 문제 |
| 2026-07 홈 화면 리스타일 3종 리뷰 | [`archive/codex/reviews/2026-07`](./archive/codex/reviews/2026-07/) | 특정 UI 변경에 대한 시점 한정 판단 |
| 2026-07 PRD 피드백 리뷰 | [`archive/codex/reviews/2026-07`](./archive/codex/reviews/2026-07/) | PRD v2.7에 반영되거나 4주 집중 전략으로 대체된 제안 |
| 브리핑 엔진 PDCA 작업 문서 4종 | [`archive/codex/briefing-engine`](./archive/codex/briefing-engine/) | 구현 전 탐색용 상세안. 현재 4주 범위보다 넓고 다른 문서에서 참조되지 않음 |

## 운영 원칙

1. 새 판단은 먼저 공식 문서 한 곳에 반영한다. 리뷰 문서는 그 결정의 근거가 필요할 때만 남긴다.
2. 동일 주제의 후속 리뷰가 기존 결론을 대체하면, 이전 리뷰는 `archive/codex`로 이동하고 이 문서에만 상태를 기록한다.
3. 계획·설계·분석 문서는 구현 착수 전의 작업 자료다. 공식 범위가 바뀌거나 참조가 사라지면 보관 문서로 전환한다.
4. Codex는 사용자가 명시적으로 요청한 검토·계획 외에 독립 문서를 새로 만들지 않는다. 변경 결과는 가능한 한 기존 공식 문서 또는 PR 설명에 기록한다.
