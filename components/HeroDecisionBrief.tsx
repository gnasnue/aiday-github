"use client";

import type { ReactNode } from "react";
import { ChevronDown, RefreshCw, Thermometer, Wind } from "lucide-react";
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

/** 우상단 현재 기준값 — "지금 어떤가"를 판단 카드 안에서 확인용으로 보여준다 */
export type HeroNowWeather = {
  /** 조회 시점 하늘 상태 아이콘. 시간대별 환경 카드와 같은 소스를 써야 두 카드의 하늘이 같다 */
  icon: ReactNode;
  /** 현재 기온. 실측이 없으면 블록 자체를 그리지 않는다(추정값 폴백 금지) */
  temp: string;
  /** 체감 온도. 없으면 이 줄만 생략한다 */
  feels?: string | null;
};

export type HeroDecisionBriefProps = {
  state: HeroState;
  /** 조건절. null이면 pill을 그리지 않는다 */
  context: string | null;
  /** 행동절 — 화면 유일의 display 타입 */
  headline: string;
  /** 헤드라인 강조 구간 매칭에 쓰는 준비물 이름들(체크리스트와 같은 소스) */
  prepNames?: string[];
  /** 조회 시점 기준값(우상단). null이면 블록을 그리지 않는다 */
  now?: HeroNowWeather | null;
  /** 아이 특성 근거 1~2문장. renderRich 결과를 넣을 수 있게 ReactNode */
  support?: ReactNode;
  /** 상세(리포트 본문·출처)를 펼쳐 담는다. 없으면 자세히 CTA를 그리지 않는다 */
  detail?: ReactNode;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  /** 판단 근거 2~3개. 빈 배열이면 근거 행을 그리지 않는다 */
  evidence?: Evidence[];
  /** caution 상태에서 이슈 종류를 지정한다. 미지정 시 상태 기본 아이콘 */
  issue?: HeroIssue;
  /** fallback 상태에서만 노출되는 재시도 */
  onRetry?: () => void;
  retrying?: boolean;
  /** 카드 하단에 이어 붙는 섹션(오늘 챙길 것) — 전체폭 헤어라인으로 구분된다.
   *  자체 표면을 가진 카드를 넣으면 "카드 안 카드"가 된다(DESIGN.md 금지) */
  children?: ReactNode;
};

