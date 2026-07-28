"use client";

/**
 * 이번 주 컨디션 예보 — 하루 탭의 앞보기 섹션.
 *
 * 주간 예보(`/api/weather/weekly`)를 아이 체질 기준으로 읽어(lib/week-radar.ts)
 * "이번 주 힘들어지기 쉬운 날"을 미리 짚는다. 홈 히어로가 오늘을 담당한다면,
 * 이 섹션은 **내일 다시 올 이유**를 담당한다 — 그리고 저녁 기록(envDigest)이 쌓이면
 * "비슷한 날 3번 중 2번 기침·콧물 기록" 같은 부모 자신의 근거로 문장이 진화한다.
 *
 * 데이터가 없으면 섹션을 그리지 않는다(없는 값을 그리지 않는다). 주간 예보는
 * localStorage에 3시간 캐시한다 — 서버 revalidate(중기 3h)와 정렬.
 */

import { useEffect, useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import type { ChildProfile } from "@/lib/profile";
import type { DayReviewEntry } from "@/lib/memory/day-review";
import { envRegion } from "@/lib/env-data";
import type { AppLocation } from "@/lib/location";
import {
  buildWeekRadar,
  radarHint,
  type RadarWeekDay,
} from "@/lib/week-radar";

const CACHE_KEY = "aiday:weekly:v1";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

type CachedWeekly = { ts: number; week: RadarWeekDay[] };

const loadCachedWeekly = (now: number): RadarWeekDay[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedWeekly;
    if (!Array.isArray(cached.week) || !cached.week.length) return null;
    const age = now - cached.ts;
    if (age < 0 || age > CACHE_TTL_MS) return null;
    // 자정을 넘긴 캐시는 "오늘"이 밀려 있으므로 버린다
    if (new Date(cached.ts).getDate() !== new Date(now).getDate()) return null;
    return cached.week;
  } catch {
    return null;
  }
};

const WeekRadar = ({
  child,
  entries,
  location,
  className = "mt-8",
}: {
  child: ChildProfile;
  entries: DayReviewEntry[];
  location: AppLocation;
  /** 섹션 상단 여백 — 화면 첫 요소일 때(낮 시간대 하루 탭)는 호출부가 줄인다 */
  className?: string;
}) => {
  const [week, setWeek] = useState<RadarWeekDay[] | null>(null);
  // envRegion은 현재 서울 고정 문자열을 돌려주므로 렌더 스코프에서 계산해 효과 의존성을
  // 스칼라로 유지한다(location 객체 identity 변화로 인한 불필요 재페치 방지).
  const region = envRegion(location);
  const { lat, lon } = location;

  useEffect(() => {
    const cached = loadCachedWeekly(Date.now());
    if (cached) {
      setWeek(cached);
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 9000);
    (async () => {
      try {
        const res = await fetch(
          `/api/weather/weekly?region=${encodeURIComponent(region)}&lat=${lat}&lon=${lon}`,
          { signal: ac.signal }
        );
        const json = (await res.json()) as { week?: RadarWeekDay[]; error?: string };
        if (!json || json.error || !Array.isArray(json.week) || !json.week.length) return;
        setWeek(json.week);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), week: json.week }));
        } catch {}
      } catch {
        // 예보를 못 받으면 섹션을 그리지 않는다 — 하루 탭의 다른 기능을 막지 않는다
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [lat, lon, region]);

  const radar = useMemo(() => {
    if (!week) return null;
    return buildWeekRadar({
      week,
      childName: child.name,
      conditions: child.conditions,
      hot: child.hot,
      sweat: child.sweat,
      entries,
    });
  }, [week, child, entries]);

  if (!radar || !radar.days.length) return null;

  const { days, peak } = radar;

  return (
    <section className={className}>
      <h2 className="text-[17px] font-bold tracking-[-0.01em]">이번 주 컨디션 예보</h2>
      <p className="mt-1 text-[13px] leading-[1.6] text-muted-foreground break-keep">
        주간 예보를 {child.name} 체질 기준으로 먼저 읽었어요.
      </p>

      <div className="mt-3 rounded-2xl bg-card p-5 shadow-soft">
        {/* 주간 스트립 — 신호가 있는 날은 warn 도트, 대표일은 tint로 표시 */}
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((d) => {
            const isPeak = peak?.day.date === d.date;
            return (
              <div
                key={d.date}
                className={`flex flex-col items-center rounded-xl py-2 ${
                  isPeak ? "bg-status-warn-tint" : ""
                }`}
              >
                <span
                  className={`text-[13px] ${
                    isPeak ? "font-bold text-foreground" : "font-medium text-muted-foreground"
                  }`}
                >
                  {d.isTomorrow ? "내일" : d.day}
                </span>
                <span
                  className={`mt-1.5 h-1.5 w-1.5 rounded-full ${
                    d.signals.length ? "bg-status-warn" : "bg-border"
                  }`}
                  aria-hidden="true"
                />
                <span className="num mt-1.5 text-[13px] font-semibold text-foreground">
                  {d.high != null ? `${d.high}°` : "–"}
                </span>
                <span className="num text-[12px] text-muted-foreground">
                  {d.low != null ? `${d.low}°` : "–"}
                </span>
                {d.signals.length > 0 && (
                  <span className="sr-only">{d.signals.map((s) => s.label).join(", ")}</span>
                )}
              </div>
            );
          })}
        </div>

        {peak ? (
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-status-warn-bg text-status-warn"
                aria-hidden="true"
              >
                <CalendarRange className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold leading-[1.4] tracking-[-0.01em] break-keep">
                  {peak.title}
                </p>
                <p className="tabular mt-0.5 text-[12px] text-muted-foreground">
                  {peak.day.date} ·{" "}
                  {peak.day.signals.map((s) => s.label).join(" · ")}
                </p>
              </div>
            </div>

            <p className="mt-3 text-[14px] leading-[1.65] text-foreground break-keep">
              {peak.why}
            </p>

            {peak.evidence ? (
              <p className="mt-2 flex items-start gap-2 text-[13px] leading-[1.6] text-accent break-keep">
                <span
                  className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent"
                  aria-hidden="true"
                />
                {peak.evidence.line}
              </p>
            ) : (
              <p className="mt-2 text-[13px] leading-[1.6] text-muted-foreground break-keep">
                {radarHint(child.name)}
              </p>
            )}

            {peak.actions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-semibold text-muted-foreground">
                  미리 챙겨두기
                </span>
                {peak.actions.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-muted px-3 py-1.5 text-[13px] font-medium text-foreground"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[15px] font-bold tracking-[-0.01em] break-keep">
              이번 주는 크게 조심할 날이 안 보여요
            </p>
            <p className="mt-1 text-[13px] leading-[1.6] text-muted-foreground break-keep">
              예보가 바뀌면 이 자리에서 먼저 짚어드릴게요.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default WeekRadar;
