"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation"; ;
import {
  ArrowLeft,
  CloudSun,
  Droplet,
  MessageCircle,
  Moon,
  PartyPopper,
  Sparkles,
  Sun,
  Sunrise,
  Thermometer,
  TreePine,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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
  AlertSettings,
  defaultAlerts,
  calcAge,
  genderToEmoji,
  koreanGenderToCode,
  markBrowseHome,
  saveProfile,
  saveProfileToDb,
} from "@/lib/profile";
import { conditions, sensitivity, sweatLevels, halfHour } from "@/lib/profile-options";
import { track } from "@/lib/analytics";
import {
  emptyConsentSelection,
  readLocalConsentSelection,
  saveLocalConsentSelection,
  syncLocalConsentsToDb,
  withBundledBetaAnalytics,
} from "@/lib/consent";

const TOTAL = 5;
const STORAGE_KEY = "aiweather:onboarding:v2"; // 기본정보 병합(7→5단계)으로 step 의미 변경 — 구형 진행상태 무효화

type State = {
  name: string;
  year: string;
  month: string;
  gender: string;
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
  notif: {
    night: boolean;
    morning: boolean;
    alerts: AlertSettings;
  };
  nightTime: string;
  morningBefore: string;
};

const defaultState: State = {
  name: "",
  year: "",
  month: "",
  gender: "",
  conds: [],
  condEtc: "",
  cold: "",
  hot: "",
  sweat: "",
  goSchool: "",
  outdoorStart: "",
  outdoorEnd: "",
  leaveSchool: "",
  eveningStart: "",
  eveningEnd: "",
  notif: {
    night: true,
    morning: true,
    alerts: defaultAlerts,
  },
  nightTime: "21:00",
  morningBefore: "30",
};

