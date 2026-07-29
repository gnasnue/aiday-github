import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_PROFILE_KEY,
  PROFILES_KEY,
  clearProfileStorage,
  getActiveProfileId,
  readKey,
  removeKey,
  setActiveProfileId,
  writeKey,
} from "./storage-keys";

/**
 * 구 접두어(`aiweather:`)에서 신 접두어(`aiday:`)로 넘어가는 자기치유 경로를 고정한다.
 * 이 테스트가 지키는 것은 "이미 앱을 쓰던 사람의 프로필이 사라지지 않는다"이며,
 * 마이그레이션 코드를 지울 때(다음 릴리스, 미러 쓰기 제거) 무엇이 깨지는지도 알려준다.
 */

// vitest는 node 환경(jsdom 없음)이라 localStorage를 직접 만든다.
const store = new Map<string, string>();
const fake = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: fake });
  vi.stubGlobal("localStorage", fake);
});

describe("readKey — 구키 자기치유", () => {
  it("신키가 없고 구키만 있으면 신키로 복사해 반환한다", () => {
    store.set("aiweather:activeProfileId", "child-1");

    expect(getActiveProfileId()).toBe("child-1");
    expect(store.get(ACTIVE_PROFILE_KEY)).toBe("child-1");
  });

  it("구키는 지우지 않고 미러로 남긴다 — 배포 직후 구버전 번들 탭 보호", () => {
    store.set("aiweather:profiles", "[]");

    readKey(PROFILES_KEY);

    expect(store.get("aiweather:profiles")).toBe("[]");
  });

  it("신키가 이미 있으면 구키를 보지 않는다 (신키가 정본)", () => {
    store.set(ACTIVE_PROFILE_KEY, "new");
    store.set("aiweather:activeProfileId", "old");

    expect(getActiveProfileId()).toBe("new");
  });

  it("둘 다 없으면 null", () => {
    expect(getActiveProfileId()).toBeNull();
  });

  it("빈 문자열도 값으로 취급한다 (없음과 구분)", () => {
    store.set(ACTIVE_PROFILE_KEY, "");

    expect(getActiveProfileId()).toBe("");
  });

  it("마이그레이션 대상이 아닌 키는 구키를 찾지 않는다", () => {
    store.set("aiweather:somethingElse", "x");

    expect(readKey("aiday:somethingElse")).toBeNull();
  });

  it("저장소 접근이 던지면 null (사파리 프라이빗 등)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: fake.setItem,
      removeItem: fake.removeItem,
    });

    expect(getActiveProfileId()).toBeNull();
  });

  it("SSR(window 없음)에서는 null — 하이드레이션 불일치 방지", () => {
    vi.stubGlobal("window", undefined);

    expect(getActiveProfileId()).toBeNull();
  });
});

describe("writeKey — 신키 + 구키 미러", () => {
  it("두 키에 같은 값을 쓴다", () => {
    setActiveProfileId("child-2");

    expect(store.get(ACTIVE_PROFILE_KEY)).toBe("child-2");
    expect(store.get("aiweather:activeProfileId")).toBe("child-2");
  });

  it("미러 대상이 아닌 키는 신키에만 쓴다", () => {
    writeKey("aiday:onlyNew", "1");

    expect(store.get("aiday:onlyNew")).toBe("1");
    expect(store.size).toBe(1);
  });
});

describe("removeKey / clearProfileStorage", () => {
  it("신키만 지우면 다음 읽기가 구키로 되살리므로 둘 다 지운다", () => {
    setActiveProfileId("child-3");

    removeKey(ACTIVE_PROFILE_KEY);

    expect(getActiveProfileId()).toBeNull();
  });

  it("로그아웃은 프로필·활성 선택을 함께 지운다 (기기에 아이 정보 미잔류)", () => {
    writeKey(PROFILES_KEY, '[{"id":"child-4"}]');
    setActiveProfileId("child-4");

    clearProfileStorage();

    expect(store.size).toBe(0);
  });
});
