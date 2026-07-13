"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChildProfile,
  Gender,
  SaveProfileResult,
  calcAge,
  genderToEmoji,
  loadProfiles,
  saveProfiles,
  saveProfileToDb,
} from "@/lib/profile";
import {
  conditions,
  sensitivity,
  sweatLevels,
  halfHour,
  normalizeConditions,
  normalizeSensitivity,
  normalizeSweat,
} from "@/lib/profile-options";

type FormState = {
  name: string;
  year: string;
  month: string;
  day: string;
  gender: Gender;
  conds: string[];
  condEtc: string;
  cold: string;
  hot: string;
  sweat: string;
  goSchool: string;
  outdoorStart: string;
  outdoorEnd: string;
  leaveSchool: string;
  eveningStart: string;
  eveningEnd: string;
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-soft">
    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    <div className="mt-3 space-y-3">{children}</div>
  </section>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-1.5 text-sm text-muted-foreground">{label}</p>
    {children}
  </div>
);

const EditProfile = () => {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [original, setOriginal] = useState<ChildProfile | null>(null);
  const [f, setF] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = decodeURIComponent(params.id ?? "");
    const found = loadProfiles().find((p) => p.id === id);
    if (!found) {
      toast.error("프로필을 찾을 수 없어요");
      router.replace("/me");
      return;
    }
    setOriginal(found);
    const { conds, etc } = normalizeConditions(found.conditions);
    setF({
      name: found.name,
      year: found.birth?.year ?? "",
      month: found.birth?.month ?? "",
      day: found.birth?.day ?? "",
      gender: found.gender,
      conds: etc.length && !conds.includes("기타") ? [...conds, "기타"] : conds,
      condEtc: found.conditionEtc || etc.join(", "),
      cold: normalizeSensitivity(found.cold),
      hot: normalizeSensitivity(found.hot),
      sweat: normalizeSweat(found.sweat),
      goSchool: found.schedule?.goSchool ?? "",
      outdoorStart: found.schedule?.outdoorStart ?? "",
      outdoorEnd: found.schedule?.outdoorEnd ?? "",
      leaveSchool: found.schedule?.leaveSchool ?? "",
      eveningStart: found.schedule?.eveningStart ?? "",
      eveningEnd: found.schedule?.eveningEnd ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!original || !f) return null;

  const update = (patch: Partial<FormState>) =>
    setF((prev) => (prev ? { ...prev, ...patch } : prev));
  const toggleCond = (c: string) =>
    update({ conds: f.conds.includes(c) ? f.conds.filter((x) => x !== c) : [...f.conds, c] });

  const save = async () => {
    if (!f.name.trim()) return toast.error("아이 이름을 입력해주세요");
    if (!f.year || !f.month || !f.day) return toast.error("생년월일을 모두 선택해주세요");
    if (f.conds.length === 0) return toast.error("건강 정보를 하나 이상 선택해주세요 (없으면 '해당없음')");
    if (!f.cold || !f.hot || !f.sweat) return toast.error("추위·더위·땀 세 항목을 모두 선택해주세요");

    const updated: ChildProfile = {
      ...original,
      name: f.name.trim(),
      emoji: genderToEmoji(f.gender),
      age: calcAge(f.year),
      gender: f.gender,
      birth: { year: f.year, month: f.month, day: f.day },
      conditions: f.conds,
      conditionEtc: f.conds.includes("기타") ? f.condEtc : "",
      cold: f.cold,
      hot: f.hot,
      sweat: f.sweat,
      schedule: {
        goSchool: f.goSchool,
        outdoorStart: f.outdoorStart,
        outdoorEnd: f.outdoorEnd,
        leaveSchool: f.leaveSchool,
        eveningStart: f.eveningStart,
        eveningEnd: f.eveningEnd,
      },
    };

    setSaving(true);
    // 편집 대상만 갈아끼운 전체 목록을 저장 — 다른 프로필(데모 포함) 유실 방지
    saveProfiles(loadProfiles().map((p) => (p.id === updated.id ? updated : p)));
    const res = await saveProfileToDb(updated).catch(
      (): SaveProfileResult => ({ status: "error", message: "network" })
    );
    // 로컬 id(c-…/demo-…) 프로필이 로그인 상태에서 DB에 신규 등록되면
    // 다음 동기화 때 중복이 생기지 않도록 로컬 id를 DB uuid로 교체한다
    if (res.status === "ok" && res.id !== updated.id) {
      saveProfiles(
        loadProfiles().map((p) => (p.id === updated.id ? { ...updated, id: res.id } : p))
      );
      try {
        if (localStorage.getItem("aiweather:activeProfileId") === updated.id) {
          localStorage.setItem("aiweather:activeProfileId", res.id);
        }
      } catch {}
    }
    setSaving(false);
    if (res.status === "error") {
      toast.error("이 기기에는 저장됐지만 계정 동기화에 실패했어요. 잠시 후 다시 시도해주세요");
    } else {
      toast.success("프로필이 저장됐어요");
    }
    router.push("/me");
  };

  return (
    <div className="page-shell">
      <div className="page-frame flex flex-col">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
          <div className="container-mobile flex h-14 items-center gap-2">
            <button
              onClick={() => router.back()}
              className="-ml-2 rounded-full p-2 text-foreground hover:bg-muted"
              aria-label="뒤로가기"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base font-bold tracking-tight">프로필 편집</h1>
          </div>
        </header>

        <main className="container-mobile flex flex-1 flex-col gap-4 py-5 pb-8">
          <Section title="기본 정보">
            <Field label="이름">
              <Input
                value={f.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="예) 지우"
                className="h-12"
              />
            </Field>
            <Field label="생년월일">
              <div className="grid grid-cols-3 gap-2">
                <Select value={f.year} onValueChange={(v) => update({ year: v })}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="년" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }).map((_, i) => {
                      const y = 2026 - i;
                      return <SelectItem key={y} value={String(y)}>{y}년</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <Select value={f.month} onValueChange={(v) => update({ month: v })}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="월" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}월</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={f.day} onValueChange={(v) => update({ day: v })}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="일" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }).map((_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}일</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Field>
            <Field label="성별">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { code: "male", l: "남아", e: "👦" },
                  { code: "female", l: "여아", e: "👧" },
                  { code: "unknown", l: "선택 안 함", e: "🙂" },
                ] as { code: Gender; l: string; e: string }[]).map((g) => {
                  const on = f.gender === g.code;
                  return (
                    <button
                      key={g.code}
                      type="button"
                      onClick={() => update({ gender: g.code })}
                      className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-xs font-medium transition-smooth ${
                        on
                          ? "border-primary bg-secondary text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <span className="text-xl">{g.e}</span>
                      {g.l}
                    </button>
                  );
                })}
              </div>
            </Field>
          </Section>

          <Section title="건강 정보">
            {conditions.map((c) => {
              const on = f.conds.includes(c);
              return (
                <label
                  key={c}
                  className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3.5 py-2.5 transition-smooth ${
                    on ? "border-primary bg-secondary" : "border-border bg-background hover:border-primary/40"
                  }`}
                >
                  <Checkbox checked={on} onCheckedChange={() => toggleCond(c)} />
                  <span className="text-sm leading-snug">{c}</span>
                </label>
              );
            })}
            {f.conds.includes("기타") && (
              <Input
                value={f.condEtc}
                onChange={(e) => update({ condEtc: e.target.value })}
                placeholder="기타 항목을 입력해주세요"
                className="h-12"
              />
            )}
          </Section>

          <Section title="체질">
            {[
              { label: "추위 민감도", v: f.cold, k: "cold" as const, opts: sensitivity },
              { label: "더위 민감도", v: f.hot, k: "hot" as const, opts: sensitivity },
              { label: "땀 분비", v: f.sweat, k: "sweat" as const, opts: sweatLevels },
            ].map(({ label, v, k, opts }) => (
              <Field key={k} label={label}>
                <Select value={v} onValueChange={(val) => update({ [k]: val } as Partial<FormState>)}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {opts.map((o) => (
                      <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </Section>

          <Section title="하루 일과 (선택)">
            <Field label="🌅 등원 시간">
              <Select value={f.goSchool} onValueChange={(v) => update({ goSchool: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="시간 선택" /></SelectTrigger>
                <SelectContent>
                  {halfHour(7, 10).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="☀️ 야외활동 시간대">
              <div className="grid grid-cols-2 gap-2">
                <Select value={f.outdoorStart} onValueChange={(v) => update({ outdoorStart: v })}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="시작" /></SelectTrigger>
                  <SelectContent>
                    {halfHour(9, 16).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={f.outdoorEnd} onValueChange={(v) => update({ outdoorEnd: v })}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="종료" /></SelectTrigger>
                  <SelectContent>
                    {halfHour(9, 17).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </Field>
            <Field label="🏫 하원 시간">
              <Select value={f.leaveSchool} onValueChange={(v) => update({ leaveSchool: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="시간 선택" /></SelectTrigger>
                <SelectContent>
                  {halfHour(13, 19).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="🌇 저녁 야외활동 시간대">
              <div className="grid grid-cols-2 gap-2">
                <Select value={f.eveningStart} onValueChange={(v) => update({ eveningStart: v })}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="시작" /></SelectTrigger>
                  <SelectContent>
                    {halfHour(16, 20).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={f.eveningEnd} onValueChange={(v) => update({ eveningEnd: v })}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="종료" /></SelectTrigger>
                  <SelectContent>
                    {halfHour(16, 21).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </Field>
          </Section>

          <div className="mt-auto pt-2">
            <Button
              onClick={save}
              disabled={saving}
              size="lg"
              className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover shadow-soft"
            >
              {saving ? "저장 중…" : "저장하기"}
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default EditProfile;
