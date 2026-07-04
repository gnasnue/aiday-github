---
name: qa-only
description: QA 리포트만 작성하고 코드는 수정하지 않는다. 현재 상태 파악, 리뷰 전 점검 등 읽기 전용 QA에 사용.
---

# QA Only — 리포트 전용 QA

/qa 와 동일한 점검 절차를 수행하되, **코드를 일절 수정하지 않는다.**

## 진행 방식

1. `.claude/skills/qa/SKILL.md`의 점검 절차(전 화면 순회, API 점검, DESIGN.md 정합성, lint/build)를 그대로 따른다.
2. 발견된 모든 문제를 심각도(P0~P3)와 함께 기록만 한다. P0이라도 수정하지 않는다.

## 산출물

리포트를 대화로 보고하고, 사용자가 원하면 `docs/reviews/YYYY-MM-DD-qa-report.md`로 저장한다:

- 점검 체크리스트 (화면별 ✅/❌)
- Findings 목록 (심각도, 파일:라인, 증상, 권장 수정 방향)
- lint/build 결과
