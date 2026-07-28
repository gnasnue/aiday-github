"use client";

/**
 * 환절기 케어 패스 — 첫 유료 상품의 사전예약 도선.
 *
 * 왜 존재하나: 지불 의향은 기능을 더 쌓아서 증명되는 게 아니라 **결제 도선을 놓고
 * 측정**해야 한다(시장선별 v2 결론 — "점수를 올리는 방법은 아이디어가 아니라 검증의
 * 실행"). 상품 정의는 그 문서의 확정안 그대로다: 2026-09-01~10-31 8주, 정가 9,900원
 * (얼리버드 4,900원), 첫 주 불만족 시 전액 환불. 페인 근거: 환절기가 어려움 상황 1위
 * (82.4%), 월내 준비 실패 52.8% — 실패 1회 비용(재준비·긴급 구매)이 패스 가격을 넘는다.
 *
 * **정직성**: 지금 결제를 받지 않는다 — 사전예약(의향 표시)만 수집하고 그 사실을
 * 화면에 명시한다. 수집은 기존 `feedback` 채널(자발 제출, anon 허용)을 재사용해
 * 신규 테이블 없이 처리한다. 결제 연동은 사전예약 규모 확인 후(8월) 붙인다.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Leaf, ShieldCheck, Sunrise, Moon, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { sendFeedback } from "@/lib/analytics";

const RESERVED_KEY = "aiday:pass:reserved:2026-fall";

const BENEFITS: { icon: typeof Sunrise; title: string; desc: string }[] = [
  {
    icon: Sunrise,
    title: "매일 아침 케어 브리핑",
    desc: "일교차·환절기 리스크를 아이 체질로 해석한 옷차림·준비물 판단",
  },
  {
    icon: Moon,
    title: "저녁 결과 회수 · 내일 준비",
    desc: "오늘 결과를 30초로 알려주면 내일 아침 준비가 미리 완성돼요",
  },
  {
    icon: Leaf,
    title: "환절기 특화 케어",
    desc: "일교차 큰 시간대 안내, 겉옷 레이어링, 비염·피부 민감 아이 케어",
  },
  {
    icon: ShieldCheck,
    title: "첫 주 전액 환불 보장",
    desc: "일주일 써보고 도움이 안 되면 이유를 묻지 않고 환불해 드려요",
  },
];

const PassPage = () => {
  const router = useRouter();
  const [reserved, setReserved] = useState<boolean | null>(null); // null = 마운트 전
  const [sending, setSending] = useState(false);

  useEffect(() => {
    try {
      setReserved(!!localStorage.getItem(RESERVED_KEY));
    } catch {
      setReserved(false);
    }
  }, []);

  const reserve = async () => {
    if (sending) return;
    setSending(true);
    // 자발 제출 채널(feedback) 재사용 — 예약 의향과 상품 식별자만 남긴다(개인정보 없음)
    const ok = await sendFeedback({
      kind: "general",
      message: "[사전예약] 환절기 케어 패스 2026 가을 (얼리버드)",
      props: { product: "season-pass-2026-fall", price_krw: 4900, list_price_krw: 9900 },
    });
    setSending(false);
    if (ok) {
      try {
        localStorage.setItem(RESERVED_KEY, "1");
      } catch {}
      setReserved(true);
    } else {
      toast("연결이 원활하지 않아요 — 잠시 후 다시 시도해주세요");
    }
  };

  return (
    <div className="page-shell">
      <div className="page-frame min-h-screen bg-background pb-24 animate-fade-in">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center">
            <button
              onClick={() => router.back()}
              aria-label="뒤로"
              className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <p className="ml-1 text-[14px] font-semibold text-foreground">환절기 케어 패스</p>
          </div>
        </header>

        <main className="container-mobile pt-6">
          {/* 히어로 — 크림(secondary)은 이벤트 강조 토큰, 화면당 1곳 */}
          <section className="rounded-3xl bg-secondary p-6 shadow-card">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-[12px] font-bold text-accent">
              <CalendarRange className="h-3.5 w-3.5" strokeWidth={2} />
              2026. 9. 1 – 10. 31 · 8주
            </p>
            <h1 className="mt-4 text-[26px] font-extrabold leading-[1.35] tracking-[-0.02em] text-foreground break-keep">
              일교차의 계절,
              <br />
              아침 판단을 통째로 맡기세요
            </h1>
            <p className="mt-3 text-[14px] leading-[1.65] text-muted-foreground break-keep">
              부모들이 가장 어려워하는 시기가 일교차 큰 환절기예요(자체 조사 82.4%).
              아침 4°, 낮 18° — 뭘 입혀 보낼지 매일 고민하는 8주를 AiDay가 대신 판단해요.
            </p>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="num text-[28px] font-extrabold text-foreground">4,900원</span>
              <span className="num text-[15px] font-medium text-faint line-through">9,900원</span>
              <span className="rounded-full bg-primary-tint px-2.5 py-1 text-[11px] font-bold text-accent">
                얼리버드
              </span>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-[17px] font-bold tracking-[-0.01em]">패스에 담기는 것</h2>
            <div className="mt-3 divide-y divide-border rounded-2xl bg-card shadow-soft">
              {BENEFITS.map((b) => (
                <div key={b.title} className="flex items-start gap-3 px-5 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent">
                    <b.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-foreground break-keep">{b.title}</p>
                    <p className="mt-0.5 text-[13px] leading-[1.6] text-muted-foreground break-keep">
                      {b.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {reserved === null ? null : reserved ? (
            <section className="mt-8 rounded-2xl bg-status-good-bg p-5 text-center">
              <Check className="mx-auto h-6 w-6 text-status-good" strokeWidth={2.5} />
              <p className="mt-2 text-[16px] font-bold text-foreground">사전예약이 완료됐어요</p>
              <p className="mt-1 text-[13px] leading-[1.6] text-muted-foreground break-keep">
                8월에 얼리버드 결제 안내를 가장 먼저 보내드릴게요.
              </p>
            </section>
          ) : (
            <div className="mt-8">
              <button
                onClick={reserve}
                disabled={sending}
                className="flex h-13 min-h-12 w-full items-center justify-center rounded-[14px] bg-primary text-[17px] font-bold text-primary-foreground transition-smooth hover:bg-primary-hover active:scale-[0.99] disabled:opacity-50"
              >
                {sending ? "예약하는 중…" : "얼리버드 사전예약하기"}
              </button>
              <p className="mt-2.5 text-center text-[12px] leading-[1.6] text-muted-foreground break-keep">
                지금 결제하지 않아요 — 출시 시 안내를 받아보는 예약이에요.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default PassPage;
