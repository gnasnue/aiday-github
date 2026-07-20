"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, CloudSun, Sun, Flower2, Wind, Sunrise, RefreshCw, Clock3 } from "lucide-react";

/**
 * 데이터 기준 안내 — AiDay가 쓰는 공식 데이터의 출처·갱신 시각과 리포트 갱신 규칙.
 *
 * "언제 봐야 정확한가"를 사용자 숙제로 남기지 않고, 앱이 어떤 규칙으로 알아서
 * 갱신하는지를 설명하는 신뢰 페이지다 (2026-07-20 시점 로직 설계 참조:
 * 단기예보 당일 첫 발표 02시 · 자외선 06시 발행 → 06시가 전 지표 당일화 경계).
 * 여기 문구는 lib/report-freshness.ts의 경계(06시)와 일치해야 한다.
 */

const sources = [
  {
    Icon: CloudSun,
    name: "기온·하늘·강수 — 기상청 단기예보·실황",
    detail: "예보는 하루 8회(02시부터 3시간마다) 발표, 현재값은 매시 관측",
  },
  {
    Icon: Sun,
    name: "자외선 — 기상청 생활기상지수",
    detail: "당일 지수는 아침 6시에 발표 (그 전엔 전날 발표 예측값)",
  },
  {
    Icon: Wind,
    name: "미세먼지 — 에어코리아 실시간 측정",
    detail: "매시 실측값 · 관측 특성상 1~2시간 전 값일 수 있어요",
  },
  {
    Icon: Flower2,
    name: "꽃가루 — 기상청 꽃가루 위험지수",
    detail: "하루 단위 지수",
  },
];

const rules = [
  {
    Icon: Sunrise,
    title: "새벽에 보면 '전날 밤 예보 기준'",
    detail:
      "자정~아침 6시 사이에 만든 리포트는 전날 밤 발표 예보로 작성돼요. 아침 6시가 지나 다시 열면 당일 예보로 자동으로 새로 써드려요.",
  },
  {
    Icon: RefreshCw,
    title: "하루 한 번, 급변하면 다시",
    detail:
      "아침 브리핑은 하루 동안 유지돼요. 비 소식이 생기는 등 날씨가 크게 바뀌면 자동으로 다시 작성해요.",
  },
  {
    Icon: Clock3,
    title: "'기준' 시각은 리포트를 만든 시각",
    detail:
      "리포트 위의 \"7월 20일 (월) 07:30 기준\"처럼 표시되는 시각은 그 리포트를 작성한 시각이에요. 지나간 시간대 카드는 그 시각의 값으로 고정해 보여드려요.",
  },
];

const DataSources = () => {
  const router = useRouter();

  return (
    <div className="page-shell">
      <div className="page-frame pb-8 animate-fade-in">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center gap-2">
            <button
              onClick={() => router.back()}
              className="-ml-2 rounded-full p-2 text-foreground hover:bg-muted"
              aria-label="뒤로가기"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base font-bold tracking-tight">데이터 기준 안내</h1>
          </div>
        </header>

        <main className="container-mobile flex flex-col gap-6 py-5">
          <p className="text-sm leading-[1.6] text-muted-foreground break-keep">
            AiDay는 기상청·에어코리아의 공식 데이터를 아이 기준으로 해석해요. 각 데이터가
            언제 발표되고, 리포트가 어떤 규칙으로 갱신되는지 알려드려요.
          </p>

          <section>
            <h2 className="text-[17px] font-bold tracking-tight">어떤 데이터를 쓰나요</h2>
            <div className="mt-3 divide-y divide-border rounded-2xl bg-card px-4 shadow-soft">
              {sources.map((s) => (
                <div key={s.name} className="flex items-start gap-3 py-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <s.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium leading-snug text-foreground break-keep">
                      {s.name}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-[1.5] text-muted-foreground break-keep">
                      {s.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-[17px] font-bold tracking-tight">리포트는 이렇게 갱신돼요</h2>
            <div className="mt-3 divide-y divide-border rounded-2xl bg-card px-4 shadow-soft">
              {rules.map((r) => (
                <div key={r.title} className="flex items-start gap-3 py-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent">
                    <r.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium leading-snug text-foreground break-keep">
                      {r.title}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-[1.5] text-muted-foreground break-keep">
                      {r.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className="text-[13px] leading-[1.5] text-faint break-keep">
            출처: 기상청 단기예보·생활기상지수·꽃가루 위험지수, 한국환경공단 에어코리아
          </p>
        </main>
      </div>
    </div>
  );
};

export default DataSources;
