// Shared profile storage helpers for AI-Weather
import { supabase } from "@/lib/supabase";
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
  birth?: { year: string; month: string; day?: string };
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
    age: "만 4세",
    gender: "female",
    birth: { year: "2022", month: "3" },
    conditions: ["아토피", "비염"],
    cold: "보통이에요",
    hot: "더위를 많이 타요",
    sweat: "많아요",
    schedule: {
      goSchool: "09:00",
      outdoorStart: "11:00",
      outdoorEnd: "12:00",
      leaveSchool: "18:00",
    },
    createdAt: 0,
  },
  {
    id: "demo-2",
    name: "도윤",
    emoji: "👦",
    age: "만 1세",
    gender: "male",
    birth: { year: "2024", month: "7" },
    conditions: ["피부 민감"],
    cold: "추위를 많이 타요",
    hot: "보통이에요",
    sweat: "보통이에요",
    schedule: {
      goSchool: "09:30",
      outdoorStart: "10:30",
      outdoorEnd: "11:30",
      leaveSchool: "16:00",
    },
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

// 만 나이 계산. 월(月)이 있으면 생일 달이 아직 안 지난 해는 1 차감해 정확한
// 만 나이를 낸다(연령군 규칙 세트가 만 나이 기준). 월이 없으면(구 데이터·손상)
// 연 나이로 폴백한다. 일(日)은 개인정보 최소수집 원칙에 따라 수집하지 않으므로,
// 생일 당월(현재 월 == 생월)은 아직 생일 전으로 보수적으로 간주한다 — 케어
// 가이드는 나이를 낮게 잡는 쪽이 안전하기 때문.
export const calcAge = (year?: string, month?: string): string => {
  if (!year) return "";
  const y = parseInt(year, 10);
  if (Number.isNaN(y)) return "";
  const now = new Date();
  let age = now.getFullYear() - y;
  const m = month ? parseInt(month, 10) : NaN;
  if (!Number.isNaN(m) && now.getMonth() + 1 <= m) age -= 1;
  age = Math.max(0, age);
  return `만 ${age}세`;
};

export const genderToEmoji = (g: Gender): string =>
  g === "male" ? "👦" : g === "female" ? "👧" : "🙂";

export const koreanGenderToCode = (label: string): Gender => {
  if (label === "남아") return "male";
  if (label === "여아") return "female";
  return "unknown";
};

// DB(uuid)에서 온 id인지 판별. 로컬 생성 id(c-…)·데모 id(demo-…)는 DB에 그대로 보내면
// uuid 컬럼 파싱 오류가 나므로, upsert 시 id를 빼고 보내 신규 행으로 삽입되게 한다.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isDbId = (id: string): boolean => UUID_RE.test(id);

export const isDemoProfile = (p: ChildProfile): boolean =>
  p.id.startsWith("demo-");

// 사용자가 직접 만든 로컬 프로필(데모 제외)
export const realLocalProfiles = (): ChildProfile[] =>
  loadProfiles().filter((p) => !isDemoProfile(p));

// 홈 진입 가드 우회 플래그(sessionStorage — 탭 세션 동안 유지).
// 로그인했지만 프로필이 없는 사용자는 홈에서 온보딩으로 유도되는데,
// 온보딩의 "나중에 이어서 하기/먼저 둘러볼게요"로 홈을 구경하는 경우는 예외로 둔다.
const BROWSE_KEY = "aiday:browseHome";
export const markBrowseHome = () => {
  try { sessionStorage.setItem(BROWSE_KEY, "1"); } catch {}
};
export const allowBrowseHome = (): boolean => {
  try { return sessionStorage.getItem(BROWSE_KEY) === "1"; } catch { return false; }
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

// ── Supabase DB 동기화 ──────────────────────────────────────────────────

type DbRow = {
  id?: string;
  user_id: string;
  name: string;
  emoji: string;
  gender: Gender;
  birth_year?: number;
  birth_month?: number;
  birth_day?: number;
  conditions?: string[];
  condition_etc?: string;
  cold_sensitivity?: string;
  hot_sensitivity?: string;
  sweat_level?: string;
  schedule?: ChildProfile["schedule"];
  notif?: ChildProfile["notif"];
};

function profileToRow(p: ChildProfile, userId: string): DbRow {
  return {
    id: isDbId(p.id) ? p.id : undefined,
    user_id: userId,
    name: p.name,
    emoji: p.emoji,
    gender: p.gender,
    birth_year: p.birth?.year ? parseInt(p.birth.year) : undefined,
    birth_month: p.birth?.month ? parseInt(p.birth.month) : undefined,
    birth_day: p.birth?.day ? parseInt(p.birth.day) : undefined,
    conditions: p.conditions,
    condition_etc: p.conditionEtc,
    cold_sensitivity: p.cold,
    hot_sensitivity: p.hot,
    sweat_level: p.sweat,
    schedule: p.schedule,
    notif: p.notif,
  };
}

function rowToProfile(row: Record<string, unknown>): ChildProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    emoji: row.emoji as string,
    gender: (row.gender as Gender) ?? "unknown",
    age: row.birth_year
      ? calcAge(
          String(row.birth_year),
          row.birth_month != null ? String(row.birth_month) : undefined
        )
      : "",
    birth: row.birth_year
      ? {
          year: String(row.birth_year),
          month: String(row.birth_month ?? ""),
          // 일(日)은 더 이상 수집하지 않는다. 구 데이터에 값이 있을 때만 채운다.
          ...(row.birth_day != null ? { day: String(row.birth_day) } : {}),
        }
      : undefined,
    conditions: (row.conditions as string[]) ?? [],
    conditionEtc: row.condition_etc as string,
    cold: row.cold_sensitivity as string,
    hot: row.hot_sensitivity as string,
    sweat: row.sweat_level as string,
    schedule: (row.schedule as ChildProfile["schedule"]) ?? {},
    notif: (row.notif as ChildProfile["notif"]),
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

export async function saveProfileToDb(p: ChildProfile): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const row = profileToRow(p, user.id);
  const { data, error } = await supabase
    .from("children")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    console.error("[saveProfileToDb]", error.message);
    return null;
  }
  return data?.id ?? null;
}

