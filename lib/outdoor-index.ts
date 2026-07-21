// 오늘의 야외활동 지수 — 환경 수치를 0~100 점수로 종합
// 대기질·자외선·꽃가루·강수·기온·바람을 감점 방식으로 합산한다.
// 입력은 모두 선택적(null 허용)이며, 없는 항목은 감점하지 않는다.

export type OutdoorIndexInput = {
  pm10Grade?: number | null;
  pm25Grade?: number | null;
  uvi?: number | null;
  pollenMax?: number | null; // 참나무·소나무·잡초 중 최고 지수(0~3, 기상청 꽃가루농도위험지수)
  pop?: number | null; // 강수확률(%)
  humidity?: number | null; // 상대습도(%)
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
// 꽃가루농도위험지수(0~3) → 라벨. 낮음=0 · 보통=1 · 높음=2 · 매우높음=3
// (공공데이터포털 "기상청_꽃가루농도위험지수 조회서비스(3.0)" 설명서 기준, lib/timeline.ts와 동일)
const pollenBandLabel = (g: number): string =>
  g >= 3 ? "매우높음" : g >= 2 ? "높음" : g >= 1 ? "보통" : "낮음";

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
    if (pollen >= 3) push(25, "꽃가루가 매우 높아요");
    else if (pollen >= 2) push(15, "꽃가루가 높은 편이에요");
    else if (pollen >= 1) push(5, "꽃가루가 다소 있어요");
  }

  // 강수확률 — 앱 전체가 ≥60%를 확정 강수(우산·실내권장) 경계로, 40~59%를
  // 예비 신호로 쓴다(prep·outfit·home·report·weekend와 동일). 지수 버킷도 같은
  // 60/40 경계에 맞춰, 60%가 단독으로 "좋음"에 남지 않도록 감점을 키운다.
  const pop = input.pop ?? null;
  if (pop != null) {
    if (pop >= 70) push(38, "비 올 확률이 높아요");
    else if (pop >= 60) push(30, "비 올 확률이 높아요");
    else if (pop >= 40) push(12, "비 소식이 있어요");
  }

  // 기온·습도 — 더위는 습도와 결합해 체감·땀띠 위험이 커지므로 불쾌지수(DI)로
  // 판정하고, 추위는 기온 단독으로 본다. 아이 기준으로는 26°C·90% 같은 고온다습도
  // "무리 없음"이 아니다.
  const temp = input.temp ?? null;
  const humidity = input.humidity ?? null;

  // 기상청 불쾌지수: DI = 0.81T + 0.01·RH·(0.99T − 14.3) + 46.3
  // (75~80 = 다수 불쾌, 80↑ = 전원 불쾌). 기온만으로는 안 잡히는 여름 고온다습을 잡는다.
  const di =
    temp != null && humidity != null && temp >= 24
      ? 0.81 * temp + 0.01 * humidity * (0.99 * temp - 14.3) + 46.3
      : null;

  // 더위: 기온 단독 감점과 불쾌지수 감점 중 큰 값만 적용해 중복 감점을 막는다.
  let heatPenalty = 0;
  let heatText = "";
  if (temp != null && temp >= 33) {
    heatPenalty = 22; // 극단값은 감점만으로 80 밑으로 내려 점수·라벨 괴리를 막는다
    heatText = "무더위가 심해요";
  } else if (temp != null && temp >= 31) {
    heatPenalty = 10;
    heatText = "더운 편이에요";
  }
  if (di != null) {
    // 감점만으로 점수가 80 밑으로 내려가게 한다(env가 점수·막대를 같이 노출하므로
    // 점수는 높은데 라벨만 '보통'인 괴리를 피한다). DI≥76 임계는 env의 습도 '매우습함'
    // (>75%) 표기 경계와도 대략 맞물린다.
    const diPenalty = di >= 80 ? 28 : di >= 76 ? 21 : 0;
    if (diPenalty > heatPenalty) {
      heatPenalty = diPenalty;
      heatText = di >= 80 ? "무덥고 습해요" : "다소 무덥고 습해요";
    }
  }
  push(heatPenalty, heatText);

  // 추위: 기온 단독 (극단값은 감점만으로 80 밑으로)
  if (temp != null && temp <= 0) push(22, "매우 추워요");
  else if (temp != null && temp <= 5) push(10, "추운 편이에요");

  // 습도 단독 — 기온이 있으면 위 불쾌지수가 담당하므로, 기온 미상일 때의 fallback만.
  if (temp == null && humidity != null) {
    if (humidity >= 90) push(10, "공기가 매우 습해요");
    else if (humidity >= 80) push(5, "다소 습한 편이에요");
  }

  // 바람
  const wind = input.windSpeed ?? null;
  if (wind != null) {
    if (wind >= 9) push(15, "바람이 강해요");
    else if (wind >= 5) push(5, "바람이 다소 불어요");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // 결정적 저해 신호가 있으면 점수와 무관하게 "좋음" 라벨을 막는다. 앱의 다른
  // 화면이 warn/주의로 표시하는 상황에서 히어로 판단만 "좋음"이라 말하는 모순을
  // 산식 가중치와 독립적으로 차단한다.
  //  - 확정 강수 ≥60% · 대기 매우나쁨 · 고온다습 불쾌지수 ≥76
  //  - 극단 기온(≤0°C·≥33°C): "매우 추워요/무더위"가 감점 -20으로 80점에 안착해
  //    "좋음 + 무리 없어요"로 자기모순되던 케이스 차단
  const decisiveDeterrent =
    (pop != null && pop >= 60) ||
    airGrade >= 4 ||
    (di != null && di >= 76) ||
    (temp != null && (temp <= 0 || temp >= 33));
  let label = labelOf(score);
  if (decisiveDeterrent && label === "좋음") label = "보통";

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
  if (humidity != null && humidity >= 80) basis.push(`습도 ${Math.round(humidity)}%`);
  if (temp != null) basis.push(`기온 ${Math.round(temp)}°C`);
  if (wind != null && wind >= 5) basis.push(`바람 ${wind}m/s`);

  return { score, label, comment, basis };
}
