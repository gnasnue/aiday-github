"use client";

/**
 * 오늘 알림장 — codex 시안 `/preview/day-v4`의 '오늘' 뷰를 실제 데이터로 구동한다.
 *
 * 시안과 다른 점은 데이터 출처뿐이다: 분석은 예시 결과가 아니라 `/api/noteboard`가
 * 만들고, 인용문은 하드코딩이 아니라 그 결과의 `summary`를 쓴다.
 *
 * 시안에 있었지만 **만들지 않은 것**: "최근 10개 중 가장 짧았어요"처럼 과거와
 * 대조하는 컨디션 문장. 그건 엔트리 간 추론이라 규칙으로 흉내내면 AI 판단인 척하는
 * 문장이 된다. 대신 그날 결과의 `findings`를 그대로 보여준다.
 */

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  ClipboardPaste,
  FileSearch,
  LoaderCircle,
  MessageCircleHeart,
  Quote,
  ShieldCheck,
  Share2,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChildProfile } from "@/lib/profile";
import { conditionsForPrompt } from "@/lib/domain/child-conditions";
import { localDateStr } from "@/lib/date";
import { track } from "@/lib/analytics";
import {
  deleteNote,
  healthMentionCount,
  loadNotes,
  maskOtherNames,
  NOTE_MAX_LEN,
  NOTEBOARD_CHANGED_EVENT,
  saveNote,
  type NoteboardEntry,
  type NoteboardResult,
} from "@/lib/noteboard";

/**
 * 로딩 중 단계 문구. `/api/noteboard`는 스트리밍하지 않으므로(라우트 주석 참조) 생성이
 * 끝나기 전에는 화면에서 바뀌는 것이 **하나도 없다** — 실측 4~7초 동안 스피너만 돈다.
 * 홈 리포트는 hook 이벤트가 3초쯤에 도착해 진행감이 있는데 이쪽은 그 신호가 없어서,
 * 같은 대기 시간이 훨씬 길게 느껴졌다(라이브 시연 대비 점검, 2026-07-29).
 * 실제 시간을 줄이는 변경이 아니라 **체감만** 줄이는 변경이다. 문구는 실제 처리 순서
 * (입력 읽기 → 변화 찾기 → 질문 고르기)를 따라가므로 거짓 진행률이 아니다.
 */
const LOADING_STAGES = [
  "알림장을 읽고 있어요",
  "오늘의 변화를 찾고 있어요",
  "대화 거리를 고르고 있어요",
] as const;
// 단계 전환 시점(ms). 마지막 문구는 응답이 올 때까지 유지된다 — 남은 단계가 없는데
// 문구를 계속 돌리면 "거의 다 됐어요"류의 거짓말이 된다.
const STAGE_AT_MS = [2000, 4000];

