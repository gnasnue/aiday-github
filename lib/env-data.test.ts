import { describe, it, expect } from "vitest";
import { fetchEnvData, envRegion } from "./env-data";
import type { AppLocation } from "./location";

const LOC: AppLocation = { gu: "송파구", lat: 37.5145, lon: 127.1059, station: "송파구" };

/** 정상 응답 픽스처 — 각 테스트에서 필요한 부분만 덮어쓴다. */
const OK = {
  weather: {
    temperature: 27,
    feelsLike: 29,
    sky: 3,
    pty: 0,
    humidity: 62,
    windSpeed: 1.4,
    pop: 20,
    currentSource: "ncst",
  },
  air: { pm10: 41, pm25: 18, pm10Grade: 2, pm25Grade: 2, o3: 0.042, stationName: "송파구" },
  pollen: { oak: 1, pine: 0, weed: null },
  uv: { uvi: 7 },
  weekly: { week: [{ day: "수", date: "07-22", icon: "cloud", high: 31, low: 24, rain: 30, weekend: false }] },
};

type Route = "weather" | "air" | "pollen" | "uv" | "weekly";

const routeOf = (url: string): Route =>
  url.includes("/api/weather/weekly")
    ? "weekly"
    : url.includes("/api/weather")
      ? "weather"
      : url.includes("/api/air")
        ? "air"
        : url.includes("/api/pollen")
          ? "pollen"
          : "uv";

/**
 * 라우트별 동작을 지정하는 mock fetch.
 * 값 = 응답 JSON | "hang"(응답 없음 — 타임아웃 유도) | "throw"(네트워크 실패)
 * 배열이면 호출 순서대로 소비한다(재시도 검증용).
 */
const mockFetch = (
  behavior: Partial<Record<Route, unknown>>,
  calls: string[] = []
): typeof fetch => {
  const queues = new Map<Route, unknown[]>();
  return ((url: string, init?: RequestInit) => {
    calls.push(url);
    const route = routeOf(url);
    let spec = route in behavior ? behavior[route] : OK[route];
    if (Array.isArray(spec)) {
      if (!queues.has(route)) queues.set(route, [...spec]);
      const q = queues.get(route)!;
      spec = q.length > 1 ? q.shift() : q[0];
    }
    if (spec === "throw") return Promise.reject(new Error("network"));
    if (spec === "hang")
      return new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      });
    return Promise.resolve({ json: () => Promise.resolve(spec) } as Response);
  }) as unknown as typeof fetch;
};

describe("envRegion", () => {
  it("서울 지원 범위이므로 어느 구든 '서울'로 매핑한다 — 화면마다 하드코딩하던 값의 단일 출처", () => {
    expect(envRegion(LOC)).toBe("서울");
    expect(envRegion({ ...LOC, gu: "중구", station: "중구" })).toBe("서울");
  });
});

describe("fetchEnvData — 위치 파라미터 매핑", () => {
  it("날씨는 좌표, 대기질은 측정소, 꽃가루·자외선은 지역명으로 조회한다", async () => {
    const calls: string[] = [];
    await fetchEnvData(LOC, { fetchImpl: mockFetch({}, calls), includeWeekly: true });

    expect(calls.some((u) => u.includes("/api/weather?lat=37.5145&lon=127.1059"))).toBe(true);
    expect(calls.some((u) => u.includes("/api/air?station=" + encodeURIComponent("송파구")))).toBe(true);
    expect(calls.some((u) => u.startsWith("/api/pollen?region="))).toBe(true);
    expect(calls.some((u) => u.startsWith("/api/uv?region="))).toBe(true);
  });

  it("includeWeekly가 아니면 주간 예보를 아예 호출하지 않는다", async () => {
    const calls: string[] = [];
    await fetchEnvData(LOC, { fetchImpl: mockFetch({}, calls) });
    expect(calls.some((u) => u.includes("/api/weather/weekly"))).toBe(false);
  });
});

describe("fetchEnvData — 센티널 방어", () => {
  it("기상청 결측 센티널(-999)을 실측으로 통과시키지 않는다", async () => {
    const data = await fetchEnvData(LOC, {
      fetchImpl: mockFetch({
        weather: { ...OK.weather, temperature: -999, humidity: -999, windSpeed: -998, pop: -999 },
      }),
    });
    expect(data.weather?.temperature).toBeNull();
    expect(data.weather?.humidity).toBeNull();
    expect(data.weather?.windSpeed).toBeNull();
    expect(data.weather?.pop).toBeNull();
    // 기온이 결측이면 날씨 신호 자체를 못 쓰는 것으로 본다
    expect(data.missing).toContain("weather");
  });

  it("시간대별 예보 배열의 센티널도 개별 슬롯 단위로 막는다", async () => {
    const data = await fetchEnvData(LOC, {
      fetchImpl: mockFetch({
        weather: {
          ...OK.weather,
          hourlyForecast: [
            { hour: "09:00", temp: 26, sky: 1, pty: 0, humidity: 60, windSpeed: 1, pop: 10 },
            { hour: "12:00", temp: -999, sky: 3, pty: 0, humidity: -999, windSpeed: 2, pop: 20 },
          ],
        },
      }),
    });
    expect(data.weather?.hourlyForecast?.[0].temp).toBe(26);
    expect(data.weather?.hourlyForecast?.[1].temp).toBeNull();
    expect(data.weather?.hourlyForecast?.[1].humidity).toBeNull();
    // 센티널이 아닌 값은 그대로 살아남아야 한다
    expect(data.weather?.hourlyForecast?.[1].windSpeed).toBe(2);
  });

  it("대기질 등급은 1~4 밖(0·9 등 결측 표기)이면 결측 처리한다", async () => {
    const data = await fetchEnvData(LOC, {
      fetchImpl: mockFetch({ air: { ...OK.air, pm10Grade: 0, pm25Grade: 9 } }),
    });
    expect(data.air?.pm10Grade).toBeNull();
    expect(data.air?.pm25Grade).toBeNull();
    // o3는 살아 있으므로 대기질 신호 전체가 죽지는 않는다
    expect(data.air?.o3).toBe(0.042);
    expect(data.missing).not.toContain("air");
  });
});