const Onboarding = () => {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [s, setS] = useState<State>(defaultState);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consents, setConsents] = useState(emptyConsentSelection);
  // "먼저 둘러볼게요" 이탈 직전 안내 — 입력의 가치(맞춤 정확도)와 개인정보 취급을
  // 한 번 알려주고 보낸다. 붙잡는 팝업이 아니라 안내이므로 둘러보기는 그대로 허용.
  const [browseNoticeOpen, setBrowseNoticeOpen] = useState(false);
  // 가입 화면에서 약관에 이미 동의했는지 — 안 했으면(Google 로그인 직행 등) 2단계
  // 인라인 동의에 약관 체크를 함께 노출한다. 체크 순간 사라지지 않도록 마운트 시 고정.
  const [termsAlreadyAgreed, setTermsAlreadyAgreed] = useState(false);

  useEffect(() => {
    const savedConsents = readLocalConsentSelection();
    setConsents(savedConsents);
    setTermsAlreadyAgreed(savedConsents.terms_privacy);
    setConsentChecked(true);
  }, []);

  useEffect(() => {
    if (!consentChecked) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.s) setS({ ...defaultState, ...parsed.s });
        if (parsed.step) setStep(parsed.step);
      }
    } catch {}
  }, [consentChecked]);

  useEffect(() => {
    if (!consentChecked) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ s, step }));
    } catch {}
  }, [consentChecked, s, step]);

  // 지표 1(온보딩 완료율)의 단계별 이탈 지점 — 도달한 step을 모두 기록하고,
  // 분석 시 세션별 max(step)로 이탈 단계를 본다 (뒤로가기·이어하기 경로 포함).
  useEffect(() => {
    track("onboarding_step", { step });
  }, [step]);

  const update = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));
  const toggleCond = (c: string) =>
    update({ conds: s.conds.includes(c) ? s.conds.filter((x) => x !== c) : [...s.conds, c] });

  const finish = () => {
    const gender = koreanGenderToCode(s.gender);
    const profile: ChildProfile = {
      id: `c-${Date.now()}`,
      name: s.name.trim(),
      emoji: genderToEmoji(gender),
      age: calcAge(s.year, s.month),
      gender,
      birth: { year: s.year, month: s.month },
      conditions: s.conds,
      conditionEtc: s.condEtc,
      cold: s.cold,
      hot: s.hot,
      sweat: s.sweat,
      schedule: {
        goSchool: s.goSchool,
        outdoorStart: s.outdoorStart,
        outdoorEnd: s.outdoorEnd,
        leaveSchool: s.leaveSchool,
        eveningStart: s.eveningStart,
        eveningEnd: s.eveningEnd,
      },
      notif: {
        ...s.notif,
        nightTime: s.nightTime,
        morningBefore: s.morningBefore,
      },
      createdAt: Date.now(),
    };
    saveProfile(profile); // localStorage (오프라인 접근용)
    saveProfileToDb(profile).then((res) => {
      if (res.status === "ok") {
        // DB 저장 후 반환된 UUID로 activeProfileId 갱신
        try { localStorage.setItem("aiweather:activeProfileId", res.id); } catch {}
      } else if (res.status === "error") {
        // 로그인 상태인데 저장 실패 — 조용히 넘기면 다른 기기·재로그인 시
        // 로컬 데이터가 없어 데모 프로필이 보인다. 사용자에게 알리고 재시도 유도.
        toast.error("프로필을 계정에 저장하지 못했어요.", {
          description: "이 기기에는 저장됐지만, 네트워크 확인 후 다시 시도해주세요.",
          duration: 6000,
        });
      }
      // no-auth(게스트)는 로컬 저장만으로 정상 — 알림 없음
    });
    try {
      localStorage.setItem("aiweather:activeProfileId", profile.id);
    } catch {}
  };

  const next = () => {
    if (step === 1) {
      if (!s.name.trim()) return toast.error("아이 이름을 입력해주세요");
      if (!s.year || !s.month) return toast.error("태어난 연도와 월을 선택해주세요");
      if (!s.gender) return toast.error("성별을 선택해주세요");
    }
    if (step === 2) {
      if (s.conds.length === 0) return toast.error("하나 이상 선택해주세요 (없으면 '해당없음')");
      if (!termsAlreadyAgreed && !consents.terms_privacy)
        return toast.error("이용약관 동의를 확인해주세요.");
      // 실제 건강 특이사항을 선택한 경우에만 민감정보 동의가 필요하다 —
      // '해당없음'만 고르면 동의 없이 진행 가능(선택 동의의 자발성 유지).
      if (s.conds.some((c) => c !== "해당없음") && !consents.sensitive_child_data)
        return toast.error("건강 정보 활용 동의를 확인해주세요.");
      // Google 로그인 등 가입 화면을 거치지 않은 경로도 약관 동의가 여기서 처음
      // 확정될 수 있으므로, 가입과 동일하게 베타 이용기록 활용을 함께 기록한다.
      saveLocalConsentSelection(withBundledBetaAnalytics(consents));
      void syncLocalConsentsToDb("onboarding");
    }
    if (step === 3 && (!s.cold || !s.hot || !s.sweat)) return toast.error("세 항목 모두 선택해주세요");
    if (step < TOTAL) setStep(step + 1);
    else {
      finish();
      track("onboarding_completed");
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      setDone(true);
    }
  };

  const prev = () => (step > 1 ? setStep(step - 1) : router.back());
  const saveLater = () => {
    markBrowseHome(); // 홈 진입 가드가 온보딩으로 되돌려보내지 않도록
    toast.success("진행 상태가 저장됐어요. 나중에 이어서 할 수 있어요.");
    router.push("/home");
  };

  if (!consentChecked) return null;

  if (done) {
    return (
      <div className="page-shell">
        <div className="page-frame flex items-center justify-center bg-background px-5">
          <div className="w-full text-center animate-scale-in">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary-tint">
              <PartyPopper size={56} strokeWidth={1.75} className="text-accent" />
            </div>
            <h1 className="mt-6 text-2xl font-bold tracking-tight">
              {s.name}의 첫 번째<br />리포트가 준비됐어요!
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              지금 바로 오늘의 리포트를<br />확인해보세요.
            </p>
            <Button
              onClick={() => router.push("/home")}
              size="lg"
              className="mt-8 h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover shadow-soft"
            >
              오늘 리포트 보러가기 →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const nm = s.name || "아이";

  const stepNode: Record<number, { q: string; hint?: string; node: React.ReactNode }> = {
    1: {
      q: "안녕하세요! 먼저 아이에 대해 알려주세요.",
      hint: "월령과 성별에 따라 맞춤 건강 정보를 준비해요",
      node: (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">이름</p>
            <Input
              autoFocus
              value={s.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="예) 지우 (별명도 괜찮아요)"
              className="h-12 text-lg"
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">태어난 연·월</p>
            <div className="grid grid-cols-2 gap-2">
              <Select value={s.year} onValueChange={(v) => update({ year: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="년" /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }).map((_, i) => {
                    const y = 2026 - i;
                    return <SelectItem key={y} value={String(y)}>{y}년</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <Select value={s.month} onValueChange={(v) => update({ month: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="월" /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}월</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">성별</p>
            <div className="grid grid-cols-3 gap-2">
              {["남아", "여아", "선택 안 함"].map((l) => {
                const on = s.gender === l;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => update({ gender: l })}
                    className={`flex h-14 items-center justify-center rounded-xl border-2 text-sm font-medium transition-smooth ${
                      on
                        ? "border-primary bg-secondary text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ),
    },
    2: {
      q: `${nm}에게 해당되는 것을 모두 선택해주세요`,
      hint: "해당 항목이 있으면 관련 환경 지표를 더 꼼꼼히 알려드려요",
      node: (
        <div className="space-y-2">
          {conditions.map((c) => {
            const on = s.conds.includes(c);
            return (
              <label
                key={c}
                className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3.5 py-2.5 transition-smooth ${
                  on ? "border-primary bg-secondary" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <Checkbox checked={on} onCheckedChange={() => toggleCond(c)} />
                <span className="text-sm leading-snug">{c}</span>
              </label>
            );
          })}
          {s.conds.includes("기타") && (
            <Input
              value={s.condEtc}
              onChange={(e) => update({ condEtc: e.target.value })}
              placeholder="기타 항목을 입력해주세요"
              className="h-12"
            />
          )}

          {/* 건강정보 활용 동의 — 별도 게이트 화면 대신 입력 화면 안에서 확인한다
              (2026-07-20 결정: 1단계→2단계 직행). 거부감을 줄이기 위해 색 강조 없이
              캡션 톤으로만 — 단, 문구는 목적·보유기간 고지를 유지한다(법정 고지사항). */}
          <div className="space-y-2.5 border-t border-border pt-4 !mt-5">
            {!termsAlreadyAgreed && (
              <label className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  checked={consents.terms_privacy}
                  onCheckedChange={(v) =>
                    setConsents((prev) => ({ ...prev, terms_privacy: v === true }))
                  }
                  className="mt-0.5 h-4 w-4"
                />
                <span className="text-[13px] leading-relaxed text-muted-foreground break-keep">
                  <Link href="/terms" className="underline underline-offset-2">
                    이용약관
                  </Link>
                  에 동의합니다.
                </span>
              </label>
            )}
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={consents.sensitive_child_data}
                onCheckedChange={(v) =>
                  setConsents((prev) => ({ ...prev, sensitive_child_data: v === true }))
                }
                className="mt-0.5 h-4 w-4"
              />
              {/* 최소 문구만 — 법정대리인 요건·보유기간 등 상세 고지는 방침 §2(자세히 링크)가 담는다 */}
              <span className="text-[13px] leading-relaxed text-muted-foreground break-keep">
                아이 건강 정보를 맞춤 리포트에 활용하는 데 동의합니다.{" "}
                <Link href="/privacy#sensitive" className="underline underline-offset-2">
                  자세히
                </Link>
              </span>
            </label>
          </div>
        </div>
      ),
    },
    3: {
      q: `${nm}는 또래와 비교했을 때 어떤가요?`,
      hint: "체온 민감도에 따라 옷차림 추천이 달라져요",
      node: (
        <div className="space-y-3">
          {[
            { label: "추위 민감도", v: s.cold, k: "cold" as const, opts: sensitivity },
            { label: "더위 민감도", v: s.hot, k: "hot" as const, opts: sensitivity },
            { label: "땀 분비", v: s.sweat, k: "sweat" as const, opts: sweatLevels },
          ].map(({ label, v, k, opts }) => (
            <div key={label}>
              <p className="mb-1.5 text-sm text-muted-foreground">{label}</p>
              <Select value={v} onValueChange={(val) => update({ [k]: val } as Partial<State>)}>
                <SelectTrigger className="h-12"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {opts.map((o) => (
                    <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      ),
    },
    4: {
      q: `${nm}의 하루 일과를 알려 주세요`,
      hint: "생활 패턴에 따라 오늘 하루의 가이드를 제공해 드려요",
      node: (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">등원 시간</p>
            <Select value={s.goSchool} onValueChange={(v) => update({ goSchool: v })}>
              <SelectTrigger className="h-12"><SelectValue placeholder="시간 선택" /></SelectTrigger>
              <SelectContent>
                {halfHour(7, 10).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">야외활동 시간대</p>
            <div className="grid grid-cols-2 gap-2">
              <Select value={s.outdoorStart} onValueChange={(v) => update({ outdoorStart: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="시작" /></SelectTrigger>
                <SelectContent>
                  {halfHour(9, 16).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={s.outdoorEnd} onValueChange={(v) => update({ outdoorEnd: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="종료" /></SelectTrigger>
                <SelectContent>
                  {halfHour(9, 17).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">하원 시간</p>
            <Select value={s.leaveSchool} onValueChange={(v) => update({ leaveSchool: v })}>
              <SelectTrigger className="h-12"><SelectValue placeholder="시간 선택" /></SelectTrigger>
              <SelectContent>
                {halfHour(13, 19).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">저녁 야외활동 시간대</p>
            <div className="grid grid-cols-2 gap-2">
              <Select value={s.eveningStart} onValueChange={(v) => update({ eveningStart: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="시작" /></SelectTrigger>
                <SelectContent>
                  {halfHour(16, 20).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={s.eveningEnd} onValueChange={(v) => update({ eveningEnd: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="종료" /></SelectTrigger>
                <SelectContent>
                  {halfHour(16, 21).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep(5)}
            className="block w-full pt-1 text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            건너뛰고 나중에 입력할게요
          </button>
        </div>
      ),
    },
    5: {
      q: "언제 알려드릴까요?",
      hint: "나중에 설정에서 언제든 변경할 수 있어요",
      node: (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => toast.info("카카오톡 연동은 준비 중이에요")}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-kakao text-sm font-semibold text-kakao-foreground"
          >
            <MessageCircle size={16} strokeWidth={1.75} />
            카카오톡 알림 연동
          </button>

          {/* 전날 밤 알림 */}
          <div className="rounded-xl bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="flex items-center gap-1.5 font-medium">
                  <Moon size={16} strokeWidth={1.75} className="text-muted-foreground" />
                  전날 밤 알림
                </p>
                <p className="text-xs text-muted-foreground">
                  내일을 미리 준비할 수 있도록 예보 기반 정보를 전날 밤에 알려드려요
                </p>
              </div>
              <Switch
                checked={s.notif.night}
                onCheckedChange={(v) => update({ notif: { ...s.notif, night: v } })}
              />
            </div>
            {s.notif.night && (
              <div className="mt-3">
                <Select value={s.nightTime} onValueChange={(v) => update({ nightTime: v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="시간" /></SelectTrigger>
                  <SelectContent>
                    {halfHour(21, 23).map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* 당일 아침 알림 */}
          <div className="rounded-xl bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="flex items-center gap-1.5 font-medium">
                  <Sunrise size={16} strokeWidth={1.75} className="text-muted-foreground" />
                  당일 아침 알림
                </p>
                <p className="text-xs text-muted-foreground">
                  당일 실시간 관측 데이터 기반으로 등원 준비 전에 알려드려요
                </p>
              </div>
              <Switch
                checked={s.notif.morning}
                onCheckedChange={(v) => update({ notif: { ...s.notif, morning: v } })}
              />
            </div>
            {s.notif.morning && (
              <div className="mt-3">
                <Select value={s.morningBefore} onValueChange={(v) => update({ morningBefore: v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="등원 몇 분 전" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">등원 10분 전</SelectItem>
                    <SelectItem value="20">등원 20분 전</SelectItem>
                    <SelectItem value="30">등원 30분 전</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* 상황별 환경 경보 알림 */}
          <div className="rounded-xl bg-card p-4">
            <p className="flex items-center gap-1.5 font-medium">
              <TriangleAlert size={16} strokeWidth={1.75} className="text-muted-foreground" />
              상황별 환경 경보 알림
            </p>
            <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
              아래 환경 조건 충족 시 즉시 알림을 보내드려요. 중복 선택 가능해요
            </p>
            <div className="space-y-2">
              {(
                [
                  {
                    key: "aiWarning" as const,
                    icon: Sparkles,
                    label: "AI 종합 환경지수 '주의' 이상",
                    desc: "기상·대기·꽃가루 등 종합 분석 결과 위험 수준 도달 시",
                    recommended: true,
                  },
                  {
                    key: "tempDiff" as const,
                    icon: Thermometer,
                    label: "일교차 10°C 이상",
                    desc: "아침·낮 기온 편차가 10°C를 초과하는 경우",
                  },
                  {
                    key: "dustBad" as const,
                    icon: Wind,
                    label: "초미세먼지(PM2.5) '나쁨' 이상",
                    desc: "PM2.5 농도 35㎍/㎥ 초과 시",
                  },
                  {
                    key: "pollen" as const,
                    icon: TreePine,
                    label: "꽃가루 농도 '주의' 이상",
                    desc: "수목·초본류 꽃가루 농도 주의 단계 이상 시",
                  },
                  {
                    key: "dryness" as const,
                    icon: Droplet,
                    label: "건조주의보 발령",
                    desc: "상대습도 35% 미만 또는 기상청 건조주의보 발효 시",
                  },
                  {
                    key: "uvHigh" as const,
                    icon: Sun,
                    label: "자외선지수 '높음' 이상",
                    desc: "UV 지수 6 이상, 영유아 피부·안구 노출 주의 수준",
                  },
                ] as {
                  key: keyof AlertSettings;
                  icon: LucideIcon;
                  label: string;
                  desc: string;
                  recommended?: boolean;
                }[]
              ).map(({ key, icon: Icon, label, desc, recommended }) => {
                const isOn = s.notif.alerts[key];
                return (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3.5 py-3 transition-smooth ${
                      isOn
                        ? "border-primary bg-secondary"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    <Checkbox
                      checked={isOn}
                      onCheckedChange={(v) =>
                        update({
                          notif: {
                            ...s.notif,
                            alerts: { ...s.notif.alerts, [key]: !!v },
                          },
                        })
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Icon size={18} strokeWidth={1.75} />
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground">{label}</span>
                        {recommended && (
                          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                            추천
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ),
    },
  };

  const cur = stepNode[step];

  return (
    <div className="page-shell">
      <div className="page-frame flex flex-col">
        <header className="border-b border-border/60">
          <div className="container-mobile flex h-14 items-center justify-between">
            <button
              onClick={prev}
              className="-ml-2 rounded-full p-2 text-foreground hover:bg-muted"
              aria-label="뒤로가기"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button onClick={saveLater} className="text-xs text-muted-foreground hover:text-foreground">
              나중에 이어서 하기
            </button>
          </div>
          <div className="container-mobile pb-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{step} / {TOTAL}</span>
              <span>{Math.round((step / TOTAL) * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${(step / TOTAL) * 100}%` }}
              />
            </div>
          </div>
        </header>

        <main className="container-mobile flex flex-1 flex-col py-6">
          <div key={step} className="animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-accent">
                <CloudSun size={20} strokeWidth={1.75} />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-secondary px-4 py-3">
                <p className="leading-relaxed text-foreground">{cur.q}</p>
                {cur.hint && <p className="mt-1.5 text-xs text-muted-foreground">{cur.hint}</p>}
              </div>
            </div>
            <div className="mt-7">{cur.node}</div>
          </div>

          <div className="mt-auto pt-8">
            <Button
              onClick={next}
              size="lg"
              className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary-hover shadow-soft"
            >
              {step === TOTAL ? "완료" : "다음"}
            </Button>
            <button
              type="button"
              onClick={() => setBrowseNoticeOpen(true)}
              className="mt-3 flex min-h-11 w-full items-center justify-center text-xs text-muted-foreground hover:text-foreground"
            >
              먼저 둘러볼게요
            </button>
          </div>
        </main>

        <Dialog open={browseNoticeOpen} onOpenChange={setBrowseNoticeOpen}>
          <DialogContent className="max-w-[350px] rounded-2xl">
            <DialogHeader className="text-left">
              <DialogTitle className="text-[16px] font-semibold">
                맞춤형 리포트에는 정보가 필요해요
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground break-keep">
                아이의 체질과 건강 정보를 입력하면 아이데이가 우리 아이 맞춤형으로
                케어 가이드를 작성할 수 있어요. 입력한 정보는 맞춤 리포트에만 사용되니
                안심하세요.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setBrowseNoticeOpen(false)}
                className="h-12 w-full rounded-[14px] bg-primary-tint text-[15px] font-semibold text-accent transition-smooth hover:bg-secondary"
              >
                이어서 입력하기
              </button>
              <button
                type="button"
                onClick={() => {
                  markBrowseHome();
                  router.push("/home");
                }}
                className="h-12 w-full rounded-[14px] bg-muted text-[15px] font-semibold text-foreground transition-smooth hover:bg-border"
              >
                홈 둘러보기
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Onboarding;
