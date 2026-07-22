import { describe, it, expect } from "vitest";
import {
  selectTips,
  type TipProfileInput,
  type SelectTipsResult,
  type SelectedTip,
} from "./select";
import { TIP_ENTRIES } from "./content";
import type { EnvData } from "../env-data";

/** 모든 신호가 정상이고 전부 '낮음' 수준인 기본 환경 */
const baseEnv = (over: Partial<EnvData> = {}): EnvData => ({
  weather: {
    temperature: 22,
    feelsLike: 22,
    sky: 1,
    pty: 0,
    humidity: 55,
    windSpeed: 1,
    pop: 0,
  },
  air: { pm10: 20, pm25: 10, pm10Grade: 1, pm25Grade: 1, o3: 0.02, stationName: "중구" },
  pollen: { oak: 0, pine: 0, weed: null },
  uv: { uvi: 1 },
  weekly: null,
  missing: [],
  ...over,
});

const NOW = new Date("2026-07-22T09:00:00+09:00");

const ids = (r: SelectTipsResult) => r.tips.map((t) => t.id);
const find = (r: SelectTipsResult, id: string): SelectedTip => {
  const tip = r.tips.find((t) => t.id === id);
  if (!tip) throw new Error(`팁 '${id}'가 노출되지 않았습니다`);
  return tip;
};

const 건강한아이: TipProfileInput = { name: "지우", age: "만 5세", conditions: [] };
const 호흡기아이: TipProfileInput = {
  name: "지우",
  age: "만 5세",
  conditions: ["호흡기 민감 (비염, 천식·기관지)"],
};
const 구형프로필: TipProfileInput = { name: "도윤", age: "만 4세", conditions: ["비염"] };

describe("selectTips — 상시 팁", () => {
  it("환경과 무관한 일반 위생 팁은 항상 나온다", () => {
    expect(ids(selectTips(baseEnv(), 건강한아이, NOW))).toContain("general-hygiene");
  });

  it("일반 위생 팁에 계절을 단정하는 표현이 없다 (7월에 '환절기'가 뜨지 않게)", () => {
    const tip = find(selectTips(baseEnv(), 건강한아이, NOW), "general-hygiene");
    const text = [tip.title, ...Object.values(tip)].join(" ");
    expect(text).not.toMatch(/환절기|봄철|겨울철|여름철|가을철/);
  });
});

describe("selectTips — fail-closed (결측 시 침묵)", () => {
  it("환경 데이터가 아예 없으면 조건부 팁은 하나도 노출하지 않는다", () => {
    const r = selectTips(null, 건강한아이, NOW);
    expect(ids(r)).toEqual(["general-hygiene"]);
    // 꽃가루는 7월(제공 기간 밖)이라 침묵 목록에서 빠진다 — 없는 게 정상인 결측
    expect(r.suppressedSignals).toEqual(["uv", "air", "humidity"]);
  });

  it("자외선을 모르면 자외선 팁을 띄우지 않는다 — 근거 없는 확신을 만들지 않기 위해", () => {
    const r = selectTips(
      baseEnv({ uv: { uvi: null }, missing: ["uv"] }),
      건강한아이,
      NOW
    );
    expect(ids(r)).not.toContain("uv-high");
    expect(r.suppressedSignals).toContain("uv");
  });

  it("응답은 왔지만 등급이 전부 결측이면 대기질 팁을 침묵시킨다", () => {
    const r = selectTips(
      baseEnv({
        air: { pm10: null, pm25: null, pm10Grade: null, pm25Grade: null, o3: 0.02, stationName: "중구" },
      }),
      호흡기아이,
      NOW
    );
    expect(ids(r)).not.toContain("pm-high");
    expect(r.suppressedSignals).toContain("air");
  });

  it("한 신호가 결측이어도 나머지 신호의 팁은 정상 노출된다", () => {
    const r = selectTips(
      baseEnv({ uv: { uvi: null }, missing: ["uv"], pollen: { oak: 3, pine: 0, weed: null } }),
      건강한아이,
      NOW
    );
    expect(ids(r)).toContain("pollen-high");
    expect(ids(r)).not.toContain("uv-high");
  });

  it("정상 데이터에서는 침묵 신호가 없다", () => {
    expect(selectTips(baseEnv(), 건강한아이, NOW).suppressedSignals).toEqual([]);
  });

  it("제공 기간 밖(7월)의 꽃가루 결측은 '못 불러왔다'고 말하지 않는다 — 없는 게 정상", () => {
    const r = selectTips(
      baseEnv({ pollen: { oak: null, pine: null, weed: null } }),
      건강한아이,
      NOW // 2026-07-22
    );
    expect(r.suppressedSignals).not.toContain("pollen");
  });

  it("제공 기간(5월)의 꽃가루 결측은 침묵 신호로 알린다 — 이때는 실제 고장", () => {
    const r = selectTips(
      baseEnv({ pollen: { oak: null, pine: null, weed: null } }),
      건강한아이,
      new Date("2026-05-10T09:00:00+09:00")
    );
    expect(r.suppressedSignals).toContain("pollen");
  });
});

