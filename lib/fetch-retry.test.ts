import { describe, it, expect } from "vitest";
import { fetchWithRetry } from "./fetch-retry";

/**
 * 결정적 시계: fetch 한 번당 durMs, sleep마다 그만큼 시간이 흐른 것으로 모델링한다.
 * 실제 타이머 없이 deadline 소진을 재현한다.
 */
function makeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** 순서대로 응답/예외를 내는 fetch 목. 각 호출은 durMs만큼 시간을 흘린다. */
function mockFetch(
  seq: Array<number | "throw">,
  clock: { advance: (ms: number) => void },
  durMs = 1000
) {
  let i = 0;
  const calls = { count: 0 };
  const impl = (async () => {
    calls.count++;
    const step = seq[Math.min(i, seq.length - 1)];
    i++;
    clock.advance(durMs);
    if (step === "throw") throw new Error("network");
    return new Response(step === 200 ? "{}" : "err", { status: step });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("fetchWithRetry — 상단 간헐 5xx/타임아웃 흡수", () => {
  it("첫 시도가 200이면 재시도 없이 즉시 반환한다", async () => {
    const clock = makeClock();
    const { impl, calls } = mockFetch([200], clock);
    const res = await fetchWithRetry("http://x", {
      fetchImpl: impl,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res?.status).toBe(200);
    expect(calls.count).toBe(1);
  });

  it("간헐 502 뒤 200이 오면 그 200을 붙잡아 반환한다 (핵심 회귀)", async () => {
    // 수정 전 동작(단일 시도)이라면 첫 502에서 멈춰 홈 섹션이 비었다.
    const clock = makeClock();
    const { impl, calls } = mockFetch([502, 502, 200], clock, 1000);
    const res = await fetchWithRetry("http://x", {
      fetchImpl: impl,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res?.status).toBe(200);
    expect(calls.count).toBe(3);
  });

  it("타임아웃(throw) 뒤 200도 회복한다", async () => {
    const clock = makeClock();
    const { impl, calls } = mockFetch(["throw", 200], clock, 1000);
    const res = await fetchWithRetry("http://x", {
      fetchImpl: impl,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res?.status).toBe(200);
    expect(calls.count).toBe(2);
  });

  it("4xx는 재시도하지 않고 즉시 반환한다 (입력·인증 오류)", async () => {
    const clock = makeClock();
    const { impl, calls } = mockFetch([401, 200], clock);
    const res = await fetchWithRetry("http://x", {
      fetchImpl: impl,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(res?.status).toBe(401);
    expect(calls.count).toBe(1);
  });

  it("계속 502면 예산 안에서 재시도하다 마지막 502를 반환하고 종료한다", async () => {
    const clock = makeClock();
    const { impl, calls } = mockFetch([502], clock, 1000); // 항상 502, 매 호출 1s 소모
    const res = await fetchWithRetry("http://x", {
      fetchImpl: impl,
      now: clock.now,
      sleep: clock.sleep,
      deadlineMs: 8000,
      backoffMs: 250,
      attemptTimeoutMs: 4000,
    });
    expect(res?.status).toBe(502); // null이 아니라 마지막 응답을 보존
    expect(calls.count).toBeGreaterThan(1); // 재시도했다
    expect(calls.count).toBeLessThan(20); // 무한 루프가 아니다(예산 내 종료)
  });

  it("계속 throw면 예산 소진 후 null을 반환한다", async () => {
    const clock = makeClock();
    const { impl, calls } = mockFetch(["throw"], clock, 1000);
    const res = await fetchWithRetry("http://x", {
      fetchImpl: impl,
      now: clock.now,
      sleep: clock.sleep,
      deadlineMs: 5000,
    });
    expect(res).toBeNull();
    expect(calls.count).toBeGreaterThan(1);
  });
});