export default function TodayGrowthView({ child }: { child: ChildProfile }) {
  const [notes, setNotes] = useState<NoteboardEntry[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [selectedTalk, setSelectedTalk] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const hasRendered = useRef(false);

  const today = notes.find((n) => n.date === localDateStr()) ?? null;

  useEffect(() => {
    setNotes(loadNotes(child.id));
    setText("");
    setError(null);
    setSelectedTalk(0);
    setMounted(true);
  }, [child.id]);

  // 이 뷰 밖에서 알림장이 바뀌어도 따라간다(예: 결과 관리에서 오늘 기록 삭제).
  // 입력 중인 텍스트는 건드리지 않는다 — 쓰던 내용을 지우면 안 된다.
  useEffect(() => {
    const sync = () => setNotes(loadNotes(child.id));
    window.addEventListener(NOTEBOARD_CHANGED_EVENT, sync);
    return () => window.removeEventListener(NOTEBOARD_CHANGED_EVENT, sync);
  }, [child.id]);

  useEffect(() => {
    if (!mounted) return;
    track("noteboard_shown", { has_result: !!today });
  }, [mounted, today, child.id]);

  // 단계 문구 진행. 로딩이 끝나면(성공·실패 모두) 0으로 되돌려 다음 시도가 처음부터 시작한다.
  useEffect(() => {
    if (!loading) {
      setStage(0);
      return;
    }
    const timers = STAGE_AT_MS.map((at, i) => window.setTimeout(() => setStage(i + 1), at));
    return () => timers.forEach(window.clearTimeout);
  }, [loading]);

  // 결과가 생기거나 사라진 뒤 히어로를 화면에 올린다(첫 렌더에는 스크롤하지 않는다).
  useEffect(() => {
    if (!hasRendered.current) {
      hasRendered.current = true;
      return;
    }
    if (loading) return;
    const frame = window.requestAnimationFrame(() => {
      heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [today, loading]);

  // 실제 알림장은 시안 예시보다 길다. rows 고정이면 붙여넣은 내용의 일부만 보여
  // 부모가 무엇을 분석시키는지 확인할 수 없으므로 내용에 맞춰 높이를 늘린다.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, today]);

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        toast("클립보드에 붙여넣을 내용이 없어요");
        return;
      }
      setText(clip.slice(0, NOTE_MAX_LEN));
    } catch {
      toast("입력창을 길게 눌러 직접 붙여넣어 주세요");
    }
  };

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
        setError(json?.error ?? "오늘의 변화를 찾지 못했어요. 잠시 후 다시 시도해주세요.");
        track("noteboard_error", { status: res.status });
        return;
      }
      saveNote({
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
      });
      setNotes(loadNotes(child.id));
      setText("");
      setSelectedTalk(0);
      track("noteboard_generated", { talks: json.talks.length, findings: json.findings.length });
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
      if (typeof shareFn === "function") await shareFn.call(navigator, { text: body });
      else {
        await navigator.clipboard.writeText(body);
        toast("대화 거리를 복사했어요");
      }
      track("noteboard_shared");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast("공유하지 못했어요 — 문장을 길게 눌러 복사해주세요");
    }
  };

  const liveMessage = loading
    ? LOADING_STAGES[stage]
    : today
      ? "분석이 끝났어요. 오늘 처음 보인 변화를 확인해 주세요."
      : "";

  if (!mounted) return null;

  /* ── 아직 안 붙여넣은 날: 입력 히어로 ── */
  if (!today) {
    const over = text.length > NOTE_MAX_LEN;
    const canSubmit = text.trim().length > 0 && !over && !loading;

    // 결과가 들어올 자리의 **형태**를 미리 보여준다 — 아래 결과 화면의 히어로(눈썹 줄 →
    // 2줄 헤드라인 → 인용 블록)와 대화 거리 카드(아이콘+제목 → 질문 3개 → why → 공유 버튼)와
    // 같은 골격·같은 여백을 쓴다(DESIGN.md 스켈레톤 규칙: 자리표시자는 실물 배치에 맞춰
    // 로딩→실물 전환 시프트를 최소화한다). 390px 실측으로 히어로 264 vs 실물 266px,
    // 대화 카드 376 vs 367px까지 맞췄다 — 헤드라인·요약 길이가 가변이라 0은 될 수 없다.
    // 로딩 중에는 "분석하면 바로" 안내를 대신한다 — 이미 누른 사람에게 효용 설명은 필요 없다.
    const resultSkeleton = (
      <div aria-hidden="true">
        <div className="mt-8 rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4 w-36 rounded-full" />
          </div>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-8 w-full rounded-full" />
            <Skeleton className="h-8 w-3/5 rounded-full" />
          </div>
          <div className="mt-5 rounded-xl bg-muted p-4">
            <Skeleton className="h-5 w-5 rounded-full" />
            <div className="mt-2 space-y-2">
              <Skeleton className="h-4 w-full rounded-full" />
              <Skeleton className="h-4 w-4/5 rounded-full" />
            </div>
          </div>
        </div>

        <div className="mt-12 rounded-2xl bg-card p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
            <div className="space-y-1.5 pt-0.5">
              <Skeleton className="h-3 w-28 rounded-full" />
              <Skeleton className="h-4 w-40 rounded-full" />
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          {/* 선택된 질문의 `why` 문단 자리 */}
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-2/3 rounded-full" />
          </div>
          {/* "배우자에게 공유" 버튼 자리 */}
          <Skeleton className="mt-4 h-12 w-full rounded-[14px]" />
        </div>
      </div>
    );

    return (
      <div>
        <p className="sr-only" role="status" aria-live="polite">
          {liveMessage}
        </p>

        <section
          ref={heroRef}
          className="scroll-mt-20 rounded-2xl bg-card p-5 shadow-card"
          aria-labelledby="analyze-note-title"
          aria-busy={loading}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-accent">
            <FileSearch className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            오늘 알림장 분석하기
          </div>
          <h2
            id="analyze-note-title"
            className="mt-3 text-[26px] font-extrabold leading-[1.32] tracking-[-0.02em] break-keep"
          >
            부모가 놓치기 쉬운 오늘의 변화를 찾아드려요
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground break-keep">
            선생님 알림장을 붙여넣으면 오늘 저녁 {child.name}와 나눌 대화 거리를 함께 정리해요.
          </p>

          <div className="mt-5 rounded-xl bg-muted p-4">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <label htmlFor="kidsnote-text" className="text-sm font-bold text-foreground">
                선생님 알림장
              </label>
              <button
                type="button"
                onClick={pasteFromClipboard}
                disabled={loading}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-accent disabled:opacity-50"
              >
                <ClipboardPaste className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                붙여넣기
              </button>
            </div>
            <textarea
              id="kidsnote-text"
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={NOTE_MAX_LEN}
              disabled={loading}
              rows={3}
              placeholder="오늘 선생님이 보내주신 알림장을 그대로 붙여넣어 주세요."
              className="mt-2 max-h-[320px] w-full resize-none overflow-y-auto rounded-xl bg-card p-4 text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-70"
            />
            <div className="mt-1.5 text-right">
              <span className="num text-[12px] text-muted-foreground">
                {text.length} / {NOTE_MAX_LEN}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-[13px] leading-relaxed break-keep">
              알림장은 이 기기에만 7일간 보관하고 서버에 저장하지 않아요. 다른 아이 이름은 보내기 전에 가려요.
            </p>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-4 text-[17px] font-bold text-primary-foreground active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <LoaderCircle className="h-5 w-5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
                {LOADING_STAGES[stage]}
              </>
            ) : (
              "오늘의 변화 찾기"
            )}
          </button>

          {error && (
            <div className="mt-3 rounded-[14px] bg-status-warn-bg px-4 py-3">
              <p className="text-[13px] leading-[1.55] text-status-warn break-keep">{error}</p>
              <button onClick={submit} className="mt-1.5 text-[13px] font-bold text-status-warn underline">
                다시 시도
              </button>
            </div>
          )}
        </section>

        {loading && resultSkeleton}

        <section
          hidden={loading}
          className="mt-8 rounded-2xl bg-card p-5 shadow-soft"
          aria-labelledby="analysis-benefit-title"
        >
          <p className="eyebrow">분석하면 바로</p>
          <h2 id="analysis-benefit-title" className="mt-1 text-[17px] font-bold">
            오늘 밤 필요한 것을 받아요
          </h2>
          <ul className="mt-4 divide-y divide-border">
            <li className="flex min-h-14 items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent">
                <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="text-base font-medium text-foreground">오늘 하루를 요약한 한 줄</span>
            </li>
            <li className="flex min-h-14 items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <MessageCircleHeart className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="text-base font-medium text-foreground">아이와 나눌 저녁 대화거리</span>
            </li>
            <li className="flex min-h-14 items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Star className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="text-base font-medium text-foreground">처음 해본 것 · 건강 관찰</span>
            </li>
          </ul>
          <p className="mt-4 border-t border-border pt-4 text-[13px] leading-relaxed text-muted-foreground break-keep">
            알림장이 쌓이면 30일 성장 탭에서 반복 신호와 변화를 함께 볼 수 있어요.
          </p>
        </section>
      </div>
    );
  }

  /* ── 결과가 있는 날 ── */
  const { headline, summary, talks, findings } = today.result;
  const selected = talks[selectedTalk] ?? talks[0];

  return (
    <div className="animate-fade-in motion-reduce:animate-none">
      <p className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </p>

      <section
        ref={heroRef}
        className="scroll-mt-20 rounded-2xl bg-card p-5 shadow-card"
        aria-labelledby="today-growth-title"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-accent">
          <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          오늘 알림장에서 찾은 것
        </div>
        <h2
          id="today-growth-title"
          className="mt-3 text-[26px] font-extrabold leading-[1.32] tracking-[-0.02em] break-keep"
        >
          {headline}
        </h2>
        <div className="mt-5 rounded-xl bg-primary-tint p-4">
          <Quote className="h-5 w-5 text-accent" strokeWidth={1.75} aria-hidden="true" />
          <p className="mt-2 text-base font-semibold leading-relaxed text-foreground break-keep">{summary}</p>
          <p className="mt-2 text-[13px] text-muted-foreground">오늘 선생님 알림장</p>
        </div>
      </section>

      {talks.length > 0 && (
        <section className="mt-12 rounded-2xl bg-card p-5 shadow-soft" aria-labelledby="conversation-title">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent">
              <MessageCircleHeart className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">오늘 저녁 바로 써먹는 질문</p>
              <h2 id="conversation-title" className="mt-1 text-[17px] font-bold">
                아이와 이렇게 이야기해 보세요
              </h2>
            </div>
          </div>

          <div className="mt-5 space-y-2" role="group" aria-label="오늘의 대화거리">
            {talks.map((talk, i) => (
              <button
                key={talk.question}
                type="button"
                aria-pressed={selectedTalk === i}
                onClick={() => setSelectedTalk(i)}
                className={`min-h-12 w-full rounded-xl px-4 py-3 text-left text-sm font-semibold leading-snug active:scale-[0.98] ${
                  selectedTalk === i ? "bg-primary-tint text-accent" : "bg-muted text-foreground"
                }`}
              >
                “{talk.question}”
              </button>
            ))}
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground break-keep" aria-live="polite">
            {selected?.why}
          </p>

          <button
            type="button"
            onClick={shareTalks}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-muted text-[15px] font-bold text-foreground active:scale-[0.99]"
          >
            <Share2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
            배우자에게 공유
          </button>
        </section>
      )}

      {findings.length > 0 && (
        <section className="mt-8 rounded-2xl bg-card p-5 shadow-soft" aria-labelledby="finding-title">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Star className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            오늘 눈에 띈 기록
          </div>
          <h2 id="finding-title" className="sr-only">
            오늘 눈에 띈 기록
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {findings.map((f) => {
              const count = f.kind === "health" ? healthMentionCount(notes, f.label) : 0;
              return (
                <li key={`${f.kind}-${f.label}`} className="flex items-center gap-3 py-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      f.kind === "health" ? "bg-status-warn-bg text-status-warn" : "bg-muted text-muted-foreground"
                    }`}
                    aria-hidden="true"
                  >
                    {f.kind === "health" ? (
                      <Activity className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    ) : (
                      <Star className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    )}
                  </span>
                  <p className="min-w-0 flex-1 text-[14px] font-semibold break-keep">
                    {f.kind === "health" ? (
                      <>
                        {f.label} 관찰 <span className="num">{count}</span>번째
                      </>
                    ) : (
                      <>처음 해본 것 — {f.label}</>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {today.raw && (
        <section className="mt-8 rounded-2xl bg-card p-5 shadow-soft" aria-labelledby="paste-note-title">
          <button
            type="button"
            onClick={() => setSourceOpen((open) => !open)}
            aria-expanded={sourceOpen}
            aria-controls="kidsnote-source"
            className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-[13px] font-semibold text-muted-foreground">분석에 사용한 원문</span>
              <span id="paste-note-title" className="mt-1 block text-[17px] font-bold text-foreground">
                오늘 알림장 보기
              </span>
            </span>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-accent transition-transform ${sourceOpen ? "rotate-180" : ""}`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>

          {sourceOpen && (
            <div id="kidsnote-source" className="mt-4 animate-fade-in motion-reduce:animate-none">
              <p className="rounded-xl bg-muted p-4 text-sm leading-relaxed text-foreground break-keep">
                {today.raw}
              </p>
            </div>
          )}

          {/* 잘못된 알림장을 붙여넣었을 때의 되돌리기. 저장은 날짜당 1건 upsert라
              오늘 기록을 지워야 입력 화면으로 돌아간다. */}
          <button
            type="button"
            onClick={() => {
              deleteNote(child.id, localDateStr());
              setNotes(loadNotes(child.id));
              setSourceOpen(false);
              setText("");
            }}
            className="mt-4 min-h-12 w-full rounded-[14px] bg-muted px-4 text-[17px] font-bold text-foreground active:scale-[0.97]"
          >
            다른 알림장 분석하기
          </button>
        </section>
      )}
    </div>
  );
}
