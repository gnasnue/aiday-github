"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { sendFeedback, FEEDBACK_MESSAGE_MAX } from "@/lib/analytics";

// 베타 상시 의견 수거함 — 마이페이지 "의견 보내기"에서 열린다.
// 자유 텍스트만 받고 feedback 테이블(kind: general)에 적재한다.
const FeedbackDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const msg = message.trim();
    if (!msg) return toast("의견을 입력해주세요");
    setSending(true);
    const ok = await sendFeedback({ kind: "general", message: msg });
    setSending(false);
    if (ok) {
      toast.success("소중한 의견이 전달됐어요. 감사해요!");
      setMessage("");
      onOpenChange(false);
    } else {
      toast.error("전송에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[350px] rounded-2xl">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[17px] font-bold">의견 보내기</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
            불편했던 점, 바라는 점 무엇이든 좋아요.
            베타 기간에는 보내주신 의견을 매일 확인해요.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={FEEDBACK_MESSAGE_MAX}
          rows={5}
          placeholder="예) 아침 알림이 있었으면 좋겠어요"
          className="resize-none rounded-md border-0 bg-muted text-base placeholder:text-faint"
        />
        <Button
          onClick={submit}
          disabled={sending || !message.trim()}
          className="h-12 w-full rounded-[14px] bg-primary text-[17px] font-bold text-primary-foreground hover:bg-primary-hover"
        >
          {sending ? "보내는 중…" : "보내기"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackDialog;
