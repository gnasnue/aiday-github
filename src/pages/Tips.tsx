import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, ShieldCheck, BookOpen, AlertTriangle } from "lucide-react";
import Logo from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ChildProfile, loadProfiles } from "@/lib/profile";
import { withSubjectSuffix } from "@/lib/korean";

/* ----------------------------- mock env (shared assumption) ----------------------------- */
const env = {
  uv: 7, // 0-10+
  pm10: 62,
  pm25: 28,
  humidity: 38, // %
  pollenTop: { name: "참나무", level: "매우높음", score: 4 },
  temp: 18,
};

/* ----------------------------- types ----------------------------- */
type Source = { label: string; url: string };
type Tip = {
  id: string;
  category: "자외선" | "미세먼지" | "꽃가루" | "건조" | "기온" | "일반";
  severity: "주의" | "경고" | "정보";
  icon: string;
  title: string;
  summary: string;
  recommendations: string[];
  sources: Source[];
  matchedProfile?: string; // why this is shown for this child
};

/* ----------------------------- nav ----------------------------- */
const navItems = [
  { icon: "🏠", label: "홈", to: "/home" },
  { icon: "📊", label: "환경정보", to: "/env" },
  { icon: "👕", label: "옷차림", to: "/outfit" },
  { icon: "💊", label: "건강팁", to: "/tips" },
  { icon: "👤", label: "마이", to: "/me" },
];

const sevStyle = (s: Tip["severity"]) =>
  s === "경고"
    ? "border-destructive/30 bg-destructive/5"
    : s === "주의"
      ? "border-accent/30 bg-accent/5"
      : "border-primary/30 bg-secondary/40";

const sevBadge = (s: Tip["severity"]) =>
  s === "경고"
    ? "bg-destructive text-destructive-foreground"
    : s === "주의"
      ? "bg-accent text-accent-foreground"
      : "bg-primary text-primary-foreground";

