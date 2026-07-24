import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCATION } from "@/lib/location";

// 아침 프리워밍 크론 (B) — 부모가 아침에 처음 여는 순간의 콜드 지연을 서버가 대신 지불한다.
//
// 문제: weather/air/uv/pollen 라우트의 상류 fetch는 next.revalidate 캐시를 쓰는데(1~6h),
// 밤새 만료된다. 그래서 아침 첫 사용자가 콜드 상류 fetch(공공 API, 최대 ~5s)를 그대로 기다린다.
// 이 크론이 러시 직전에 각 라우트를 미리 호출해 revalidate 캐시를 데워 두면, 첫 사용자는
// 데워진 캐시로 즉시 통과한다(홈 클라의 A2 즉시 페인트 재검증도 이 캐시를 읽어 빨리 끝난다).
//
// 실행: vercel.json의 crons가 매일 06:00 KST(21:00 UTC)에 호출. Vercel Hobby는 크론 1일 1회
// 제한이라 아침 1회로 설계했다(Pro면 러시 내내 여러 번으로 늘릴 수 있음 — 아래 SLOTS 참고).
// 워밍 대상은 기본 기준지(서울 중구) + region=서울(uv/pollen은 서울 전역 단일값). 사용자가 다른
// 구로 바꾼 경우의 weather/air는 못 데우지만, 지인 베타는 대부분 기본 위치라 이걸로 대다수를 덮는다.

export const dynamic = "force-dynamic"; // 크론 라우트 자체는 캐시하지 않는다(매 호출 실제 실행)
export const maxDuration = 30;

// Vercel Cron은 Authorization: Bearer $CRON_SECRET을 붙여 호출한다. CRON_SECRET이 설정돼 있으면
// 그 헤더를 요구해 공개 남용(무한 상류 호출)을 막는다. 미설정(로컬·미구성)이면 검증을 건너뛴다.
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const { lat, lon, station } = DEFAULT_LOCATION;

  // 홈 클라이언트가 실제로 치는 것과 동일한 경로·쿼리로 호출해야 같은 revalidate 캐시 키가 데워진다.
  const targets: { name: string; url: string }[] = [
    { name: "weather", url: `${origin}/api/weather?lat=${lat}&lon=${lon}` },
    { name: "air", url: `${origin}/api/air?station=${encodeURIComponent(station)}` },
    { name: "uv", url: `${origin}/api/uv?region=서울` },
    { name: "pollen", url: `${origin}/api/pollen?region=서울` },
  ];

  const results = await Promise.all(
    targets.map(async ({ name, url }) => {
      const t0 = Date.now();
      try {
        // 캐시를 데우는 게 목적이므로 하위 라우트가 상류를 완주하도록 넉넉히 대기(10s).
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        return { name, ok: res.ok, status: res.status, ms: Date.now() - t0 };
      } catch {
        return { name, ok: false, status: 0, ms: Date.now() - t0 };
      }
    })
  );

  const warmed = results.filter((r) => r.ok).length;
  return NextResponse.json({ warmed, total: targets.length, station, results });
}
