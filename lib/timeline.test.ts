import { describe, it, expect } from "vitest";
import { buildTimeline } from "./timeline";
import { feelsLikeC } from "./feels-like";

// 강수 노출 창(popWindow·rainWindow) 집계 검증 — 슬롯 정시값만 보면 놓치는
// "시점이 어긋난 소나기"를 창 max가 잡아내는지 확인한다.
const hour = (h: string, pop: number, pty = 0) => ({
  hour: h,
  temp: 28,
  sky: 3,
  pty,
  humidity: 60,
  windSpeed: 1,
  pop,
});

describe("buildTimeline — 강수 노출 창", () => {
  it("창 안의 소나기 예보를 popWindow(max)·rainWindow로 집계한다", () => {
    const slots = buildTimeline(undefined, {
      // 기본 슬롯: 등원 08:00 / 하원 15:00 / 저녁 21:00
      weather: {
        hourlyForecast: [
          hour("06:00", 10),
          hour("09:00", 10),
          hour("12:00", 80, 4), // 정오 소나기 — 등원 정시값(10%)만 보면 놓친다
          hour("15:00", 20),
          hour("18:00", 20),
          hour("21:00", 0),
        ],
      },
      air: null,
      uv: null,
      pollen: null,
    });
    expect(slots).not.toBeNull();
    const [go, leave, evening] = slots!;
    expect(go.pop).toBe(10); // 정시값은 그대로
    expect(go.popWindow).toBe(80); // 창(등원~하원) max가 소나기를 잡는다
    expect(go.rainWindow).toBe(true);
    expect(leave.popWindow).toBe(20); // 하원 창(15~21시)엔 소나기 없음
    expect(leave.rainWindow).toBe(false);
    expect(evening.popWindow).toBe(0);
  });
});

// 체감온도 위임 검증 — 2026-07 조사: 종전 `기온 − 0.7×풍속` 감산식은 습도를 무시하고
// 여름엔 방향 자체가 반대였다. 슬롯 feels가 공용 feelsLikeC(습도 포함)를 쓰는지 고정한다.
describe("buildTimeline — 체감온도(공용 공식 위임)", () => {
  const wet = (h: string) => ({
    hour: h,
    temp: 25,
    sky: 1,
    pty: 0,
    humidity: 85,
    windSpeed: 5,
    pop: 0,
  });
  const env = {
    weather: { hourlyForecast: [wet("09:00"), wet("15:00"), wet("21:00")] },
    air: null,
    uv: null,
    pollen: null,
  };

  it("슬롯 체감은 공용 feelsLikeC(기온·습도·풍속) 결과와 동일하다 — 습도 전달 누락 회귀 방지", () => {
    const slots = buildTimeline(undefined, env);
    expect(slots).not.toBeNull();
    for (const s of slots!) expect(s.feels).toBe(feelsLikeC(25, 85, 5));
  });

  it("종전 `기온 − 0.7×풍속` 감산식으로 회귀하지 않는다 (계절 무관: 습윤 25°C에서 체감 ≥ 기온)", () => {
    // 기온 25°C·습도 85%·풍속 5m/s: 여름 공식 27°C, 겨울 경로도 10°C 초과 가드로 기온 유지(25°C).
    // 종전 감산식이면 22°C(기온 미만)가 되어 계절과 무관하게 실패한다.
    const [go] = buildTimeline(undefined, env)!;
    expect(go.feels).toBeGreaterThanOrEqual(go.temp);
  });
});
