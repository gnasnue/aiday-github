/**
 * `NOTEBOARD_CHANGED_EVENT`의 발화 지점 회귀 테스트.
 *
 * 왜 별 파일인가: 이 테스트만 `window`·`localStorage` 스텁이 필요하다. 실제로 이 저장소의
 * 유닛 테스트는 DOM 없이 돌아서, 이벤트를 `persist()`에 걸었을 때 생긴 무한 재귀
 * (`loadNotes → persist → 이벤트 → 리스너가 loadNotes`)를 아무 테스트도 잡지 못했다.
 * 브라우저에서 스택 오버플로로 드러났고, 그래서 여기서 고정한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTEBOARD_CHANGED_EVENT,
  clearNotes,
  deleteNote,
  loadNotes,
  saveNote,
  type NoteboardEntry,
} from "./noteboard";

type Listener = () => void;

let listeners: Map<string, Listener[]>;
let store: Map<string, string>;

const entry = (date: string): NoteboardEntry => ({
  childId: "c1",
  date,
  raw: "원문",
  result: { headline: "한 줄", summary: "근거", talks: [], findings: [] },
  ts: 0,
});

beforeEach(() => {
  listeners = new Map();
  store = new Map();

  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });

  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener: (type: string, fn: Listener) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((l) => l !== fn));
    },
    dispatchEvent: (ev: { type: string }) => {
      for (const fn of listeners.get(ev.type) ?? []) fn();
      return true;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NOTEBOARD_CHANGED_EVENT", () => {
  it("읽기(loadNotes)는 이벤트를 쏘지 않는다 — 리스너가 다시 읽어도 재귀하지 않는다", () => {
    saveNote(entry("2026-07-20"));

    let reads = 0;
    // GrowthNoteCard가 하는 일과 같은 리스너 — 이벤트를 받으면 다시 읽는다.
    window.addEventListener(NOTEBOARD_CHANGED_EVENT, () => {
      reads += 1;
      loadNotes("c1");
    });

    expect(() => {
      loadNotes("c1");
      loadNotes("c1");
      loadNotes("c1");
    }).not.toThrow();
    expect(reads).toBe(0);
  });

  it("saveNote는 이벤트를 정확히 한 번 쏘고, 리스너의 재읽기가 루프를 만들지 않는다", () => {
    let fired = 0;
    window.addEventListener(NOTEBOARD_CHANGED_EVENT, () => {
      fired += 1;
      loadNotes("c1");
    });

    expect(() => saveNote(entry("2026-07-21"))).not.toThrow();
    expect(fired).toBe(1);
  });

  it("deleteNote·clearNotes도 변경을 알린다", () => {
    saveNote(entry("2026-07-22"));

    let fired = 0;
    window.addEventListener(NOTEBOARD_CHANGED_EVENT, () => void (fired += 1));

    deleteNote("c1", "2026-07-22");
    expect(fired).toBe(1);

    clearNotes("c1");
    expect(fired).toBe(2);
  });
});
