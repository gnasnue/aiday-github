"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  ShieldCheck,
  BookOpen,
  AlertTriangle,
  Info,
  Sun,
  TreeDeciduous,
  Droplet,
  Sparkles,
  Flame,
  Snowflake,
  Activity,
} from "lucide-react";
import LineIcon from "@/components/LineIcon";
import PageHeader from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ChildProfile, defaultProfiles, loadProfiles } from "@/lib/profile";
import { getActiveProfileId } from "@/lib/storage-keys";
import { withSubjectSuffix, withTopicParticle } from "@/lib/korean";
import { useLocation } from "@/lib/useLocation";
import { fetchEnvData, type EnvData } from "@/lib/env-data";
import { selectTips, type SelectedTip } from "@/lib/tips/select";
import { SOURCE_DISCLAIMER, type TipCategory, type TipSource } from "@/lib/tips/content";

/* ----------------------------- 프레젠테이션 매핑 ----------------------------- */
// 아이콘은 화면의 몫이다 — 콘텐츠 테이블(lib/tips/content)은 근거·문구만 갖고,
// 표현은 여기서 붙인다. 그래야 도메인 전문가가 표를 감사할 때 JSX를 안 봐도 된다.
const CATEGORY_ICON: Record<TipCategory, ReactNode> = {
  자외선: <Sun size={20} strokeWidth={1.75} aria-hidden />,
  미세먼지: <LineIcon name="mask" size={20} strokeWidth={1.75} />,
  꽃가루: <TreeDeciduous size={20} strokeWidth={1.75} aria-hidden />,
  건조: <Droplet size={20} strokeWidth={1.75} aria-hidden />,
  폭염: <Flame size={20} strokeWidth={1.75} aria-hidden />,
  한파: <Snowflake size={20} strokeWidth={1.75} aria-hidden />,
  감염병: <Activity size={20} strokeWidth={1.75} aria-hidden />,
  일반: <Sparkles size={20} strokeWidth={1.75} aria-hidden />,
};

// v3: 상태 배지는 solid 채움 금지 — 상태색 틴트 배경 + 상태색 텍스트
// (브랜드 오렌지는 상태 표현에 쓰지 않는다)
const sevTone = (s: SelectedTip["severity"]) =>
  s === "경고"
    ? "bg-destructive/10 text-destructive"
    : s === "주의"
      ? "bg-status-warn-bg text-status-warn"
      : "bg-status-info-bg text-status-info";

const SIGNAL_LABEL: Record<string, string> = {
  uv: "자외선",
  air: "대기질",
  pollen: "꽃가루",
  humidity: "습도",
  heat: "폭염",
  cold: "한파",
};

const sourceLine = (s: TipSource) =>
  `${s.org} ${s.docTitle}${s.pubYear ? ` (${s.pubYear})` : ""}`;

