import { supabase } from "@/lib/supabase";

/**
 * 당일 AI 리포트의 서버 사본 (public.daily_reports).
 *
 * 리포트 캐시는 원래 브라우저 localStorage 전용이었다. 그래서 하루 한도(report_usage)를
 * 소진한 뒤 **캐시가 없는 기기**(폰↔PC, 시크릿창, 저장소 정리 후)로 들어오면 홈 히어로가
 * 규칙 폴백("기본 추천")으로 추락했다 — 서비스의 첫 화면이 흔한 조건에서 깨지던 구조
 * (2026-07-27 실사용 제보).
 *
 * 이 모듈은 그 캐시의 교차기기 사본을 담당한다. **조회는 생성이 아니다** — Claude를 호출하지
 * 않고 하루 한도도 쓰지 않는다. 한도는 "새로 쓰기"만 막아야 한다.
 *
 * 설계 원칙 — 서버 캐시는 로컬 캐시의 사본이며 새로운 신선도 의미를 만들지 않는다.
 * 저장하는 값(env·profileSig·ts·version)이 localStorage에 넣는 것과 같고, 신선도 판정은
 * 호출부가 로컬 캐시와 **똑같은 규칙**으로 한다(app/(main)/home/page.tsx). 판정이 두 갈래가
 * 되면 그게 다음 버그가 된다.
 *
 * 게스트(비로그인)는 대상이 아니다 — RLS가 로그인 사용자 전용이고, 게스트 체험은 종전대로
 * localStorage만 쓴다. 모든 함수는 실패해도 던지지 않는다: 서버 사본은 보조 수단이므로
 * 여기서 나는 오류가 리포트 흐름을 멈추면 안 된다.
 */

export type StoredDailyReport = {
  hook: string;
  message: string;
  checklist: string[];
  /** 생성 시각(epoch ms) — 로컬 캐시의 `ts`와 같은 의미(발행 시각·새벽 잠정본 판정). */
  ts: number;
  /** 생성 시점 환경 스냅샷(EnvSignature 객체) — 급변 재생성 판정용. */
  env: unknown;
  /** 생성 시점 판단 입력 서명 — 체질·일과 변경 재생성 판정용. */
  profileSig: string;
};

type Row = {
  hook: string | null;
  message: string;
  checklist: string[] | null;
  env_sig: string | null;
  profile_sig: string | null;
  generated_at: string;
};

/**
 * 오늘 이 아이의 서버 사본을 가져온다. 없거나 비로그인·조회 실패면 null.
 * `version`이 다른 행은 구형 페이로드이므로 없는 것으로 취급한다.
 */
export async function fetchDailyReport(
  childId: string,
  day: string,
  version: string
): Promise<StoredDailyReport | null> {
  try {
    // getSession은 로컬 저장소만 읽으므로 네트워크 오류로 로그인 상태를 오판하지 않는다
    // (lib/profile.ts fetchProfilesFromDb와 같은 패턴).
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data, error } = await supabase
      .from("daily_reports")
      .select("hook, message, checklist, env_sig, profile_sig, generated_at")
      .eq("user_id", session.user.id)
      .eq("child_id", childId)
      .eq("day", day)
      .eq("cache_version", version)
      .maybeSingle<Row>();

    if (error || !data?.message) return null;

    let env: unknown = null;
    try {
      env = data.env_sig ? JSON.parse(data.env_sig) : null;
    } catch {
      env = null;
    }
    // env가 null이면 호출부의 envChanged가 "판정 불가 → 변하지 않음"으로 보고 재사용한다
    // (`if (!prev) return false`). 로컬 캐시의 구형 항목(env 필드 없음)과 똑같은 처리이며,
    // 의도한 대로다 — 서버 사본은 로컬 캐시의 사본이고 신선도 규칙을 새로 만들지 않는다.

    return {
      hook: data.hook ?? "",
      message: data.message,
      checklist: Array.isArray(data.checklist) ? data.checklist : [],
      ts: new Date(data.generated_at).getTime(),
      env,
      profileSig: data.profile_sig ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * 생성된 리포트를 서버에 올린다(같은 키가 있으면 덮어쓴다). 비로그인이면 아무 것도 하지 않는다.
 * 실패는 삼킨다 — 화면에는 이미 리포트가 떠 있고, 사본 저장 실패로 사용자를 방해할 이유가 없다.
 */
export async function saveDailyReport(
  childId: string,
  day: string,
  version: string,
  report: StoredDailyReport
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { error } = await supabase.from("daily_reports").upsert(
      {
        user_id: session.user.id,
        child_id: childId,
        day,
        cache_version: version,
        hook: report.hook,
        message: report.message,
        checklist: report.checklist,
        env_sig: JSON.stringify(report.env ?? null),
        profile_sig: report.profileSig,
        generated_at: new Date(report.ts).toISOString(),
      },
      { onConflict: "user_id,child_id,day" }
    );
    if (error) console.error("[saveDailyReport]", error.message);
  } catch (err) {
    console.error("[saveDailyReport]", err);
  }
}
