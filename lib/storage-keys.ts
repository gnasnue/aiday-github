/**
 * localStorage 키 단일 출처 + `aiweather:` → `aiday:` 마이그레이션.
 *
 * 왜 이 파일이 있나 (PRODUCT-DECISIONS §3-4):
 * 네임스페이스를 `aiday:`로 통일하기로 확정한 뒤에도 부채가 줄지 않고 **번졌다**.
 * 원인은 이름이 아니라 출처였다 — `activeProfileId`가 화면 14곳에 문자열 리터럴로
 * 흩어져 있어서, 새 화면(하루·리뷰)이 기존 화면을 복사할 때 구 접두어가 따라왔다.
 * 그래서 ① 키는 여기서만 정의하고 ② 접근은 이 파일의 함수로만 하며
 * ③ eslint(`no-restricted-syntax`)가 `aiweather:` 리터럴과 이 파일 밖의 직접
 * `localStorage` 접근을 막는다. 규칙을 문서에만 두면 또 번진다.
 *
 * 마이그레이션은 `useEffect`가 아니라 **읽기 시점 자기치유**다.
 * React는 자식 effect가 부모보다 먼저 실행되므로, provider의 effect에서 옮기면
 * 페이지가 이미 구키를 읽고 지나간 뒤에 돌아 첫 렌더가 빈 프로필로 뜬다.
 * 읽기에서 해결하면 실행 순서에 무관하게 안전하고, 어느 화면이 먼저 뜨든 같다.
 *
 * ⚠️ 구키는 이번 단계에서 **지우지 않고 미러로 함께 쓴다.**
 * 배포 직후 bfcache에 남은 구버전 번들 탭이 구키에 쓴 변경(프로필 추가·아이 전환)을
 * 잃지 않기 위함이다. 미러 쓰기를 제거하고 구키를 삭제하는 것은 다음 릴리스의 일이며,
 * 그때는 이 파일의 LEGACY 맵과 mirror 로직만 지우면 된다.
 */

export const PROFILES_KEY = "aiday:profiles";
export const ACTIVE_PROFILE_KEY = "aiday:activeProfileId";
export const ONBOARDING_KEY = "aiday:onboarding:v2";

/** 신키 → 구키. 이 맵에 있는 키만 자기치유·미러 대상이다. */
const LEGACY: Readonly<Record<string, string>> = {
  [PROFILES_KEY]: "aiweather:profiles",
  [ACTIVE_PROFILE_KEY]: "aiweather:activeProfileId",
  // 온보딩 진행 상태의 구키 접미사 `:v2`는 5단계 개편 때 붙은 것이라 신키와 같다.
  [ONBOARDING_KEY]: "aiweather:onboarding:v2",
};

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

/**
 * 신키를 읽고, 없으면 구키를 신키로 복사한 뒤 그 값을 반환한다(자기치유).
 * 저장소 접근 실패(사파리 프라이빗 등)는 전부 삼키고 null — 호출부는 값 없음만 다룬다.
 */
export function readKey(key: string): string | null {
  if (!hasStorage()) return null;
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;
    const legacyKey = LEGACY[key];
    if (!legacyKey) return null;
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue === null) return null;
    localStorage.setItem(key, legacyValue); // 복사만 — 구키는 미러로 남긴다
    return legacyValue;
  } catch {
    return null;
  }
}

/** 신키에 쓰고, 구키에도 미러로 쓴다(구버전 번들 탭 호환 — 다음 릴리스에서 제거). */
export function writeKey(key: string, value: string) {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(key, value);
    const legacyKey = LEGACY[key];
    if (legacyKey) localStorage.setItem(legacyKey, value);
  } catch {
    // ignore
  }
}

/** 신키·구키를 함께 지운다 — 한쪽만 지우면 다음 읽기가 자기치유로 되살린다. */
export function removeKey(key: string) {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(key);
    const legacyKey = LEGACY[key];
    if (legacyKey) localStorage.removeItem(legacyKey);
  } catch {
    // ignore
  }
}

/* ---------- 화면이 쓰는 접근자 ---------- */

export const getActiveProfileId = (): string | null => readKey(ACTIVE_PROFILE_KEY);

export const setActiveProfileId = (id: string) => writeKey(ACTIVE_PROFILE_KEY, id);

/**
 * 로그아웃 시 이 기기에서 아이 정보를 지운다.
 * 아이 건강정보(민감정보)를 남기지 않는 것이 목적이므로 프로필·활성 선택을 함께 지운다.
 */
export const clearProfileStorage = () => {
  removeKey(PROFILES_KEY);
  removeKey(ACTIVE_PROFILE_KEY);
};
