"use client";

/**
 * 하루 탭 — **{아이}의 성장 노트**.
 *
 * 시안: codex `/preview/day-v4` (승인 2026-07-29, 검토 기록
 * `docs/reviews/2026-07-29-review-day-v4-growth-note.md`). 이 화면은 그 시안의 구조를
 * 그대로 따른다: 상단 제목 → `오늘 알림장 / 30일 성장` 세그먼트 → 선택된 뷰 하나.
 *
 * 왜 알림장이 이 탭의 주인공이 됐나: 부모는 키즈노트 알림장을 매일 받지만 그 안의 신호를
 * 축적·해석하지 못한다. 아침 판단(홈)이 하루를 열고, 이 탭이 **기관에서 돌아온 하루를
 * 닫는다** — 오늘 저녁 대화 거리 하나와, 쌓였을 때만 보이는 변화.
 *
 * 이전 버전에서 **이 탭에서 내린 것들**(코드는 남아 있고 다른 표면에서 산다):
 *   - 저녁 마무리 진입 → 홈의 `DayReviewEntryCard`가 이미 같은 일을 한다(고아 아님).
 *   - 돌봄 카드 / 내일 아침 준비 / 최근 비슷한 날 → 성장 노트 한 화면에 세그먼트로
 *     담기 위해 제거. `lib/memory/care-card.ts`·`tomorrow-brief.ts`는 그대로 있다.
 * **남긴 것**: 이번 주 컨디션 예보(사용자 지시), 결과 관리 시트 — 저녁 기록을 지우는
 * 유일한 경로라 개인정보 통제를 없앨 수 없다(헤더 설정 아이콘 뒤, 레이아웃과 무관).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Settings2, Trash2, X } from "lucide-react";
import PageHeader, { headerBtn } from "@/components/PageHeader";
import { toast } from "sonner";
import { ChildProfile, defaultProfiles, isDemoProfile, loadProfiles } from "@/lib/profile";
import { useLocation } from "@/lib/useLocation";
import WeekRadar from "@/components/WeekRadar";
import GrowthViewSegment, { type GrowthView } from "@/components/day-growth/GrowthViewSegment";
import TodayGrowthView from "@/components/day-growth/TodayGrowthView";
import MonthGrowthView from "@/components/day-growth/MonthGrowthView";
import { type DemoVariant } from "@/components/day-growth/DemoGrowthCards";
import { localDateStr } from "@/lib/date";
import {
  OVERALL_FIT_OPTIONS,
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

const DayPage = () => {
  const router = useRouter();
  const { location } = useLocation();
  const [mounted, setMounted] = useState(false);
  const [profiles, setProfiles] = useState<ChildProfile[]>(defaultProfiles);
  const [active, setActive] = useState<string>(defaultProfiles[0].id);
  const [entries, setEntries] = useState<DayReviewEntry[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<GrowthView>("today");
  // 30일 탭 예시 카드 제어. 기본은 켜짐(데이터가 없을 때만 나온다 — MonthGrowthView).
  const [showExamples, setShowExamples] = useState(true);
  const [demoVariant, setDemoVariant] = useState<DemoVariant | undefined>(undefined);

  useEffect(() => {
    const list = loadProfiles();
    setProfiles(list);
    let id = list[0].id;
    try {
      const saved = localStorage.getItem("aiweather:activeProfileId");
      if (saved && list.some((p) => p.id === saved)) id = saved;
    } catch {}
    setActive(id);

    // 예시 카드는 **기본으로 켜져 있다** — 쿼리·세션에 기대면 라이브 발표에서
    // 탭 이동 한 번에 사라진다(실제로 발생). 데이터가 쌓이면 자동으로 진짜 화면이
    // 대신하므로(MonthGrowthView) 켜 둬도 실사용자에게 예시가 계속 남지 않는다.
    //   `?demo=a|b|c` → 그 한 안만 / `?demo=0` → 예시 끄기(진짜 빈 상태 확인용)
    try {
      const q = new URLSearchParams(window.location.search).get("demo");
      if (q === "0" || q === "off") setShowExamples(false);
      else if (q === "a" || q === "b" || q === "c") setDemoVariant(q);
    } catch {}

    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setEntries(loadEntries(active));
    try {
      localStorage.setItem("aiweather:activeProfileId", active);
    } catch {}
  }, [active, mounted]);

  const child = profiles.find((p) => p.id === active) ?? profiles[0];
  const name = child?.name ?? "";
  const today = entries.find((e) => e.date === localDateStr()) ?? null;

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
        <PageHeader
          right={
            <button onClick={() => setSettingsOpen(true)} className={headerBtn} aria-label="결과 관리">
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
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">(예시)</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <section className={profiles.length > 1 ? "pb-5 pt-5" : "pb-5"} aria-labelledby="day-title">
            <h1 id="day-title" className="text-xl font-bold tracking-[-0.01em]">
              {name}의 성장 노트
            </h1>
            <p className="mt-1 text-sm text-muted-foreground break-keep">
              매일의 알림장에서 놓치기 쉬운 변화를 찾아요
            </p>
          </section>

          <GrowthViewSegment value={view} onChange={setView} />

          {/* 두 뷰를 모두 마운트해 두고 hidden으로 감춘다 — 탭을 옮겨도 오늘의 분석
              결과·선택한 질문이 유지된다(시안에서 확인한 동작). */}
          <div className="mt-6">
            <div hidden={view !== "today"}>
              {child && <TodayGrowthView child={child} />}

              {/* ── 이번 주 컨디션 예보 — 주간 예보 × 체질 × 저녁 기록의 앞보기 훅 ──
                  세그먼트 **안**에 둬야 한다. 밖에 두면 두 탭에서 모두 보이는데, 탭 내용과의
                  경계(48px)가 각 뷰 내부의 히어로↔다음 섹션 간격과 같아 탭의 마지막 카드처럼
                  읽혔다. 기본 탭에 두어 앞보기 훅의 노출을 지킨다. */}
              <WeekRadar child={child} entries={entries} location={location} className="mt-12" />
            </div>
            <div hidden={view !== "month"}>
              {child && (
                <MonthGrowthView child={child} showExamples={showExamples} demoVariant={demoVariant} />
              )}
            </div>
          </div>
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