describe("selectTips — 공인 등급 기반 발동·심각도", () => {
  it("자외선은 '높음'(6) 미만이면 발동하지 않는다", () => {
    expect(ids(selectTips(baseEnv({ uv: { uvi: 5 } }), 건강한아이, NOW))).not.toContain("uv-high");
  });

  it("자외선 6 이상이면 주의, 8 이상이면 경고", () => {
    const warn = find(selectTips(baseEnv({ uv: { uvi: 6 } }), 건강한아이, NOW), "uv-high");
    expect(warn.severity).toBe("주의");
    expect(warn.title).toContain("강함");

    const alert = find(selectTips(baseEnv({ uv: { uvi: 9 } }), 건강한아이, NOW), "uv-high");
    expect(alert.severity).toBe("경고");
    expect(alert.title).toContain("매우강함");
  });

  it("대기질은 등급 '나쁨'(3)부터 발동하고 라벨이 환경정보 화면과 일치한다", () => {
    const ok = selectTips(
      baseEnv({ air: { ...baseEnv().air!, pm10Grade: 2, pm25Grade: 2 } }),
      건강한아이,
      NOW
    );
    expect(ids(ok)).not.toContain("pm-high");

    const bad = find(
      selectTips(baseEnv({ air: { ...baseEnv().air!, pm10Grade: 3, pm25Grade: 1 } }), 건강한아이, NOW),
      "pm-high"
    );
    expect(bad.title).toContain("나쁨");
    expect(bad.severity).toBe("주의");
  });

  it("PM10과 PM2.5 중 나쁜 쪽이 판단을 이끈다 (PM2.5만 나쁜 날을 놓치지 않게)", () => {
    const r = find(
      selectTips(baseEnv({ air: { ...baseEnv().air!, pm10Grade: 1, pm25Grade: 4 } }), 건강한아이, NOW),
      "pm-high"
    );
    expect(r.title).toContain("매우나쁨");
    expect(r.severity).toBe("경고");
  });

  it("건조는 습도 30% 이하에서만 발동한다 (환경정보 화면의 '건조' 기준과 동일)", () => {
    const wet = selectTips(
      baseEnv({ weather: { ...baseEnv().weather!, humidity: 31 } }),
      건강한아이,
      NOW
    );
    expect(ids(wet)).not.toContain("dry-skin");

    const dry = find(
      selectTips(baseEnv({ weather: { ...baseEnv().weather!, humidity: 30 } }), 건강한아이, NOW),
      "dry-skin"
    );
    expect(dry.severity).toBe("정보"); // 건조 자체는 경고가 아니다
    expect(dry.title).toContain("30");
  });
});

