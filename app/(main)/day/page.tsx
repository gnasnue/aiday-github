"use client";

/**
 * 하루 탭 — "AiDay가 아이를 어떻게 알아가고 있는지" 보는 화면.
 *
 * 시안: docs/reviews/2026-07-28-day-tab-home-tips-mockup.html (v6)
 * 계획: docs/01-plan/features/day-review-family-memory.plan.md
 *
 * **이 화면은 기록함이 아니다.** 제품은 기록 앱이 아니라 판단 앱이므로(MANIFESTO —
 * "신생아 기록 앱이 아니다", 문제정의 v3 — "유아기 이후의 Job은 기록이 아니라 판단"),
 * 사용자에게 보이는 언어에서 기록·트래킹·N일째·연속을 쓰지 않는다. 대신:
 *   Hero      = 오늘의 변화(결과가 반영됐다 / 아직 안 닫혔다 / 이미 이만큼 안다)
 *   반응 지도 = 특성별 병렬 상태 — 전역 진행 단계를 만들지 않는다(더위는 반영 중인데
 *               추위는 정보가 적을 수 있고, 그 병렬성이 실제 데이터 구조다)
 *   근거      = 최근 비슷한 날(조건 · 추천 · 결과 3요소)
 * 입력(/review)은 이 화면을 갱신하는 가벼운 액션이지 메인 콘텐츠가 아니다.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Droplets,
  Settings2,
  Shirt,
  Snowflake,
  Sun,
  Trash2,
  Wind,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PageHeader, { headerBtn } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChildProfile,
  defaultProfiles,
  isDemoProfile,
  loadProfiles,
} from "@/lib/profile";
import { loadTodayReport } from "@/lib/report-cache";
import { splitHook } from "@/lib/hero-brief";
import { withSubjectSuffix } from "@/lib/korean";
import { localDateStr } from "@/lib/date";
import {
  OVERALL_FIT_OPTIONS,
  THERMAL_OPTIONS,
  buildNextJudgementLine,
  buildTraitMap,
  clearEntries,
  deleteEntry,
  loadEntries,
  type DayReviewEntry,
  type TraitCard,
} from "@/lib/memory/day-review";

/** 특성 키 → 아이콘 (Lucide 단일 세트 — 이모지 금지) */
const TRAIT_ICON: Record<TraitCard["key"], LucideIcon> = {
  heat: Sun,
  cold: Snowflake,
  prep: Shirt,
  airway: Wind,
};

const fitLabel = (e: DayReviewEntry) =>
  OVERALL_FIT_OPTIONS.find((o) => o.value === e.overallFit)?.label ?? "";
const thermalLabel = (e: DayReviewEntry) =>
  e.thermalOutcome ? THERMAL_OPTIONS.find((o) => o.value === e.thermalOutcome)?.label : null;

/** "7.27 일" */
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][new Date(iso + "T00:00:00").getDay()];
  return `${m}.${d} ${dow}`;
};

