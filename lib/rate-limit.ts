import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { kstNow } from "./kma-time";

/**
 * /api/report 레이트리밋 — 서버 전용 모듈.
 *
 * 인증 없이 열려 있는 리포트 엔드포인트는 호출당 Claude 비용이 발생한다. 결정 문서 3-1에
 * 따라 게스트 호출은 계속 허용하되(둘러보기 = 핵심 가치 시연) 하루 상한을 둔다.
 * 카운터는 Supabase(`report_usage`)에 두어 서버리스 인스턴스가 여러 개로 늘어나도
 * 한도가 정확히 지켜지게 한다.
 *
 * ⚠️ service role 키를 읽으므로 클라이언트 컴포넌트에서 import 하지 말 것.
 */

/** 게스트(IP 버킷) 하루 한도. 데모 프로필 2개 × 재시도 여유 (결정 3-1 기본값). */
export const GUEST_DAILY_LIMIT = 10;
/** 로그인 사용자(user_id 버킷) 하루 한도. 아이 여러 명 + 재생성 여유. */
export const USER_DAILY_LIMIT = 20;

/**
 * 신뢰할 수 있는 클라이언트 IP. Vercel은 `x-forwarded-for` 맨 앞에 실제 클라이언트를 넣는다.
 * 로컬 dev에는 헤더 자체가 없어 null이 되고, 그 경우 레이트리밋은 적용되지 않는다.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

/**
 * 버킷 키. 로그인 사용자는 user_id, 게스트는 솔트를 섞은 IP 해시를 쓴다 —
 * IP 원문을 저장하지 않기 위함이며, 솔트가 없으면 IPv4는 전수 대입으로 복원된다.
 */
export function bucketKey(
  userId: string | null,
  ip: string | null,
  salt: string
): { bucket: string; limit: number } | null {
  if (userId) return { bucket: `u:${userId}`, limit: USER_DAILY_LIMIT };
  if (!ip) return null;
  const hash = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
  return { bucket: `ip:${hash}`, limit: GUEST_DAILY_LIMIT };
}

/**
 * 카운터 리셋 기준일(KST). `lib/kma-time.ts`의 `ymd`는 구분자 없는 `YYYYMMDD`라
 * Postgres `date` 입력으로 모호하므로, 여기서는 `YYYY-MM-DD`로 명시해 넘긴다.
 */
export function kstDay(now: Date = kstNow()): string {
  return (
    String(now.getUTCFullYear()) +
    "-" +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getUTCDate()).padStart(2, "0")
  );
}

export type RateLimitResult = {
  allowed: boolean;
  /** 판정을 건너뛴 이유. 로그·계측용이며 allowed는 항상 true다. */
  skipped?: "no_config" | "no_identity" | "store_error";
  limit?: number;
  used?: number;
};

const ALLOW = (skipped: RateLimitResult["skipped"]): RateLimitResult => ({ allowed: true, skipped });

/**
 * 호출 1회를 기록하고 한도 초과 여부를 판정한다.
 *
 * 판정 불가 상황(설정 누락·IP 없음·DB 오류)에서는 **통과시킨다**. 카운터 저장소가 잠깐
 * 흔들렸다고 모든 부모의 아침 리포트를 막는 편이, 그 사이 비용이 새는 것보다 나쁘다.
 * 다만 프로덕션에서 설정이 없으면 보호가 통째로 꺼진 것이므로 매 호출 error 로그를 남긴다.
 */
export async function checkReportRateLimit(
  headers: Headers,
  userId: string | null
): Promise<RateLimitResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[rate-limit] SUPABASE_SERVICE_ROLE_KEY 미설정 — /api/report 레이트리밋이 비활성 상태입니다."
      );
    }
    return ALLOW("no_config");
  }

  const identity = bucketKey(userId, clientIp(headers), process.env.RATE_LIMIT_SALT || serviceKey);
  if (!identity) return ALLOW("no_identity");

  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("bump_report_usage", {
      p_bucket: identity.bucket,
      p_day: kstDay(),
      p_limit: identity.limit,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return ALLOW("store_error");
    return {
      allowed: Boolean(row.allowed),
      limit: identity.limit,
      used: Number(row.usage_count),
    };
  } catch (err) {
    console.error("[rate-limit] 사용량 기록 실패 — 이번 요청은 통과시킵니다:", err);
    return ALLOW("store_error");
  }
}