describe("selectTips — 오늘 하루 피크 기준 판단", () => {
  it("새벽에 열어도 낮의 자외선 피크로 판단한다 — '지금' 값만 보면 밤엔 절대 안 뜬다", () => {
    const 새벽 = baseEnv({
      uv: { uvi: 0, hourly: { "0": 0, "9": 4, "12": 9, "15": 5, "21": 0 } },
    });
    const tip = find(selectTips(새벽, 건강한아이, NOW), "uv-high");
    expect(tip.severity).toBe("경고"); // 낮 피크 9 → 매우강함
    expect(tip.title).toContain("매우강함");
  });

  it("하루 종일 낮으면 발동하지 않는다 (오늘처럼 흐린 날)", () => {
    const 흐림 = baseEnv({
      uv: { uvi: 0, hourly: { "0": 0, "9": 4, "12": 2, "15": 1, "21": 0 } },
    });
    expect(ids(selectTips(흐림, 건강한아이, NOW))).not.toContain("uv-high");
  });

  it("대기질도 시각별 등급의 최악값으로 판단한다", () => {
    const env = baseEnv({
      air: { ...baseEnv().air!, pm10Grade: 1, pm25Grade: 1, hourly: { "9": 1, "14": 3 } },
    });
    expect(find(selectTips(env, 건강한아이, NOW), "pm-high").title).toContain("나쁨");
  });

  it("건조는 하루 '최저' 습도로 판단한다 — 낮을수록 위험하므로", () => {
    const env = baseEnv({
      weather: {
        ...baseEnv().weather!,
        humidity: 70,
        hourlyForecast: [
          { hour: "09:00", temp: 20, sky: 1, pty: 0, humidity: 70, windSpeed: 1, pop: 0 },
          { hour: "15:00", temp: 26, sky: 1, pty: 0, humidity: 25, windSpeed: 1, pop: 0 },
        ],
      },
    });
    const tip = find(selectTips(env, 건강한아이, NOW), "dry-skin");
    expect(tip.title).toContain("25");
  });

  it("시간대별 데이터가 없으면 현재값으로 판단한다 (하위 호환)", () => {
    expect(ids(selectTips(baseEnv({ uv: { uvi: 9 } }), 건강한아이, NOW))).toContain("uv-high");
  });
});

describe("selectTips — 안심 신호 (조용한 이유 설명)", () => {
  it("확인했지만 기준 미달인 신호를 calmSignals로 알린다", () => {
    const r = selectTips(baseEnv(), 건강한아이, NOW);
    expect(r.tips.map((t) => t.category)).toEqual(["일반"]);
    // 픽스처는 꽃가루 지수도 실측(0)이라 안심 목록에 든다. 제공 기간 밖이면 값 자체가
    // 없어 결측으로 빠지므로(위 fail-closed 스위트), 7월 실데이터에서는 3개만 남는다.
    expect(r.calmSignals).toEqual(["uv", "air", "pollen", "humidity"]);
  });

  it("발동한 신호는 안심 목록에 넣지 않는다", () => {
    const r = selectTips(baseEnv({ uv: { uvi: 9 } }), 건강한아이, NOW);
    expect(r.calmSignals).not.toContain("uv");
    expect(r.calmSignals).toContain("air");
  });

  it("결측 신호는 안심도 경고도 아니다 — 확인 자체를 못 했으므로", () => {
    const r = selectTips(baseEnv({ uv: { uvi: null }, missing: ["uv"] }), 건강한아이, NOW);
    expect(r.calmSignals).not.toContain("uv");
    expect(r.suppressedSignals).toContain("uv");
  });
});

