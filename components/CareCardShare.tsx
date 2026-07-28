"use client";

import { forwardRef } from "react";
import type { CareCard } from "@/lib/memory/care-card";

/**
 * 돌봄 카드 공유 이미지 — 조부모·시터·어린이집에 건네는 한 장.
 *
 * ShareReportCard와 같은 제약을 따른다: 캔버스 캡처(foreignObject 래스터화)에서는
 * Tailwind 유틸·CSS 변수(hsl 토큰) 해석이 보장되지 않으므로 **스타일은 전부 인라인 hex**로
 * 고정한다. hex는 DESIGN.md v3 토큰의 근사값이다.
 *
 * 콘텐츠 폭 600px 고정 — pixelRatio 2로 구우면 1200px, 카톡·문자 공유에 적합.
 */

const C = {
  paper: "#FFF8F0",
  card: "#FFFFFF",
  muted: "#F3F0ED",
  border: "#EAE3DC",
  foreground: "#26201B",
  body: "#4A3F36",
  mutedFg: "#6E655D",
  faint: "#9C938A",
  accent: "#C2540A",
  tint: "#FFEDDD",
  good: "#3D8B5F",
};

const CareCardShare = forwardRef<HTMLDivElement, { card: CareCard }>(function CareCardShare(
  { card },
  ref
) {
  return (
    <div
      ref={ref}
      style={{
        width: 600,
        background: C.paper,
        padding: 40,
        fontFamily:
          '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, sans-serif',
        color: C.foreground,
      }}
    >
      <div style={{ background: C.card, borderRadius: 28, padding: 36 }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", color: C.accent }}>
            돌봄 카드
          </p>
          <p style={{ margin: 0, fontSize: 13, color: C.faint }}>{card.dateLabel}</p>
        </div>
        <h1
          style={{
            margin: "10px 0 0",
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.028em",
            lineHeight: 1.3,
          }}
        >
          {card.childName}
          {card.ageLabel ? (
            <span style={{ fontSize: 18, fontWeight: 600, color: C.mutedFg }}> · {card.ageLabel}</span>
          ) : null}
        </h1>

        {/* 오늘 부탁 — 있으면 가장 위, 크림 밴드 */}
        {card.todayRequest && (
          <div style={{ marginTop: 24, background: C.tint, borderRadius: 18, padding: "20px 22px" }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", color: C.accent }}>
              오늘 부탁드려요
            </p>
            <p style={{ margin: "8px 0 0", fontSize: 19, fontWeight: 700, lineHeight: 1.55, wordBreak: "keep-all" }}>
              {card.todayRequest}
            </p>
          </div>
        )}

        {/* 부모가 알려준 것 */}
        {card.profileLines.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>알아두면 좋은 것</p>
            <div style={{ marginTop: 12 }}>
              {card.profileLines.map((l, i) => (
                <div
                  key={l.label}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "14px 0",
                    borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                  }}
                >
                  <span
                    style={{
                      flex: "none",
                      minWidth: 52,
                      height: 28,
                      padding: "0 12px",
                      borderRadius: 999,
                      background: C.muted,
                      color: C.mutedFg,
                      fontSize: 13,
                      fontWeight: 700,
                      lineHeight: "28px",
                      textAlign: "center",
                    }}
                  >
                    {l.label}
                  </span>
                  <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: C.body, wordBreak: "keep-all" }}>
                    {l.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 기록에서 확인된 것 — 근거 수를 함께 적는다 */}
        {card.observedLines.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
              그동안의 기록에서{" "}
              <span style={{ fontSize: 13, fontWeight: 600, color: C.faint }}>· 관찰이며 진단이 아니에요</span>
            </p>
            <div style={{ marginTop: 12 }}>
              {card.observedLines.map((l, i) => (
                <div
                  key={l.label}
                  style={{
                    padding: "14px 0",
                    borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: C.body, wordBreak: "keep-all" }}>
                    {l.text}
                  </p>
                  {l.evidence && (
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: C.faint }}>{l.evidence}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.faint }}>
            AiDay가 {card.childName}의 프로필과 보호자 기록으로 만든 카드예요. 의학적 진단이
            아니며, 아이 상태가 걱정되면 전문가와 상의해 주세요.
          </p>
        </div>
      </div>
    </div>
  );
});

export default CareCardShare;