/* ----------------------------- page ----------------------------- */
const Tips = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [profiles] = useState<ChildProfile[]>(() => loadProfiles());
  const activeId = (() => {
    try {
      return localStorage.getItem("aiweather:activeProfileId") || profiles[0]?.id;
    } catch {
      return profiles[0]?.id;
    }
  })();
  const cur = profiles.find((p) => p.id === activeId) ?? profiles[0];
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"전체" | Tip["category"]>("전체");

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, []);

  const tips = useMemo<Tip[]>(() => {
    const conds = cur?.conditions ?? [];
    const hasResp = conds.some((c) => c.includes("호흡기"));
    const hasAllergy = conds.some((c) => c.includes("알레르기"));
    const hasSkin = conds.some((c) => c.includes("피부"));
    const list: Tip[] = [];

    /* ===== 자외선 ===== */
    if (env.uv >= 6) {
      list.push({
        id: "uv-high",
        category: "자외선",
        severity: env.uv >= 8 ? "경고" : "주의",
        icon: "☀️",
        title: `자외선 ${env.uv >= 8 ? "매우 높음" : "높음"} — 영유아 피부 보호 필수`,
        summary:
          "영유아 피부는 멜라닌 색소가 적어 성인보다 자외선 손상에 취약합니다. UV 지수 6 이상에서는 적극적 차단이 필요합니다.",
        recommendations: [
          "외출 15~30분 전 SPF 30+ / PA++ 이상 자외선차단제 도포 (생후 6개월 이상)",
          "2~3시간마다 또는 땀·물놀이 후 재도포",
          "챙 넓은 모자(7cm 이상) + UV 차단 선글라스 착용",
          "자외선 강한 시간대(10~15시) 그늘·실내 활동 권장",
          "긴소매 UV 차단 의류로 물리적 차단 병행",
        ],
        sources: [
          { label: "대한피부과학회 — 자외선차단제 가이드", url: "https://www.derma.or.kr/" },
          {
            label: "대한소아청소년과학회 — 영유아 피부 관리",
            url: "https://www.pediatrics.or.kr/",
          },
          { label: "질병관리청 — 자외선 건강수칙", url: "https://www.kdca.go.kr/" },
        ],
      });
    }

    /* ===== 미세먼지 ===== */
    if (env.pm10 >= 50 || env.pm25 >= 25) {
      const bad = env.pm10 >= 80 || env.pm25 >= 35;
      list.push({
        id: "pm-high",
        category: "미세먼지",
        severity: bad ? "경고" : "주의",
        icon: "😷",
        title: `미세먼지 ${bad ? "나쁨" : "보통~주의"} — 호흡기 보호 가이드`,
        summary:
          "초미세먼지(PM2.5)는 폐포·혈관까지 침투해 소아 천식·알레르기성 비염을 악화시킬 수 있습니다. 어린이는 호흡량이 많아 더 큰 영향을 받습니다.",
        recommendations: [
          "외출 시 KF80 이상 보건용 마스크 착용 (만 2세 이상 권장)",
          "장시간 야외활동·격렬한 운동 자제",
          "외출 후 손·얼굴 세안, 코 세척(생리식염수)으로 점막 자극 완화",
          "실내 환기는 최소화, 공기청정기 가동 권장",
          "수분 섭취 충분히 — 점막 건조 방지",
        ],
        sources: [
          {
            label: "대한소아알레르기호흡기학회 — 미세먼지 가이드",
            url: "https://www.kapard.or.kr/",
          },
          { label: "대한이비인후과학회 — 비강 관리", url: "https://www.korl.or.kr/" },
          { label: "환경부 에어코리아 — 행동요령", url: "https://www.airkorea.or.kr/" },
        ],
        matchedProfile: hasResp ? "비염·천식 등 호흡기 민감" : undefined,
      });
    }

    /* ===== 꽃가루 (프로파일 기반 경고) ===== */
    if (env.pollenTop.score >= 3) {
      const personal = hasAllergy || hasResp;
      list.push({
        id: "pollen-high",
        category: "꽃가루",
        severity: personal ? "경고" : "주의",
        icon: "🌳",
        title: `${env.pollenTop.name} 꽃가루 ${env.pollenTop.level}${
          personal ? " — 알레르기 아동 주의" : ""
        }`,
        summary: personal
          ? `${cur?.name ?? "아이"}의 알레르기·호흡기 민감 정보를 반영했습니다. 수목 꽃가루(특히 참나무·자작나무)는 봄철 소아 알레르기 비염·결막염의 주요 유발 항원입니다.`
          : "수목 꽃가루는 봄철 알레르기 비염·결막염을 유발할 수 있습니다.",
        recommendations: [
          "꽃가루 농도 높은 오전 5~10시 외출 자제",
          "외출 시 모자·마스크·보안경 또는 선글라스 착용",
          "귀가 즉시 옷 털기 → 샤워 → 코·눈 세척",
          "창문 닫고 빨래는 실내 건조 권장",
          personal
            ? "처방받은 항히스타민제·비강 스프레이 미리 복용 (담당의 상담)"
            : "증상 발생 시 소아청소년과·이비인후과 진료",
        ],
        sources: [
          {
            label: "대한소아알레르기호흡기학회 — 꽃가루 알레르기",
            url: "https://www.kapard.or.kr/",
          },
          { label: "대한천식알레르기학회", url: "https://www.allergy.or.kr/" },
          {
            label: "기상청 생활기상지수 — 꽃가루 농도",
            url: "https://www.weather.go.kr/w/forecast/life/life-weather-index.do?tabIndex=4",
          },
        ],
        matchedProfile: personal ? "알레르기 체질 / 호흡기 민감" : undefined,
      });
    }

    /* ===== 건조 (피부 프로파일 기반) ===== */
    if (env.humidity <= 40) {
      const skinFocus = hasSkin;
      list.push({
        id: "dry-skin",
        category: "건조",
        severity: skinFocus ? "경고" : "정보",
        icon: "💧",
        title: `습도 ${env.humidity}% — ${
          skinFocus ? "민감·아토피 피부 집중 케어" : "건조 환경 보습 가이드"
        }`,
        summary: skinFocus
          ? `${cur?.name ?? "아이"}의 민감·아토피 피부 정보를 반영했습니다. 습도 40% 이하에서는 경피수분손실(TEWL)이 증가해 아토피 피부염이 악화될 수 있습니다.`
          : "건조한 환경은 피부 장벽을 약화시키고 호흡기 점막을 자극할 수 있습니다.",
        recommendations: [
          "목욕은 미온수(36~38℃)로 10분 이내, 약산성·무향 세정제 사용",
          "목욕 후 3분 이내 보습제 도포(세라마이드·판테놀 함유 권장)",
          "하루 2회 이상 보습제 충분량 도포 (FTU 단위 참고)",
          "실내 습도 40~60% 유지 — 가습기 또는 젖은 빨래 활용",
          skinFocus
            ? "악화 시 자가 스테로이드 사용 금지, 소아청소년과·피부과 상담"
            : "수분 섭취 늘리고 카페인·과한 난방 자제",
        ],
        sources: [
          {
            label: "대한피부과학회 — 아토피피부염 진료지침",
            url: "https://www.derma.or.kr/",
          },
          {
            label: "대한소아청소년과학회 — 영유아 피부 관리",
            url: "https://www.pediatrics.or.kr/",
          },
          { label: "보건복지부 — 아토피 정보", url: "https://www.mohw.go.kr/" },
        ],
        matchedProfile: skinFocus ? "민감 피부 / 아토피" : undefined,
      });
    }

    /* ===== 일반: 손씻기 / 수분 ===== */
    list.push({
      id: "general-hygiene",
      category: "일반",
      severity: "정보",
      icon: "🧼",
      title: "환절기 기본 위생 — 손씻기 30초",
      summary:
        "환절기에는 호흡기 바이러스 전파가 증가합니다. 손씻기는 가장 효과적인 비약물적 예방법으로 알려져 있습니다.",
      recommendations: [
        "외출 후·식사 전·기침 후 비누로 30초 이상 손씻기",
        "기침은 옷소매 안쪽으로",
        "수면 9~11시간 충분히 — 면역력 유지",
        "예방접종 일정 확인",
      ],
      sources: [
        { label: "질병관리청 — 감염병 예방수칙", url: "https://www.kdca.go.kr/" },
        {
          label: "대한소아청소년과학회 — 예방접종",
          url: "https://www.pediatrics.or.kr/",
        },
      ],
    });

    return list;
  }, [cur]);

  const filtered = filter === "전체" ? tips : tips.filter((t) => t.category === filter);
  const categories: ("전체" | Tip["category"])[] = [
    "전체",
    ...Array.from(new Set(tips.map((t) => t.category))),
  ];

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(-1)}
                className="rounded-full p-2 text-foreground hover:bg-muted"
                aria-label="뒤로가기"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Logo />
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-accent">
              <ShieldCheck className="h-3.5 w-3.5" />
              근거 기반
            </div>
          </div>
        </header>

        <main className="container-mobile pt-5">
          <h1 className="text-xl font-bold tracking-tight">건강팁</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            대학병원·의료학회·보건복지부 등 의학적 근거 기반 가이드를 제공합니다.
          </p>

          {/* Profile context */}
          {cur && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-card p-3 text-sm shadow-soft">
              <span className="text-2xl">{cur.emoji}</span>
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
                onClick={() => navigate("/me")}
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
                className={`shrink-0 rounded-full border-2 px-3.5 py-1.5 text-xs font-medium transition-smooth ${
                  filter === c
                    ? "border-primary bg-secondary text-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Tip cards */}
          <section className="mt-5 space-y-3">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 w-full rounded-2xl" />
                ))
              : filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                    해당 카테고리의 가이드가 없어요
                  </div>
                ) : (
                  filtered.map((tip) => (
                    <article
                      key={tip.id}
                      className={`rounded-2xl border p-4 shadow-soft ${sevStyle(tip.severity)}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tip.icon}</span>
                          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            {tip.category}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sevBadge(
                            tip.severity
                          )}`}
                        >
                          {tip.severity}
                        </span>
                      </div>

                      <h3 className="mt-3 text-sm font-bold leading-snug text-foreground">
                        {tip.title}
                      </h3>

                      {tip.matchedProfile && (
                        <p className="mt-1.5 inline-block rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                          내 아이 프로필 매칭: {tip.matchedProfile}
                        </p>
                      )}

                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {tip.summary}
                      </p>

                      <ul className="mt-3 space-y-1.5">
                        {tip.recommendations.map((r, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-xs leading-relaxed text-foreground"
                          >
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 rounded-xl bg-background/70 p-2.5">
                        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          <BookOpen className="h-3 w-3" />
                          출처
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {tip.sources.map((s) => (
                            <li key={s.url}>
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-[11px] text-foreground hover:text-accent hover:underline"
                              >
                                <span className="flex-1">{s.label}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  ))
                )}
          </section>

          {/* Footer note */}
          <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            가이드 기준: 대한소아청소년과학회, 대한피부과학회,
            <br />
            대한이비인후과학회, 대한소아알레르기호흡기학회,
            <br />
            질병관리청, 보건복지부, 환경부 에어코리아
          </p>
        </main>
      </div>
    </div>
  );
};

export default Tips;
