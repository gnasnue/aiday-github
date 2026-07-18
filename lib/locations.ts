/**
 * 위치 v1 — 서울 25개 자치구 매핑.
 *
 * 홈 위치 버튼에서 Geolocation 좌표를 받아 최근접 구를 찾고,
 * 날씨는 사용자 좌표 그대로(기상청 격자 변환은 API 라우트가 수행),
 * 미세먼지는 해당 구의 에어코리아 측정소명으로 조회한다.
 * 서울 밖(최근접 구가 20km 초과)은 null — 호출부가 정직하게 미지원 안내.
 */

export type SeoulGu = {
  name: string; // 구 이름 (라벨·에어코리아 측정소명 겸용 — 서울 측정소는 구 단위 동명)
  lat: number;
  lon: number;
};

// 각 구청 좌표 기준
export const SEOUL_GUS: SeoulGu[] = [
  { name: "종로구", lat: 37.5735, lon: 126.979 },
  { name: "중구", lat: 37.5636, lon: 126.9976 },
  { name: "용산구", lat: 37.5324, lon: 126.9903 },
  { name: "성동구", lat: 37.5634, lon: 127.0369 },
  { name: "광진구", lat: 37.5385, lon: 127.0823 },
  { name: "동대문구", lat: 37.5744, lon: 127.0396 },
  { name: "중랑구", lat: 37.6063, lon: 127.0925 },
  { name: "성북구", lat: 37.5894, lon: 127.0167 },
  { name: "강북구", lat: 37.6396, lon: 127.0257 },
  { name: "도봉구", lat: 37.6688, lon: 127.0472 },
  { name: "노원구", lat: 37.6543, lon: 127.0568 },
  { name: "은평구", lat: 37.6027, lon: 126.9291 },
  { name: "서대문구", lat: 37.5791, lon: 126.9368 },
  { name: "마포구", lat: 37.5663, lon: 126.9014 },
  { name: "양천구", lat: 37.517, lon: 126.8666 },
  { name: "강서구", lat: 37.551, lon: 126.8495 },
  { name: "구로구", lat: 37.4954, lon: 126.8874 },
  { name: "금천구", lat: 37.4569, lon: 126.8955 },
  { name: "영등포구", lat: 37.5264, lon: 126.8963 },
  { name: "동작구", lat: 37.5124, lon: 126.9393 },
  { name: "관악구", lat: 37.4784, lon: 126.9516 },
  { name: "서초구", lat: 37.4837, lon: 127.0324 },
  { name: "강남구", lat: 37.5172, lon: 127.0473 },
  { name: "송파구", lat: 37.5145, lon: 127.106 },
  { name: "강동구", lat: 37.5301, lon: 127.1238 },
];

// 서울 판정 상한: 최근접 구청에서 20km를 넘으면 사실상 서울 밖이다
const MAX_DISTANCE_KM = 20;

// Haversine 거리(km)
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestSeoulGu(lat: number, lon: number): SeoulGu | null {
  let best: SeoulGu | null = null;
  let bestD = Infinity;
  for (const gu of SEOUL_GUS) {
    const d = distanceKm(lat, lon, gu.lat, gu.lon);
    if (d < bestD) {
      bestD = d;
      best = gu;
    }
  }
  return bestD <= MAX_DISTANCE_KM ? best : null;
}
