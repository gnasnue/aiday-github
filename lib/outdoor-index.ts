// 오늘의 야외활동 지수 — 환경 수치를 0~100 점수로 종합
// 대기질·자외선·꽃가루·강수·기온·바람을 감점 방식으로 합산한다.
// 입력은 모두 선택적(null 허용)이며, 없는 항목은 감점하지 않는다.

export type OutdoorIndexInput = {
  pm10Grade?: number | null;
  pm25Grade?: number | null;
  uvi?: number | null;
  pollenMax?: number | null; // 참나무·소나무·잡초 중 최고 등급(1~4)
  pop?: number | null; // 강수확률(%)
  temp?: number | null; // 기온(°C)
  windSpeed?: number | null; // 풍속(m/s)
};

export type OutdoorIndexResult = {
  score: number; // 0~100
  label: "좋음" | "보통" | "주의" | "나쁨";
  comment: string;
  basis: string[]; // 계산에 쓰인 공인 입력값 (화면 하단 근거 표기용)
};

const labelOf = (s: number): OutdoorIndexResult["label"] =>
  s >= 80 ? "좋음" : s >= 60 ? "보통" : s >= 40 ? "주의" : "나쁨";

// 통합대기 등급(1~4) → 라벨 (에어코리아 공인 등급)
const airGradeLabel = (g: number): string =>
  g === 1 ? "좋음" : g === 2 ? "보통" : g === 3 ? "나쁨" : g === 4 ? "매우나쁨" : "정보없음";
const uvBandLabel = (v: number): string =>
  v >= 11 ? "위험" : v >= 8 ? "매우높음" : v >= 6 ? "높음" : v >= 3 ? "보통" : "낮음";
const uviLabelValue = (v: number): string => `${v}(${uvBandLabel(v)})`;
const pollenBandLabel = (g: number): string =>
  g >= 4 ? "매우높음" : g >= 3 ? "높음" : g >= 2 ? "보통" : "낮음";

export function computeOutdoorIndex(input: OutdoorIndexInput): OutdoorIndexResult {
  let score = 100;
  // 감점 사유를 크기순으로 모아 대표 코멘트를 만든다
  const reasons: { penalty: number; text: string }[] = [];

  const push = (penalty: number, text: string) => {
    if (penalty > 0) {
      score -= penalty;
      reasons.push({ penalty, text });
    }
  };

  // 대기질 — PM10·PM2.5 중 나쁜 등급 기준
  const airGrade = Math.max(input.pm10Grade ?? 0, input.pm25Grade ?? 0);
  if (airGrade >= 4) push(55, "미세먼지가 매우 나빠요");
  else if (airGrade >= 3) push(30, "미세먼지가 나쁜 편이에요");
  else if (airGrade >= 2) push(10, "미세먼지가 보통 수준이에요");

  // 자외선
  const uvi = input.uvi ?? null;
  if (uvi != null) {
    if (uvi >= 11) push(25, "자외선이 위험 수준이에요");
    else if (uvi >= 8) push(18, "자외선이 매우 높아요");
    else if (uvi >= 6) push(10, "자외선이 높은 편이에요");
    else if (uvi >= 3) push(3, "자외선이 보통 수준이에요");
  }

  // 꽃가루
  const pollen = input.pollenMax ?? null;
  if (pollen != null) {
    if (pollen >= 4) push(25, "꽃가루가 매우 높아요");
    else if (pollen >= 3) push(15, "꽃가루가 높은 편이에요");
    else if (pollen >= 2) push(5, "꽃가루가 다소 있어요");
  }

  // 강수확률
  const pop = input.pop ?? null;
  if (pop != null) {
    if (pop >= 70) push(30, "비 올 확률이 높아요");
    else if (pop >= 50) push(20, "비 소식이 있어요");
    else if (pop >= 30) push(8, "강수확률이 다소 있어요");
  }

  // 기온 극값
  const temp = input.temp ?? null;
  if (temp != null) {
    if (temp <= 0 || temp >= 33) push(20, temp >= 33 ? "무더위가 심해요" : "매우 추워요");
    else if (temp <= 5 || temp >= 31) push(10, temp >= 31 ? "더운 편이에요" : "추운 편이에요");
  }

  // 바람
  const wind = input.windSpeed ?? null;
  if (wind != null) {
    if (wind >= 9) push(15, "바람이 강해요");
    else if (wind >= 5) push(5, "바람이 다소 불어요");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = labelOf(score);

  // 코멘트: 가장 큰 감점 요인 최대 2개 + 상태별 마무리 문구
  reasons.sort((a, b) => b.penalty - a.penalty);
  const top = reasons.slice(0, 2).map((r) => r.text);
  const tail =
    label === "좋음"
      ? reasons.length
        ? "대체로 야외활동에 무리 없어요."
        : "야외활동하기 좋은 날이에요."
      : label === "보통"
        ? "짧은 외출은 무리 없어요."
        : label === "주의"
          ? "외출 시간을 줄이고 대비를 챙기세요."
          : "가급적 실내 활동을 권장해요.";
  const comment = top.length ? `${top.join(", ")}. ${tail}` : `쾌적한 환경이에요. ${tail}`;

  // 계산 근거: 실제로 반영된 공인 입력값만 나열 (화면 하단 표기용)
  const basis: string[] = [];
  if (airGrade >= 1) basis.push(`통합대기 ${airGradeLabel(airGrade)}`);
  if (uvi != null) basis.push(`자외선 ${uviLabelValue(uvi)}`);
  if (pollen != null) basis.push(`꽃가루 ${pollenBandLabel(pollen)}`);
  if (pop != null) basis.push(`강수확률 ${pop}%`);
  if (temp != null) basis.push(`기온 ${Math.round(temp)}°C`);
  if (wind != null && wind >= 5) basis.push(`바람 ${wind}m/s`);

  return { score, label, comment, basis };
}
