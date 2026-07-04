---
name: ship
description: 현재 작업을 커밋·푸시하고 PR을 생성한다. "올려줘", "PR 만들어", "배포 준비" 요청에 사용. 머지·배포까지 하려면 /land-and-deploy.
---

# Ship — 커밋·푸시·PR

현재 작업을 정리해 PR까지 만든다.

## 진행 순서

1. **사전 점검**: `npm run lint` 와 `npm run build` 를 통과해야 ship할 수 있다. 실패하면 멈추고 보고한다.
2. **버전·체인지로그** (기능 추가/버그 수정이 포함된 경우):
   - CHANGELOG.md에 Keep a Changelog 형식으로 항목 추가 (`### Added` / `### Changed` / `### Fixed`, 한국어)
   - 버전 규칙: 4자리 `MAJOR.MINOR.PATCH.HOTFIX` — `VERSION` 파일과 `package.json`의 `version`을 함께 올린다
3. **커밋**: 컨벤셔널 커밋 + 한국어 설명 (기존 이력 스타일: `feat: 온보딩 데이터 Supabase DB 저장`). 논리 단위로 나눠 커밋한다.
4. **푸시**: `git push -u origin <branch>`. main에 직접 푸시하지 않는다 — 항상 feature 브랜치 → PR.
5. **PR 생성**: 제목은 커밋 스타일과 동일하게, 본문에는 변경 요약·테스트 방법·관련 리뷰 리포트(`docs/reviews/`) 링크를 포함한다.

## 규칙

- `.env*` 파일, API 키가 diff에 포함되어 있지 않은지 커밋 전에 확인한다.
- 스코프 밖의 uncommitted 변경이 섞여 있으면 커밋에 포함하지 말고 사용자에게 알린다.
