"use client";

/**
 * 홈 "오늘의 마무리" 진입 카드 — 오늘의 마무리(/review)로 가는 유일한 진입점.
 *
 * 상태 3가지:
 *   미기록  → 안내 + CTA "하루 돌아보기" + 텍스트 버튼 "오늘은 건너뛸게요"
 *   기록 완료 → "오늘 기록 완료 · 기록 N일째" + Memory Status 한 줄 (CTA 없음)
 *   건너뜀  → 카드 숨김 (당일 한정 — 기록으로 저장하지 않는다)
 *
 * P0는 상시 노출(심사 시연은 낮) — 19:30 게이팅·리포트 열람 조건은 P1
 * (docs/01-plan/features/day-review-family-memory.plan.md §1 노출 조건 항목).
 * localStorage 읽기는 마운트 effect 이후에만 — SSR 첫 렌더와의 하이드레이션
 * 불일치를 피하기 위해 마운트 전에는 아무것도 그리지 않는다(홈 프로필 패턴).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, NotebookPen } from "lucide-react";
import {
  buildNextJudgementLine,
  buildTraitMap,
  dismissedKey,
  loadEntries,
} from "@/lib/memory/day-review";
import { localDateStr } from "@/lib/date";

type CardState =
  | { kind: "todo" }
  | { kind: "done"; line: string }
  | { kind: "hidden" };

const DayReviewEntryCard = ({ childId, childName }: { childId: string; childName: string }) => {
  const router = useRouter();
  const [state, setState] = useState<CardState | null>(null); // null = 마운트 전(렌더 안 함)

  useEffect(() => {
    try {
      if (localStorage.getItem(dismissedKey(childId))) {
        setState({ kind: "hidden" });
        return;
      }
    } catch {}
    const entries = loadEntries(childId);
    const today = entries.find((e) => e.date === localDateStr());
    if (today) {
      // 완료 상태는 한 줄로 축소된다 — 콘텐츠(반응 지도·근거)는 하루 탭에만 둔다.
      // "기록 N일째" 같은 누적 카운트는 쓰지 않는다(트래킹 어휘 금지, 2026-07-28 v6).
      const traits = buildTraitMap(entries);
      const next = buildNextJudgementLine(traits);
      setState({
        kind: "done",
        line: next ?? `${childName}의 반응을 조금 더 알아가는 중이에요`,
      });
    } else {
      setState({ kind: "todo" });
    }
  }, [childId, childName]);

  if (!state || state.kind === "hidden") return null;

  return (
    <section className="mt-8">
      <h2 className="scroll-mt-14 text-[17px] font-bold tracking-[-0.01em]">오늘의 마무리</h2>

      {state.kind === "todo" ? (
        <div className="mt-4 rounded-2xl bg-card p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent"
              aria-hidden="true"
            >
              <NotebookPen className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold leading-[1.4] tracking-[-0.01em] break-keep">
                오늘 {childName}에게 어땠는지 알려주세요
              </p>
              <p className="mt-1.5 text-[13px] leading-[1.6] text-muted-foreground break-keep">
                아침 추천이 실제로 맞았는지 알려주면 다음 판단을 {childName}에게 더 맞게 조정할 수
                있어요. <span className="whitespace-nowrap">약 30초</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/review")}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-[14px] bg-primary text-[16px] font-bold text-primary-foreground transition-smooth hover:bg-primary-hover active:scale-[0.99]"
          >
            하루 돌아보기
          </button>
          <button
            onClick={() => {
              try {
                localStorage.setItem(dismissedKey(childId), "1");
              } catch {}
              setState({ kind: "hidden" });
            }}
            className="mt-1 flex min-h-11 w-full items-center justify-center text-[14px] font-semibold text-muted-foreground transition-smooth hover:text-foreground"
          >
            오늘은 건너뛸게요
          </button>
        </div>
      ) : (
        <button
          onClick={() => router.push("/day")}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-card p-5 text-left shadow-soft transition-smooth active:scale-[0.99]"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-status-good"
            aria-hidden="true"
          >
            <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold tracking-[-0.01em] break-keep">
              오늘 결과가 반영됐어요
            </span>
            <span className="mt-0.5 block text-[13px] leading-[1.5] text-muted-foreground break-keep">
              {state.line}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-faint" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </section>
  );
};

export default DayReviewEntryCard;
