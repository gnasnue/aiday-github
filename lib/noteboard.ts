// 알림장 인제스트 — 교사가 보낸 알림장에서 저녁 대화 거리를 꺼내는 루프의 클라이언트 계층.
//
// 왜 만드나 (승인 설계안 2026-07-29, Approach A):
//   부모는 키즈노트 알림장을 매일 읽지만 그 안의 신호를 축적·해석하지 못한다. 저녁에
//   "오늘 뭐 했어?"라고 물으면 "몰라"가 돌아오는 게 그 단절의 대표 증상이다. 이 모듈은
//   붙여넣은 알림장 원문을 **전송 가능한 형태로 다듬고**(마스킹) **로컬에만 보관**한다
//   (7일 롤링). 생성 자체는 `/api/noteboard`가 한다.
//
// 이 파일이 순수 로직인 이유: 마스킹은 개인정보 경계라 화면 JSX 안에 두면 검증할 수 없다.
//
// 개인정보 계약 (설계안 전제 5):
//   - 원문은 서버에 **저장하지 않는다**. 다만 생성을 위해 **전송은 된다** — 그래서 전송 전
//     **클라이언트에서** 타 아동 이름을 가린다(서버·로그를 원문 인명이 경유하지 않게).
//   - 간이 마스킹이므로 **탐지 실패를 허용**한다. 프롬프트의 "타 아동 이름 인용 금지"
//     지시가 2차 방어다. 정식 마스킹(개체 인식)은 B 단계 요건.
//   - 로컬 보관도 무기한이 아니다: 원문은 7일 롤링 삭제, 추출 결과만 남긴다.

import { localDateStr } from "./date";

/** 붙여넣기 상한 — 알림장 1건 분량. UI maxLength와 서버 검증이 같은 값을 쓴다. */
export const NOTE_MAX_LEN = 2000;

/** 원문 로컬 보관 일수. 지나면 원문만 지우고 대화 거리(추출 결과)는 남긴다. */
export const NOTE_RAW_RETENTION_DAYS = 7;

/** 하루 생성 상한 (서버 레이트리밋과 같은 값 — 초과 시 UI가 미리 막는다) */
export const NOTE_DAILY_LIMIT = 5;

/* ---------- 타입 ---------- */

export type TalkPrompt = {
  /** 아이에게 그대로 물어볼 수 있는 질문 */
  question: string;
  /** 왜 이 질문인지 — 알림장의 어느 대목에서 나왔는지 한 줄 */
  why: string;
};

/** 알림장에서 발견한 축적 신호. 대시보드가 아니라 "반영할까요?" 한 줄로만 쓴다. */
export type NoteFinding = {
  kind: "health" | "first";
  /** "콧물" · "얼음 감각놀이" 등 관찰 어휘 (진단 금지) */
  label: string;
};

export type NoteboardResult = {
  /** 하루를 한 줄로 — "얼음을 처음 만진 날이었어요" */
  headline: string;
  /** 그 한 줄의 근거 (알림장에서 무엇을 봤는지) */
  summary: string;
  talks: TalkPrompt[];
  findings: NoteFinding[];
};

export type NoteboardEntry = {
  childId: string;
  /** YYYY-MM-DD (로컬) — 아이·날짜당 1건 upsert */
  date: string;
  /** 마스킹된 원문. 보존 기간이 지나면 undefined로 비운다 */
  raw?: string;
  result: NoteboardResult;
  ts: number;
};

/* ---------- 마스킹 (전송 전 · 클라이언트) ---------- */

// 호칭 조사 — "OO이가", "OO는", "OO랑" 처럼 이름 뒤에 붙는 흔한 형태.
// 조사 없는 맨이름은 잡지 않는다(일반 명사를 이름으로 오인하는 쪽이 더 나쁘다).
const NAME_PARTICLES = "이가|이는|이랑|이와|이도|이의|이를|가|는|랑|와|도|의|를|은|이";

/**
 * 알림장 본문에서 **우리 아이 이름을 뺀** 2~3자 한글 인명 후보를 "친구"로 바꾼다.
 *
 * 왜 화이트리스트(우리 아이)를 쓰나: 한국어 인명은 일반 명사와 형태가 겹쳐(예: "친구",
 * "선생") 블랙리스트로는 못 가른다. 대신 "우리 아이 이름만 보존하고 나머지 호칭 패턴을
 * 치환"하는 쪽이 과잉 마스킹으로 기울어 안전하다 — 대화 거리 품질이 조금 나빠지는 것이
 * 남의 아이 이름이 새는 것보다 낫다.
 *
 * 한계(의도된 것): 조사 없이 나열된 이름("지우, 민서, 하준")은 첫 항목만 조사가 없어
 * 놓칠 수 있다. 프롬프트 지시가 2차 방어다.
 */
export function maskOtherNames(text: string, childName: string): string {
  const mine = childName.trim();
  // 조사가 붙은 2~3자 한글 이름 후보. 우리 아이 이름은 그대로 둔다.
  const re = new RegExp(`([가-힣]{2,3})(${NAME_PARTICLES})(?=\\s|[,.·)\\]]|$)`, "g");
  return text.replace(re, (match, name: string, particle: string) => {
    if (mine && (name === mine || `${name}이` === mine || name === `${mine}이`)) return match;
    // 사람 이름이 아닐 가능성이 큰 흔한 명사는 건드리지 않는다 — 문장이 망가지면
    // 대화 거리 품질이 떨어지고, 그건 이 기능의 유일한 보상이다.
    if (COMMON_NOUNS.has(name)) return match;
    return `친구${particle}`;
  });
}

