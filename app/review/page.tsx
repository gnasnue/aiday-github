"use client";

/**
 * 오늘의 마무리 (Daily Reflection) — Family Memory 원료 수집 화면.
 *
 * 계획: docs/01-plan/features/day-review-family-memory.plan.md (PRD S-003 구현)
 * 구조: (main) 그룹 밖 풀스크린(BottomNav 없음, 온보딩 패턴) + 내부 상태머신
 *   Step 1 아침 판단 리뷰(적합도 필수 + 의류 있던 날만 체감) → Step 2 아이 하루 리캡
 *   → 완료(Memory Status). 라우팅 없는 상태 전환 — 데모 중 네비 엣지케이스 차단.
 * 데이터: localStorage 정본(lib/memory/day-review). 서버 전송 없음(P0) — 게스트·
 *   오프라인에서도 전체 플로우가 완주된다.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadProfiles, type ChildProfile } from "@/lib/profile";
import { hasAllergy, hasRespiratory, hasSkin } from "@/lib/domain/child-conditions";
import { buildAiChecklist } from "@/lib/hero-brief";
import { loadTodayReport } from "@/lib/report-cache";
import { localDateStr } from "@/lib/date";
import {
  DAY_COMFORT_OPTIONS,
  DAY_TAGS,
  NOTE_MAX,
  OVERALL_FIT_OPTIONS,
  TAG_NONE,
  THERMAL_OPTIONS,
  daysLogged,
  detectMemoryStatus,
  fitRate7d,
  loadEntries,
  memoryStatusCopy,
  saveEntry,
  seedDemoEntries,
  type DayComfort,
  type DayReviewEntry,
  type MemoryStatus,
  type OverallFit,
  type ThermalOutcome,
} from "@/lib/memory/day-review";

/** 의류계 준비물 판정 — 이 어휘가 있던 날만 옷차림 체감을 묻는다 (표준명 기준) */
const CLOTHING_RE = /옷|상의|내복|긴팔|반팔|가디건|바람막이|외투|겉옷|목수건/;

type Step = 1 | 2 | "done";

/** 세로 선택 목록 — 색(tint)+형태(체크 글리프) 이중 신호, 행 높이 ≥48px */
const OptionList = <T extends string>({
  options,
  value,
  onSelect,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onSelect: (v: T) => void;
}) => (
  <div className="mt-3 space-y-2">
    {options.map((o) => {
      const selected = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          aria-pressed={selected}
          className={`flex min-h-12 w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-[15px] transition-smooth active:scale-[0.99] ${
            selected
              ? "bg-primary-tint font-semibold text-foreground"
              : "bg-card font-medium text-foreground shadow-soft"
          }`}
        >
          <span className="break-keep">{o.label}</span>
          {selected && <Check className="h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} />}
        </button>
      );
    })}
  </div>
);