const HeroDecisionBrief = ({
  state,
  context,
  headline,
  prepNames = [],
  now,
  support,
  detail,
  detailOpen = false,
  onToggleDetail,
  evidence = [],
  issue,
  onRetry,
  retrying = false,
  children,
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
      {/* 조건 배지 — 이 카드는 판단만 담는다. 새로고침·공유 같은 유틸은 카드 밖
          페이지 헤더 우측에 둔다(리포트를 다시 받는 조작은 화면 전체의 유틸이고,
          결론 옆에 컨트롤이 붙으면 조건→결론으로 가는 시선이 한 번 끊긴다). */}
      {(context || now) && (
        // 좌: 무엇이 문제인가(판단의 조건) / 우: 지금 어떤가(판단의 기준값).
        // 기준값을 우상단 보조 위계(17px)에 두면 결론(28px)과 경쟁하지 않는다 — 수치를
        // 화면 중앙에 크게 놓는 날씨 앱과 다른 점이 이 위계다.
        // 같은 값을 근거 칩에 중복해 넣지 않는다: 한 카드에서 같은 지표가 두 번, 그것도
        // 다른 값(현재 30° / 체감 32°)으로 보이면 어느 쪽이 판단 근거인지 흐려진다.
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {context && (
              <p
                className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold leading-[1.35] tracking-[-0.01em] text-foreground break-keep ${PILL[state]}`}
              >
                {issue ? ISSUE_ICON[issue] : DEFAULT_ICON[state]}
                <span>{context}</span>
              </p>
            )}
          </div>
          {now && (
            // 아이콘은 온도 **왼쪽**에 둔다(세로 스택 금지). 세로로 쌓으면 이 블록이 74px가 되는데
            // 이 행은 items-start라 높이가 큰 쪽을 따르므로, 33.5px짜리 pill 아래에 40.5px짜리
            // 빈 칸이 생긴다. 그 빈 칸이 조건과 결론 사이를 광학 70px로 벌려 "조건 → 결론"의
            // 시선을 끊었다 — mt를 0으로 줄여도 남는 결함이라 배치로 고친다. 가로로 두면 블록이
            // 36px가 되어 pill과 나란해지고, 결론은 의도한 mt-4 자리(실측 18.5px)에 온다.
            <div className="flex shrink-0 items-center gap-2">
              {/* 하늘 아이콘은 장식 — 조건은 pill 텍스트가, 값은 옆의 두 줄이 말한다 */}
              <span aria-hidden="true">{now.icon}</span>
              <div className="flex flex-col items-end">
                <p className="flex items-baseline gap-1 leading-none">
                  <span className="text-[13px] font-medium text-muted-foreground">현재</span>
                  <span className="num text-[17px] font-bold text-foreground">{now.temp}</span>
                </p>
                {now.feels && (
                  <p className="mt-1.5 flex items-baseline gap-1 text-[13px] leading-none text-muted-foreground">
                    <span className="font-medium">체감</span>
                    <span className="num font-semibold">{now.feels}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* 데이터 + 상세 진입을 한 행에 — 근거(왼쪽)와 "더 읽기"(오른쪽)는 둘 다 판단이 끝난
          뒤의 확인용이라 같은 위계다. 행을 따로 쓰면 카드가 40px 길어지고, 그 대가로
          얻는 정보는 없다. 진입이 문장 안 인라인 링크가 아닌 이유는 터치 타깃(44px). */}
      {(evidence.length > 0 || (detail && onToggleDetail)) && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <ul className="flex min-w-0 flex-wrap gap-2">
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
          {detail && onToggleDetail && (
            <button
              type="button"
              onClick={onToggleDetail}
              aria-expanded={detailOpen}
              aria-controls="hero-detail"
              // 보이는 글자("자세히")를 포함하는 이름 — 음성 제어에서 화면의 말과 조작이 어긋나지
              // 않게 한다(WCAG 2.5.3). "무엇을" 자세히 보는지는 시각적으로 위치가 말해준다.
              aria-label={detailOpen ? "AI 리포트 접기" : "AI 리포트 자세히 보기"}
              className="-mr-2 flex min-h-11 shrink-0 items-center gap-0.5 rounded-xl px-2 text-[14px] font-semibold text-muted-foreground transition-smooth active:bg-muted"
            >
              {detailOpen ? "접기" : "자세히"}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${detailOpen ? "rotate-180" : ""}`}
                strokeWidth={2}
              />
            </button>
          )}
        </div>
      )}

      {/* 펼침 본문은 진입 버튼이 있는 행 바로 아래 — 여는 컨트롤과 열리는 내용이 붙어 있어야
          한다. 잠정본·출처 같은 시점 정보도 여기 담긴다(조건과 결론 사이에 읽을 것을 늘리지 않는다). */}
      {detail && detailOpen && (
        <div
          id="hero-detail"
          className="mt-4 space-y-3 border-t border-border pt-4 animate-fade-up"
        >
          {detail}
        </div>
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

      {/* 실행(오늘 챙길 것)은 판단과 같은 카드 안에서 이어진다 — 판단과 그 판단이 지시한
          실행이 두 표면으로 갈리면 한눈에 하나로 읽히지 않는다. 구분은 전체폭 헤어라인
          하나뿐: 안쪽 divider는 "목록의 행 구분", 전체폭 divider는 "같은 카드의 다음 섹션"이다. */}
      {children && (
        <div className="-mx-5 mt-5 border-t border-border px-5 pt-5">{children}</div>
      )}
    </section>
  );
};

export default HeroDecisionBrief;