describe("selectTips — 프로필 매칭 (child-conditions 공유)", () => {
  it("호흡기 민감이면 미세먼지 팁의 심각도가 올라가고 이유가 붙는다", () => {
    const env = baseEnv({ air: { ...baseEnv().air!, pm10Grade: 3, pm25Grade: 3 } });
    expect(find(selectTips(env, 건강한아이, NOW), "pm-high").severity).toBe("주의");

    const matched = find(selectTips(env, 호흡기아이, NOW), "pm-high");
    expect(matched.severity).toBe("경고");
    expect(matched.matchedProfile).toContain("호흡기");
    expect(matched.summary).toContain("지우");
  });

  it("구형·데모 프로필의 짧은 라벨('비염')도 매칭한다 — 인라인 재구현이 놓치던 버그", () => {
    const env = baseEnv({ air: { ...baseEnv().air!, pm10Grade: 3, pm25Grade: 3 } });
    expect(find(selectTips(env, 구형프로필, NOW), "pm-high").matchedProfile).toBeTruthy();
  });

  it("피부 체질이면 건조 팁이 정보→주의로 올라가고 추가 권고가 붙는다", () => {
    const env = baseEnv({ weather: { ...baseEnv().weather!, humidity: 25 } });
    const plain = find(selectTips(env, 건강한아이, NOW), "dry-skin");
    const skin = find(
      selectTips(env, { ...건강한아이, conditions: ["아토피"] }, NOW),
      "dry-skin"
    );
    expect(plain.severity).toBe("정보");
    expect(skin.severity).toBe("주의");
    expect(skin.recommendations.length).toBeGreaterThan(plain.recommendations.length);
  });

  it("프로필이 없어도 조건부 팁은 정상 동작한다 (게스트)", () => {
    const r = selectTips(baseEnv({ uv: { uvi: 9 } }), null, NOW);
    expect(ids(r)).toContain("uv-high");
    expect(find(r, "uv-high").matchedProfile).toBeUndefined();
  });
});

describe("selectTips — 나이 게이팅 (마스크 안전 규칙)", () => {
  const dusty = baseEnv({ air: { ...baseEnv().air!, pm10Grade: 3, pm25Grade: 3 } });
  const maskLine = (p: TipProfileInput) =>
    find(selectTips(dusty, p, NOW), "pm-high").recommendations[0];

  it("만 2세 이상에게는 마스크를 권한다", () => {
    expect(maskLine({ name: "지우", age: "만 5세" })).toContain("마스크");
    expect(maskLine({ name: "지우", age: "24개월" })).toContain("KF80");
  });

  it("만 2세 미만에게는 마스크 대신 외출 자제를 권한다 (질식 위험)", () => {
    const line = maskLine({ name: "아기", age: "18개월" });
    expect(line).not.toContain("KF80");
    expect(line).toContain("외출");
  });

  it("생년월로도 나이를 판정한다", () => {
    const line = maskLine({ name: "아기", birth: { year: "2025", month: "6" } }); // 13개월
    expect(line).not.toContain("KF80");
  });

  it("나이를 알 수 없으면 기존 동작(권장 허용)을 유지한다", () => {
    expect(maskLine({ name: "이름만" })).toContain("KF80");
  });
});

describe("콘텐츠 무결성 — 출처 규율", () => {
  it("모든 팁에 기관명과 문서명을 갖춘 출처가 최소 1건 있다", () => {
    for (const e of TIP_ENTRIES) {
      expect(e.sources.length, e.id).toBeGreaterThan(0);
      for (const s of e.sources) {
        expect(s.org, e.id).toBeTruthy();
        expect(s.docTitle, e.id).toBeTruthy();
        expect(s.url, e.id).toMatch(/^https:\/\//);
      }
    }
  });

  it("모든 출처에 원문 확인일이 있다 — 재검토 주기의 기준", () => {
    for (const e of TIP_ENTRIES) {
      for (const s of e.sources) {
        expect(s.retrievedDate, `${e.id}/${s.org}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("문서명이 기관명을 그대로 반복하지 않는다 — 홈페이지 링크로 퇴화 방지", () => {
    for (const e of TIP_ENTRIES) {
      for (const s of e.sources) {
        expect(s.docTitle, `${e.id}/${s.org}`).not.toBe(s.org);
      }
    }
  });
});