const DayPage = () => {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [profiles, setProfiles] = useState<ChildProfile[]>(defaultProfiles);
  const [active, setActive] = useState<string>(defaultProfiles[0].id);
  const [entries, setEntries] = useState<DayReviewEntry[]>([]);
  const [todayHook, setTodayHook] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // localStorage 읽기는 마운트 이후에만 — SSR 첫 렌더와의 하이드레이션 불일치 방지(홈 패턴)
  useEffect(() => {
    const list = loadProfiles();
    setProfiles(list);
    let id = list[0].id;
    try {
      const saved = localStorage.getItem("aiweather:activeProfileId");
      if (saved && list.some((p) => p.id === saved)) id = saved;
    } catch {}
    setActive(id);
    setMounted(true);
  }, []);

  // 활성 아이가 바뀌면 그 아이의 결과·오늘 판단을 다시 읽는다
  useEffect(() => {
    if (!mounted) return;
    setEntries(loadEntries(active));
    const report = loadTodayReport(active);
    setTodayHook(report?.hook ?? null);
    try {
      localStorage.setItem("aiweather:activeProfileId", active);
    } catch {}
  }, [active, mounted]);

  const child = profiles.find((p) => p.id === active) ?? profiles[0];
  const today = entries.find((e) => e.date === localDateStr()) ?? null;
  const traits = useMemo(() => buildTraitMap(entries), [entries]);
  const nextLine = useMemo(() => buildNextJudgementLine(traits), [traits]);
  const recent = entries.filter((e) => e.date !== localDateStr()).slice(0, 3);
  const hookAction = todayHook ? (splitHook(todayHook)[1] ?? todayHook) : null;

  const refresh = () => setEntries(loadEntries(active));

  if (!mounted) {
    return (
      <div className="page-shell">
        <div className="page-frame min-h-screen bg-background" />
      </div>
    );
  }

  const name = child.name;

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
        <PageHeader
          right={
            <button
              onClick={() => setSettingsOpen(true)}
              className={headerBtn}
              aria-label="결과 관리"
            >
              <Settings2 className="h-5 w-5" strokeWidth={1.75} />
            </button>
          }
        />

        <main className="container-mobile pt-5">
          {/* 아이 전환 — 2명 이상일 때만. Family Memory는 아이별로 쌓인다 */}
          {profiles.length > 1 && (
            <div className="flex shrink-0 items-center gap-1 self-start rounded-full bg-muted p-1">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActive(p.id)}
                  aria-pressed={active === p.id}
                  className={`flex min-h-9 shrink-0 items-center rounded-full px-4 text-sm transition-smooth active:scale-[0.97] ${
                    active === p.id
                      ? "bg-card font-bold text-foreground shadow-soft"
                      : "font-medium text-muted-foreground"
                  }`}
                >
                  {p.name}
                  {isDemoProfile(p) && (
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      (예시)
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <h1 className="mt-4 text-[20px] font-bold leading-[1.35] tracking-[-0.02em]">
            {name}의 하루
          </h1>
          <p className="tabular mt-1 text-[13px] font-medium text-muted-foreground">
            {new Date().getMonth() + 1}월 {new Date().getDate()}일 (
            {["일", "월", "화", "수", "목", "금", "토"][new Date().getDay()]})
          </p>

          {/* ── 반응 지도: 특성별 병렬 상태 ─────────────────────────────── */}
          {traits.length > 0 && (
            <section className="mt-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[17px] font-bold tracking-[-0.01em]">
                  {withSubjectSuffix(name)} 알아가는 중
                </h2>
                <p className="shrink-0 text-[12px] font-medium text-muted-foreground">
                  확인된 경향 <span className="num font-bold text-foreground">
                    {traits.filter((t) => t.state === "confirmed").length}
                  </span>개
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {traits.slice(0, 1).map((t) => {
                  const Icon = TRAIT_ICON[t.key];
                  const on = t.state === "confirmed";
                  return (
                    <div
                      key={t.key}
                      className={`rounded-2xl p-4 ${
                        on ? "bg-primary-tint" : "border-[1.5px] border-dashed border-border-control bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 ${on ? "text-accent" : "text-muted-foreground"}`}
                          strokeWidth={1.75}
                        />
                        <p className="flex-1 text-[15px] font-bold text-foreground break-keep">
                          {t.title}
                        </p>
                        {on && (
                          <span className="shrink-0 rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-accent">
                            다음 판단 반영
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] leading-[1.55] text-muted-foreground break-keep">
                        {t.desc}
                      </p>
                    </div>
                  );
                })}
                {traits.length > 1 && (
                  <div className={`grid gap-2 ${traits.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {traits.slice(1, 3).map((t) => {
                      const Icon = TRAIT_ICON[t.key];
                      const on = t.state === "confirmed";
                      return (
                        <div
                          key={t.key}
                          className={`rounded-2xl p-3.5 ${
                            on
                              ? "bg-primary-tint"
                              : "border-[1.5px] border-dashed border-border-control bg-card"
                          }`}
                        >
                          <Icon
                            className={`h-[18px] w-[18px] ${on ? "text-accent" : "text-muted-foreground"}`}
                            strokeWidth={1.75}
                          />
                          <p className="mt-2 text-[13.5px] font-bold text-foreground break-keep">
                            {t.title}
                          </p>
                          <p className="mt-0.5 text-[12px] leading-[1.45] text-muted-foreground break-keep">
                            {t.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Hero: 오늘의 변화 (오늘 무엇이 달라졌나 / 무엇을 알려줄까) ── */}
          {today ? (
            <section className="mt-4 rounded-3xl bg-card p-5 shadow-card">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-[15px] font-bold text-foreground">
                  오늘 결과가 반영됐어요
                </p>
                <button
                  onClick={() => router.push("/review?edit=1")}
                  className="-mr-2 flex min-h-11 items-center rounded-full px-2 text-[13px] font-semibold text-muted-foreground transition-smooth hover:text-foreground"
                >
                  수정
                </button>
              </div>
              <p className="mt-2 text-[19px] font-extrabold leading-[1.45] tracking-[-0.02em] text-foreground break-keep">
                {traits.some((t) => t.state === "confirmed")
                  ? `${name}의 반응이 조금 더 또렷해졌어요`
                  : `오늘 ${name}의 하루가 더해졌어요`}
              </p>

              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                오늘 알려준 내용
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[fitLabel(today), thermalLabel(today), ...today.tags.slice(0, 2)]
                  .filter((s): s is string => !!s)
                  .map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-muted px-3 py-1.5 text-[13px] font-medium text-foreground"
                    >
                      {s}
                    </span>
                  ))}
              </div>

              {nextLine && (
                <div className="mt-4 rounded-2xl bg-secondary p-4">
                  <p className="text-[14.5px] font-bold leading-[1.55] text-foreground break-keep">
                    {nextLine}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-[1.6] text-muted-foreground break-keep">
                    아래 ‘최근 비슷한 날’의 결과를 참고했어요
                  </p>
                </div>
              )}
            </section>
          ) : entries.length === 0 ? (
            /* 첫 진입 — "0에서 시작"이 아니라 "이미 이만큼 알고 있다" */
            <section className="mt-4 rounded-3xl bg-card p-5 shadow-card">
              <p className="text-[19px] font-extrabold leading-[1.45] tracking-[-0.02em] break-keep">
                {withSubjectSuffix(name)} 이미
                <br />
                이만큼 알고 있어요
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(child.conditions?.length ? child.conditions : ["프로필 정보"])
                  .slice(0, 3)
                  .map((c) => (
                    <span
                      key={c}
                      className="rounded-full bg-muted px-3 py-1.5 text-[13px] font-semibold text-foreground"
                    >
                      {c}
                    </span>
                  ))}
              </div>
              <p className="mt-4 text-[13.5px] leading-[1.65] text-muted-foreground break-keep">
                하루의 실제 결과를 가볍게 알려주면, 프로필만으로는 알 수 없는 {name}의 반응을
                다음 판단에 더해갈 수 있어요.
              </p>
              <Button
                className="mt-4 h-12 w-full rounded-[14px] bg-primary text-[16px] font-bold text-primary-foreground hover:bg-primary-hover"
                onClick={() => router.push("/review")}
              >
                오늘 {name}에게 어땠는지 알려주기
              </Button>
            </section>
          ) : (
            /* 오늘 미입력 — 질문형 Hero + 아침 판단 인용 */
            <section className="mt-4 rounded-3xl bg-card p-5 shadow-card">
              <p className="text-[19px] font-extrabold leading-[1.45] tracking-[-0.02em] break-keep">
                오늘 {name}에게
                <br />
                실제로 어땠나요?
              </p>
              {hookAction && (
                <div className="mt-3 rounded-2xl bg-muted p-3.5">
                  <p className="text-[12.5px] leading-[1.55] text-muted-foreground break-keep">
                    아침에는 <span className="font-semibold text-foreground">“{hookAction}”</span>
                    라고 안내했어요.
                  </p>
                </div>
              )}
              <p className="mt-2.5 text-[13.5px] leading-[1.6] text-muted-foreground break-keep">
                한 번만 알려주면, 다음 비슷한 날의 판단에 참고할게요.
              </p>
              <Button
                className="mt-4 h-12 w-full rounded-[14px] bg-primary text-[16px] font-bold text-primary-foreground hover:bg-primary-hover"
                onClick={() => router.push("/review")}
              >
                30초로 알려주기
              </Button>
            </section>
          )}

          {/* ── 근거: 최근 비슷한 날 (조건 · 추천 · 결과) ─────────────────── */}
          {recent.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[17px] font-bold tracking-[-0.01em]">최근 비슷한 날</h2>
              <div className="mt-3 divide-y divide-border rounded-2xl bg-card shadow-soft">
                {recent.map((e) => (
                  <div key={e.date} className="px-5 py-3.5">
                    <p className="tabular text-[12px] text-faint">
                      {shortDate(e.date)}
                      {e.conditionLabel ? ` · ${e.conditionLabel}` : ""}
                    </p>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <p className="min-w-0 text-[14px] font-medium text-foreground break-keep">
                        {e.prepSummary?.length ? `${e.prepSummary.join(" + ")} 추천` : fitLabel(e)}
                      </p>
                      <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">
                        {thermalLabel(e) ?? fitLabel(e)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="mt-6 text-center text-[12px] leading-[1.6] text-muted-foreground break-keep">
            알려주지 않아도 불이익은 없어요 — 체질 진단이 아니며, 언제든 수정·삭제할 수 있어요.
          </p>
        </main>
      </div>

      {/* 결과 관리 시트 — 개인정보 통제(수정·삭제)는 여기 모은다 */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-[390px] rounded-t-3xl bg-card p-5 pb-8 shadow-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="결과 관리"
          >
            <div className="flex items-center justify-between">
              <p className="text-[17px] font-bold">AiDay가 참고하는 정보</p>
              <button
                onClick={() => setSettingsOpen(false)}
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"
                aria-label="닫기"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <p className="mt-1 text-[13px] leading-[1.6] text-muted-foreground break-keep">
              {name}의 하루 결과 {entries.length}건이 이 기기에 저장돼 있어요.
            </p>

            <div className="mt-4 divide-y divide-border rounded-2xl bg-muted/60">
              {today && (
                <button
                  onClick={() => router.push("/review?edit=1")}
                  className="flex min-h-14 w-full items-center gap-3 px-4 text-left"
                >
                  <span className="flex-1 text-[15px] font-medium">오늘 결과 수정</span>
                  <ChevronRight className="h-4 w-4 text-faint" strokeWidth={2} />
                </button>
              )}
              {entries.slice(0, 5).map((e) => (
                <div key={e.date} className="flex min-h-14 items-center gap-3 px-4">
                  <span className="tabular flex-1 text-[14px] text-foreground">
                    {shortDate(e.date)} · {fitLabel(e)}
                  </span>
                  <button
                    onClick={() => {
                      deleteEntry(active, e.date);
                      refresh();
                      toast("이 날의 결과를 삭제했어요");
                    }}
                    aria-label={`${shortDate(e.date)} 결과 삭제`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-status-bad"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>

            {entries.length > 0 && (
              <button
                onClick={() => {
                  if (!confirm(`${name}의 하루 결과를 모두 삭제할까요? 되돌릴 수 없어요.`)) return;
                  clearEntries(active);
                  refresh();
                  setSettingsOpen(false);
                  toast("모든 결과를 삭제했어요");
                }}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-muted text-[14px] font-semibold text-status-bad"
              >
                <Droplets className="h-4 w-4" strokeWidth={1.75} />
                전체 삭제
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DayPage;
