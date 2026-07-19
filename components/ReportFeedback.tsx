"use client";

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { sendFeedback } from "@/lib/analytics";
import { localDateStr } from "@/lib/date";
import Link from "next/link";
import {
  hasAnalyticsConsent,
  readLocalConsentSelection,
  saveLocalConsentSelection,
  syncLocalConsentsToDb,
} from "@/lib/consent";

// AI 리포트 유용성 평가 — 베타 지표 "리포트 유용성"의 수집 지점.
// 판단을 소비한 직후 그 자리에서 묻는다 (별도 설문 페이지보다 응답률이 높다).
// 아이·날짜당 1회만 — 평가하면 localStorage에 기록해 재방문 시 다시 묻지 않는다.

const ratedKey = (childId: string) => `aiday:report-fb:${childId}:${localDateStr()}`;

const ReportFeedback = ({
  childId,
  ageBand,
}: {
  childId: string;
  ageBand: string | null;
}) => {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);

  // 아이 전환·날짜 경과 시 해당 키의 평가 여부로 상태 리셋
  useEffect(() => {
    setAnalyticsAllowed(hasAnalyticsConsent());
    try {
      const prev = localStorage.getItem(ratedKey(childId));
      setRating(prev === "up" || prev === "down" ? prev : null);
      setSent(!!prev);
    } catch {
      setRating(null);
      setSent(false);
    }
    setAskReason(false);
    setReason("");
  }, [childId]);

  const joinBetaImprovement = async () => {
    const selection = readLocalConsentSelection();
    selection.beta_analytics = true;
    saveLocalConsentSelection(selection);
    await syncLocalConsentsToDb("auth_sync");
    setAnalyticsAllowed(true);
  };

  const rate = async (value: "up" | "down") => {
    if (rating) return; // 하루 1회
    setRating(value);
    setAskReason(true);
    try {
      localStorage.setItem(ratedKey(childId), value);
    } catch {}
    // 평가는 즉시 전송 — 이유 입력을 기다리다 이탈하면 평가까지 잃는다.
    // 전송 실패 시엔 1회 기록을 되돌려 재평가를 허용한다 (실패했는데 그날 잠기는 것 방지).
    const ok = await sendFeedback({ kind: "report", rating: value, props: { age_band: ageBand } });
    if (!ok) {
      try {
        localStorage.removeItem(ratedKey(childId));
      } catch {}
      setRating(null);
      setAskReason(false);
      toast("전송에 실패했어요. 잠시 후 다시 눌러주세요.");
    }
  };

  const submitReason = async () => {
    const msg = reason.trim();
    if (!msg) {
      setAskReason(false);
      return;
    }
    const ok = await sendFeedback({
      kind: "report",
      message: msg,
      props: { age_band: ageBand, follow_up: rating },
    });
    if (ok) {
      setSent(true);
      setAskReason(false);
      toast("의견이 전달됐어요. 더 나은 판단으로 보답할게요.");
    } else {
      toast("전송에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  if (!analyticsAllowed) {
    if (promptDismissed) return null;
    return (
      <div className="mt-4 border-t border-border px-0.5 pt-4">
        <p className="text-sm font-semibold text-foreground">아이데이를 함께 개선해주세요</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground break-keep">
          페이지 이동·기능 사용·오류 기록을 베타 개선에 활용하고 종료 후 90일 이내 삭제해요.
          이름과 건강정보는 분석 기록에 담지 않으며, 참여하지 않아도 모든 기능을 이용할 수 있어요. {" "}
          <Link href="/privacy#beta" className="font-medium text-accent underline underline-offset-2">
            자세히
          </Link>
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={joinBetaImprovement}
            className="min-h-11 flex-1 rounded-md bg-muted px-3 text-sm font-semibold text-foreground transition-smooth hover:bg-border"
          >
            동의하고 참여하기
          </button>
          <button
            type="button"
            onClick={() => setPromptDismissed(true)}
            className="min-h-11 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            나중에
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-border px-0.5 pt-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted-foreground">
          {rating ? "의견 감사해요" : "이 리포트가 도움이 되었나요?"}
        </p>
        {/* 아이콘은 라벨 텍스트(13px)와 같은 크기 — 시각은 28px 박스로 조용히,
            터치 타겟은 after 확장으로 44px(28+8*2)을 확보한다.
            gap-4(16px)는 확장 히트영역(양쪽 +8px)이 서로 겹치지 않는 최소 간격 */}
        <div className="flex gap-4">
          {(["up", "down"] as const).map((v) => {
            const Icon = v === "up" ? ThumbsUp : ThumbsDown;
            const on = rating === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => rate(v)}
                disabled={!!rating}
                aria-label={v === "up" ? "도움이 됐어요" : "아쉬웠어요"}
                aria-pressed={on}
                className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-smooth after:absolute after:-inset-2 after:content-[''] ${
                  on
                    ? "bg-primary-tint text-accent"
                    : rating
                      ? "bg-muted text-faint"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={13} strokeWidth={1.75} />
              </button>
            );
          })}
        </div>
      </div>

      {/* 평가 직후에만 이유를 선택 입력받는다 — 보내면(또는 비워두고 닫으면) 사라진다 */}
      {askReason && !sent && (
        <div className="mt-2.5 flex gap-2 animate-fade-in">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitReason()}
            maxLength={200}
            placeholder={rating === "down" ? "어떤 점이 아쉬웠나요? (선택)" : "어떤 점이 좋았나요? (선택)"}
            className="h-11 min-w-0 flex-1 rounded-md bg-muted px-3 text-base text-foreground placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={submitReason}
            className="h-11 shrink-0 rounded-md bg-muted px-3.5 text-[14px] font-semibold text-foreground transition-smooth hover:bg-border"
          >
            {reason.trim() ? "보내기" : "닫기"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ReportFeedback;
