import { localDateStr } from "@/lib/date";

// AI 리포트 당일 캐시 키 — 프롬프트/스키마 변경 시 버전(v..)을 올려 구캐시를 무효화한다.
// 홈(생성·프라임)과 오늘의 마무리(아침 판단 스냅샷 읽기)가 반드시 같은 키를 쓰도록
// 한 곳에서 만든다 — 예전에 홈 안에서도 두 곳에 하드코딩해 버전이 어긋나며 프라임이
// 캐시를 못 찾던 회귀가 있었다. (2026-07-28 홈에서 이 모듈로 추출 — 동작 불변)
//
// 버전 이력:
// v21: 판단 순서·개인화 프롬프트 개편 + 자외선 강함 미만 입력 제외 (2026-07-20, docs/report-eval/)
// v22: 질병명(비염·천식·아토피) 진단 단정 제거 — 민감 체질 표현으로 전환 (2026-07-21)
// v23: 준비물 정합성 런타임 강제 — 근거 없는 마스크 제거·prep⊆checklist (2026-07-22)
// v24: hook 계약 개정(25자 1절 → 40자 "조건 — 행동" 2절). 구형 캐시의 짧은 hook은
// 히어로에서 배지가 비거나 28px 결론이 6자만 담당하게 되므로 버전을 올려 무효화한다.
// v25: 브리핑 판단 깊이 개편 — message 3문장 역할 구조(이름=2번째 줄, supportLine 발췌
// 계약)·few-shot 교체. 구캐시는 이름 줄 위치가 달라 근거 발췌가 어긋나므로 무효화 (2026-07-27)
// v26: 저장값에 판단 입력 스냅샷(profileSig) 추가 + 환경 스냅샷에 PM2.5/통합대기/습도 반영 —
// 같은 날 체질·민감도·일과를 수정해도 구 판단을 재사용하던 결함과, PM10 외 대기질·습도
// 급변을 놓치던 결함을 함께 고친다. 구캐시엔 profileSig가 없어 전부 재생성된다
// (2026-07-27 Codex 엔지니어링 리뷰 T3).
// v27: 시점 단정 금지 — 꽃가루·대기질처럼 시간대 입력이 없는 지표의 변화를 사실로 말하지
// 않고 가능성 보존형으로. 구캐시엔 단정형 문장이 남아 있으므로 무효화 (2026-07-27)
// v28: 근거 없는 마스크 본문 언급 금지(부정·안심 형태 포함) — few-shot 예시 8 재작성 +
// 런타임 본문 게이트. 당일 구캐시에 "마스크를 씌우면 오히려 …" 문장이 남아 있으므로 무효화
// (2026-07-27 실사용 사고)
// v29: 메타 비교 말투 금지("갈아입히는 게 더위 자체보다 중요해요"류) — few-shot 예시 3
// 재작성 + 말투 규칙. 당일 구캐시에 해당 문장이 남아 있으므로 무효화 (2026-07-27 사용자 피드백)
// v30: 히어로 표면 역할 재계약 — message는 hook의 요약이 아니라 이어 읽는 새 정보(반복 금지),
// hook 행동절은 하루에 통하는 원칙. 구캐시는 헤드라인·근거·본문이 같은 말을 반복하므로 무효화
// (2026-07-27 사용자 지적)
// v31: 고온다습 판정 전도 수정 — 기온 31°C+습도 70%를 위험 수준(②)으로 승격, 위험한 날
// hook은 온열 안전 수칙(활동 조정·수분)이 1순위(민감도는 순위가 아니라 처방 강도를 바꾼다).
// 당일 구캐시는 "갈아입히기"가 헤드라인이므로 무효화 (2026-07-27 사용자 지적)
// v32: 무난한 날 좋음·보통 등급 근거 나열 금지("미세먼지도 좋음이라"류) — 입력에서 좋음·보통
// 등급 제거(air·pollen) + 런타임 등급 언급 수술. 당일 구캐시에 해당 문장이 남아 있으므로
// 무효화 (2026-07-27 eval E-AHA-4 재발)
//
// 페이로드 스키마 버전. 로컬 캐시 키와 서버 사본(daily_reports.cache_version)이 같은 값을 쓴다 —
// 서버 사본에 버전이 없으면 규격을 바꾼 당일 구형 리포트가 서버에서 되살아난다.
export const REPORT_CACHE_VERSION = "v32";

export const reportCacheKey = (childId: string) =>
  `aiday:report:${REPORT_CACHE_VERSION}:${childId}:${localDateStr()}`;

/** 당일 캐시된 리포트 페이로드 — 홈이 저장하는 형태의 부분집합(읽기용). */
export type CachedDailyReport = {
  hook?: string;
  message?: string;
  checklist?: string[];
  ts?: number;
};

/**
 * 오늘의 캐시된 리포트를 읽는다(없거나 파싱 실패면 null).
 * 오늘의 마무리(Step 1 아침 판단 스냅샷)가 사용 — 쓰기는 홈만 한다.
 */
export const loadTodayReport = (childId: string): CachedDailyReport | null => {
  try {
    const raw = localStorage.getItem(reportCacheKey(childId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as CachedDailyReport;
  } catch {
    return null;
  }
};
