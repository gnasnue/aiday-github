"use client";

/**
 * 홈 하단 "오늘의 건강 팁" — 근거 있는 관리 가이드로의 진입.
 *
 * 왜 홈인가(2026-07-28 결정): 건강팁 탭을 없애고 '하루' 탭을 넣으면서, 팁 콘텐츠는
 * env로 옮기는 안과 홈 하단에 두는 안을 비교했다. env는 `야외활동 지수 → 지금 지표 →
 * 주간 → 주말 나들이`로 흐름이 짜여 있어 관리 가이드가 어디 끼어도 맥락이 끊겼다.
 * 홈 하단은 오늘의 정보 계열(판단 → 환경 → 케어)의 마지막 자리라 자연스럽다.
 *
 * 중복을 만들지 않는 방법: 홈에는 **제목 + 출처만** 리스트 행으로 두고 처방 본문은
 * 시트에서만 편다. AI 리포트는 "오늘 이 아이의 행동"을, 이 섹션은 "출처 있는 관리
 * 지식"을 말하므로 역할이 겹치지 않는다 — 홈에 처방 본문까지 두면 히어로와 같은 말을
 * 두 번 하게 된다(v30에서 히어로 내부 반복을 걷어낸 것과 같은 계열의 문제).
 *
 * 데이터: 홈이 이미 들고 있는 env 원시값을 EnvData 형태로 어댑트해 selectTips에 넘긴다 —
 * 재페치하지 않는다. 팁 판정이 홈과 /tips 화면에서 다른 값을 보면 안 되기 때문.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, ExternalLink, ShieldCheck, X } from "lucide-react";
import { selectTips, type SelectedTip } from "@/lib/tips/select";
import { SOURCE_DISCLAIMER, type TipSource } from "@/lib/tips/content";
import type { EnvData } from "@/lib/env-data";
import type { ChildProfile } from "@/lib/profile";

/** 홈에 노출할 최대 개수 — 더 많으면 홈이 팁 목록 화면이 된다 */
const HOME_TIP_MAX = 2;

const sourceLine = (s: TipSource) =>
  `${s.org} ${s.docTitle}${s.pubYear ? ` (${s.pubYear})` : ""}`;

const HomeHealthTips = ({
  env,
  child,
}: {
  env: EnvData | null;
  child: ChildProfile | null;
}) => {
  const router = useRouter();
  const [open, setOpen] = useState<SelectedTip | null>(null);

  // 심각도 높은 순으로 최대 2개. 환경 신호가 없는 상시 팁("손씻기" 등)은 홈에 올리지
  // 않는다 — 오늘과 무관한 당연한 이야기가 홈을 차지하면 안 된다.
  const tips = useMemo(() => {
    if (!env || !child) return [];
    const { tips: all } = selectTips(env, {
      name: child.name,
      conditions: child.conditions,
      age: child.age,
      birth: child.birth,
    });
    const rank = { 경고: 0, 주의: 1, 정보: 2 } as const;
    return all
      .filter((t) => t.category !== "일반")
      .sort((a, b) => rank[a.severity] - rank[b.severity])
      .slice(0, HOME_TIP_MAX);
  }, [env, child]);

  // 오늘 관련 있는 팁이 없으면 섹션 자체를 그리지 않는다 — 홈에 안심 배너를 얹지 않는다
  // (그 역할은 /tips 화면이 한다. 홈은 판단 화면이라 여백이 더 값지다).
  if (tips.length === 0) return null;

  return (
    <>
      <section className="mt-8">
        <h2 className="scroll-mt-14 text-[17px] font-bold tracking-[-0.01em]">오늘의 건강 팁</h2>
        <div className="mt-4 divide-y divide-border rounded-2xl bg-card shadow-soft">
          {tips.map((tip) => (
            <button
              key={tip.id}
              onClick={() => setOpen(tip)}
              className="flex min-h-[64px] w-full items-center gap-3 px-5 py-3.5 text-left transition-smooth active:bg-muted/60"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                aria-hidden="true"
              >
                <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium text-foreground break-keep">
                  {tip.title}
                </span>
                {/* 출처는 신뢰 신호라 잘라내지 않는다 — 2줄까지 허용(기관명+문서명이 길다) */}
                <span className="mt-0.5 block text-[12px] leading-[1.45] text-faint line-clamp-2 break-keep">
                  {tip.sources[0] ? `${tip.sources[0].org} ${tip.sources[0].docTitle}` : ""}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-faint" strokeWidth={2} />
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[12px] leading-[1.6] text-muted-foreground break-keep">
          공공기관·의료학회가 공개한 가이드를 오늘 환경에 맞춰 골라 보여드려요.
        </p>
      </section>

      {/* 상세 시트 — 처방 본문·출처는 여기서만 편다 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30"
          onClick={() => setOpen(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-[390px] overflow-y-auto rounded-t-3xl bg-card p-5 pb-8 shadow-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={open.title}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
                {open.severity !== "정보" && (
                  <span
                    className={`h-[5px] w-[5px] shrink-0 rounded-full ${
                      open.severity === "경고" ? "bg-status-bad" : "bg-status-warn"
                    }`}
                    aria-hidden="true"
                  />
                )}
                {open.category} · {open.severity}
              </span>
              <button
                onClick={() => setOpen(null)}
                aria-label="닫기"
                className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>

            <h3 className="mt-3 text-[20px] font-bold leading-[1.35] tracking-[-0.01em] break-keep">
              {open.title}
            </h3>
            {open.matchedProfile && (
              <p className="mt-2 inline-block rounded-md bg-primary-tint px-2 py-1 text-[12px] font-semibold text-accent">
                우리 아이 매칭: {open.matchedProfile}
              </p>
            )}
            <p className="mt-2.5 text-[15px] leading-[1.66] text-muted-foreground break-keep">
              {open.summary}
            </p>

            <ul className="mt-4 space-y-2">
              {open.recommendations.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[15px] leading-[1.6] text-foreground break-keep"
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                  <span>{r}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 border-t border-border pt-4">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                출처
              </p>
              <ul className="mt-1.5 space-y-1">
                {open.sources.map((s) => (
                  <li key={s.url + s.docTitle}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-11 items-center gap-2 text-[13px] leading-[1.5] text-foreground hover:text-accent"
                    >
                      <span className="flex-1 break-keep">
                        {sourceLine(s)} · {s.retrievedDate} 확인
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-[1.6] text-muted-foreground break-keep">
                {SOURCE_DISCLAIMER}
              </p>
            </div>

            <button
              onClick={() => router.push("/tips")}
              className="mt-5 flex min-h-12 w-full items-center justify-between rounded-[14px] bg-muted px-4 text-left"
            >
              <span className="text-[14px] font-semibold text-foreground">
                근거 기반 가이드 모두 보기
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-faint" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default HomeHealthTips;