const DayReviewPage = () => {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [step, setStep] = useState<Step>(1);

  // 입력 상태
  const [overallFit, setOverallFit] = useState<OverallFit | null>(null);
  const [thermal, setThermal] = useState<ThermalOutcome | null>(null);
  const [dayComfort, setDayComfort] = useState<DayComfort | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");

  // 아침 판단 스냅샷 (캐시 없으면 null — 일반 문구로 degrade)
  const [snapshot, setSnapshot] = useState<{ hook: string; preps: string[]; ts: number | null } | null>(null);
  // 완료 화면 재료 — entry는 요약 3줄("오늘 남긴 기록")의 원본
  const [result, setResult] = useState<{
    status: MemoryStatus;
    days: number;
    fit: number | null;
    entry: DayReviewEntry;
  } | null>(null);

  // 마운트 후에만 localStorage를 읽는다(하이드레이션 안전 — 홈과 같은 패턴)
  useEffect(() => {
    const profiles = loadProfiles();
    let active: ChildProfile = profiles[0];
    try {
      const saved = localStorage.getItem("aiweather:activeProfileId");
      active = profiles.find((p) => p.id === saved) ?? profiles[0];
    } catch {}
    setChild(active);

    // 데모 시딩 — 개발 환경 전용. 실제 저장 포맷으로 과거 2일치를 넣어
    // "3회째 패턴 발견" 상태를 연출한다. 프로덕션 번들에서는 조건이 상수 false.
    if (process.env.NODE_ENV === "development") {
      try {
        if (new URLSearchParams(window.location.search).get("seed") === "memory") {
          seedDemoEntries(active.id);
        }
      } catch {}
    }

    const report = loadTodayReport(active.id);
    if (report?.hook) {
      const preps = buildAiChecklist(report.checklist ?? []).map((i) => i.text);
      setSnapshot({ hook: report.hook, preps: preps.slice(0, 3), ts: report.ts ?? null });
    }

    // 이미 오늘 기록이 있으면 완료 화면으로 (재진입 시 중복 입력 방지)
    const entries = loadEntries(active.id);
    const today = entries.find((e) => e.date === localDateStr());
    if (today) {
      setResult({
        status: detectMemoryStatus(entries),
        days: daysLogged(entries),
        fit: fitRate7d(entries),
        entry: today,
      });
      setStep("done");
    }
    setMounted(true);
  }, []);

  // 의류계 준비물이 있던 날만 옷차림 체감을 묻는다 (스냅샷 없으면 생략 — degrade)
  const askThermal = useMemo(
    () => (snapshot ? snapshot.preps.some((p) => CLOTHING_RE.test(p)) : false),
    [snapshot]
  );

  // 프로필 체질과 매칭되는 태그를 앞으로 정렬 (TAG_NONE은 항상 마지막)
  const orderedTags = useMemo(() => {
    const conds = child?.conditions ?? [];
    const matches = (c: (typeof DAY_TAGS)[number]["cond"]) =>
      (c === "respiratory" && hasRespiratory(conds)) ||
      (c === "allergy" && hasAllergy(conds)) ||
      (c === "skin" && hasSkin(conds));
    const front = DAY_TAGS.filter((t) => t.tag !== TAG_NONE && matches(t.cond));
    const rest = DAY_TAGS.filter((t) => t.tag !== TAG_NONE && !matches(t.cond));
    return [...front, ...rest, ...DAY_TAGS.filter((t) => t.tag === TAG_NONE)];
  }, [child]);

  const toggleTag = (tag: string) => {
    setTags((prev) => {
      if (tag === TAG_NONE) return prev.includes(TAG_NONE) ? [] : [TAG_NONE];
      const next = prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev.filter((t) => t !== TAG_NONE), tag];
      return next;
    });
  };

  const submit = () => {
    if (!child || !overallFit || !dayComfort) return;
    const entry: DayReviewEntry = {
      childId: child.id,
      date: localDateStr(),
      overallFit,
      thermalOutcome: askThermal ? thermal : null,
      dayComfort,
      tags,
      note: note.trim() ? note.trim().slice(0, NOTE_MAX) : undefined,
      ts: Date.now(),
    };
    saveEntry(entry);
    const entries = loadEntries(child.id);
    setResult({
      status: detectMemoryStatus(entries),
      days: daysLogged(entries),
      fit: fitRate7d(entries),
      entry,
    });
    setStep("done");
  };

  if (!mounted || !child) {
    return <div className="page-shell"><div className="page-frame min-h-screen bg-background" /></div>;
  }

  const name = child.name;

  return (
    <div className="page-shell">
      <div className="page-frame min-h-screen bg-background pb-10 animate-fade-in">
        {/* 헤더 — 좌측 뒤로/닫기(44px), 우측 진행 표시. 집중 플로우라 로고·탭 없음 */}
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center justify-between">
            {step === 2 ? (
              <button
                onClick={() => setStep(1)}
                aria-label="이전 단계"
                className="flex h-11 w-11 -ml-3 items-center justify-center rounded-full text-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
              </button>
            ) : (
              <button
                onClick={() => router.push("/home")}
                aria-label="닫기"
                className="flex h-11 w-11 -ml-3 items-center justify-center rounded-full text-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            )}
            <p className="text-[14px] font-semibold text-foreground">오늘의 마무리</p>
            <p className="tabular w-11 text-right text-[13px] font-medium text-muted-foreground">
              {step === "done" ? "" : `${step} / 2`}
            </p>
          </div>
        </header>

        <main className="container-mobile pt-6">
          {step === 1 && (
            <>
              <h1 className="text-[20px] font-bold leading-[1.35] tracking-[-0.02em] break-keep">
                아침 추천은 오늘 어땠나요?
              </h1>
              <p className="mt-2 text-[14px] leading-[1.6] text-muted-foreground break-keep">
                정답을 평가하는 것이 아니라, {name}에게 실제로 어땠는지 알려주세요.
              </p>

              {/* 아침 판단 스냅샷 — 무엇을 평가하는지 맥락. 캐시 없으면 생략(degrade) */}
              {snapshot && (
                <section className="mt-5 rounded-2xl bg-card p-4 shadow-soft">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    오늘 아침 AiDay의 판단
                  </p>
                  <p className="mt-2 text-[15px] font-semibold leading-[1.5] text-foreground break-keep">
                    {snapshot.hook}
                  </p>
                  {snapshot.preps.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {snapshot.preps.map((p) => (
                        <li key={p} className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                          <Check className="h-3.5 w-3.5 shrink-0 text-status-good" strokeWidth={2.5} />
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <section className="mt-7">
                <h2 className="text-[16px] font-bold tracking-[-0.01em] break-keep">
                  오늘 전체적으로 얼마나 잘 맞았나요?
                </h2>
                <OptionList<OverallFit> options={OVERALL_FIT_OPTIONS} value={overallFit} onSelect={setOverallFit} />
              </section>

              {askThermal && (
                <section className="mt-7">
                  <h2 className="text-[16px] font-bold tracking-[-0.01em] break-keep">
                    옷차림은 {name}에게 어땠나요?
                  </h2>
                  <OptionList<ThermalOutcome> options={THERMAL_OPTIONS} value={thermal} onSelect={setThermal} />
                </section>
              )}

              <Button
                className="mt-8 h-12 w-full rounded-[14px] bg-primary text-[17px] font-bold text-primary-foreground hover:bg-primary-hover"
                disabled={!overallFit}
                onClick={() => setStep(2)}
              >
                다음
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-[20px] font-bold leading-[1.35] tracking-[-0.02em] break-keep">
                오늘 {name}에게 어떤 일이 있었나요?
              </h1>
              <p className="mt-2 text-[14px] leading-[1.6] text-muted-foreground break-keep">
                해당하는 것만 골라주세요. 아무 일 없었다면 바로 완료할 수 있어요.
              </p>

              <section className="mt-6">
                <h2 className="text-[16px] font-bold tracking-[-0.01em]">하루 전체는 어땠나요?</h2>
                <OptionList<DayComfort> options={DAY_COMFORT_OPTIONS} value={dayComfort} onSelect={setDayComfort} />
              </section>

              <section className="mt-7">
                <h2 className="text-[16px] font-bold tracking-[-0.01em]">이런 일이 있었어요</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">여러 개 고를 수 있어요 · 선택</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {orderedTags.map(({ tag }) => {
                    const selected = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        aria-pressed={selected}
                        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-[14px] transition-smooth active:scale-[0.97] break-keep ${
                          selected
                            ? "bg-primary-tint font-semibold text-accent"
                            : "bg-card font-medium text-muted-foreground shadow-soft"
                        }`}
                      >
                        {selected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="mt-7">
                <label htmlFor="review-note" className="text-[16px] font-bold tracking-[-0.01em]">
                  기억해두면 좋을 일이 있나요? <span className="font-medium text-muted-foreground">· 선택</span>
                </label>
                <textarea
                  id="review-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                  rows={3}
                  maxLength={NOTE_MAX}
                  placeholder="예: 낮에는 더워해서 겉옷을 벗었고, 하원할 때 다시 입혔어요."
                  className="mt-3 w-full resize-none rounded-2xl bg-card p-4 text-[15px] leading-[1.6] text-foreground shadow-soft placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </section>

              <Button
                className="mt-8 h-12 w-full rounded-[14px] bg-primary text-[17px] font-bold text-primary-foreground hover:bg-primary-hover"
                disabled={!dayComfort}
                onClick={submit}
              >
                저장하기
              </Button>
            </>
          )}

          {step === "done" && result && (
            <>
              <h1 className="text-[20px] font-bold leading-[1.35] tracking-[-0.02em] break-keep">
                오늘의 기록을 저장했어요
              </h1>
              <p className="mt-2 text-[14px] leading-[1.6] text-muted-foreground break-keep">
                이 기록은 다음에 비슷한 날이 왔을 때 {name}에게 더 맞는 판단을 만드는 데 사용돼요.
              </p>

              {/* 오늘 남긴 기록 요약 — 선택 라벨을 그대로 되비춘다 (저장의 투명성) */}
              <section className="mt-5 rounded-2xl bg-card p-4 shadow-soft">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  오늘 남긴 기록
                </p>
                <ul className="mt-2 space-y-1.5">
                  {[
                    OVERALL_FIT_OPTIONS.find((o) => o.value === result.entry.overallFit)?.label,
                    result.entry.thermalOutcome
                      ? `옷차림은 ${THERMAL_OPTIONS.find((o) => o.value === result.entry.thermalOutcome)?.label}`
                      : null,
                    ...result.entry.tags.slice(0, 2),
                  ]
                    .filter((s): s is string => !!s)
                    .map((s) => (
                      <li key={s} className="flex items-center gap-2 text-[14px] font-medium text-foreground break-keep">
                        <span className="h-1 w-1 shrink-0 rounded-full bg-status-neutral-dot" aria-hidden="true" />
                        {s}
                      </li>
                    ))}
                </ul>
              </section>

              {/* Memory Status — 이 화면의 히어로 표면(L2, 화면당 1곳) */}
              <section className="mt-6 rounded-3xl bg-card p-5 shadow-card">
                <p className="text-[17px] font-bold tracking-[-0.01em] break-keep">
                  {memoryStatusCopy(result.status, name).title}
                </p>
                <p className="mt-2 text-[15px] leading-[1.66] text-muted-foreground break-keep">
                  {memoryStatusCopy(result.status, name).body}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-2 text-[13px] font-medium text-muted-foreground">
                    기록 <span className="num font-bold text-foreground">{result.days}</span>일째
                  </span>
                  {result.fit != null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-2 text-[13px] font-medium text-muted-foreground">
                      최근 7일 적합률 <span className="num font-bold text-foreground">{result.fit}%</span>
                    </span>
                  )}
                </div>
              </section>

              <Button
                className="mt-8 h-12 w-full rounded-[14px] bg-primary text-[17px] font-bold text-primary-foreground hover:bg-primary-hover"
                onClick={() => router.push("/home")}
              >
                마무리하기
              </Button>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default DayReviewPage;
