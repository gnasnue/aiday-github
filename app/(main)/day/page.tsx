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
import { buildCarePlan } from "@/lib/care-plan";
import { loadTodayReport } from "@/lib/report-cache";
import { buildTomorrowBrief } from "@/lib/memory/tomorrow-brief";
import { buildCareCard, careCardToText, isCareCardEmpty } from "@/lib/memory/care-card";
import CareCardShare from "@/components/CareCardShare";
import WeekRadar from "@/components/WeekRadar";
import NoteboardCard from "@/components/NoteboardCard";
import { localDateStr } from "@/lib/date";
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

  // 오늘 부탁 문구 — 슬롯 전이에서 실패 조건을 찾아 **돌봄자에게 보낼 한 문장**을 만든다.
  // 없으면 null(지어내지 않는다).
  //
  // 2026-07-29: 이 엔진의 결과를 화면 헤드라인으로 쓰던 '오늘의 실행' L2 카드는 폐기했다.
  // 계측 결과 평년 날씨에서 발동률이 11%(36케이스 중 4)에 그쳤고, 무엇보다 이 카드를 만든
  // 근거였던 문제정의 §8-2의 대표 실패일(아침 20°→낮 28°→저녁 17°)조차 발동하지 않았다 —
  // 원인 슬롯 쌍을 '야외활동 → 바로 다음 슬롯'으로 고정한 탓에 하루의 **승온 구간**(11시→15시,
  // 항상 −2~−3°)을 보고 있었기 때문이다. 그래서 판단·근거·준비물을 화면에 펼치는 역할은
  // 홈 히어로에 남기고, 여기서는 **다른 어디에도 없는 기능 하나**만 살렸다: 남에게 넘기는 문구
  // (`plan.handoff` → 돌봄 카드의 '오늘 부탁'). MANIFESTO 1층(운영 책임의 집중)을 실제로
  // 덜어내는 부분이 그것이다. 계측 근거·되살릴 때 고칠 지점은 `lib/care-plan.ts` 헤더 주석 참조.
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

  // 결과를 알려준 뒤의 보상 — 내일 아침 준비(오늘 결과 반영)
  const tomorrow = useMemo(() => {
    if (!today || !snap || !child) return null;
    const slots = buildTomorrowTimeline(child.schedule, snap.env);
    return buildTomorrowBrief(slots, child.conditions ?? [], today);
  }, [today, snap, child]);

  const recent = entries.filter((e) => e.date !== localDateStr()).slice(0, 3);

  // 아침에 부모가 실제로 본 결론(홈 히어로 hook) — 저녁 대조의 인용 출처.
  // 캐시가 없으면(다른 기기·정리됨) 만들지 않는다 — 추정 인용 금지.
  const morningHook = useMemo(() => {
    if (!mounted || !child) return null;
    return loadTodayReport(child.id)?.hook?.trim() || null;
  }, [mounted, child]);

  // ── 돌봄 카드 — 축적된 이해를 조부모·시터·어린이집에 건네는 한 장 ──
  // 반복 설명 노동(역할 분담 25.0% · 기관 추가 전달 16.7%)을 앱이 대신 넘긴다.
  const careCard = useMemo(
    () => (child ? buildCareCard({ child, entries, plan }) : null),
    [child, entries, plan]
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

  // 오늘 부탁만 텍스트로 전달 — 카톡에 한 줄 붙여넣는 쓰임새가 카드 이미지와 다르다.
  // 공유 시트를 먼저 시도하고(한 탭에 끝난다), 미지원이면 복사로 폴백한다.
  const shareHandoff = async () => {
    if (!plan) return;
    const text = plan.handoff;
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
  const handoffTarget = plan?.atDaycare ? "어린이집에 보내기" : "돌봄자에게 보내기";
  // 하루 화면은 시간에 따라 얼굴을 바꾼다 — 낮에는 앞보기(컨디션 예보)가 먼저,
  // 저녁에는 예측과 실제의 대조·회수가 주인공이다(홈이 구조적으로 못 하는 일).
  const isEvening = new Date().getHours() >= 18;
  // 마지막 확인 시각 — 없으면 만들지 않는다(추정 금지). 출처를 함께 적는다.
  const lastReportedAt = today?.ts
    ? new Date(today.ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : null;

  // ── 저녁 회수 블록 — 이 화면의 key 기능(2026-07-29 결정: 저녁엔 최상단 승격) ──
  // 낮에는 아직 물을 결과가 없으므로 종전 위치(실행 아래)를 유지하고, 저녁(18시~)에는
  // 회수 CTA·결과 반영 카드가 첫 화면이 된다 — "시간에 따라 얼굴을 바꾼다" 원칙의 구현.
  const reviewMt = isEvening ? "mt-4" : "mt-8";
  const reviewBlock = today ? (
    /* 예측 ↔ 실제 대조 — 홈이 구조적으로 못 하는 일(아침엔 결과가 없다).
       출처·시각을 함께 적어 "언제 누가 확인한 것인지"를 숨기지 않는다.
       인용하는 "아침 예측"은 **부모가 실제로 본 문장**(홈 히어로 hook)이다 — 종전에는
       케어 플랜의 실행문을 인용했는데, 그 카드를 폐기한 뒤로는 부모가 한 번도 보지 못한
       문장을 "예측"이라 부르게 되므로 인용 출처를 홈 리포트로 바꿨다(2026-07-29). */
    <section className={`${reviewMt} rounded-3xl bg-card p-5 shadow-card`}>
      {morningHook && (
        <div className="mb-4 rounded-2xl bg-muted p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            아침 예측
          </p>
          <p className="mt-1 text-[14px] leading-[1.55] text-muted-foreground break-keep">
            {morningHook}
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
  ) : (
    /* 미입력 상태도 L2 — 이 화면의 key 기능이므로 두 상태의 표면 위계를 같게 둔다
       (화면의 유일한 L2. 컨디션 예보·돌봄 카드는 L1) */
    <button
      onClick={() => router.push("/review")}
      className={`${reviewMt} flex w-full items-center gap-3 rounded-3xl bg-card p-5 text-left shadow-card transition-smooth active:scale-[0.99]`}
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
  );

  // 회수 묶음 — 저녁에 부모가 하는 두 가지 회수를 나란히 둔다: **내 판단의 결과**(리뷰)와
  // **기관에서 온 소식**(알림장 → 대화 거리). 한 번의 저녁 방문에서 둘 다 끝나게 하려면
  // 두 카드가 붙어 있어야 하고, 그래서 위치 전환(저녁 최상단/낮 중간)도 함께 움직인다.
  // 알림장은 오후에 오므로 이 묶음이 아침에 최상단으로 올라오면 둘 다 빈 카드가 된다.
  const reviewStack = (
    <>
      {reviewBlock}
      <NoteboardCard child={child} />
    </>
  );

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

          {/* ── 저녁엔 회수가 주인공 — 리뷰 블록이 첫 화면 ─────────────── */}
          {isEvening && reviewStack}

          {/* ── 이번 주 컨디션 예보 — 주간 예보 × 체질 × 저녁 기록의 앞보기 훅 ── */}
          <WeekRadar
            child={child}
            entries={entries}
            location={location}
            className={isEvening ? "mt-8" : "mt-5"}
          />

          {/* ── 저녁 회수 한 줄 / 결과 반영 후 보상 — 낮에만 이 위치(저녁엔 최상단) ── */}
          {!isEvening && reviewStack}

          {/* ── 돌봄 카드 — 아이를 맡길 때 반복하던 설명을 한 장으로 넘긴다 ── */}
          {careCard && !isCareCardEmpty(careCard) && (
            <section className="mt-8">
              <h2 className="text-[17px] font-bold tracking-[-0.01em]">{name} 돌봄 카드</h2>
              <p className="mt-1 text-[13px] leading-[1.6] text-muted-foreground break-keep">
                조부모·시터·어린이집에 건네면, 같은 설명을 다시 하지 않아도 돼요.
              </p>
              <div className="mt-3 rounded-2xl bg-card p-5 shadow-soft">
                {/* 오늘 부탁 — 폐기한 '오늘의 실행' 카드에서 유일하게 살린 것.
                    이미지 카드에도 들어가지만, 카톡에 한 줄 붙여넣는 쓰임새가 달라
                    텍스트 전달 액션을 따로 둔다. */}
                {careCard.todayRequest && (
                  <div className="mb-4 rounded-2xl bg-secondary p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                      오늘 부탁
                    </p>
                    <p className="mt-1.5 text-[14px] leading-[1.6] text-foreground break-keep">
                      {careCard.todayRequest}
                    </p>
                    <button
                      onClick={shareHandoff}
                      className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold transition-smooth active:scale-[0.99] ${
                        shared
                          ? "bg-status-good-bg text-status-good"
                          : "bg-primary text-primary-foreground hover:bg-primary-hover"
                      }`}
                    >
                      {shared ? (
                        <>
                          <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
                          보냈어요
                        </>
                      ) : (
                        <>
                          <Share2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
                          {handoffTarget}
                        </>
                      )}
                    </button>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent"
                    aria-hidden="true"
                  >
                    <IdCard className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* 오늘 부탁은 이 섹션 위에 이미 펼쳐져 있으므로 카운터에서 다시 세지 않는다 */}
                    <p className="text-[14px] font-semibold text-foreground">
                      {careCard.profileLines.length + careCard.observedLines.length}가지 안내
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