// DB → localStorage 동기화. 로그인 상태에서 앱 진입 시 호출.
// DB에 프로필이 있으면 localStorage를 DB 기준으로 덮어쓰고 목록을 반환.
// 비로그인이거나 DB가 비어 있으면 null 반환 (로컬 상태 유지 — 게스트/데모 보존).
export async function syncProfilesFromDb(): Promise<ChildProfile[] | null> {
  const list = await loadProfilesFromDb();
  if (!list.length) return null;
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
  } catch {}
  return list;
}

// DB 프로필 조회 결과. 진입 분기(인증 후 판단 지점·홈 가드)가 "비로그인 / 조회 실패 /
// 진짜 빈 계정"을 구분해야 하므로 상태를 함께 반환한다.
// - no-auth: 비로그인(게스트) — 로컬 상태 유지
// - error:   로그인 상태지만 조회 실패(네트워크 등) — 빈 계정으로 오판해 온보딩으로 보내면 안 됨
// - ok:      조회 성공 (list가 비어 있으면 아직 아이 등록 전)
export type DbProfilesResult =
  | { status: "no-auth" }
  | { status: "error" }
  | { status: "ok"; list: ChildProfile[] };

export async function fetchProfilesFromDb(): Promise<DbProfilesResult> {
  // getSession은 로컬 저장소만 읽으므로 네트워크 오류로 로그인 상태를 오판하지 않는다
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { status: "no-auth" };

  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at");

  if (error || !data) return { status: "error" };
  return { status: "ok", list: data.map(rowToProfile) };
}

export async function loadProfilesFromDb(): Promise<ChildProfile[]> {
  const res = await fetchProfilesFromDb();
  return res.status === "ok" ? res.list : [];
}

// 게스트 시절 만든 로컬 프로필(데모 제외)을 DB로 1회 이전.
// DB가 비어 있을 때만 호출할 것 (중복 등록 방지는 호출부 책임). 성공 건수를 반환.
export async function uploadLocalProfilesToDb(): Promise<number> {
  const locals = realLocalProfiles();
  if (!locals.length) return 0;
  const results = await Promise.all(locals.map((p) => saveProfileToDb(p)));
  return results.filter(Boolean).length;
}

export async function removeProfileFromDb(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("children").delete().eq("id", id).eq("user_id", user.id);
}