// 알림장에 자주 나오는 2~3자 일반 명사. 인명 오탐을 줄이기 위한 최소 목록이며,
// 여기 없는 명사가 "친구"로 바뀌는 것은 허용 오차다(과잉 마스킹 쪽으로 기운다).
const COMMON_NOUNS = new Set([
  "친구", "선생", "선생님", "오늘", "내일", "어제", "점심", "간식", "낮잠", "바깥",
  "실내", "교실", "놀이", "활동", "물놀이", "산책", "미술", "음악", "체육", "블록",
  "그림", "노래", "율동", "이야기", "동화", "인사", "정리", "손씻", "화장실", "기분",
  "컨디션", "감기", "기침", "콧물", "열", "체온", "약", "밥", "국", "반찬", "우유",
  "물", "옷", "신발", "가방", "모자", "우산", "수건", "여벌", "하루", "아침", "저녁",
  "오후", "오전", "엄마", "아빠", "부모", "가정", "우리", "모두", "다들", "서로",
]);

/* ---------- 저장 (localStorage 정본) ---------- */

const STORE_KEY = "aiday:noteboard:v1";
const MAX_ENTRIES_PER_CHILD = 30;

const loadAll = (): NoteboardEntry[] => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as NoteboardEntry[]) : [];
  } catch {
    return [];
  }
};

/**
 * 알림장이 **추가·삭제됐을 때만** 알린다. 같은 화면의 누적 카드가 따라오게 하는 용도로,
 * `storage` 이벤트는 다른 탭에서만 발생해 쓸 수 없다.
 *
 * `persist()`에 걸지 않는 이유: `loadNotes()`가 읽을 때마다 보존 정책을 되돌려 쓰면서
 * `persist()`를 호출한다. 거기서 이벤트를 쏘면 `읽기 → 이벤트 → 리스너가 다시 읽기`가
 * 무한히 돈다(실제로 스택 오버플로가 났다). 이벤트의 의미는 "저장소가 쓰였다"가 아니라
 * **"사용자 데이터가 바뀌었다"** 여야 한다.
 */
export const NOTEBOARD_CHANGED_EVENT = "aiday:noteboard-changed";

const notifyChanged = (): void => {
  try {
    window.dispatchEvent(new Event(NOTEBOARD_CHANGED_EVENT));
  } catch {
    // 서버 렌더·테스트 환경엔 window가 없다 — 알림은 부가 기능이라 조용히 넘어간다.
  }
};

const persist = (entries: NoteboardEntry[]): void => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  } catch {
    // 저장 불가(시크릿 모드·용량 초과) — 무기록으로 정상 진행. 화면엔 결과가 이미 떠 있다.
  }
};

/** YYYY-MM-DD에 일수를 더한다 (day-review와 같은 방식 — 로컬 자정 기준) */
const addDays = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

/**
 * 보존 정책 적용 — 7일이 지난 항목의 **원문만** 비운다. 대화 거리·발견 신호는 남긴다
 * (그게 축적 자산이고, 원문이 프라이버시 부담이 큰 쪽이다).
 */
export function pruneRaw(
  entries: NoteboardEntry[],
  today = localDateStr()
): NoteboardEntry[] {
  const cutoff = addDays(today, -(NOTE_RAW_RETENTION_DAYS - 1));
  return entries.map((e) => (e.date < cutoff && e.raw ? { ...e, raw: undefined } : e));
}

/** 아이별 항목 (최신 날짜 우선). 읽을 때마다 보존 정책을 적용해 되돌려 쓴다. */
export const loadNotes = (childId: string): NoteboardEntry[] => {
  const all = pruneRaw(loadAll());
  persist(all);
  return all.filter((e) => e.childId === childId).sort((a, b) => (a.date < b.date ? 1 : -1));
};

export const loadTodayNote = (childId: string): NoteboardEntry | null =>
  loadNotes(childId).find((e) => e.date === localDateStr()) ?? null;

/** 아이·날짜당 1건 upsert + 아이별 상한 유지 */
export const saveNote = (entry: NoteboardEntry): void => {
  const rest = pruneRaw(loadAll()).filter(
    (e) => !(e.childId === entry.childId && e.date === entry.date)
  );
  const mine = rest
    .filter((e) => e.childId === entry.childId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, MAX_ENTRIES_PER_CHILD - 1);
  persist([...rest.filter((e) => e.childId !== entry.childId), ...mine, entry]);
  notifyChanged();
};

export const deleteNote = (childId: string, date: string): void => {
  persist(loadAll().filter((e) => !(e.childId === childId && e.date === date)));
  notifyChanged();
};

export const clearNotes = (childId: string): void => {
  persist(loadAll().filter((e) => e.childId !== childId));
  notifyChanged();
};

/* ---------- 파생 ---------- */

/**
 * 같은 건강 관찰이 이번 주에 몇 번 나왔는지 — "콧물 관찰 2번째" 한 줄의 재료.
 * 최근 7일(오늘 포함) 안에서만 센다. 진단이 아니라 **등장 횟수**다.
 */
export function healthMentionCount(
  entries: NoteboardEntry[],
  label: string,
  today = localDateStr()
): number {
  const cutoff = addDays(today, -6);
  return entries.filter(
    (e) =>
      e.date >= cutoff &&
      e.date <= today &&
      e.result.findings.some((f) => f.kind === "health" && f.label === label)
  ).length;
}
