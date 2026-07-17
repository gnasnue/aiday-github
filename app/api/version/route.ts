import { NextResponse } from "next/server";

// 현재 라이브 배포의 식별자. bfcache/PWA로 복원된 옛 번들이 최신과 다른지 비교하는 용도.
// 항상 최신 배포에서 실행되므로 이 값이 "지금 서빙 중인 버전"이다. no-store로 캐시 없이 실측.
export const dynamic = "force-dynamic";

export function GET() {
  const id =
    process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";
  return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
}
