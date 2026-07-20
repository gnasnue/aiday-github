import { describe, it, expect } from "vitest";
import { buildTimeline, buildTomorrowTimeline } from "./timeline";
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
      // 기본 슬롯: 등원 08:00 / 야외활동 11:00 / 하원 15:00 / 저녁 21:00
      weather: {
        hourlyForecast: [
          hour("06:00", 10),
          hour("09:00", 10),
          hour("12:00", 10),
          hour("15:00", 20),
          hour("18:00", 80, 4), // 초저녁 소나기 — 하원 정시값(20%)만 보면 놓친다
          hour("21:00", 0),
        ],
      },
      air: null,
      uv: null,
      pollen: null,
    });
    expect(slots).not.toBeNull();
    // 일과 미입력 시에도 야외활동 포함 4슬롯이 기본 노출된다
    expect(slots!.map((s) => s.time)).toEqual(["등원시간", "야외활동", "하원시간", "저녁"]);
    const [go, outdoor, leave, evening] = slots!;
    expect(go.popWindow).toBe(10); // 등원 창(08~11시)엔 소나기 없음
    expect(go.rainWindow).toBe(false);
    expect(outdoor.popWindow).toBe(20); // 야외 창(11~15시): 12시 10%·15시 20%
    expect(leave.pop).toBe(20); // 정시값은 그대로
    expect(leave.popWindow).toBe(80); // 창(하원~저녁) max가 18시 소나기를 잡는다
    expect(leave.rainWindow).toBe(true);
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

// 내일 미리보기 빌더 — 내일분 예보·자외선만으로 슬롯을 구성하고,
// 존재하지 않는 내일 미세먼지·꽃가루는 중립 폴백으로 남는지(렌더에서 숨김 전제) 고정한다.
describe("buildTomorrowTimeline — 내일 미리보기", () => {
  const t = (h: string) => ({
    hour: h,
    temp: 30,
    sky: 1,
    pty: 0,
    humidity: 55,
    windSpeed: 2,
    pop: 20,
  });
  const env = {
    weather: {
      hourlyForecast: [], // 오늘분이 비어도 내일분만으로 동작해야 한다
      hourlyForecastTomorrow: [t("06:00"), t("09:00"), t("12:00"), t("15:00"), t("18:00"), t("21:00")],
    },
    air: { pm10Grade: 3, hourly: { "9": 3 } }, // 오늘 실측 — 내일 슬롯에 새면 안 됨
    uv: { uvi: 2, hourly: { "12": 3 }, hourlyTomorrow: { "9": 7, "12": 9 } },
    pollen: { oak: 4, pine: null, weed: null }, // 오늘 지수 — 내일 슬롯에 새면 안 됨
  };

  it("내일분 예보·자외선으로 4슬롯을 만들고, 오늘 실측(미세먼지·꽃가루)은 쓰지 않는다", () => {
    const slots = buildTomorrowTimeline(undefined, env);
    expect(slots).not.toBeNull();
    expect(slots!.map((s) => s.time)).toEqual(["등원시간", "야외활동", "하원시간", "저녁"]);
    const [go] = slots!;
    expect(go.temp).toBe(30);
    expect(go.uv).toBe("강함"); // 내일 9시 UVI 7 → 강함 (hourlyTomorrow 사용 확인)
    // 오늘의 미세먼지 나쁨(3)·꽃가루 매우높음(4)이 내일 카드로 새지 않는다 — 중립 폴백
    expect(go.dust).toBe("보통");
    expect(go.pollen).toBe("낮음");
  });

  it("내일분 예보가 없으면 null (호출부가 빈 상태 안내로 렌더)", () => {
    expect(buildTomorrowTimeline(undefined, { ...env, weather: { hourlyForecast: [t("09:00")] } })).toBeNull();
  });
});
