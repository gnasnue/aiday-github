"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import PrepIcon from "@/components/PrepIcon";

// 오늘 챙길 것 — 기본은 독립 L1 카드(shadow-soft + radius 20, 행 구분은 hairline 하나).
// 홈에서는 `embedded`로 히어로 카드 안 섹션이 된다(자체 표면 없음 = 카드 안 카드 금지 준수).
// 명세: docs/reviews/2026-07-25-home-decision-brief-design.html (§4 체크리스트 상태)
//
// 강조 타일은 **화면당 1개** — 헤드라인이 지시한 준비물(lib/hero-brief pickPrimaryPrep).
// 결론과 실행이 같은 단어·같은 색으로 이어져 시선이 끊기지 않는 것이 목적이다.

export type PrepItem = {
  /** 체크 상태 저장 키 — 인덱스가 아니라 표준화된 준비물명 기반(목록 교체 시 오체크 방지) */
  key: string;
  title: string;
  /** 짧은 이유. 이 한 줄이 "무료 목록 앱"과 "유료 판단 서비스"를 가른다 */
  reason?: string;
  /** AI 원본 표기(이모지 포함 가능) — 아이콘 매칭 키로만 쓴다 */
  icon?: string;
};

export type PrepChecklistCardProps = {
  items: PrepItem[];
  checkedKeys: string[];
  onToggle: (key: string) => void;
  /** accent tint를 줄 항목 1개. null이면 강조 없음(폴백 상태) */
  primaryKey?: string | null;
  title?: string;
  /** 피드백 행 등 카드 하단 슬롯 — divider 뒤에 놓인다 */
  footer?: ReactNode;
  /** 상위 카드 안 섹션으로 렌더한다 — 표면(radius·shadow·bg·padding)을 갖지 않는다 */
  embedded?: boolean;
};

const PrepChecklistCard = ({
  items,
  checkedKeys,
  onToggle,
  primaryKey = null,
  title = "오늘 챙길 것",
  footer,
  embedded = false,
}: PrepChecklistCardProps) => {
  const doneCount = items.filter((it) => checkedKeys.includes(it.key)).length;
  const allDone = items.length > 0 && doneCount === items.length;

  return (
    // embedded에서는 완료 배경 tint를 쓰지 않는다 — 히어로는 화면의 유일한 L2 표면인데
    // 그 일부만 색면이 되면 "카드가 두 개"로 다시 읽힌다. 완료 신호는 카운터가
    // "준비 끝"(status-good)으로 바뀌는 것으로 남긴다.
    <section
      className={
        embedded
          ? ""
          : `rounded-2xl p-5 pb-2 shadow-soft transition-colors duration-300 ${
              allDone ? "bg-status-good-bg" : "bg-card"
            }`
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold tracking-[-0.015em]">{title}</h2>
        {/* 완료 시에도 컨페티·바운스 없이 카운터 문구만 바꾼다 — 아침에 필요한 건 축하가
            아니라 확인이다. 진행 상황은 스크린리더에도 전달한다. */}
        <p
          aria-live="polite"
          className={`shrink-0 text-[13px] font-semibold tabular-nums ${
            allDone ? "text-status-good" : "text-muted-foreground"
          }`}
        >
          {allDone ? "준비 끝" : <><b className="font-bold text-foreground">{doneCount}</b> / {items.length}</>}
        </p>
      </div>

      <ul>
        {items.map((it) => {
          const on = checkedKeys.includes(it.key);
          const isPrimary = it.key === primaryKey;
          return (
            // divider는 li에 둔다 — button에 두면 `first:`가 항상 자기 자신(li의 유일한
            // 자식)에 맞아 모든 행의 상단선이 사라진다.
            <li key={it.key} className="border-t border-border first:border-t-0">
              <button
                type="button"
                onClick={() => onToggle(it.key)}
                aria-pressed={on}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl py-2 text-left transition-smooth active:scale-[0.99] active:bg-muted"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-smooth ${
                    on
                      ? "border-status-good bg-status-good text-white"
                      : "border-border-control bg-card text-transparent"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>

                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-smooth ${
                    on
                      ? "bg-muted text-faint"
                      : isPrimary
                        ? "bg-primary-tint text-accent"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  <PrepIcon icon={it.icon} text={it.title} />
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[16px] font-medium tracking-[-0.01em] ${
                      on
                        ? "text-muted-foreground line-through decoration-faint decoration-[1.5px] underline-offset-2"
                        : "text-foreground"
                    }`}
                  >
                    {it.title}
                  </span>
                  {it.reason && (
                    <span className="mt-0.5 block text-[13px] text-muted-foreground break-keep">
                      {it.reason}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {footer && <div className="mt-4 border-t border-border pt-4">{footer}</div>}
    </section>
  );
};

export default PrepChecklistCard;
