"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation"; ;
import {
  Bell,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  Database,
  MapPin,
  FileText,
  MessageCircle,
  LogOut,
  Baby,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import PageHeader, { headerBtn } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChildProfile,
  defaultProfiles,
  loadProfiles,
  removeProfile,
  removeProfileFromDb,
  syncProfilesFromDb,
} from "@/lib/profile";
import { useLocation } from "@/lib/useLocation";
import { supabase } from "@/lib/supabase";
import { normalizeSensitivity } from "@/lib/profile-options";
import FeedbackDialog from "@/components/FeedbackDialog";


const sensitivityLabel: Record<string, string> = {
  "very-much": "매우 많이 탐",
  much: "조금 많이 탐",
  normal: "보통",
  less: "조금 덜 탐",
  "very-less": "매우 덜 탐",
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
  onEdit,
  onDelete,
}: {
  p: ChildProfile;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const conds = (p.conditions || []).filter(Boolean);
  const condStr = conds.length
    ? conds
        .map((c) => (c === "기타" && p.conditionEtc ? `기타(${p.conditionEtc})` : c))
        .join(", ")
    : "-";

  const sched = p.schedule || {};
  const genderStr =
    p.gender === "male" ? "남아" : p.gender === "female" ? "여아" : "";
  const summary = [p.age, genderStr, conds.length ? condStr : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-2xl bg-card p-4 shadow-soft transition-smooth">
      <button onClick={onSelect} className="flex w-full items-center gap-3 text-left">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-avatar text-lg font-bold text-avatar-foreground">
          {p.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[17px] font-bold">{p.name}</p>
            {active && (
              <span className="rounded-full bg-primary-tint px-2 py-0.5 text-[11px] font-semibold text-accent">
                선택됨
              </span>
            )}
          </div>
          <p className="truncate text-[13px] text-muted-foreground">
            {summary || "-"}
          </p>
        </div>
      </button>

      <dl className="mt-3 divide-y divide-border/60 border-t border-border/60 pt-1">
        <InfoRow
          label="민감도"
          value={`추위 ${sensitivityLabel[normalizeSensitivity(p.cold)]} · 더위 ${sensitivityLabel[normalizeSensitivity(p.hot)]}`}
        />
        <InfoRow
          label="등원 · 하원"
          value={
            sched.goSchool || sched.leaveSchool
              ? `${sched.goSchool || "-"} · ${sched.leaveSchool || "-"}`
              : ""
          }
        />
      </dl>

      <div className="mt-3 flex gap-2">
        <button
          onClick={onEdit}
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
  const router = useRouter();
  const pathname = usePathname();
  // 초기값은 SSR 안전한 defaultProfiles로. useState 초기값에서 loadProfiles()·localStorage를
  // 읽으면 서버(기본 프로필)와 클라 첫 렌더(저장 프로필)가 어긋나 하이드레이션 불일치(React #418)가
  // 난다. 저장된 프로필·활성 아이는 아래 마운트 effect에서 주입한다.
  const [profiles, setProfiles] = useState<ChildProfile[]>(defaultProfiles);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { location, requestLocation } = useLocation();
  const [active, setActive] = useState<string>(defaultProfiles[0]?.id ?? "");

  useEffect(() => {
    const list = loadProfiles();
    setProfiles(list);
    try {
      const saved = localStorage.getItem("aiweather:activeProfileId");
      setActive(saved && list.some((p) => p.id === saved) ? saved : list[0]?.id ?? "");
    } catch {
      setActive(list[0]?.id ?? "");
    }
  }, [pathname]);

  // 로그인 상태면 DB 프로필을 localStorage로 복원 (다른 기기·재로그인 대응)
  useEffect(() => {
    syncProfilesFromDb().then((list) => {
      if (!list) return;
      setProfiles(list);
      setActive((prev) => (list.find((p) => p.id === prev) ? prev : list[0]?.id ?? ""));
    });
  }, []);

  const select = (id: string) => {
    setActive(id);
    try { localStorage.setItem("aiweather:activeProfileId", id); } catch {}
    toast.success("프로필이 선택되었어요");
  };

  const del = (id: string) => {
    if (!confirm("이 프로필을 삭제할까요?")) return;
    removeProfile(id);
    removeProfileFromDb(id).catch(() => {}); // 비로그인·데모 프로필이면 조용히 무시
    const next = loadProfiles();
    setProfiles(next);
    if (active === id && next[0]) setActive(next[0].id);
  };

  const logout = async () => {
    if (!confirm("로그아웃할까요?")) return;
    await supabase.auth.signOut();
    // 이 기기에 아이 건강정보를 남기지 않도록 로컬 프로필도 정리
    try {
      localStorage.removeItem("aiweather:profiles");
      localStorage.removeItem("aiweather:activeProfileId");
    } catch {}
    toast.success("로그아웃했어요");
    router.push("/");
  };

  return (
    <div className="page-shell">
      <div className="page-frame pb-24 animate-fade-in">
        <PageHeader
          right={
            // 알림 — 정식 출시 예정. 우상단 점으로 "예정"을 암시하고, 탭하면 예고 안내.
            <button
              onClick={() => toast("기준치 이상 환경 변화 알림은 정식 출시에 추가될 예정이에요")}
              className={`${headerBtn} relative`}
              aria-label="알림 (정식 출시 예정)"
            >
              <Bell className="h-5 w-5" strokeWidth={1.75} />
              <span
                className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
            </button>
          }
        />

        <main className="container-mobile pt-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight">마이페이지</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              온보딩에서 입력한 우리 아이 정보를 확인할 수 있어요
            </p>
          </div>

          <section className="mt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[17px] font-bold tracking-tight">아이 프로필</h2>
              <span className="text-xs text-muted-foreground">{profiles.length}명</span>
            </div>

            <div className="mt-3 space-y-3">
              {profiles.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                  <div className="flex justify-center text-muted-foreground">
                    <Baby size={40} strokeWidth={1.75} aria-hidden="true" />
                  </div>
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
                    onEdit={() => router.push(`/me/edit/${encodeURIComponent(p.id)}`)}
                    onDelete={() => del(p.id)}
                  />
                ))
              )}

              <Button
                onClick={() => router.push("/onboarding")}
                variant="outline"
                size="lg"
                className="h-12 w-full rounded-2xl border-2 border-dashed border-border text-foreground hover:border-primary hover:bg-secondary"
              >
                <Plus className="mr-1.5 h-4 w-4" /> 아이 추가하기
              </Button>
            </div>
          </section>

          <section className="mt-7">
            <h2 className="text-[17px] font-bold tracking-tight">계정</h2>
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl bg-card">
              {([
                { l: "알림 설정", Icon: Bell },
                { l: "위치 설정", Icon: MapPin, action: requestLocation, value: `서울 ${location.gu}` },
                { l: "데이터 기준 안내", Icon: Database, action: () => router.push("/me/data-sources") },
                { l: "약관 및 정책", Icon: FileText, action: () => router.push("/me/policies") },
                { l: "의견 보내기", Icon: MessageSquareText, action: () => setFeedbackOpen(true) },
                { l: "고객 문의", Icon: MessageCircle },
                { l: "로그아웃", Icon: LogOut, action: logout },
              ] as { l: string; Icon: LucideIcon; action?: () => void; value?: string }[]).map((it) => (
                <button
                  key={it.l}
                  onClick={it.action ?? (() => toast(`${it.l}은(는) 준비 중이에요`))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <it.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  <span className="flex-1 text-base font-medium">{it.l}</span>
                  {it.value && <span className="text-sm text-muted-foreground">{it.value}</span>}
                  {!it.action && <ChevronRight className="h-4 w-4 text-faint" />}
                </button>
              ))}
            </div>
          </section>
        </main>

        <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      </div>
    </div>
  );
};

export default My;
