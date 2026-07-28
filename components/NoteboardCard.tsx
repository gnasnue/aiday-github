"use client";

/**
 * 알림장 → 저녁 대화 거리 (승인 설계안 2026-07-29, Approach A · 시안
 * docs/reviews/2026-07-29-noteboard-loop-mockup.html).
 *
 * 이 카드의 Job 하나: **부모가 저녁에 아이에게 걸 첫 마디를 준다.**
 * 알림장 요약이 아니다 — 부모는 이미 읽었다. 필요한 건 "그래서 뭐라고 말을 걸까"다.
 *
 * 왜 복붙을 요구하나: 키즈노트에 공개 API가 없다. 이 카드는 임시 다리이며, 자산은
 * 다리가 아니라 알림장에서 나온 신호가 저녁 기록·컨디션 예보와 만나는 결합이다.
 * 그래서 P0의 목적은 기능 완성이 아니라 **복붙 행동률 측정**이다(설계안 전제 1).
 *
 * 개인정보: 원문은 **전송 전 클라이언트에서** 타 아동 이름을 가리고(maskOtherNames),
 * 서버에는 저장하지 않으며, 로컬에도 7일만 둔다(lib/noteboard.ts pruneRaw).
 * 이 세 가지를 카드 안에 사용자가 읽을 수 있는 문장으로 명시한다 — 숨기지 않는다.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Loader2, Share2, Sparkles, Star, Activity } from "lucide-react";
import { toast } from "sonner";
import type { ChildProfile } from "@/lib/profile";
import { conditionsForPrompt } from "@/lib/domain/child-conditions";
import { localDateStr } from "@/lib/date";
import { track } from "@/lib/analytics";
import {
  healthMentionCount,
  loadNotes,
  maskOtherNames,
  NOTE_MAX_LEN,
  saveNote,
  type NoteboardEntry,
  type NoteboardResult,
} from "@/lib/noteboard";

const NoteboardCard = ({
  child,
  className = "mt-8",
}: {
  child: ChildProfile;
  className?: string;
}) => {
  const [notes, setNotes] = useState<NoteboardEntry[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setNotes(loadNotes(child.id));
    setText("");
    setError(null);
    setMounted(true);
  }, [child.id]);

  const today = useMemo(
    () => notes.find((n) => n.date === localDateStr()) ?? null,
    [notes]
  );

  // 카드 노출 계측 — 사용률의 분모. 아이·날짜가 바뀔 때만 한 번.
  useEffect(() => {
    if (!mounted) return;
    track("noteboard_shown", { has_result: !!today });
  }, [mounted, today, child.id]);

  const submit = async () => {
    const raw = text.trim();
    if (!raw || loading) return;
    setLoading(true);
    setError(null);
    track("noteboard_submitted", { length: raw.length });

    // 전송 전 마스킹 — 원문 인명이 우리 서버·로그를 경유하지 않게 한다.
    const masked = maskOtherNames(raw, child.name);
    try {
      const res = await fetch("/api/noteboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: masked,
          childName: child.name,
          conditions: conditionsForPrompt(child.conditions, child.conditionEtc),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | (NoteboardResult & { error?: string })
        | null;
      if (!res.ok || !json || json.error) {
        setError(json?.error ?? "대화 거리를 만들지 못했어요. 잠시 후 다시 시도해주세요.");
        track("noteboard_error", { status: res.status });
        return;
      }
      const entry: NoteboardEntry = {
        childId: child.id,
        date: localDateStr(),
        raw: masked,
        result: {
          headline: json.headline,
          summary: json.summary,
          talks: json.talks,
          findings: json.findings,
        },
        ts: Date.now(),
      };
      saveNote(entry);
      setNotes(loadNotes(child.id));
      setText("");
      track("noteboard_generated", {
        talks: json.talks.length,
        findings: json.findings.length,
      });
    } catch {
      setError("연결이 불안정해요. 잠시 후 다시 시도해주세요.");
      track("noteboard_error", { status: 0 });
    } finally {
      setLoading(false);
    }
  };

  const shareTalks = async () => {
    if (!today) return;
    const body = [
      `[${child.name}] ${today.result.headline}`,
      "",
      ...today.result.talks.map((t, i) => `${i + 1}. ${t.question}`),
      "",
      "AiDay에서 선생님 알림장으로 만든 대화 거리예요",
    ].join("\n");
    const shareFn = (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share;
    try {
      if (typeof shareFn === "function") {
        await shareFn.call(navigator, { text: body });
      } else {
        await navigator.clipboard.writeText(body);
        toast("대화 거리를 복사했어요");
      }
      track("noteboard_shared");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast("공유하지 못했어요 — 문장을 길게 눌러 복사해주세요");
    }
  };

  if (!mounted) return null;

  /* ── 결과가 있는 날: 대화 거리를 히어로로 ── */
  if (today) {
    const { headline, summary, talks, findings } = today.result;
    return (
      <section className={className}>
        <div className="rounded-3xl bg-card p-5 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            오늘 저녁 대화 거리
          </p>
          <h2 className="mt-2 text-[22px] font-extrabold leading-[1.36] tracking-[-0.025em] break-keep">
            {headline}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-[1.6] text-muted-foreground break-keep">
            {summary}
          </p>

          <div className="mt-4 border-t border-border">
            {talks.map((t, i) => (
              <div key={t.question} className={`flex gap-3 py-3.5 ${i > 0 ? "border-t border-border" : ""}`}>
                <span
                  className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-primary-tint text-[12px] font-extrabold text-accent"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold leading-[1.5] tracking-[-0.01em] break-keep">
                    “{t.question}”
                  </p>
                  <p className="mt-1 text-[13px] leading-[1.55] text-muted-foreground break-keep">
                    {t.why}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={shareTalks}
            className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-muted text-[15px] font-bold text-foreground transition-smooth active:scale-[0.99]"
          >
            <Share2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
            배우자에게 공유
          </button>
        </div>

        {/* 축적 레이어의 씨앗 — 대시보드가 아니라 리스트 행 한두 줄로만.
            데이터가 쌓이기 전에 차트를 그리면 콜드스타트에서 빈 화면이 된다. */}
        {findings.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[17px] font-bold tracking-[-0.01em]">알림장에서 찾은 것</h3>
            <div className="mt-3 divide-y divide-border rounded-2xl bg-card shadow-soft">
              {findings.map((f) => {
                const count = f.kind === "health" ? healthMentionCount(notes, f.label) : 0;
                return (
                  <div key={`${f.kind}-${f.label}`} className="flex items-center gap-3 px-[18px] py-[15px]">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        f.kind === "health"
                          ? "bg-status-warn-bg text-status-warn"
                          : "bg-muted text-muted-foreground"
                      }`}
                      aria-hidden="true"
                    >
                      {f.kind === "health" ? (
                        <Activity className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      ) : (
                        <Star className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold break-keep">
                        {f.kind === "health" ? (
                          <>
                            {f.label} 관찰{" "}
                            <span className="num">{count}</span>번째
                          </>
                        ) : (
                          <>처음 해본 것 — {f.label}</>
                        )}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground break-keep">
                        {f.kind === "health" ? "이번 주 · 오늘 결과에 반영할까요?" : `${child.name}의 성장 기록에 담아둘까요?`}
                      </p>
                    </div>
                    <ChevronRight className="h-[17px] w-[17px] shrink-0 text-accent" strokeWidth={2} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    );
  }

  /* ── 아직 안 붙여넣은 날: 입력 카드 ── */
  const over = text.length > NOTE_MAX_LEN;
  const canSubmit = text.trim().length > 0 && !over && !loading;

  return (
    <section className={className}>
      <h2 className="text-[17px] font-bold tracking-[-0.01em]">선생님 알림장, 오늘 받으셨나요?</h2>
      <p className="mt-1 text-[13px] leading-[1.6] text-muted-foreground break-keep">
        붙여넣으면 오늘 저녁 {child.name}와 나눌 대화 거리를 만들어 드려요.
      </p>

      <div className="mt-3 rounded-2xl bg-card p-5 shadow-soft">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent"
            aria-hidden="true"
          >
            <FileText className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <p className="text-[14px] font-bold">키즈노트 알림장 붙여넣기</p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={NOTE_MAX_LEN}
          disabled={loading}
          aria-label="알림장 내용"
          placeholder="오늘 선생님이 보내주신 알림장을 그대로 붙여넣어 주세요."
          className="mt-3 min-h-[92px] w-full resize-none rounded-[14px] border-[1.5px] border-border-control bg-muted/40 px-3.5 py-3 text-[14px] leading-[1.6] text-foreground outline-none transition-smooth placeholder:text-faint focus:border-primary/50 disabled:opacity-60"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[12px] text-muted-foreground">최대 {NOTE_MAX_LEN.toLocaleString()}자</span>
          <span className="num text-[12px] text-muted-foreground">
            {text.length} / {NOTE_MAX_LEN}
          </span>
        </div>

        <button
          onClick={submit}
          disabled={!canSubmit}
          className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[17px] font-bold transition-smooth active:scale-[0.99] ${
            canSubmit
              ? "bg-primary text-primary-foreground hover:bg-primary-hover"
              : "bg-muted text-faint"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={2} />
              대화 거리 찾는 중…
            </>
          ) : (
            <>
              <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.75} />
              대화 거리 만들기
            </>
          )}
        </button>

        {error && (
          <div className="mt-3 rounded-[14px] bg-status-warn-bg px-4 py-3">
            <p className="text-[13px] leading-[1.55] text-status-warn break-keep">{error}</p>
            <button
              onClick={submit}
              className="mt-1.5 text-[13px] font-bold text-status-warn underline"
            >
              다시 시도
            </button>
          </div>
        )}

        <p className="mt-3 text-[12px] leading-[1.6] text-muted-foreground break-keep">
          알림장은 이 기기에만 7일간 보관하고 서버에 저장하지 않아요. 다른 아이 이름은 보내기 전에 가려요.
        </p>
      </div>
    </section>
  );
};

export default NoteboardCard;
