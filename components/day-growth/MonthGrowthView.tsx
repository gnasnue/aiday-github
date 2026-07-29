"use client";

/**
 * 30일 성장 — codex 시안 `/preview/day-v4`의 '30일' 뷰를 실제 데이터로 구동한다.
 *
 * 시안의 4블록 중 2개만 만들었다. 나머지 2개는 지금 데이터로 파생할 수 없다:
 *   - "이번 달 달라진 한 가지" 히어로 문장 → 엔트리 간 추론이라 로컬 데이터로 불가.
 *     규칙으로 흉내내면 AI 판단인 척하는 문장이 된다.
 *   - 환경 교차 패턴(꽃가루 ↔ 코 불편) → `EnvDigest`가 기온·강수만 담아 축이 없다.
 * 그래서 히어로 자리에는 **집계로 정직하게 말할 수 있는 것**(처음 보인 장면 수)만 둔다.
 *
 * 근거를 원문이 아니라 `result.summary`로 쓰는 이유: `raw`는 7일 롤링 삭제라 30일
 * 뷰에서는 대부분 비어 있지만 `summary`("그 한 줄의 근거")는 30건 내내 남는다.
 */

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Leaf, Repeat2, Sparkles } from "lucide-react";
import type { ChildProfile } from "@/lib/profile";
import { loadNotes, NOTEBOARD_CHANGED_EVENT } from "@/lib/noteboard";
import {
  buildGrowthNote,
  MIN_ENTRIES_FOR_GROWTH,
  type GrowthNoteSummary,
} from "@/lib/noteboard-growth";
import DemoGrowthCards, { type DemoVariant } from "./DemoGrowthCards";

const monthDay = (date: string): string => {
  const [, m, d] = date.split("-");
  return `${Number(m)}.${d}`;
};

