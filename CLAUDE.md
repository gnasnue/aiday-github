# aiday — Claude Code Instructions

아이데이(AiDay): 날씨·대기질 등 환경 데이터를 아이 체질 기준으로 해석해, 부모가 매일 반복하는 육아 의사결정의 첫 판단(옷차림·준비물·오늘의 케어 방식)을 지원하는 AI 육아 앱. 그 판단은 하루 안에서 닫힌다 — **아침 판단 → 기관·돌봄자에게 전달 → 저녁 30초 회수 → 다음 비슷한 날 예고**(아침이 중심, 나머지는 그 정확도·전달을 위해 존재. MANIFESTO §1·§5). Next.js 15 (App Router) + TypeScript + Supabase + Claude Sonnet. 모바일 우선(390px 고정 프레임), 문서·UI·커밋 메시지는 한국어.

## Commands

```bash
npm run dev     # 개발 서버 (localhost:3000)
npm run build   # 프로덕션 빌드 — ship 전 필수 통과
npm run lint    # ESLint — ship 전 필수 통과
npm test        # vitest — lib 유닛 테스트
node scripts/verify-env-accuracy.mjs   # 홈 환경 지표 정합성 검증 (기본 프로덕션, --base http://localhost:3000 로컬)
# ↑ 매일 07시 Claude 스케줄 태스크 `aiday-daily-env-accuracy`(~/.claude/scheduled-tasks, repo 외부)가 자동 실행
node scripts/eval-report.mjs       # 리포트 프롬프트 eval — 프롬프트 변경 시 before/after 대조 필수
node scripts/eval-noteboard.mjs    # 알림장 프롬프트 eval (3케이스)
```

lib 도메인 로직은 vitest 유닛 테스트(`npm test`)로, 화면 동작은 실제 구동(dev 서버 + 화면 확인)으로 검증한다. 환경 변수는 `.env.example` 참조 (`.env.local`에 설정).

## Structure

| 경로 | 역할 |
|------|------|
| `app/(main)/*` | 탭 5종: home(AI 리포트)·env·outfit·day(하루 루프)·me. 탭 밖: tips(전체 가이드)·pass(케어 패스) |
| `app/review/*` | 오늘의 마무리 — 저녁 결과 회수 2스텝 풀스크린 ((main) 프레임 밖) |
| `app/api/*` | weather(기상청)·weather/weekly(주간)·air(에어코리아)·pollen(꽃가루)·uv(자외선)·report(Claude)·noteboard(알림장→저녁 대화 거리, 로그인 필수) |
| `lib/` | 도메인 로직. AI 프롬프트는 `lib/prompts/`(report·noteboard), 하루 루프 판정은 `lib/memory/`·`lib/week-radar.ts`·`lib/care-plan.ts`(handoff 생성기)·`lib/morning-message.ts` |
| `components/ui/` | shadcn/ui 생성물 — 직접 수정 지양, 커스텀은 `components/`에 |
| `supabase/migrations/` | DB 스키마 (RLS 적용) |
| `docs/reviews/` | 리뷰 스킬들의 리포트 산출물 |

## Documents

- **SPEC.md** — 페이지별 기능 명세와 구현 현황. 기능 작업 전 해당 섹션을 먼저 읽는다.
- **MANIFESTO.md** — 서비스 존재 이유와 설계 원칙. 제품 판단의 기준.
- **DESIGN.md** — 디자인 시스템. 아래 Design System 섹션 참조.
- **docs/PRODUCT-DECISIONS.md** — 성공 지표·출시 기준·확정된 제품 결정. 출시 범위나 보류 항목 판단 시 참조.
- **docs/perf-home-latency.md** — 홈 지연 계측(`?perf=1`) 사용법·로그 읽는 법·2026-07 조사 요약. 홈 로딩 성능 진단 시 참조.
- **docs/01-plan/features/web-push-notifications.plan.md** — 웹 푸시 알림(매일 아침 케어 리포트) 구현 계획안. iOS 16.4+ PWA 제약·아키텍처·마일스톤 정리. **미착수** — 구현 전 `/plan-eng-review`로 아키텍처 검증 권장.
- **CHANGELOG.md / VERSION** — 아래 Conventions 참조.

## Conventions

- **커밋**: 컨벤셔널 커밋 + 한국어 설명 (예: `feat: 온보딩 데이터 Supabase DB 저장`). main 직접 푸시 금지 — feature 브랜치 → PR.
- **버전**: 4자리 `MAJOR.MINOR.PATCH.HOTFIX`. 릴리스 시 `VERSION`·`package.json`·CHANGELOG.md(Keep a Changelog, 한국어)를 함께 갱신.
- **캐시 키**: AI 리포트 등 캐시된 페이로드의 스키마가 바뀌면 캐시 키 버전을 올려 구형 캐시를 무효화한다.
- **외부 API 제약**: Anthropic temperature는 0~1.0, 기상청 자외선 데이터는 KST 06시 발행(그 전엔 어제 데이터 fallback), 비정상 지역 파라미터는 서울 fallback. 외부 API 호출부에는 반드시 try/catch와 사용자 피드백을 둔다.

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Skill routing

프로젝트 스킬은 `.claude/skills/`에 있다. 요청이 아래 스킬에 해당하면 Skill 도구로 호출한다. When in doubt, invoke the skill.

- 제품 아이디어/브레인스토밍 → /office-hours
- 전략/스코프 → /plan-ceo-review
- 아키텍처 → /plan-eng-review
- 디자인 시스템 상담 → /design-consultation, 구현 전 계획 검토 → /plan-design-review
- 풀 리뷰 파이프라인 → /autoplan
- 버그/에러 → /investigate
- QA/사이트 동작 테스트 → /qa (수정 포함) 또는 /qa-only (리포트만)
- 코드 리뷰/diff 점검 → 내장 /code-review (작업 중 diff) 또는 /review (GitHub PR)
- 시각적 폴리싱 → /design-review
- 커밋/푸시/PR → /ship, 머지/배포 → /land-and-deploy
- 진행 상황 저장 → /context-save, 복원 → /context-restore
