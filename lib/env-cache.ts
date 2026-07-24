// 홈 env 즉시 페인트 스냅샷 캐시 (A2)
//
// 콜드 재진입 시 시간대별 환경·케어 플랜·"지금 날씨" 카드가 weather+air 네트워크(콜드 ~5s)를
// 기다리며 스켈레톤에 갇히던 문제를 없앤다. 마지막 성공 env 응답을 위치별로 localStorage에
// 저장해 두고, 마운트 즉시 그 값으로 화면을 그린 뒤 백그라운드로 조용히 재검증한다(SWR).
//
// 스테일 상한(90분)은 예보 슬롯 허용폭(홈 케어 밴드 CARE_BAND_MIN=90)과 정렬한다. 그보다
// 오래된(예: 밤새 둔) 스냅샷은 즉시 노출하지 않고 스켈레톤으로 둔다 — 정확도 우선 원칙
// (무표기 스테일 폴백이 "지표 부정확" 체감의 근본 원인이었으므로, 오래된 값을 실측인 척
// 그리지 않는다). 밤새 만료된 첫 아침 진입은 스켈레톤 → 서버측 프리워밍 크론(B)이 데워 둔
// 캐시로 재검증이 빠르게 끝난다.

import type { EnvRaw } from "@/lib/timeline";

export type CurWeatherScalar = {
  temperature: number | null;
  feelsLike: number | null;
  windSpeed: number | null;
  humidity: number | null;
  pop: number | null;
  sky: number | null;
  pty: number | null;
} | null;

export type EnvSnapshot = {
  station: string;
  lat: number;
  lon: number;
  ts: number;
  env: EnvRaw;
  curWeather: CurWeatherScalar;
};

export type SnapshotLocation = { station: string; lat: number; lon: number };

const ENV_SNAP_PREFIX = "aiday:envsnap:v1:";
export const ENV_SNAPSHOT_MAX_AGE_MS = 90 * 60 * 1000; // 90분
// 좌표 허용 오차 — 같은 라벨(구)이라도 GPS 좌표가 크게 다르면 다른 지점으로 보고 무효화.
// 0.02도 ≈ 위도 2.2km / 경도(서울 위도) 1.8km. 구 단위 이동 판정에 충분히 보수적.
const COORD_EPS = 0.02;

const snapKey = (station: string) => `${ENV_SNAP_PREFIX}${station}`;

// 순수 판정 — 유닛 테스트 대상. 같은 위치 + 상한 이내 + 시계 정상이면 즉시 페인트 가능.
export function isEnvSnapshotFresh(
  snap: Pick<EnvSnapshot, "station" | "lat" | "lon" | "ts"> | null | undefined,
  loc: SnapshotLocation,
  now: number,
  maxAgeMs: number = ENV_SNAPSHOT_MAX_AGE_MS
): boolean {
  if (!snap) return false;
  if (snap.station !== loc.station) return false;
  if (Math.abs(snap.lat - loc.lat) > COORD_EPS) return false;
  if (Math.abs(snap.lon - loc.lon) > COORD_EPS) return false;
  const age = now - snap.ts;
  if (age < 0) return false; // 미래 ts(시계 되감김·조작) 방어 — 스테일로 취급
  return age <= maxAgeMs;
}

export function saveEnvSnapshot(
  loc: SnapshotLocation,
  env: EnvRaw,
  curWeather: CurWeatherScalar,
  now: number = Date.now()
): void {
  if (typeof window === "undefined") return;
  // weather 실측이 없으면 저장하지 않는다 — 화면의 근거가 못 되는 스냅샷은 즉시 페인트 대상이 아님.
  if (!env.weather) return;
  try {
    const snap: EnvSnapshot = {
      station: loc.station,
      lat: loc.lat,
      lon: loc.lon,
      ts: now,
      env,
      curWeather,
    };
    localStorage.setItem(snapKey(loc.station), JSON.stringify(snap));
  } catch {
    // 용량 초과 등은 무시 — 즉시 페인트는 최적화일 뿐, 없어도 정상 동작(스켈레톤)
  }
}

// 같은 위치의 신선한 스냅샷이면 반환, 아니면 null(→ 호출부는 스켈레톤 유지).
export function loadEnvSnapshot(
  loc: SnapshotLocation,
  now: number = Date.now()
): EnvSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(snapKey(loc.station));
    if (!raw) return null;
    const snap = JSON.parse(raw) as EnvSnapshot;
    if (!isEnvSnapshotFresh(snap, loc, now)) return null;
    if (!snap.env || !snap.env.weather) return null;
    return snap;
  } catch {
    return null;
  }
}
