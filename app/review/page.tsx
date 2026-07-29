"use client";

/**
 * 오늘의 마무리 (Daily Reflection) — Family Memory 원료 수집.
 *
 * 계획: docs/01-plan/features/day-review-family-memory.plan.md (PRD S-003 구현)
 * 시안: docs/reviews/2026-07-28-day-tab-home-tips-mockup.html (v6)
 *
 * 설계 원칙 — **부모를 기록자가 아니라 확인자로 만든다**:
 *   - 아침에 이미 아는 것(체크한 준비물)은 다시 묻지 않고 "맞아요 / 조금 달랐어요"로 확인만.
 *   - 3번째 질문은 매일 같은 것을 묻지 않고 **그날 아침 판단의 1순위 이슈**만 검증한다
 *     (더위 → 옷차림 체감 / 대기질·꽃가루 경고 → 야외활동 뒤 반응).
 *   - 완료 화면은 "저장됐습니다"로 끝내지 않는다: 한 줄 리캡(감정) + 특성 승격(개인화)
 *     + 다음 판단 미리보기(기능적 이유)를 함께 보여준다.
 *
 * 구조: (main) 밖 풀스크린(BottomNav 없음) + 내부 상태머신(라우팅 없음 — 네비 엣지케이스 차단).
 * 데이터: localStorage 정본(lib/memory/day-review). 서버 전송 없음(P0).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Minus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadProfiles, type ChildProfile } from "@/lib/profile";
import { getActiveProfileId } from "@/lib/storage-keys";
import { useLocation } from "@/lib/useLocation";
import { loadTodayEnvSnapshot } from "@/lib/env-cache";
import { hasAllergy, hasRespiratory, hasSkin } from "@/lib/domain/child-conditions";
import { buildAiChecklist, splitHook } from "@/lib/hero-brief";
import { loadTodayReport } from "@/lib/report-cache";
import { loadCheckedKeys } from "@/lib/memory/checklist-state";
import { localDateStr } from "@/lib/date";
import {
  ACTION_EXECUTION_OPTIONS,
  AIRWAY_OPTIONS,
  DAY_COMFORT_OPTIONS,
  DAY_TAGS,
  NOTE_MAX,
  OVERALL_FIT_OPTIONS,
  TAG_NONE,
  THERMAL_OPTIONS,
  buildEnvDigest,
  buildNextJudgementLine,
  buildRecapLine,
  buildTraitMap,
  loadEntries,
  loadTodayEntry,
  pickDynamicAxis,
  saveEntry,
  seedDemoEntries,
  type ActionExecution,
  type AirwayOutcome,
  type DayComfort,
  type DayReviewEntry,
  type DynamicAxis,
  type OverallFit,
  type ThermalOutcome,
  type TraitCard,
} from "@/lib/memory/day-review";

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
  const { location } = useLocation();
  // useSearchParams는 Suspense 경계를 요구해 이 정적 페이지를 dynamic으로 만든다 —
  // 쿼리는 마운트 effect에서 window.location으로 직접 읽는다(어차피 클라 전용 판정).
  const [isEdit, setIsEdit] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [step, setStep] = useState<Step>(1);

  // 입력 상태
  const [overallFit, setOverallFit] = useState<OverallFit | null>(null);
  const [thermal, setThermal] = useState<ThermalOutcome | null>(null);
  const [airway, setAirway] = useState<AirwayOutcome | null>(null);
  const [dayComfort, setDayComfort] = useState<DayComfort | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  // 준비물 확인자 모드 — false면 "맞아요" 상태(전부 done), true면 개별 수정 UI 노출
  const [prepEditing, setPrepEditing] = useState(false);
  const [actions, setActions] = useState<{ name: string; execution: ActionExecution }[]>([]);

  // 아침 판단 스냅샷 (캐시 없으면 null — 스냅샷·동적 질문 생략하고 degrade)
  const [snapshot, setSnapshot] = useState<{
    hook: string;
    condition: string | null;
    preps: string[];
  } | null>(null);
  const [axis, setAxis] = useState<DynamicAxis>(null);

  // 완료 화면 재료
  const [result, setResult] = useState<{
    entry: DayReviewEntry;
    recap: string;
    traits: TraitCard[];
    next: string | null;
    promoted: TraitCard | null;
  } | null>(null);

  // 마운트 후에만 localStorage를 읽는다(하이드레이션 안전 — 홈과 같은 패턴)
  useEffect(() => {
    const profiles = loadProfiles();
    let active: ChildProfile = profiles[0];
    try {
      const saved = getActiveProfileId();
      active = profiles.find((p) => p.id === saved) ?? profiles[0];
    } catch {}
    setChild(active);

    // 데모 시딩 — 개발 환경 전용. 프로덕션 번들에서는 조건이 상수 false.
    if (process.env.NODE_ENV === "development") {
      try {
        if (new URLSearchParams(window.location.search).get("seed") === "memory") {
          seedDemoEntries(active.id);
        }
      } catch {}
    }

    // 아침 판단 스냅샷 + 동적 질문 축 결정
    const report = loadTodayReport(active.id);
    let preps: string[] = [];
    if (report?.hook) {
      preps = buildAiChecklist(report.checklist ?? []).map((i) => i.text);
      const [cond] = splitHook(report.hook);
      setSnapshot({
        hook: report.hook,
        condition: cond && cond !== report.hook ? cond : null,
        preps: preps.slice(0, 3),
      });
    }
    // 호흡기 축은 그날 마스크·실내놀이가 준비물에 있었는지로 판정한다 —
    // 이 두 준비물은 대기질·꽃가루 경고에서만 발화하므로(lib/prep.ts) 경고일의 대리 신호다.
    const airwayAlert = preps.some((p) => /마스크|실내놀이/.test(p));
    setAxis(pickDynamicAxis({ preps, airwayAlert }));

    // 오늘 이미 기록이 있으면: ?edit=1이면 그 값으로 프리필해 수정, 아니면 완료 화면
    const today = loadTodayEntry(active.id);
    const editing = new URLSearchParams(window.location.search).get("edit") === "1";
    setIsEdit(editing);
    if (today && !editing) {
      showResult(today, active);
    } else if (today && editing) {
      setOverallFit(today.overallFit);
      setThermal(today.thermalOutcome);
      setAirway(today.airwayOutcome ?? null);
      setDayComfort(today.dayComfort);
      setTags(today.tags);
      setNote(today.note ?? "");
      setActions(today.actionOutcomes ?? []);
      if (today.actionOutcomes?.some((a) => a.execution !== "done")) setPrepEditing(true);
    }

    // 준비물 실행 여부 기본값 — 부모를 기록자가 아니라 확인자로 만드는 핵심.
    //  · 아침에 체크를 했다면 그 상태를 그대로 따른다(체크=했어요 / 안 한 것=못 했어요).
    //  · 아무것도 안 눌렀다면 체크 자체를 안 쓰는 사용자이므로 "추천대로 했다"를 기본값으로
    //    두되(가장 흔한 실제), 화면이 그 가정을 그대로 보여주고 "조금 달랐어요"로 고치게 한다.
    if (!today || editing) {
      const checked = loadCheckedKeys(active.id);
      const top = preps.slice(0, 3);
      if (top.length) {
        setActions((prev) =>
          prev.length
            ? prev
            : top.map((name) => ({
                name,
                execution: (checked.length === 0 || checked.includes(name)
                  ? "done"
                  : "not_done") as ActionExecution,
              }))
        );
      }
    }
    setMounted(true);
  }, []);

  const showResult = (entry: DayReviewEntry, active: ChildProfile) => {
    const entries = loadEntries(active.id);
    const traits = buildTraitMap(entries);
    // 오늘 승격된 특성 = 오늘 기록을 뺐을 때는 확정이 아니었던 확정 특성
    const before = buildTraitMap(entries.filter((e) => e.date !== entry.date));
    const promoted =
      traits.find(
        (t) =>
          t.state === "confirmed" &&
          !before.some((b) => b.key === t.key && b.state === "confirmed")
      ) ?? null;
    setResult({
      entry,
      recap: buildRecapLine(entry, active.name),
      traits,
      next: buildNextJudgementLine(traits),
      promoted,
    });
    setStep("done");
  };

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
      return prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev.filter((t) => t !== TAG_NONE), tag];
    });
  };

  const setAction = (name: string, execution: ActionExecution) =>
    setActions((prev) => prev.map((a) => (a.name === name ? { ...a, execution } : a)));

  const submit = () => {
    if (!child || !overallFit || !dayComfort) return;
    // 그날 환경 요약 — 컨디션 예보(week-radar)의 개인 근거 매칭 재료. 오늘자 홈 스냅샷이
    // 없으면 저장하지 않는다(추정 금지 — 매칭에서 빠질 뿐 흐름을 막지 않는다).
    const snap = loadTodayEnvSnapshot({
      station: location.station,
      lat: location.lat,
      lon: location.lon,
    });
    const digest = snap ? buildEnvDigest(snap.env) : null;
    const entry: DayReviewEntry = {
      childId: child.id,
      date: localDateStr(),
      overallFit,
      thermalOutcome: axis === "thermal" ? thermal : null,
      dayComfort,
      tags,
      note: note.trim() ? note.trim().slice(0, NOTE_MAX) : undefined,
      ts: Date.now(),
      conditionLabel: snapshot?.condition ?? undefined,
      prepSummary: snapshot?.preps,
      actionOutcomes: actions.length ? actions : undefined,
      airwayOutcome: axis === "airway" ? (airway ?? undefined) : undefined,
      envDigest: digest ?? undefined,
    };
    saveEntry(entry);
    showResult(entry, child);
  };

  if (!mounted || !child) {
    return (
      <div className="page-shell">
        <div className="page-frame min-h-screen bg-background" />
      </div>
    );
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
                className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
              </button>
            ) : (
              <button
                onClick={() => router.push(step === "done" ? "/day" : "/home")}
                aria-label="닫기"
                className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted"
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
                </section>
              )}

              <section className="mt-7">
                <h2 className="text-[16px] font-bold tracking-[-0.01em] break-keep">
                  오늘 전체적으로 얼마나 잘 맞았나요?
                </h2>
                <OptionList<OverallFit>
                  options={OVERALL_FIT_OPTIONS}
                  value={overallFit}
                  onSelect={setOverallFit}
                />
              </section>

              {/* 준비물 확인자 — 아침에 아는 것은 다시 묻지 않고 "맞아요"로 끝낸다 */}
              {actions.length > 0 && (
                <section className="mt-7">
                  <h2 className="text-[16px] font-bold tracking-[-0.01em] break-keep">
                    오늘은 이렇게 보낸 것으로 기억하고 있어요
                  </h2>
                  {!prepEditing ? (
                    <>
                      <div className="mt-3 rounded-2xl bg-card p-4 shadow-soft">
                        <ul className="space-y-2">
                          {actions.map((a) => {
                            const done = a.execution === "done";
                            return (
                              <li
                                key={a.name}
                                className={`flex items-center gap-2 text-[15px] font-medium ${
                                  done ? "text-foreground" : "text-muted-foreground"
                                }`}
                              >
                                {done ? (
                                  <Check
                                    className="h-4 w-4 shrink-0 text-status-good"
                                    strokeWidth={2.5}
                                  />
                                ) : (
                                  <Minus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                                )}
                                {a.name}
                                {!done && (
                                  <span className="text-[13px] text-muted-foreground">
                                    · 못 했어요
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPrepEditing(true)}
                        className="mt-2 flex min-h-11 w-full items-center justify-center rounded-2xl bg-muted text-[14px] font-semibold text-foreground transition-smooth active:scale-[0.99]"
                      >
                        조금 달랐어요
                      </button>
                    </>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {actions.map((a) => (
                        <div key={a.name} className="rounded-2xl bg-card p-4 shadow-soft">
                          <p className="text-[14px] font-semibold text-foreground">{a.name}</p>
                          <div className="mt-2 flex gap-1.5">
                            {ACTION_EXECUTION_OPTIONS.map((o) => {
                              const on = a.execution === o.value;
                              return (
                                <button
                                  key={o.value}
                                  type="button"
                                  onClick={() => setAction(a.name, o.value)}
                                  aria-pressed={on}
                                  className={`min-h-11 flex-1 rounded-full text-[13px] transition-smooth active:scale-[0.97] ${
                                    on
                                      ? "bg-primary-tint font-bold text-foreground"
                                      : "bg-muted font-medium text-muted-foreground"
                                  }`}
                                >
                                  {o.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* 동적 3번째 질문 — 그날 1순위 이슈만 검증한다 */}
              {axis === "thermal" && (
                <section className="mt-7">
                  <h2 className="text-[16px] font-bold tracking-[-0.01em] break-keep">
                    옷차림은 {name}에게 어땠나요?
                  </h2>
                  <OptionList<ThermalOutcome>
                    options={THERMAL_OPTIONS}
                    value={thermal}
                    onSelect={setThermal}
                  />
                </section>
              )}
              {axis === "airway" && (
                <section className="mt-7">
                  <h2 className="text-[16px] font-bold tracking-[-0.01em] break-keep">
                    야외활동 뒤에 불편한 점이 있었나요?
                  </h2>
                  <OptionList<AirwayOutcome>
                    options={AIRWAY_OPTIONS}
                    value={airway}
                    onSelect={setAirway}
                  />
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
                <OptionList<DayComfort>
                  options={DAY_COMFORT_OPTIONS}
                  value={dayComfort}
                  onSelect={setDayComfort}
                />
              </section>

              <section className="mt-7">
                <h2 className="text-[16px] font-bold tracking-[-0.01em]">이런 일이 있었어요</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  여러 개 고를 수 있어요 · 선택
                </p>
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
                  기억해두면 좋을 일이 있나요?{" "}
                  <span className="font-medium text-muted-foreground">· 선택</span>
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
                {isEdit ? "수정 저장하기" : "저장하기"}
              </Button>
            </>
          )}

          {/* 완료 — 저장 확인이 아니라 보상: 한 줄 리캡 → 특성 승격 → 다음 판단 미리보기 */}
          {step === "done" && result && (
            <>
              <h1 className="text-[20px] font-bold leading-[1.35] tracking-[-0.02em] break-keep">
                오늘 결과가 반영됐어요
              </h1>

              <section className="mt-5 rounded-3xl bg-card p-5 shadow-card">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  오늘의 {name}
                </p>
                <p className="mt-2 text-[17px] font-bold leading-[1.55] text-foreground break-keep">
                  {result.recap}
                </p>
              </section>

              {/* 특성 승격 — 불확실한 관찰이 추천 근거가 되는 순간 */}
              {result.promoted ? (
                <section className="mt-4 rounded-2xl bg-primary-tint p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-[18px] w-[18px] shrink-0 text-accent" strokeWidth={1.75} />
                    <p className="flex-1 text-[15px] font-bold text-foreground">
                      {result.promoted.title}
                    </p>
                    <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-extrabold text-accent">
                      NEW
                    </span>
                  </div>
                  <p className="mt-2 text-[14px] leading-[1.6] text-foreground break-keep">
                    반복되는 결과가 확인됐어요 — {result.promoted.desc}.
                  </p>
                </section>
              ) : (
                <section className="mt-4 rounded-2xl bg-card p-4 shadow-soft">
                  <p className="text-[14px] leading-[1.6] text-muted-foreground break-keep">
                    비슷한 결과가 몇 번 더 쌓이면, 반복되는 경향만 조심스럽게 반영할게요.
                  </p>
                </section>
              )}

              {/* 다음 판단 미리보기 — 다시 참여할 기능적 이유 */}
              {result.next && (
                <section className="mt-4 rounded-2xl bg-secondary p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent">
                    다음 비슷한 날 미리보기
                  </p>
                  <p className="mt-2 text-[16px] font-bold leading-[1.5] text-foreground break-keep">
                    {result.next}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-[1.6] text-muted-foreground break-keep">
                    오늘 알려주신 결과가 다음 판단의 근거가 됐어요.
                  </p>
                </section>
              )}

              <Button
                className="mt-8 h-12 w-full rounded-[14px] bg-primary text-[17px] font-bold text-primary-foreground hover:bg-primary-hover"
                onClick={() => router.push("/day")}
              >
                {name}의 하루 보러 가기
              </Button>
              <button
                onClick={() => router.push("/home")}
                className="mt-1 flex min-h-11 w-full items-center justify-center text-[14px] font-semibold text-muted-foreground transition-smooth hover:text-foreground"
              >
                홈으로
              </button>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default DayReviewPage;