export default function MonthGrowthView({
  child,
  showExamples = true,
  demoVariant,
}: {
  child: ChildProfile;
  /** 데이터가 아직 없을 때 예시 카드를 보여줄지. `?demo=0`으로 끌 수 있다. */
  showExamples?: boolean;
  /** 지정하면 그 한 안만 — 발표에서 한 화면만 띄울 때. 없으면 3안 모두. */
  demoVariant?: DemoVariant;
}) {
  const [summary, setSummary] = useState<GrowthNoteSummary | null>(null);
  const [noteCount, setNoteCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    const notes = loadNotes(child.id);
    setNoteCount(notes.length);
    setSummary(buildGrowthNote(notes));
  }, [child.id]);

  useEffect(() => {
    refresh();
    setMounted(true);
    // 같은 화면에서 알림장을 새로 저장하면 이 뷰도 즉시 따라가야 한다.
    // storage 이벤트는 다른 탭에서만 발생하므로 앱 내 이벤트를 듣는다.
    window.addEventListener(NOTEBOARD_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTEBOARD_CHANGED_EVENT, refresh);
  }, [refresh]);

  if (!mounted) return null;

  /* ── 아직 쌓이지 않은 경우: 빈 대시보드 대신 남은 개수만 ── */
  if (!summary) {
    const left = MIN_ENTRIES_FOR_GROWTH - noteCount;
    return (
      <div>
        <section className="rounded-2xl bg-card p-5 shadow-soft" aria-labelledby="month-empty-title">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CalendarRange className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            30일 성장
          </div>
          <h2
            id="month-empty-title"
            className="mt-3 text-[17px] font-bold leading-snug break-keep"
          >
            알림장 <span className="num">{left}</span>개만 더 모이면 변화를 보여드려요
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground break-keep">
            지금까지 <span className="num">{noteCount}</span>개예요. 쌓이면 아래 같은 화면을 받게 돼요.
          </p>
        </section>

        {/* 아직 쌓이지 않았을 때는 **받게 될 화면을 예시로** 보여준다. 빈 안내 한 장만 두면
            이 탭이 무엇을 주는지 알 수 없다. 예시임은 카드마다 배지로 명시하고, 아이 이름은
            주입하지 않고 고정 예시 이름을 쓴다(실사용자 아이 이름에 지어낸 문장 금지). */}
        {showExamples && (
          <div className="mt-8">
            <DemoGrowthCards variant={demoVariant} />
          </div>
        )}
      </div>
    );
  }

  const { notesCount, periodDays, moments, momentsOmitted, repeated, firstsCount } = summary;
  const hasFirsts = firstsCount > 0;

  return (
    <div>
      <section className="rounded-2xl bg-card p-5 shadow-card" aria-labelledby="month-growth-title">
        <div className="flex items-center gap-2 text-sm font-semibold text-accent">
          {hasFirsts ? (
            <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <CalendarRange className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          )}
          최근 {periodDays}일
        </div>
        <h2
          id="month-growth-title"
          className="mt-3 text-[26px] font-extrabold leading-[1.32] tracking-[-0.02em] break-keep"
        >
          {hasFirsts ? (
            <>
              {child.name}가 처음 해본 일이 <span className="num">{firstsCount}</span>가지 기록됐어요
            </>
          ) : (
            <>{child.name}의 최근 하루들을 모아봤어요</>
          )}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground break-keep">
          붙여넣은 알림장 <span className="num">{notesCount}</span>개에서 모았어요.
        </p>

        <div className="mt-6 divide-y divide-border" aria-label="30일 성장 장면">
          {moments.map((moment) => (
            <div key={moment.date} className="flex gap-3 py-4 first:pt-0 last:pb-0">
              <span className="num w-12 shrink-0 text-sm font-bold text-accent">
                {monthDay(moment.date)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground break-keep">{moment.headline}</p>
                <p className="mt-1 border-l-2 border-border pl-3 text-[13px] leading-relaxed text-muted-foreground break-keep">
                  {moment.basis}
                </p>
                {moment.firstLabels.length > 0 && (
                  <p className="mt-1.5 text-[13px] font-semibold text-accent break-keep">
                    처음 해본 것 — {moment.firstLabels.join(" · ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {momentsOmitted > 0 && (
          <p className="mt-5 text-[13px] text-muted-foreground">
            이전 <span className="num">{momentsOmitted}</span>건은 접어 두었어요.
          </p>
        )}
      </section>

      {repeated.length > 0 && (
        <section className="mt-12 rounded-2xl bg-card p-5 shadow-soft" aria-labelledby="repeated-title">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent">
              <Repeat2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">두 번 이상 돌아온 것</p>
              <h2 id="repeated-title" className="mt-1 text-[17px] font-bold">
                요즘 {child.name}의 세계
              </h2>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {repeated.map((signal) => (
              <div key={`${signal.kind}-${signal.label}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-bold text-foreground break-keep">{signal.label}</p>
                  <p className="num text-sm font-bold text-accent">
                    {signal.count}/{notesCount}
                  </p>
                </div>
                {/* 게이지 fill에 브랜드 오렌지 금지(DESIGN.md 2026-07-21 C-3) — 빈도 지표라
                    상태색도 아니므로 env 주간 바와 같은 foreground/30, 높이도 h-1.5로 맞춘다. */}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-foreground/30"
                    style={{ width: `${(signal.count / notesCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 border-t border-border pt-4 text-[13px] leading-relaxed text-muted-foreground break-keep">
            알림장에 적힌 표현이 몇 번 나왔는지만 센 거예요. 원인이나 건강 상태를 판단하지 않아요.
          </p>
        </section>
      )}

      <section className="mt-8 rounded-2xl bg-card p-5 shadow-soft" aria-labelledby="growth-basis-title">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Leaf className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          이 화면이 보는 것
        </div>
        <h2 id="growth-basis-title" className="sr-only">
          이 화면이 보는 것
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground break-keep">
          붙여넣은 알림장에서 나온 문장과 등장 횟수만 모아요. 아이의 발달이나 건강 상태를 평가하지
          않고, 알림장 원문은 이 기기에만 7일간 남아요.
        </p>
      </section>
    </div>
  );
}
