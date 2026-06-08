// Shared profile storage helpers for AI-Weather
export type Gender = "male" | "female" | "unknown";

export type AlertSettings = {
  aiWarning: boolean;   // AI 종합 환경지수 '주의' 이상
  tempDiff: boolean;    // 일교차 10°C 이상
  dustBad: boolean;     // 초미세먼지(PM2.5) '나쁨' 이상
  pollen: boolean;      // 꽃가루 농도 '주의' 이상
  dryness: boolean;     // 건조주의보 발령
  uvHigh: boolean;      // 자외선지수 '높음' 이상
};

export type ChildProfile = {
  id: string;
  name: string;
  emoji: string;
  age: string;
  gender: Gender;
  birth?: { year: string; month: string; day: string };
  conditions?: string[];
  conditionEtc?: string;
  cold?: string;
  hot?: string;
  sweat?: string;
  schedule?: {
    goSchool?: string;
    outdoorStart?: string;
    outdoorEnd?: string;
    leaveSchool?: string;
    eveningStart?: string;
    eveningEnd?: string;
  };
  notif?: {
    night: boolean;
    morning: boolean;
    alerts: AlertSettings;
    nightTime: string;
    morningBefore: string;
  };
  createdAt: number;
};

export const PROFILES_KEY = "aiweather:profiles";

const defaultProfiles: ChildProfile[] = [
  {
    id: "demo-1",
    name: "지우",
    emoji: "👧",
    age: "6세",
    gender: "female",
    createdAt: 0,
  },
  {
    id: "demo-2",
    name: "도윤",
    emoji: "👦",
    age: "4세",
    gender: "male",
    createdAt: 0,
  },
];

export const defaultAlerts: AlertSettings = {
  aiWarning: true,
  tempDiff: false,
  dustBad: false,
  pollen: false,
  dryness: false,
  uvHigh: false,
};

export const calcAge = (year?: string): string => {
  if (!year) return "";
  const y = parseInt(year, 10);
  if (Number.isNaN(y)) return "";
  const now = new Date().getFullYear();
  const age = Math.max(0, now - y);
  return `${age}세`;
};

export const genderToEmoji = (g: Gender): string =>
  g === "male" ? "👦" : g === "female" ? "👧" : "🙂";

export const koreanGenderToCode = (label: string): Gender => {
  if (label === "남아") return "male";
  if (label === "여아") return "female";
  return "unknown";
};

export const loadProfiles = (): ChildProfile[] => {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return defaultProfiles;
    const parsed = JSON.parse(raw) as ChildProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultProfiles;
    return parsed;
  } catch {
    return defaultProfiles;
  }
};

export const saveProfile = (p: ChildProfile) => {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    const list: ChildProfile[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(list)
      ? list.filter((x) => x.id !== p.id)
      : [];
    const next = [...filtered, p];
    localStorage.setItem(PROFILES_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
};

export const removeProfile = (id: string) => {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as ChildProfile[];
    if (!Array.isArray(list)) return;
    localStorage.setItem(
      PROFILES_KEY,
      JSON.stringify(list.filter((x) => x.id !== id))
    );
  } catch {
    // ignore
  }
};