/* ----------------------------- page ----------------------------- */
const Tips = () => {
  const router = useRouter();
  // 초기값은 SSR 안전한 defaultProfiles로. useState 초기값·렌더 중 localStorage를 읽으면
  // 서버(기본 프로필)와 클라 첫 렌더(저장 프로필)가 어긋나 하이드레이션 불일치(React #418)가 난다.
  const [profiles, setProfiles] = useState<ChildProfile[]>(defaultProfiles);
  const [activeId, setActiveId] = useState<string | undefined>(defaultProfiles[0]?.id);
  useEffect(() => {
    const list = loadProfiles();
    setProfiles(list);
    try {
      const saved = getActiveProfileId();
      setActiveId(saved && list.some((p) => p.id === saved) ? saved : list[0]?.id);
    } catch {
      setActiveId(list[0]?.id);
    }
  }, []);
  const cur = profiles.find((p) => p.id === activeId) ?? profiles[0];

  const { location } = useLocation();
  const [env, setEnv] = useState<EnvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"전체" | TipCategory>("전체");

  // 위치는 원시값으로 분해 — useLocation이 동기화마다 새 객체를 만들어 객체 그대로
  // 의존하면 값이 같아도 재조회가 돈다.
  const { gu, lat, lon, station } = location;
  useEffect(() => {
    // 화면 이탈·기준지 변경 시 진행 중 요청을 끊는다 — 늦게 도착한 이전 응답이
    // 다른 기준지의 팁으로 섞이지 않게.
    const ac = new AbortController();
    setLoading(true);
    fetchEnvData({ gu, lat, lon, station }, { signal: ac.signal })
      .then((data) => {
        if (ac.signal.aborted) return;
        setEnv(data);
        setLoading(false);
      })
      .catch(() => {
        // fetchEnvData는 개별 실패를 결측으로 수렴시키지만, 예기치 못한 throw에도
        // 스켈레톤이 영구 정지하지 않게 한다. env가 null이면 상시 팁만 남는다.
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [gu, lat, lon, station]);

  const { tips, suppressedSignals, calmSignals } = useMemo(
    () =>
      selectTips(env, cur ? { name: cur.name, conditions: cur.conditions, age: cur.age, birth: cur.birth } : null),
    [env, cur]
  );

  const filtered = filter === "전체" ? tips : tips.filter((t) => t.category === filter);
  const categories: ("전체" | TipCategory)[] = [
    "전체",
    ...Array.from(new Set(tips.map((t) => t.category))),
  ];

  // 하단 기준 표기는 실제로 노출된 출처에서 만든다 — 손으로 적은 기관 목록은
  // 콘텐츠가 바뀌어도 그대로 남아, 쓰지도 않은 기관을 근거로 내세우게 된다.
  const citedOrgs = Array.from(new Set(tips.flatMap((t) => t.sources.map((s) => s.org))));

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
        {/* Header */}
        <PageHeader
          right={
            <div className="flex items-center gap-1.5 rounded-full bg-primary-tint px-2.5 py-1 text-xs font-medium text-accent">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
              근거 기반
            </div>
          }
        />

        <main className="container-mobile pt-5">
          <h1 className="text-xl font-bold tracking-tight">건강팁</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            공공기관·의료학회가 공개한 가이드를 오늘 환경에 맞춰 골라 보여드려요.
          </p>

          {/* Profile context */}
          {cur && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-card p-3 text-sm shadow-soft">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-avatar text-lg font-bold text-avatar-foreground">
                {cur.name.charAt(0)}
              </span>
              <div className="flex-1">
                <p className="font-semibold text-foreground">
                  {withSubjectSuffix(cur.name)} 위한 오늘의 가이드
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {cur.conditions?.length
                    ? cur.conditions.join(" · ")
                    : "건강 정보가 등록되지 않았어요"}
                </p>
              </div>
              <button
                onClick={() => router.push("/me")}
                className="text-xs font-medium text-accent hover:underline"
              >
                수정
              </button>
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="leading-relaxed">
              본 정보는 일반적 건강 정보이며 진료를 대체하지 않습니다. 증상이 지속되거나 심한
              경우 의료기관 진료를 권장합니다.
            </p>
          </div>

          {/* Category filter */}
          <div className="mt-4 -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-[13px] transition-smooth ${
                  filter === c
                    ? "bg-primary-tint font-semibold text-accent"
                    : "bg-card font-medium text-muted-foreground shadow-soft"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Tip cards */}
          <section className="mt-5 space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-2xl" />
              ))
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                해당 카테고리의 가이드가 없어요
              </div>
            ) : (
              filtered.map((tip) => (
                <article key={tip.id} className="rounded-2xl bg-card p-4 shadow-soft">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${sevTone(tip.severity)}`}
                      >
                        {CATEGORY_ICON[tip.category]}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                        {tip.category}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${sevTone(tip.severity)}`}
                    >
                      {tip.severity}
                    </span>
                  </div>

                  <h3 className="mt-3 text-[16px] font-bold leading-snug text-foreground">
                    {tip.title}
                  </h3>

                  {tip.matchedProfile && (
                    <p className="mt-1.5 inline-block rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      내 아이 프로필 매칭: {tip.matchedProfile}
                    </p>
                  )}

                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {tip.summary}
                  </p>

                  <ul className="mt-3 space-y-1.5">
                    {tip.recommendations.map((r, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
                      >
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 border-t border-border pt-3">
                    <p className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" />
                      출처
                    </p>
                    <ul className="mt-1 divide-y divide-border">
                      {tip.sources.map((s) => (
                        <li key={s.url + s.docTitle}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex min-h-[44px] items-center gap-2 py-1.5 text-[13px] text-foreground hover:text-accent hover:underline"
                          >
                            <span className="flex-1 leading-snug">{sourceLine(s)}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      {SOURCE_DISCLAIMER}
                    </p>
                  </div>
                </article>
              ))
            )}
          </section>

          {/* 안심 안내 — 조용한 이유를 밝히지 않으면 정상 동작이 고장으로 읽힌다.
              무엇을 확인했는지까지 말해야 "확인해봤는데 괜찮다"가 된다. */}
          {!loading && calmSignals.length > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-status-good-bg p-3 text-xs text-status-good">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="leading-relaxed">
                오늘{" "}
                {withTopicParticle(
                  calmSignals.map((s) => SIGNAL_LABEL[s] ?? s).join(" · ")
                )}{" "}
                주의 수준이 아니에요.
              </p>
            </div>
          )}

          {/* 결측 안내 — 모르는 것에 대해서는 팁을 만들지 않는다는 사실을 감춘 채
              카드 수만 줄이면, 사용자는 "오늘은 주의할 게 없구나"로 잘못 읽는다. */}
          {!loading && suppressedSignals.length > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="leading-relaxed">
                {suppressedSignals.map((s) => SIGNAL_LABEL[s] ?? s).join(" · ")} 정보를 지금
                불러오지 못해 관련 가이드는 빼고 보여드려요. 잠시 후 다시 확인해 주세요.
              </p>
            </div>
          )}

          {/* Footer note — 실제 인용한 기관만 */}
          {!loading && citedOrgs.length > 0 && (
            <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              가이드 기준: {citedOrgs.join(", ")}
            </p>
          )}
        </main>
      </div>
    </div>
  );
};

export default Tips;
