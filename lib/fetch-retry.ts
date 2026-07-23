/**
 * 5xx·네트워크 오류에 짧게 재시도하는 서버측 fetch 래퍼.
 *
 * 존재 이유: data.go.kr 게이트웨이는 기상청 단기예보(VilageFcstInfoService_2.0) 백엔드가
 * 붐빌 때 간헐 502("Error forwarding request to backend server")·연결 행(hang)을 낸다.
 * 같은 API 키로 에어코리아·생활기상지수는 정상인데 단기예보 백엔드만 펄럭이는 상황을
 * 2026-07-23 실측으로 확인했다(성공률이 순간마다 0~30%로 요동). 한 번의 나쁜 순간에 홈
 * [시간대별 환경]·[오늘의 케어 플랜]이 통째로 비지 않도록, 총 예산 안에서 간헐 성공을 붙잡는다.
 *
 * 정책:
 *  - 2xx: 즉시 반환(성공)
 *  - 4xx: 즉시 반환(입력·인증 오류는 재시도해도 동일 — 낭비 방지)
 *  - 5xx / throw(타임아웃·네트워크): 총 예산(deadlineMs) 안에서 backoff 후 재시도
 *  - 예산 소진 시 마지막 응답(하나도 못 받았으면 null) 반환 → 호출부가 502 등으로 폴백
 *
 * 각 시도는 attemptTimeoutMs(남은 예산이 더 짧으면 그만큼)로 AbortSignal.timeout을 걸어,
 * 한 시도가 오래 매달려 예산을 다 먹지 않게 한다(위 10초 연결 행을 여기서 끊는다).
 * 총 지연은 deadlineMs를 넘지 않으므로, 단일 fetch를 쓰던 기존 대비 최악 지연이 늘지 않는다.
 */

export type FetchWithRetryOptions = {
  /** 한 시도의 상한(ms). 남은 예산이 더 짧으면 남은 예산으로 줄인다. */
  attemptTimeoutMs?: number;
  /** 전체 재시도 예산(ms). 이 안에서 가능한 만큼 시도한다. */
  deadlineMs?: number;
  /** 시도 사이 간격(ms). */
  backoffMs?: number;
  /** 남은 예산이 이 값보다 적으면 새 시도를 시작하지 않는다(0에 가까운 무의미 시도 방지). */
  minAttemptMs?: number;
  /** fetch에 전달할 옵션(next 캐시 옵션 등). signal은 내부에서 attemptTimeout으로 덮어쓴다. */
  init?: RequestInit;
  /** 테스트 주입용 */
  fetchImpl?: typeof fetch;
  /** 테스트 주입용 시계 */
  now?: () => number;
  /** 테스트 주입용 대기 */
  sleep?: (ms: number) => Promise<void>;
};

export async function fetchWithRetry(
  url: string,
  {
    attemptTimeoutMs = 4000,
    deadlineMs = 8000,
    backoffMs = 250,
    minAttemptMs = 800,
    init,
    fetchImpl = fetch,
    now = () => Date.now(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  }: FetchWithRetryOptions = {}
): Promise<Response | null> {
  const start = now();
  let last: Response | null = null;

  while (true) {
    const remaining = deadlineMs - (now() - start);
    if (remaining < minAttemptMs) break;
    const timeout = Math.min(attemptTimeoutMs, remaining);
    try {
      const res = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeout),
      });
      // 성공 또는 재시도해도 소용없는 4xx(입력·인증)는 즉시 반환.
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      last = res; // 5xx — 재시도 대상
    } catch {
      last = null; // 타임아웃·네트워크 오류 — 재시도 대상
    }
    // 다음 시도의 backoff를 넣을 여유조차 없으면 종료.
    if (now() - start + backoffMs >= deadlineMs) break;
    await sleep(backoffMs);
  }

  return last;
}
