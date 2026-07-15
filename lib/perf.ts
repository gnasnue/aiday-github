// 경량 성능 마커 — 로그인 후 home 진입~AI 리포트 안정 구간을 실측하기 위한 계측.
// (2026-07 홈 지연 조사: "home 뜬 뒤 AI 카드 스켈레톤" 구간 분해가 목적)
//
// 설계 원칙 (코덱스 리뷰 반영):
//  - 요청 스코프: 각 흐름에서 세션 객체를 로컬로 캡처해 쓴다. 공유 ref 덮어쓰기로
//    마커가 뒤섞이지 않게 한다. (Strict Mode 이중 실행·프로필 변경·새로고침 대비)
//  - 멱등 보고: perfReport는 세션당 1회만 출력한다(reported 플래그). 이중 실행이
//    같은 세션을 두 번 보고하지 않는다.
//  - 실패도 기록: 성공/오류/중단 모두 finally에서 마지막 마커 + outcome을 남긴다(호출부 책임).
//  - correlation: 세션마다 id를 부여해 클라이언트/서버 로그를 같은 요청으로 잇는다.
//
// 마킹 자체는 항상 수행하고(오버헤드 미미), 콘솔 출력만 게이팅한다:
//   - ?perf=1 쿼리로 진입하면 이후 세션에서 계속 활성 (localStorage에 저장), ?perf=0으로 해제.

export type PerfSession = {
  id: string;
  t0: number;
  marks: { name: string; t: number }[];
  reported?: boolean;
  claimed?: boolean; // 한 리포트 요청이 이 세션을 점유했는지 — 요청 간 세션 공유 방지
};

const now = (): number => (typeof performance !== "undefined" ? performance.now() : 0);

let idCounter = 0;
const newId = (): string => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
  } catch {}
  // randomUUID 미지원 환경 폴백 — 세션 구분만 되면 충분
  idCounter += 1;
  return `p${Math.round(now())}-${idCounter}`;
};

export const perfEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("perf");
    if (q === "1") {
      localStorage.setItem("aiday:perf", "1");
      return true;
    }
    if (q === "0") {
      localStorage.removeItem("aiday:perf");
      return false;
    }
    return localStorage.getItem("aiday:perf") === "1";
  } catch {
    return false;
  }
};

export const perfStart = (): PerfSession => ({ id: newId(), t0: now(), marks: [] });

export const perfMark = (s: PerfSession | null, name: string): void => {
  if (!s) return;
  s.marks.push({ name, t: now() });
};

// 구간별 delta(직전 마크 대비)와 누적(시작 대비)을 출력. 세션당 1회(멱등), enabled일 때만.
export const perfReport = (s: PerfSession | null, label: string): void => {
  if (!s || s.reported || !s.marks.length || !perfEnabled()) return;
  s.reported = true;
  let prev = s.t0;
  const rows = s.marks.map((m) => {
    const delta = Math.round(m.t - prev);
    const total = Math.round(m.t - s.t0);
    prev = m.t;
    return { mark: m.name, "구간ms": delta, "누적ms": total };
  });
  // 한 줄 요약 — console.table이 직렬화 안 되는 환경(원격 콘솔·로그 수집)에서도 읽히게.
  // Δ(직전 마커 대비)와 Σ(시작 대비 누적)를 함께 출력한다. 동시 착수한 API의 완료 마커는
  // Δ가 "완료 간격"일 뿐이므로, 응답시간에 가까운 값은 Σ(≈각 API가 시작 후 걸린 시간)다.
  const line = rows.map((r) => `${r.mark} Δ${r["구간ms"]}/Σ${r["누적ms"]}`).join(" · ");
  console.log(`[perf] ${label} [${s.id}] — 총 ${Math.round(prev - s.t0)}ms | ${line}`);
  // 로컬 DevTools 편의용 표 (구간ms/누적ms)
  console.table(rows);
};
