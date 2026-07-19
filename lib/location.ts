/**
 * 위치 v1 — 앱 전역 단일 기준지(서울 구 단위).
 *
 * 홈·환경·옷차림·마이가 공유하는 위치 상태의 단일 진실(localStorage `aiday:location:v1`).
 * 날씨는 사용자 좌표 그대로(기상청 격자 변환은 API 라우트가 수행),
 * 미세먼지는 해당 구의 에어코리아 측정소명(station)으로 조회한다.
 * 라벨과 데이터 기준지가 항상 일치한다.
 */
export type AppLocation = { gu: string; lat: number; lon: number; station: string };

export const LOCATION_KEY = "aiday:location:v1";

// 기본 기준지: 서울시청 좌표 + 중구 측정소 (라벨 "서울 중구"와 데이터 일치)
export const DEFAULT_LOCATION: AppLocation = { gu: "중구", lat: 37.5665, lon: 126.978, station: "중구" };

// 같은 탭 내 다른 화면에 위치 변경을 알리는 커스텀 이벤트 (storage 이벤트는 다른 탭에만 발화)
export const LOCATION_CHANGE_EVENT = "aiday:location-change";

export function loadLocation(): AppLocation {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCATION_KEY) ?? "null");
    if (
      saved &&
      typeof saved.lat === "number" &&
      typeof saved.lon === "number" &&
      typeof saved.gu === "string" &&
      typeof saved.station === "string"
    )
      return saved as AppLocation;
  } catch {}
  return DEFAULT_LOCATION;
}

export function saveLocation(loc: AppLocation) {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
    // 같은 탭의 다른 마운트 화면(useLocation)에 즉시 반영
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
  } catch {}
}
