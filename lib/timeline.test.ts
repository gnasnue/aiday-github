import { describe, it, expect } from "vitest";
import { buildTimeline } from "./timeline";

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
