/**
 * 기상청 체감온도 공식 (공용 — 홈 현재값·시간대별 카드에서 사용).
 *
 * - 여름철(5~9월): 습구온도(Stull, 2011) 기반 — 습도가 높을수록 기온보다 높게 체감된다.
 * - 그 외 기간: 풍속 기반 wind chill — 기온 10°C 이하·풍속 1.3m/s(4.8km/h) 이상일 때만
 *   적용하고, 조건 밖에서는 기온 그대로가 체감이다.
 *
 * 종전의 `기온 − 0.7×풍속` 근사는 겨울용 감산식이라 여름에는 방향 자체가 반대로
 * 틀렸다(습한 7월 저녁 실측: 앱 24°C vs 기상청 공식 27.3°C).
 */
export function feelsLikeC(
  tempC: number,
  humidityPct: number | null,
  windMps: number | null,
  // KST 벽시계로 보정된 Date를 UTC 게터로 읽는 프로젝트 관례를 따른다
  when: Date = new Date(Date.now() + 9 * 60 * 60 * 1000)
): number {
  const month = when.getUTCMonth() + 1;

  if (month >= 5 && month <= 9) {
    // 습도 미상이면 계산 불가 — 그럴듯한 오답 대신 기온을 그대로 반환한다
    if (humidityPct == null) return Math.round(tempC);
    const rh = humidityPct;
    const tw =
      tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
      Math.atan(tempC + rh) -
      Math.atan(rh - 1.676331) +
      0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
      4.686035;
    return Math.round(
      -0.2442 + 0.55399 * tw + 0.45535 * tempC - 0.0022 * tw * tw + 0.00278 * tw * tempC + 3.0
    );
  }

  const vKmh = (windMps ?? 0) * 3.6;
  if (tempC > 10 || vKmh < 4.8) return Math.round(tempC);
  return Math.round(
    13.12 +
      0.6215 * tempC -
      11.37 * Math.pow(vKmh, 0.16) +
      0.3965 * tempC * Math.pow(vKmh, 0.16)
  );
}
