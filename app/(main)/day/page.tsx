"use client";

/**
 * 하루 탭 — **오늘의 케어 실행 하나**를 끝내는 화면.
 *
 * 시안·합의: docs/reviews/2026-07-28-review-codex-day-preview.md (조정 합의 3라운드)
 *
 * 이 화면의 Job은 하나다: **오늘 아이에게 생길 수 있는 실패를 막는 행동 1개를,
 * 내가 챙기고(준비) 남에게 넘기게(전달) 한다.** 저녁에는 그 결과를 한 번 회수한다.
 *
 * 이전 버전이 실패한 이유(2026-07-29 사용자 지적, 스크린샷 `2026-07-29-day-current-prod.png`):
 *   ① 첫 화면에 "오늘 할 일"이 없었다 — 카드가 전부 '내일' 또는 '우리가 아는 것'이었다.
 *   ② "지우를 이미 이만큼 알고 있어요"는 부모가 **자기가 입력한 정보를 되돌려 받는** 카드였다.
 *   ③ 반응 지도·현황판은 제품의 진척이지 부모의 효용이 아니다(3회 지적).
 * 그래서 프로필 카드·반응 지도·상시 내일 카드를 **삭제**했다. 내일 준비는 결과를
 * 알려준 뒤의 **보상**으로만 등장한다.
 *
 * 금지(조정 합의): "가장 중요한·1순위·놓치면 안 될" 같은 순위 주장, 기록·트래킹 어휘,
 * 엔진 입력에 실제로 들어가지 않은 개인화 설명.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronRight,
  IdCard,
  Settings2,
  Share2,
  Sunrise,
  Trash2,
  X,
} from "lucide-react";
import PageHeader, { headerBtn } from "@/components/PageHeader";
import { toast } from "sonner";
import {
  ChildProfile,
  defaultProfiles,
  isDemoProfile,
  loadProfiles,
} from "@/lib/profile";
import { useLocation } from "@/lib/useLocation";
import { loadEnvSnapshot } from "@/lib/env-cache";
import { buildTimeline, buildTomorrowTimeline } from "@/lib/timeline";
import { buildCarePlan, applyPastOutcome } from "@/lib/care-plan";
import { buildTomorrowBrief } from "@/lib/memory/tomorrow-brief";
import { buildCareCard, careCardToText, isCareCardEmpty } from "@/lib/memory/care-card";
import CareCardShare from "@/components/CareCardShare";
import { localDateStr } from "@/lib/date";
import { loadCheckedKeys, saveCheckedKeys } from "@/lib/memory/checklist-state";
import {
  OVERALL_FIT_OPTIONS,
  THERMAL_OPTIONS,
  clearEntries,
  deleteEntry,
  loadEntries,
  type DayReviewEntry,
} from "@/lib/memory/day-review";

const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][new Date(iso + "T00:00:00").getDay()];
  return `${m}.${d} ${dow}`;
};

const fitLabel = (e: DayReviewEntry) =>
  OVERALL_FIT_OPTIONS.find((o) => o.value === e.overallFit)?.label ?? "";
const thermalLabel = (e: DayReviewEntry) =>
  e.thermalOutcome ? THERMAL_OPTIONS.find((o) => o.value === e.thermalOutcome)?.label : null;

const DayPage = () => {
  const router = useRouter();
  const { location } = useLocation();
  const [mounted, setMounted] = useState(false);
  const [profiles, setProfiles] = useState<ChildProfile[]>(defaultProfiles);
  const [active, setActive] = useState<string>(defaultProfiles[0].id);
  const [entries, setEntries] = useState<DayReviewEntry[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [shared, setShared] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  useEffect(() => {
    if (!mounted) return;
    setEntries(loadEntries(active));
    setChecked(loadCheckedKeys(active));
    setShared(false);
    try {
      localStorage.setItem("aiweather:activeProfileId", active);
    } catch {}
  }, [active, mounted]);

  const child = profiles.find((p) => p.id === active) ?? profiles[0];
  const today = entries.find((e) => e.date === localDateStr()) ?? null;

  // 환경은 홈이 저장해 둔 스냅샷을 재사용한다(이 탭은 페치하지 않는다 — 판정 입력 단일화)
  const snap = useMemo(() => {
    if (!mounted) return null;
    return loadEnvSnapshot({
      station: location.station,
      lat: location.lat,
      lon: location.lon,
    });
  }, [mounted, location.station, location.lat, location.lon]);

  // 오늘의 실행 — 슬롯 전이에서 실패 조건을 찾는다. 없으면 null(지어내지 않는다).
  const plan = useMemo(() => {
    if (!snap || !child) return null;
    const slots = buildTimeline(child.schedule, snap.env);
    if (!slots) return null;
    return buildCarePlan({
      slots,
      childName: child.name,
      conditions: child.conditions,
      hot: child.hot,
      sweat: child.sweat,
    });
  }, [snap, child]);

  // 과거 결과 반영 — 같은 종류의 결과가 있을 때만. 없으면 반영 문장을 만들지 않는다.
  const pastThermal = useMemo(() => {
    const past = entries.filter((e) => e.date !== localDateStr() && e.thermalOutcome);
    const warm = past.filter((e) => e.thermalOutcome === "too_warm").length;
    const cold = past.filter((e) => e.thermalOutcome === "too_cold").length;
    if (warm >= 2 && warm > cold) return "too_warm" as const;
    if (cold >= 2 && cold > warm) return "too_cold" as const;
    return null;
  }, [entries]);

  const adjusted = useMemo(
    () => (plan ? applyPastOutcome(plan, pastThermal) : null),
    [plan, pastThermal]
  );
  const shownPlan = adjusted?.plan ?? plan;

  // 결과를 알려준 뒤의 보상 — 내일 아침 준비(오늘 결과 반영)
  const tomorrow = useMemo(() => {
    if (!today || !snap || !child) return null;
    const slots = buildTomorrowTimeline(child.schedule, snap.env);
    return buildTomorrowBrief(slots, child.conditions ?? [], today);
  }, [today, snap, child]);

  const recent = entries.filter((e) => e.date !== localDateStr()).slice(0, 3);
  const prepKey = shownPlan?.prep[0] ?? null;
  const prepDone = prepKey ? checked.includes(prepKey) : false;

  // ── 돌봄 카드 — 축적된 이해를 조부모·시터·어린이집에 건네는 한 장 ──
  // 반복 설명 노동(역할 분담 25.0% · 기관 추가 전달 16.7%)을 앱이 대신 넘긴다.
  const careCard = useMemo(
    () => (child ? buildCareCard({ child, entries, plan: shownPlan }) : null),
    [child, entries, shownPlan]
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSharing, setCardSharing] = useState(false);

  // 카드 공유 — 이미지가 본체다(받는 사람이 앱 없이 바로 읽는다). 이미지 경로가 막히면
  // 텍스트로 폴백한다. 홈 리포트 공유와 같은 방식(html-to-image + Web Share files).
  const shareCareCard = async () => {
    if (!careCard || cardSharing) return;
    setCardSharing(true);
    const fallbackText = async () => {
      const text = careCardToText(careCard);
      const shareFn = (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share;
      try {
        if (typeof shareFn === "function") {
          await shareFn.call(navigator, { text });
          return;
        }
        await navigator.clipboard.writeText(text);
        toast("돌봄 카드를 텍스트로 복사했어요");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        toast("공유하지 못했어요 — 잠시 후 다시 시도해주세요");
      }
    };
    try {
      const node = cardRef.current;
      if (!node) {
        await fallbackText();
        return;
      }
      if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: true,
        backgroundColor: "#FFF8F0",
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `aiday-care-card-${child.name}.png`, { type: "image/png" });
      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file], title: `${child.name} 돌봄 카드` });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `aiday-care-card-${child.name}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("돌봄 카드 이미지를 저장했어요");
    } catch {
      await fallbackText();
    } finally {
      setCardSharing(false);
    }
  };

  const togglePrep = () => {
    if (!prepKey) return;
    const next = prepDone ? checked.filter((k) => k !== prepKey) : [...checked, prepKey];
    setChecked(next);
    saveCheckedKeys(active, next);
  };

  // 전달 — 공유 시트를 먼저 시도하고(한 탭에 끝난다), 미지원이면 복사로 폴백한다.
  const share = async () => {
    if (!shownPlan) return;
    const text = shownPlan.handoff;
    if (typeof navigator === "undefined") return;
    // Web Share는 lib.dom 버전에 따라 타입에 없을 수 있어 함수 존재로 판정한다
    const shareFn = (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share;
    const copy = async () => {
      await navigator.clipboard.writeText(text);
      setShared(true);
      toast("전달 문구를 복사했어요");
    };
    try {
      if (typeof shareFn === "function") {
        await shareFn.call(navigator, { text });
        setShared(true);
        return;
      }
      await copy();
    } catch (err) {
      // 사용자가 공유 시트를 닫은 것(AbortError)은 실패가 아니다
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await copy();
      } catch {
        toast("전달 문구를 복사하지 못했어요 — 문장을 길게 눌러 복사해주세요");
      }
    }
  };

  if (!mounted) {
    return (
      <div className="page-shell">
        <div className="page-frame min-h-screen bg-background" />
      </div>
    );
  }

  const name = child.name;
  const handoffTarget = shownPlan?.atDaycare ? "어린이집에 전달하기" : "돌봄자에게 전달하기";
  // 하루 화면은 시간에 따라 얼굴을 바꾼다 — 낮에는 오늘의 실행이 주인공,
  // 저녁에는 예측과 실제의 대조·회수가 주인공이다(홈이 구조적으로 못 하는 일).
  const isEvening = new Date().getHours() >= 18;
  // 마지막 확인 시각 — 없으면 만들지 않는다(추정 금지). 출처를 함께 적는다.
  const lastReportedAt = today?.ts
    ? new Date(today.ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : null;

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
          {profiles.length > 1 && (
            <div className="flex w-fit items-center gap-1 rounded-full bg-muted p-1">
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

          {/* ── 오늘의 실행 (이 화면의 유일한 L2) ───────────────────────── */}
          {shownPlan ? (
            <section className="mt-4 rounded-3xl bg-card p-5 shadow-card">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                오늘의 실행
              </p>
              <h1 className="mt-2 text-[26px] font-extrabold leading-[1.34] tracking-[-0.028em] text-foreground break-keep">
                {shownPlan.action}
              </h1>

              {/* 근거 — 원인 슬롯 → 결과 슬롯. 판단에 쓴 값을 그대로 보여준다 */}
              <div className="mt-4 rounded-2xl bg-muted p-4">
                {shownPlan.evidence.map((e, i) => (
                  <div key={e.slot} className={i === 0 ? "" : "mt-3 border-t border-border pt-3"}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-bold text-foreground">{e.slot}</span>
                      <span className="num text-[13px] font-bold text-foreground">{e.value}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-[1.55] text-muted-foreground break-keep">
                      {e.why}
                    </p>
                  </div>
                ))}
              </div>

              {adjusted && (
                <p className="mt-3 text-[13px] leading-[1.6] text-accent break-keep">
                  {adjusted.note}
                </p>
              )}

              {/* ① 내가 챙길 것 */}
              {prepKey && (
                <button
                  onClick={togglePrep}
                  aria-pressed={prepDone}
                  className="mt-5 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-muted px-4 text-left transition-smooth active:scale-[0.99]"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                      prepDone
                        ? "border-status-good bg-status-good text-white"
                        : "border-border-control bg-card"
                    }`}
                    aria-hidden="true"
                  >
                    {prepDone && <Check className="h-4 w-4" strokeWidth={3} />}
                  </span>
                  <span
                    className={`flex-1 text-[16px] font-semibold ${
                      prepDone ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {prepKey} 가방에 넣기
                  </span>
                </button>
              )}

              {/* ② 남에게 넘길 일 — 이 화면의 유일한 primary CTA */}
              <button
                onClick={share}
                className={`mt-2 flex h-13 min-h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[17px] font-bold transition-smooth active:scale-[0.99] ${
                  shared
                    ? "bg-status-good-bg text-status-good"
                    : "bg-primary text-primary-foreground hover:bg-primary-hover"
                }`}
              >
                {shared ? (
                  <>
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                    전달했어요
                  </>
                ) : (
                  <>
                    <Share2 className="h-5 w-5" strokeWidth={1.75} />
                    {handoffTarget}
                  </>
                )}
              </button>
              <p className="mt-2 rounded-2xl bg-secondary p-3.5 text-[13px] leading-[1.6] text-foreground break-keep">
                “{shownPlan.handoff}”
              </p>
            </section>
          ) : (
            <section className="mt-4 rounded-3xl bg-card p-5 shadow-card">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                오늘의 실행
              </p>
              <h1 className="mt-2 text-[22px] font-extrabold leading-[1.4] tracking-[-0.02em] break-keep">
                오늘은 따로 챙길 것이 없어요
              </h1>
              <p className="mt-2 text-[14px] leading-[1.65] text-muted-foreground break-keep">
                {snap
                  ? `시간대별 기온 변화와 ${name}의 일과를 확인했는데, 오늘은 미리 맞춰둘 케어가 보이지 않아요.`
                  : "홈에서 오늘 환경을 먼저 불러오면 오늘의 실행을 보여드릴게요."}
              </p>
            </section>
          )}

          {/* ── 저녁 회수 한 줄 / 결과 반영 후 보상 ─────────────────────── */}
          {today ? (
            <>
              {/* 예측 ↔ 실제 대조 — 홈이 구조적으로 못 하는 일(아침엔 결과가 없다).
                  출처·시각을 함께 적어 "언제 누가 확인한 것인지"를 숨기지 않는다. */}
              <section className="mt-6 rounded-2xl bg-card p-5 shadow-soft">
                {shownPlan && (
                  <div className="mb-4 rounded-2xl bg-muted p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      아침 예측
                    </p>
                    <p className="mt-1 text-[14px] leading-[1.55] text-muted-foreground break-keep">
                      {shownPlan.action}
                    </p>
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        실제
                      </p>
                      <p className="mt-1 text-[15px] font-bold leading-[1.5] text-foreground break-keep">
                        {[fitLabel(today), thermalLabel(today)].filter(Boolean).join(" · ")}
                      </p>
                      {lastReportedAt && (
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          마지막 확인 {lastReportedAt} · 보호자 기록
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Check className="h-[18px] w-[18px] shrink-0 text-status-good" strokeWidth={2.5} />
                  <p className="flex-1 text-[15px] font-bold">오늘 결과가 반영됐어요</p>
                  <button
                    onClick={() => router.push("/review?edit=1")}
                    className="-mr-2 flex min-h-11 items-center rounded-full px-2 text-[13px] font-semibold text-muted-foreground"
                  >
                    수정
                  </button>
                </div>
                {tomorrow && (
                  <div className="mt-3 rounded-2xl bg-muted p-4">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      <Sunrise className="h-3.5 w-3.5" strokeWidth={2} />
                      내일 {tomorrow.slotLabel} <span className="num">{tomorrow.hour}</span> ·{" "}
                      <span className="num">{tomorrow.temp}°</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tomorrow.preps.map((p, i) => (
                        <span
                          key={p}
                          className={`rounded-full px-3 py-1.5 text-[13px] ${
                            i === 0 && tomorrow.adjusted?.name === p
                              ? "bg-primary-tint font-bold text-foreground"
                              : "bg-card font-medium text-foreground"
                          }`}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    {tomorrow.adjusted && (
                      <p className="mt-2 text-[12.5px] leading-[1.6] text-muted-foreground break-keep">
                        {tomorrow.adjusted.reason}
                      </p>
                    )}
                  </div>
                )}
              </section>
            </>
          ) : (
            <button
              onClick={() => router.push("/review")}
              className="mt-6 flex w-full items-center gap-3 rounded-2xl bg-card p-5 text-left shadow-soft transition-smooth active:scale-[0.99]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold tracking-[-0.01em] break-keep">
                  오늘 {name}에게 어땠는지 한 번만 알려주세요
                </span>
                <span className="mt-0.5 block text-[13px] leading-[1.5] text-muted-foreground break-keep">
                  30초면 끝나고, 내일 아침 준비에 바로 반영해요
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
            </button>
          )}

          {/* ── 돌봄 카드 — 아이를 맡길 때 반복하던 설명을 한 장으로 넘긴다 ── */}
          {careCard && !isCareCardEmpty(careCard) && (
            <section className="mt-8">
              <h2 className="text-[17px] font-bold tracking-[-0.01em]">{name} 돌봄 카드</h2>
              <p className="mt-1 text-[13px] leading-[1.6] text-muted-foreground break-keep">
                조부모·시터·어린이집에 건네면, 같은 설명을 다시 하지 않아도 돼요.
              </p>
              <div className="mt-3 rounded-2xl bg-card p-5 shadow-soft">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent"
                    aria-hidden="true"
                  >
                    <IdCard className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-foreground">
                      {careCard.profileLines.length + careCard.observedLines.length}가지 안내
                      {careCard.todayRequest ? " + 오늘 부탁" : ""}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {[...careCard.profileLines, ...careCard.observedLines].slice(0, 3).map((l) => (
                        <li
                          key={l.label + l.text}
                          className="flex gap-2 text-[13px] leading-[1.55] text-muted-foreground break-keep"
                        >
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-status-neutral-dot" />
                          {l.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <button
                  onClick={shareCareCard}
                  disabled={cardSharing}
                  className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-muted text-[15px] font-bold text-foreground transition-smooth active:scale-[0.99] disabled:opacity-50"
                >
                  <Share2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  {cardSharing ? "카드 만드는 중…" : "돌봄 카드 보내기"}
                </button>
              </div>
            </section>
          )}

          {/* ── 근거: 최근 비슷한 날 (있을 때만, 조용히) ───────────────── */}
          {recent.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[17px] font-bold tracking-[-0.01em]">최근 비슷한 날</h2>
              <div className="mt-3 divide-y divide-border rounded-2xl bg-card shadow-soft">
                {recent.map((e) => (
                  <div key={e.date} className="px-5 py-3.5">
                    <p className="tabular text-[12px] text-muted-foreground">
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

          {/* 공유 캡처 대상 — 화면 밖에 렌더해두고 공유 시 PNG로 굽는다(홈 리포트와 같은 방식) */}
          {careCard && (
            <div
              aria-hidden="true"
              style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none", zIndex: -1 }}
            >
              <CareCardShare ref={cardRef} card={careCard} />
            </div>
          )}
        </main>
      </div>

      {/* 결과 관리 시트 — 개인정보 통제 */}
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
                  <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
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
                      setEntries(loadEntries(active));
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
                  setEntries(loadEntries(active));
                  setSettingsOpen(false);
                  toast("모든 결과를 삭제했어요");
                }}
                className="mt-4 flex min-h-12 w-full items-center justify-center rounded-[14px] bg-muted text-[14px] font-semibold text-status-bad"
              >
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
