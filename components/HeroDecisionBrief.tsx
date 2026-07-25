"use client";

import type { ReactNode } from "react";
import { RefreshCw, Thermometer, Wind } from "lucide-react";
import LineIcon from "@/components/LineIcon";
import { headlineLines, type Evidence, type HeroState } from "@/lib/hero-brief";

// 홈 히어로 — "AI가 오늘의 판단을 완료했다"를 형태로 전달하는 화면당 1개 L2 카드.
// 명세: docs/reviews/2026-07-25-home-decision-brief-design.html (§2 확대·주석)
//
// 요소 순서가 곧 논증이다: 조건(pill) → 결론(대형) → 개인 근거(문장) → 데이터(chip).
// 데이터가 마지막에 오면 "판단은 끝났고 근거는 확인용"이라는 뜻이 된다. 수치를 먼저
// 놓는 날씨 앱과 반대 순서이며, 이 순서가 이 카드의 유일한 시그니처다.

/** 이슈 종류별 context 아이콘 — caution 상태에서 무엇이 문제인지 모양으로 말한다 */
export type HeroIssue = "temp" | "rain" | "dust" | "pollen" | "uv" | "heat" | "cold";

const ISSUE_ICON: Record<HeroIssue, ReactNode> = {
  temp: <Thermometer className="h-4 w-4 shrink-0" strokeWidth={1.75} />,
  rain: <LineIcon name="droplet" size={16} className="shrink-0" />,
  dust: <Wind className="h-4 w-4 shrink-0" strokeWidth={1.75} />,
  pollen: <LineIcon name="cloudsun" size={16} className="shrink-0" />,
  uv: <LineIcon name="sun" size={16} className="shrink-0" />,
  heat: <Thermometer className="h-4 w-4 shrink-0" strokeWidth={1.75} />,
  cold: <LineIcon name="scarf" size={16} className="shrink-0" />,
};

/** 상태별 pill 배경·아이콘 색. normal/fallback은 tint 없이 웜 뉴트럴 —
 *  "색 없음이 곧 특이사항 없음"(DESIGN.md status-neutral 원칙). */
const PILL: Record<HeroState, string> = {
  caution: "bg-status-warn-tint text-status-warn",
  safe: "bg-status-good-tint text-status-good",
  normal: "bg-muted text-muted-foreground",
  fallback: "bg-muted text-muted-foreground",
};

const DEFAULT_ICON: Record<HeroState, ReactNode> = {
  caution: ISSUE_ICON.temp,
  safe: <LineIcon name="sun" size={16} className="shrink-0" />,
  normal: <LineIcon name="cloudsun" size={16} className="shrink-0" />,
  fallback: <LineIcon name="cloudsun" size={16} className="shrink-0" />,
};

export type HeroDecisionBriefProps = {
  state: HeroState;
  /** 조건절. null이면 pill을 그리지 않는다 */
  context: string | null;
  /** 행동절 — 화면 유일의 display 타입 */
  headline: string;
  /** 헤드라인 강조 구간 매칭에 쓰는 준비물 이름들(체크리스트와 같은 소스) */
  prepNames?: string[];
  /** 아이 특성 근거 1~2문장. renderRich 결과를 넣을 수 있게 ReactNode */
  support?: ReactNode;
  /** 판단 근거 2~3개. 빈 배열이면 근거 행을 그리지 않는다 */
  evidence?: Evidence[];
  /** caution 상태에서 이슈 종류를 지정한다. 미지정 시 상태 기본 아이콘 */
  issue?: HeroIssue;
  /** fallback 상태에서만 노출되는 재시도 */
  onRetry?: () => void;
  retrying?: boolean;
  /** 카드 우측 상단 유틸 슬롯(새로고침·공유). 조건 배지 오른쪽 빈 공간을 쓴다 */
  actions?: ReactNode;
};

