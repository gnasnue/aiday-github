import { describe, it, expect } from "vitest";
import {
  GUEST_DAILY_LIMIT,
  USER_DAILY_LIMIT,
  bucketKey,
  clientIp,
  kstDay,
} from "./rate-limit";

const headers = (h: Record<string, string>) => new Headers(h);

describe("clientIp — 프록시 헤더에서 클라이언트 IP 추출", () => {
  it("x-forwarded-for의 맨 앞(실제 클라이언트)을 쓴다", () => {
    // Vercel은 프록시 체인을 뒤에 덧붙인다 — 뒤쪽을 쓰면 모든 사용자가 한 버킷으로 뭉친다.
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe("203.0.113.7");
  });

  it("공백을 제거하고, x-forwarded-for가 없으면 x-real-ip로 폴백한다", () => {
    expect(clientIp(headers({ "x-forwarded-for": "  203.0.113.7 " }))).toBe("203.0.113.7");
    expect(clientIp(headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("헤더가 없거나 비면 null (로컬 dev — 레이트리밋 미적용)", () => {
    expect(clientIp(headers({}))).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": "" }))).toBeNull();
  });
});

describe("bucketKey — 신원별 버킷·한도", () => {
  it("로그인 사용자는 user_id 버킷 + 사용자 한도 (IP가 같아도 서로 독립)", () => {
    // 공용 와이파이에서 여러 가구가 같은 IP를 써도 서로의 한도를 잡아먹지 않아야 한다.
    const a = bucketKey("user-a", "203.0.113.7", "salt");
    const b = bucketKey("user-b", "203.0.113.7", "salt");
    expect(a).toEqual({ bucket: "u:user-a", limit: USER_DAILY_LIMIT });
    expect(b?.bucket).toBe("u:user-b");
    expect(a?.bucket).not.toBe(b?.bucket);
  });

  it("게스트는 IP 해시 버킷 + 게스트 한도이고, IP 원문은 키에 남지 않는다", () => {
    const g = bucketKey(null, "203.0.113.7", "salt");
    expect(g?.limit).toBe(GUEST_DAILY_LIMIT);
    expect(g?.bucket.startsWith("ip:")).toBe(true);
    expect(g?.bucket).not.toContain("203.0.113.7");
  });

  it("같은 IP는 같은 버킷, 다른 IP는 다른 버킷", () => {
    expect(bucketKey(null, "203.0.113.7", "salt")).toEqual(bucketKey(null, "203.0.113.7", "salt"));
    expect(bucketKey(null, "203.0.113.7", "salt")?.bucket).not.toBe(
      bucketKey(null, "203.0.113.8", "salt")?.bucket
    );
  });

  it("솔트가 다르면 해시도 다르다 — 솔트 없이 IPv4는 전수 대입으로 복원된다", () => {
    expect(bucketKey(null, "203.0.113.7", "salt-a")?.bucket).not.toBe(
      bucketKey(null, "203.0.113.7", "salt-b")?.bucket
    );
  });

  it("게스트 한도가 사용자 한도보다 낮다", () => {
    expect(GUEST_DAILY_LIMIT).toBeLessThan(USER_DAILY_LIMIT);
  });

  it("신원을 못 정하면(게스트 + IP 없음) null — 호출부는 통과시킨다", () => {
    expect(bucketKey(null, null, "salt")).toBeNull();
  });
});

describe("kstDay — 카운터 리셋 경계", () => {
  it("Postgres date로 넘길 YYYY-MM-DD 형식", () => {
    expect(kstDay(new Date(Date.UTC(2026, 6, 22, 3, 0, 0)))).toBe("2026-07-22");
  });

  it("KST 자정 경계에서 날짜가 넘어간다", () => {
    // kstNow()가 UTC+9 보정한 Date를 주므로, 이 함수는 UTC 게터로 읽는 프로젝트 관례를 따른다.
    expect(kstDay(new Date(Date.UTC(2026, 6, 22, 23, 59, 59)))).toBe("2026-07-22");
    expect(kstDay(new Date(Date.UTC(2026, 6, 23, 0, 0, 0)))).toBe("2026-07-23");
  });
});
