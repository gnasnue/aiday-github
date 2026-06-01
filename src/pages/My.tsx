import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Settings, Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChildProfile,
  loadProfiles,
  removeProfile,
} from "@/lib/profile";


const sensitivityLabel: Record<string, string> = {
  "very-much": "매우 많이 탐",
  much: "조금 많이 탐",
  normal: "보통",
  less: "조금 덜 탐",
  "very-less": "매우 덜 탐",
};
const sweatLabel: Record<string, string> = {
  "very-much": "매우 많음",
  much: "조금 많음",
  normal: "보통",
  less: "적은 편",
};

const InfoRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="flex items-baseline justify-between gap-3 py-2">
    <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
    <dd className="text-right text-sm font-medium text-foreground">
      {value && value.length > 0 ? value : "-"}
    </dd>
  </div>
);

const ProfileCard = ({
  p,
  active,
  onSelect,
  onDelete,
}: {
  p: ChildProfile;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) => {
  const birth = p.birth?.year
    ? `${p.birth.year}.${p.birth.month}.${p.birth.day}`
    : "";
  const conds = (p.conditions || []).filter(Boolean);
  const condStr = conds.length
    ? conds
        .map((c) => (c === "기타" && p.conditionEtc ? `기타(${p.conditionEtc})` : c))
        .join(", ")
    : "-";

  const sched = p.schedule || {};
  const range = (a?: string, b?: string) =>
    a && b ? `${a} ~ ${b}` : a || b || "";

  return (
    <article
      className={`rounded-2xl border bg-card p-4 shadow-soft transition-smooth ${
        active ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <button onClick={onSelect} className="flex w-full items-center gap-3 text-left">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-2xl">
          {p.emoji}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-base font-bold">{p.name}</p>
            {active && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                선택됨
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {p.age || "-"} · {p.gender === "male" ? "남아" : p.gender === "female" ? "여아" : "선택 안 함"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>

      <dl className="mt-3 divide-y divide-border/60 border-t border-border/60 pt-1">
        <InfoRow label="생년월일" value={birth} />
        <InfoRow label="건강 정보" value={condStr} />
        <InfoRow label="추위 민감도" value={sensitivityLabel[p.cold || ""]} />
        <InfoRow label="더위 민감도" value={sensitivityLabel[p.hot || ""]} />
        <InfoRow label="땀 분비" value={sweatLabel[p.sweat || ""]} />
        <InfoRow label="등원 시간" value={sched.goSchool} />
        <InfoRow label="야외활동" value={range(sched.outdoorStart, sched.outdoorEnd)} />
        <InfoRow label="하원 시간" value={sched.leaveSchool} />
        <InfoRow label="저녁 야외활동" value={range(sched.eveningStart, sched.eveningEnd)} />
      </dl>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => toast("프로필 편집은 준비 중이에요")}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-xs font-medium text-foreground hover:bg-muted"
        >
          <Pencil className="h-3.5 w-3.5" /> 편집
        </button>
        <button
          onClick={onDelete}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-accent"
          aria-label="삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
};

const My = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [profiles, setProfiles] = useState<ChildProfile[]>(() => loadProfiles());
  const [active, setActive] = useState<string>(() => {
    try {
      return (
        localStorage.getItem("aiweather:activeProfileId") ||
        loadProfiles()[0]?.id ||
        ""
      );
    } catch {
      return loadProfiles()[0]?.id || "";
    }
  });

  useEffect(() => {
    setProfiles(loadProfiles());
  }, [location.key]);

  const select = (id: string) => {
    setActive(id);
    try { localStorage.setItem("aiweather:activeProfileId", id); } catch {}
    toast.success("프로필이 선택되었어요");
  };

  const del = (id: string) => {
    if (!confirm("이 프로필을 삭제할까요?")) return;
    removeProfile(id);
    const next = loadProfiles();
    setProfiles(next);
    if (active === id && next[0]) setActive(next[0].id);
  };

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center justify-between">
            <Logo />
            <div className="flex items-center gap-1">
              <button
                onClick={() => toast("새 알림이 없어요")}
                className="rounded-full p-2 text-foreground hover:bg-muted"
                aria-label="알림"
              >
                <Bell className="h-5 w-5" />
              </button>
              <button
                onClick={() => toast("설정 페이지는 준비 중이에요")}
                className="rounded-full p-2 text-foreground hover:bg-muted"
                aria-label="설정"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="container-mobile pt-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight">마이페이지</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              온보딩에서 입력한 우리 아이 정보를 확인할 수 있어요
            </p>
          </div>

          <section className="mt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">아이 프로필</h2>
              <span className="text-xs text-muted-foreground">{profiles.length}명</span>
            </div>

            <div className="mt-3 space-y-3">
              {profiles.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                  <div className="text-4xl">👶</div>
                  <p className="mt-3 text-sm text-foreground">등록된 아이가 없어요</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    온보딩으로 우리 아이 정보를 등록해주세요
                  </p>
                </div>
              ) : (
                profiles.map((p) => (
                  <ProfileCard
                    key={p.id}
                    p={p}
                    active={p.id === active}
                    onSelect={() => select(p.id)}
                    onDelete={() => del(p.id)}
                  />
                ))
              )}

              <Button
                onClick={() => navigate("/onboarding")}
                variant="outline"
                size="lg"
                className="h-12 w-full border-2 border-dashed border-border text-foreground hover:border-primary hover:bg-secondary"
              >
                <Plus className="mr-1.5 h-4 w-4" /> 아이 추가하기
              </Button>
            </div>
          </section>

          <section className="mt-7">
            <h2 className="text-base font-bold">계정</h2>
            <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
              {[
                { l: "알림 설정", e: "🔔" },
                { l: "위치 설정", e: "📍" },
                { l: "약관 및 정책", e: "📄" },
                { l: "고객 문의", e: "💬" },
                { l: "로그아웃", e: "🚪" },
              ].map((it) => (
                <button
                  key={it.l}
                  onClick={() => toast(`${it.l}은(는) 준비 중이에요`)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm hover:bg-muted/50"
                >
                  <span className="text-base">{it.e}</span>
                  <span className="flex-1">{it.l}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default My;