describe("fetchEnvData — 부분 결과와 결측 신호", () => {
  it("한 소스가 죽어도 나머지는 그대로 오고, 죽은 신호만 missing에 남는다", async () => {
    const data = await fetchEnvData(LOC, {
      fetchImpl: mockFetch({ air: "throw" }),
      retries: { air: 0 },
    });
    expect(data.air).toBeNull();
    expect(data.missing).toContain("air");
    expect(data.weather?.temperature).toBe(27);
    expect(data.uv?.uvi).toBe(7);
    expect(data.missing).not.toContain("weather");
  });

  it("HTTP 200이어도 { error } 응답이면 실패로 취급한다", async () => {
    const data = await fetchEnvData(LOC, {
      fetchImpl: mockFetch({ pollen: { error: "upstream timeout" } }),
    });
    expect(data.pollen).toBeNull();
    expect(data.missing).toContain("pollen");
  });

  it("응답은 왔지만 핵심 값이 결측이면 '있다'고 오판하지 않는다 (자외선 06시 발행 전)", async () => {
    const data = await fetchEnvData(LOC, { fetchImpl: mockFetch({ uv: { uvi: null } }) });
    expect(data.uv).not.toBeNull();
    expect(data.missing).toContain("uv");
  });

  it("모두 정상이면 missing이 비어 있다", async () => {
    const data = await fetchEnvData(LOC, { fetchImpl: mockFetch({}) });
    expect(data.missing).toEqual([]);
    expect(data.weather?.temperature).toBe(27);
    expect(data.air?.pm10Grade).toBe(2);
    expect(data.pollen?.oak).toBe(1);
    expect(data.uv?.uvi).toBe(7);
  });
});

describe("fetchEnvData — 타임아웃·재시도", () => {
  it("응답이 없으면 타임아웃 후 결측으로 수렴한다 (스켈레톤 영구 정지 방지)", async () => {
    const data = await fetchEnvData(LOC, {
      fetchImpl: mockFetch({ uv: "hang" }),
      timeouts: { uv: 20 },
    });
    expect(data.uv).toBeNull();
    expect(data.missing).toContain("uv");
  });

  it("weather·air는 1회 재시도한다 — 콜드 캐시 첫 로드가 폴백에 갇히지 않게", async () => {
    const calls: string[] = [];
    const data = await fetchEnvData(LOC, {
      fetchImpl: mockFetch({ weather: ["throw", OK.weather] }, calls),
      retryDelayMs: 1,
    });
    expect(calls.filter((u) => u.includes("/api/weather")).length).toBe(2);
    expect(data.weather?.temperature).toBe(27);
    expect(data.missing).not.toContain("weather");
  });

  it("꽃가루·자외선은 재시도하지 않는다 — 화면 착수를 늦추지 않기 위해", async () => {
    const calls: string[] = [];
    await fetchEnvData(LOC, { fetchImpl: mockFetch({ pollen: "throw" }, calls), retryDelayMs: 1 });
    expect(calls.filter((u) => u.includes("/api/pollen")).length).toBe(1);
  });
});

describe("fetchEnvData — 취소", () => {
  it("이미 취소된 신호로 호출하면 요청을 보내지 않고 전부 결측으로 돌아온다", async () => {
    const calls: string[] = [];
    const ac = new AbortController();
    ac.abort();
    const data = await fetchEnvData(LOC, { fetchImpl: mockFetch({}, calls), signal: ac.signal });
    expect(calls).toEqual([]);
    expect(data.missing).toEqual(["weather", "air", "pollen", "uv"]);
  });

  it("진행 중 취소되면 재시도로 이어지지 않는다", async () => {
    const calls: string[] = [];
    const ac = new AbortController();
    const p = fetchEnvData(LOC, {
      fetchImpl: mockFetch({ weather: "hang", air: "hang", pollen: "hang", uv: "hang" }, calls),
      signal: ac.signal,
      retryDelayMs: 1,
    });
    ac.abort();
    const data = await p;
    expect(calls.length).toBe(4); // 재시도 없이 최초 4건뿐
    expect(data.missing).toContain("weather");
  });
});
