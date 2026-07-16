"use client";

import { forwardRef } from "react";

/**
 * 공유용 이미지 카드 — 홈 AI 리포트를 카톡·인스타 등으로 공유할 때
 * html-to-image로 PNG 캡처하는 대상. 화면에는 보이지 않고(off-screen),
 * ref로 붙잡아 렌더 결과만 이미지로 굽는다.
 *
 * ⚠️ 캔버스 캡처(foreignObject 래스터화) 제약 때문에 스타일은 전부 인라인 hex로 고정한다.
 *   - Tailwind 유틸/CSS 변수(hsl 토큰)는 캡처 컨텍스트에서 해석이 보장되지 않는다.
 *   - hex 값은 DESIGN.md 웜 뉴트럴 v2 토큰의 근사값과 일치시킨다.
 * 폭은 콘텐츠 600px 고정 — pixelRatio 2로 구우면 1200px, 소셜 공유에 적합.
 */

export type ShareBadge = { label: string; value: string; tone: "good" | "warn" | "neutral" };
export type ShareChecklistItem = { icon: string; title: string; reason: string };

export type ShareReportData = {
  childName: string;
  dateLabel: string;
  hook: string;
  paragraphs: string[];
  badges: ShareBadge[];
  checklist: ShareChecklistItem[];
};

const C = {
  paperFrom: "#FFF2E0",
  paperTo: "#FFF8F0",
  card: "#FFFFFF",
  soft: "#FFF8F0",
  muted: "#F5F3EF",
  border: "#EAE3DC",
  foreground: "#281D15",
  body: "#4A3F36",
  mutedFg: "#766960",
  accent: "#CC5500",
  good: "#3D8B5F",
  warn: "#D4622A",
  neutralFg: "#756A5F",
};

// Logo.tsx의 Mark와 동일 패스 (브랜드 일관성). 크기만 공유 카드용으로 키움.
const BrandMark = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="17 11 90 90" fill="none" aria-hidden="true">
    <g transform="translate(0 12.5)" fill="none" strokeLinecap="round">
      <g stroke="#EDB94A" strokeWidth="3">
        <line x1="60" y1="33" x2="60" y2="25" />
        <line x1="76.6" y1="38.7" x2="81.5" y2="32.4" />
        <line x1="43.4" y1="38.7" x2="38.5" y2="32.4" />
        <line x1="85.4" y1="50.8" x2="92.9" y2="48" />
        <line x1="34.6" y1="50.8" x2="27.1" y2="48" />
      </g>
      <path d="M38 60 A22 22 0 0 1 82 60 Z" fill="#EFAA35" />
      <path d="M20 70 Q60 56 100 70" stroke="#7FB4A6" strokeWidth="5" />
      <path
        d="M98 17 Q100.3 21.7 105 24 Q100.3 26.3 98 31 Q95.7 26.3 91 24 Q95.7 21.7 98 17 Z"
        fill="#6FB0A0"
      />
    </g>
  </svg>
);

const badgeStyle = (tone: ShareBadge["tone"]): React.CSSProperties => {
  if (tone === "warn")
    return { background: "#FDEDE4", border: `1px solid ${C.warn}33`, color: C.warn, fontWeight: 700 };
  if (tone === "good")
    return { background: C.card, border: `1px solid ${C.good}44`, color: C.good, fontWeight: 700 };
  return { background: C.muted, border: "1px solid transparent", color: C.neutralFg, fontWeight: 500 };
};

const ShareReportCard = forwardRef<HTMLDivElement, { data: ShareReportData }>(
  ({ data }, ref) => {
    const { childName, dateLabel, hook, paragraphs, badges, checklist } = data;
    const FONT =
      "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', -apple-system, BlinkMacSystemFont, sans-serif";

    return (
      <div
        ref={ref}
        style={{
          width: 600,
          boxSizing: "border-box",
          padding: "44px 40px 36px",
          background: `linear-gradient(160deg, ${C.paperFrom} 0%, ${C.paperTo} 100%)`,
          fontFamily: FONT,
          color: C.foreground,
        }}
      >
        {/* 헤더 — 브랜드 + 날짜 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BrandMark />
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>
              AiDay 아이데이
            </span>
          </div>
          <span style={{ fontSize: 14, color: C.mutedFg, fontWeight: 500 }}>{dateLabel}</span>
        </div>

        {/* 본문 카드 */}
        <div
          style={{
            marginTop: 22,
            background: C.card,
            borderRadius: 22,
            border: `1px solid ${C.border}`,
            padding: "30px 28px 26px",
            boxShadow: "0 12px 32px rgba(120, 90, 40, 0.10)",
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: C.accent,
              textTransform: "uppercase",
            }}
          >
            AI 리포트 · {childName}
          </div>

          {/* hook — 히어로 */}
          {hook && (
            <div
              style={{
                marginTop: 12,
                fontSize: 27,
                fontWeight: 800,
                lineHeight: 1.36,
                letterSpacing: "-0.02em",
                color: C.foreground,
                wordBreak: "keep-all",
              }}
            >
              {hook}
            </div>
          )}

          {/* 본문 문단 */}
          {paragraphs.length > 0 && (
            <div style={{ marginTop: hook ? 16 : 12 }}>
              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  style={{
                    margin: i === 0 ? 0 : "8px 0 0",
                    fontSize: 15.5,
                    lineHeight: 1.72,
                    color: C.body,
                    wordBreak: "keep-all",
                  }}
                >
                  {p}
                </p>
              ))}
            </div>
          )}

          {/* 환경 칩 */}
          {badges.length > 0 && (
            <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 7 }}>
              {badges.map((b) => (
                <span
                  key={b.label}
                  style={{
                    ...badgeStyle(b.tone),
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    borderRadius: 999,
                    padding: "6px 13px",
                    fontSize: 13,
                    lineHeight: 1,
                  }}
                >
                  {b.tone !== "neutral" && (
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        background: "currentColor",
                        display: "inline-block",
                      }}
                    />
                  )}
                  {b.label} {b.value}
                </span>
              ))}
            </div>
          )}

          {/* 오늘 챙길 것 */}
          {checklist.length > 0 && (
            <div
              style={{
                marginTop: 20,
                background: C.soft,
                borderRadius: 18,
                padding: "18px 18px 6px",
              }}
            >
              <div style={{ fontSize: 15.5, fontWeight: 800, paddingLeft: 2 }}>오늘 챙길 것</div>
              <div style={{ marginTop: 8 }}>
                {checklist.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 13,
                      padding: "11px 0",
                      borderBottom: i === checklist.length - 1 ? "none" : `1px solid ${C.border}99`,
                    }}
                  >
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        borderRadius: 12,
                        background: C.muted,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        lineHeight: 1,
                      }}
                    >
                      {c.icon}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 15,
                          fontWeight: 700,
                          letterSpacing: "-0.01em",
                          color: C.foreground,
                        }}
                      >
                        {c.title}
                      </span>
                      {c.reason && (
                        <span
                          style={{
                            display: "block",
                            marginTop: 2,
                            fontSize: 12.5,
                            color: C.mutedFg,
                            wordBreak: "keep-all",
                          }}
                        >
                          {c.reason}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 CTA */}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: C.foreground }}>
            우리 아이 맞춤 아침 리포트
          </div>
          <div style={{ marginTop: 3, fontSize: 12.5, color: C.mutedFg }}>
            날씨·대기질을 아이 체질로 해석 — AiDay에서 매일 받아보세요
          </div>
        </div>
      </div>
    );
  }
);

ShareReportCard.displayName = "ShareReportCard";

export default ShareReportCard;
