"use client";

/**
 * 기관에 보낼 아침 메시지 (승인 설계안 2026-07-29, Approach C · 시안
 * docs/reviews/2026-07-29-noteboard-loop-mockup.html).
 *
 * 부모는 매일 아침 기관·시터에게 아이 정보를 손으로 써 보낸다. AiDay는 그 판단을 이미
 * 다 갖고 있으므로, **같은 결론을 알림장 문체로 옮겨 한 탭에 복사**하게 한다.
 * 새 생성이 아니라 재조립이므로 LLM 호출이 없다(lib/morning-message.ts).
 *
 * 배치: 히어로 카드 안 마지막 행. 판단(결론) → 실행(오늘 챙길 것) → **전달**(이 행)이
 * 한 카드에서 끝나야 "아침에 할 일"이 한눈에 하나로 읽힌다(2026-07-26 카드 단일화 결정).
 */

import { useState } from "react";
import { ChevronRight, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { buildMorningMessage, type MorningMessageInput } from "@/lib/morning-message";

const MorningMessageAction = (props: MorningMessageInput) => {
  const [open, setOpen] = useState(false);
  const msg = buildMorningMessage(props);

  // 재료가 없으면 행 자체를 그리지 않는다 — 빈 시트로 이어지는 행은 노동을 늘린다.
  if (!msg) return null;

  const copy = async () => {
    try {
      // 공유 시트를 먼저 시도한다(카톡·키즈노트로 한 탭에 넘어간다). 미지원이면 클립보드.
      const shareFn = (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share;
      if (typeof shareFn === "function") {
        await shareFn.call(navigator, { text: msg.body });
      } else {
        await navigator.clipboard.writeText(msg.body);
        toast("아침 메시지를 복사했어요");
      }
      track("morning_message_copied", {
        has_handoff: !!props.handoff,
        preps: props.preps.length,
      });
      setOpen(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(msg.body);
        toast("아침 메시지를 복사했어요");
        track("morning_message_copied", {
          has_handoff: !!props.handoff,
          preps: props.preps.length,
        });
        setOpen(false);
      } catch {
        toast("복사하지 못했어요 — 문장을 길게 눌러 복사해주세요");
      }
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="-mx-1 flex w-[calc(100%+8px)] items-center gap-3 rounded-2xl px-1 py-1 text-left transition-smooth active:scale-[0.99]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent"
          aria-hidden="true"
        >
          <Copy className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold tracking-[-0.01em] break-keep">
            기관에 보낼 아침 메시지
          </span>
          <span className="mt-0.5 block text-[13px] leading-[1.5] text-muted-foreground break-keep">
            알림장에 붙여넣기만 하면 끝
          </span>
        </span>
        <ChevronRight className="h-[17px] w-[17px] shrink-0 text-accent" strokeWidth={2} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[390px] rounded-t-3xl bg-card p-5 pb-8 shadow-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="기관에 보낼 아침 메시지"
          >
            <div className="flex items-center justify-between">
              <p className="text-[17px] font-bold tracking-[-0.01em]">기관에 보낼 아침 메시지</p>
              <button
                onClick={() => setOpen(false)}
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"
                aria-label="닫기"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="mt-3.5 rounded-2xl bg-secondary p-[15px]">
              {msg.lines.map((line, i) => (
                <p
                  key={line}
                  className={`text-[14px] leading-[1.7] text-foreground break-keep ${i > 0 ? "mt-1" : ""}`}
                >
                  {line}
                </p>
              ))}
            </div>

            <button
              onClick={copy}
              className="mt-3.5 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-[17px] font-bold text-primary-foreground transition-smooth hover:bg-primary-hover active:scale-[0.99]"
            >
              <Copy className="h-[19px] w-[19px]" strokeWidth={1.9} />
              복사하기
            </button>
            <p className="mt-2.5 text-center text-[12px] text-muted-foreground">
              키즈노트·문자 어디든 붙여넣을 수 있어요
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default MorningMessageAction;
