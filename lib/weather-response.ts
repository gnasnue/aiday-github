// 기상청 날씨 라우트의 "응답 상태 판정" — app/api/weather/route.ts에서 분리한 순수 결정.
//
// #154 회귀의 라우트 절반: 단기예보가 NO_DATA/장애로 전면 실패하면, 성공(200)으로
// 위장하지 않고 502로 돌려줘야 클라이언트가 재시도하고 서버 캐시가 데워질 여지가 생긴다.
// 파서 절반(extractFcstItems가 NO_DATA를 빈 배열로 정규화)은 lib/kma-forecast.ts에서
// 이미 테스트된다 — 여기서는 "무엇을 실패로 볼 것인가"의 경계만 결정·검증한다.
//
//   현재값 temperature   시간대별 hourlyForecast   →  판정
//   ------------------   ---------------------      ----------------------------
//   null                 0                          UNAVAILABLE (502)  — 전면 실패
//   있음                 0                          부분 성공 (200)    — 칩만 표시
//   null                 있음                       부분 성공 (200)    — 시간대만 표시
//   있음                 있음                       완전 성공 (200)
//
// "부분 성공"을 200으로 정직하게 내보내는 건 의도된 계약이다(상단 칩은 살리고 시간대별만
// 안내 카드로). 전면 실패만 502.

/**
 * 날씨 데이터가 "전면 실패"인지 판정한다. 현재값(temperature)도 없고 시간대별 예보도
 * 하나도 없을 때만 true(=502로 내보낼 대상). 둘 중 하나라도 있으면 부분/완전 성공.
 */
export function isWeatherUnavailable(
  temperature: number | null,
  hourlyForecastLength: number
): boolean {
  return temperature == null && hourlyForecastLength === 0;
}
