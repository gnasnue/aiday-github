import { NextRequest, NextResponse } from "next/server";

// 인앱 수요 프로브 이벤트 수집 — DB·마이그레이션 없이 서버 로그로만 기록하는 최소 구현.
// pre-product 검증용: 어떤 기능에, 어떤 맥락에서 관심 클릭이 얼마나 나오는지를
// Vercel 로그에서 집계한다. (신호가 확인되면 그때 제대로 된 저장소로 승격)
//
// 개인정보는 받지 않는다 — feature/action/meta(비식별 맥락)만 허용.

interface FeedbackBody {
  feature?: unknown;
  action?: unknown;
  meta?: unknown;
}

const asString = (v: unknown, max = 80): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;

export async function POST(request: NextRequest) {
  let body: FeedbackBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const feature = asString(body.feature);
  const action = asString(body.action);
  if (!feature || !action) {
    return NextResponse.json({ error: "feature/action required" }, { status: 400 });
  }

  // meta는 얕은 문자열/숫자 맵만 허용 (임의 페이로드·개인정보 저장 방지)
  const meta: Record<string, string | number> = {};
  if (body.meta && typeof body.meta === "object") {
    for (const [k, v] of Object.entries(body.meta as Record<string, unknown>)) {
      if (Object.keys(meta).length >= 6) break;
      const key = asString(k, 32);
      if (!key) continue;
      if (typeof v === "number" && Number.isFinite(v)) meta[key] = v;
      else {
        const s = asString(v, 120);
        if (s) meta[key] = s;
      }
    }
  }

  // 구조화 로그 — Vercel 로그에서 grep/집계 가능
  console.log("[feedback]", JSON.stringify({ feature, action, meta }));

  return NextResponse.json({ ok: true });
}