const HeroDecisionBrief = ({
  state,
  context,
  headline,
  prepNames = [],
  support,
  evidence = [],
  issue,
  onRetry,
  retrying = false,
  actions,
}: HeroDecisionBriefProps) => {
  const isFallback = state === "fallback";
  // 결론은 2줄 고정 — 어절 경계에서 균형 있게 쪼개고 강조 구간은 가르지 않는다.
  // 길이에 따라 1·2줄이 오가면 카드 높이가 매일 달라지고 결론의 무게감도 흔들린다.
  const lines = isFallback
    ? [[{ text: headline, emphasis: false }]]
    : headlineLines(headline, prepNames);

  return (
    // radius 24(rounded-3xl) + shadow-card는 화면에서 이 카드만 쓴다 — 색이 아니라
    // 기하와 깊이로 "여기가 중심"을 말한다.
    <section className="rounded-3xl bg-card p-5 shadow-card" aria-labelledby="hero-headline">
      {/* 상단 행 — 조건 배지(좌) + 유틸(우). 배지가 Hug라 오른쪽에 남는 빈 공간을
          새로고침·공유가 쓴다. 44px 타깃을 유지하면서 카드 높이가 늘지 않도록
          -mt-2/-mr-2로 광학 정렬만 맞춘다(배지 높이 34px < 버튼 44px). */}
      <div className="flex items-start justify-between gap-2">
        {context ? (
          <p
            className={`inline-flex min-w-0 items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold leading-[1.35] tracking-[-0.01em] text-foreground break-keep ${PILL[state]}`}
          >
            {issue ? ISSUE_ICON[issue] : DEFAULT_ICON[state]}
            <span>{context}</span>
          </p>
        ) : (
          <span />
        )}
        {actions && (
          // -my-2로 위아래 8px씩 상쇄해 44px 버튼이 34px 배지보다 행을 키우지 않게 한다
          // (터치 타깃은 44px 그대로, 시각적 높이만 배지에 맞춘다)
          <div className="-my-2 -mr-2 flex shrink-0 items-center text-muted-foreground">{actions}</div>
        )}
      </div>

      {/* 결론 — display 28/800. fallback은 title-lg 20/700으로 낮춘다:
          강한 결론 타입은 "AI가 판단했다"는 신호이고, 규칙 기반 추천이 빌려 쓰면
          신뢰가 오염된다. 같은 이유로 fallback에서는 하이라이트 밴드도 쓰지 않는다. */}
      {/* h2다 — 페이지의 h1은 헤더의 "○○의 오늘 준비"이고, 이 결론은 그 아래 섹션의 제목이다.
          h1이 두 개면 스크린리더의 문서 개요가 무너진다. */}
      <h2
        id="hero-headline"
        className={`text-foreground break-keep ${
          isFallback
            ? "mt-4 text-[20px] font-bold leading-[1.4] tracking-[-0.02em]"
            : "mt-4 text-[28px] font-extrabold leading-[1.3] tracking-[-0.028em]"
        }`}
      >
        {lines.map((line, li) => (
          <span key={li} className="block">
            {line.map((seg, i) =>
              seg.emphasis ? (
                // 강조는 색이 아니라 형태 — 글자는 잉크(16:1)로 두고 primary-tint 밴드를 깐다.
                // accent 텍스트는 무채색·저조도에서 잉크보다 밝아져 강조가 역전된다(실측).
                <span
                  key={i}
                  className="shadow-[inset_0_-0.28em_0_hsl(var(--primary-tint))] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
                >
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </span>
        ))}
      </h2>

      {support && (
        <p className="mt-2 text-[15px] leading-[1.66] text-muted-foreground break-keep">{support}</p>
      )}

      {/* 잠정본·출처 같은 시점 정보는 이 카드에 두지 않는다 — 조건과 결론 사이에 읽을 것을
          늘리고, 성격도 "판단"이 아니라 근거다. 상세 펼침 영역의 trust line 옆에 놓는다. */}

      {evidence.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {evidence.map((e) => (
            <li
              key={e.label}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-3 py-2"
            >
              <span className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
                {e.label}
              </span>
              <span
                className={`text-[13px] font-bold tracking-[-0.01em] ${
                  e.tone === "warn"
                    ? "text-status-warn"
                    : e.tone === "good"
                      ? "text-status-good"
                      : "text-foreground"
                } ${/\d/.test(e.value) ? "num" : ""}`}
              >
                {e.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      {isFallback && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 flex h-11 items-center gap-1.5 rounded-xl bg-muted px-3 text-[14px] font-semibold text-foreground transition-smooth active:scale-[0.98] disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} strokeWidth={1.75} />
          AI 판단 다시 받기
        </button>
      )}
    </section>
  );
};

export default HeroDecisionBrief;
