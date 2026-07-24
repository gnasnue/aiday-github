import { describe, it, expect } from "vitest";
import { isEnvSnapshotFresh, ENV_SNAPSHOT_MAX_AGE_MS } from "./env-cache";

const loc = { station: "중구", lat: 37.5665, lon: 126.978 };
const snapAt = (ts: number, over: Partial<{ station: string; lat: number; lon: number }> = {}) => ({
  station: over.station ?? loc.station,
  lat: over.lat ?? loc.lat,
  lon: over.lon ?? loc.lon,
  ts,
});

describe("isEnvSnapshotFresh — 즉시 페인트 판정", () => {
  const now = 1_000_000_000_000;

  it("같은 위치 + 상한 이내면 신선", () => {
    expect(isEnvSnapshotFresh(snapAt(now - 60_000), loc, now)).toBe(true);
  });

  it("null 스냅샷은 신선하지 않음", () => {
    expect(isEnvSnapshotFresh(null, loc, now)).toBe(false);
    expect(isEnvSnapshotFresh(undefined, loc, now)).toBe(false);
  });

  it("상한(90분) 정확히 경계는 신선(<=), 1ms 초과는 스테일", () => {
    expect(isEnvSnapshotFresh(snapAt(now - ENV_SNAPSHOT_MAX_AGE_MS), loc, now)).toBe(true);
    expect(isEnvSnapshotFresh(snapAt(now - ENV_SNAPSHOT_MAX_AGE_MS - 1), loc, now)).toBe(false);
  });

  it("밤새 둔 스냅샷(12시간)은 스테일 — 첫 아침은 스켈레톤", () => {
    expect(isEnvSnapshotFresh(snapAt(now - 12 * 60 * 60 * 1000), loc, now)).toBe(false);
  });

  it("다른 측정소(구)면 무효 — 위치가 바뀌면 즉시 페인트 안 함", () => {
    expect(isEnvSnapshotFresh(snapAt(now - 60_000, { station: "송파구" }), loc, now)).toBe(false);
  });

  it("좌표가 허용 오차(0.02도)를 넘게 다르면 무효", () => {
    // 같은 라벨이라도 GPS 좌표가 크게 다르면 다른 지점 — 스테일 취급
    expect(isEnvSnapshotFresh(snapAt(now - 60_000, { lat: loc.lat + 0.03 }), loc, now)).toBe(false);
    expect(isEnvSnapshotFresh(snapAt(now - 60_000, { lon: loc.lon - 0.05 }), loc, now)).toBe(false);
  });

  it("좌표 미세 차이(오차 이내)는 신선 유지", () => {
    expect(isEnvSnapshotFresh(snapAt(now - 60_000, { lat: loc.lat + 0.01 }), loc, now)).toBe(true);
  });

  it("미래 ts(시계 되감김)는 스테일로 방어", () => {
    expect(isEnvSnapshotFresh(snapAt(now + 60_000), loc, now)).toBe(false);
  });

  it("maxAgeMs를 낮추면 그 기준으로 판정", () => {
    expect(isEnvSnapshotFresh(snapAt(now - 5 * 60_000), loc, now, 60_000)).toBe(false);
    expect(isEnvSnapshotFresh(snapAt(now - 30_000), loc, now, 60_000)).toBe(true);
  });
});
