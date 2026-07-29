/**
 * 30일 성장 탭 상단 카드 — **데모 전용 예시 3안**.
 *
 * 왜 필요한가: 실제 상단 카드는 알림장이 쌓여야 나온다. 데모에서는 그 상태를 만들 수 없어
 * "N개만 더 모이면"만 보인다. 그래서 완성된 모습을 예시로 보여준다.
 *
 * 실사용자에게 새지 않게 하는 세 겹:
 *   1. `?demo=` 쿼리가 없으면 렌더하지 않는다(호출부 게이트).
 *   2. 아이 이름을 **주입하지 않는다** — 고정 예시 이름("지우")만 쓴다. 실사용자 아이 이름에
 *      지어낸 문장을 붙이는 것이 이 화면에서 가능한 최악의 실수다.
 *   3. 카드마다 '예시' 배지를 단다.
 *
 * `NODE_ENV === "development"` 게이트(`?seed=memory` 방식)를 쓰지 않은 이유: 데모를 배포된
 * 앱에서 할 수 있어야 한다. 위 세 겹으로 프로덕션 노출 위험을 대신 막는다.
 *
 * 세 안 모두 `shadow-card`를 쓴다 — 하나를 골라 히어로가 될 후보라서 실제 모습대로
 * 비교해야 한다("히어로 1곳" 규칙은 이 데모 표면 밖에서 지킨다).
 */

import { ArrowRight, Leaf, Share2, Sparkles, TrendingUp } from "lucide-react";

export type DemoVariant = "a" | "b" | "c";

const EXAMPLE_NAME = "지우";

const Badge = ({ label }: { label?: string }) => (
  <div className="mb-2 flex items-center gap-2">
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
      예시
    </span>
    {label && <span className="text-[12px] text-muted-foreground">{label}</span>}
  </div>
);

const Action = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-5 flex items-start gap-2 border-t border-border pt-4">
    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden="true" />
    <p className="text-base font-semibold leading-relaxed text-foreground break-keep">{children}</p>
  </div>
);

const Foot = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground break-keep">{children}</p>
);

/* ── A · 변화 — 한 달 전과 지금을 나란히 ── */
const VariantA = () => (
  <section className="rounded-2xl bg-card p-5 shadow-card" aria-labelledby="demo-a-title">
    <div className="flex items-center gap-2 text-sm font-semibold text-accent">
      <TrendingUp className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      이번 달 달라진 한 가지
    </div>
    <h2 id="demo-a-title" className="mt-3 text-[26px] font-extrabold leading-[1.32] tracking-[-0.02em] break-keep">
      지켜보던 {EXAMPLE_NAME}가, 먼저 손을 내밀기 시작했어요
    </h2>
    <p className="mt-3 text-base leading-relaxed text-muted-foreground break-keep">
      최근 30일 알림장 <span className="num">12</span>개에서 찾았어요. 3주 사이에 바뀐 건 이 한 가지예요.
    </p>

    <div className="mt-5 divide-y divide-border">
      <div className="flex gap-3 py-3.5 first:pt-0">
        <span className="w-16 shrink-0 text-[13px] font-bold text-muted-foreground">7월 초</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-muted-foreground break-keep">
            “친구들이 나비 놀이를 하는 모습을 한참 지켜봤어요.”
          </p>
          <p className="mt-1.5 text-[12px] font-bold text-muted-foreground">지켜보기</p>
        </div>
      </div>
      <div className="flex gap-3 py-3.5 last:pb-0">
        <span className="w-16 shrink-0 text-[13px] font-bold text-accent">지금</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-foreground break-keep">
            “민서에게 먼저 다가가 ‘같이 만들자’고 이야기했답니다.”
          </p>
          <p className="mt-1.5 text-[12px] font-bold text-accent">먼저 제안하기</p>
        </div>
      </div>
    </div>

    <Action>이번 주말엔 친구 한 명과 둘이 할 놀이를 권해보세요.</Action>
    <Foot>선생님 알림장에 적힌 문장에서 찾은 변화예요.</Foot>
  </section>
);

/* ── B · 관심사 — 요즘 빠져 있는 것 → 주말 계획 ── */
const INTERESTS = [
  { label: "곤충 · 자연", count: 8 },
  { label: "함께 만들기", count: 6 },
  { label: "역할놀이", count: 4 },
];
const TOTAL = 12;

const VariantB = () => (
  <section className="rounded-2xl bg-card p-5 shadow-card" aria-labelledby="demo-b-title">
    <div className="flex items-center gap-2 text-sm font-semibold text-accent">
      <Leaf className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      요즘 돌아오는 관심
    </div>
    <h2 id="demo-b-title" className="mt-3 text-[26px] font-extrabold leading-[1.32] tracking-[-0.02em] break-keep">
      요즘 {EXAMPLE_NAME}의 세계는 ‘곤충’이에요
    </h2>
    <p className="mt-3 text-base leading-relaxed text-muted-foreground break-keep">
      알림장 <span className="num">{TOTAL}</span>개 중 <span className="num">8</span>번, 3주 내내 빠지지 않았어요.
    </p>

    <div className="mt-5 rounded-xl bg-primary-tint p-4">
      <p className="text-[18px] font-extrabold tracking-[-0.01em] text-foreground">곤충 · 자연</p>
      <p className="mt-1 text-[13px] font-semibold text-accent">그림책 · 산책 · 만들기에서 반복</p>
    </div>

    <div className="mt-4 space-y-3.5">
      {INTERESTS.map((it) => (
        <div key={it.label}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-bold text-foreground">{it.label}</p>
            <p className="num text-[13px] font-bold text-accent">
              {it.count}/{TOTAL}
            </p>
          </div>
          {/* 게이지 fill 브랜드 오렌지 금지(DESIGN.md C-3) — 빈도 지표라 상태색도 아니다. */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-foreground/30" style={{ width: `${(it.count / TOTAL) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>

    <Action>주말 나들이엔 곤충을 볼 수 있는 곳이 잘 맞아요.</Action>
    <Foot>알림장에 나온 표현이 몇 번 나왔는지만 셌어요.</Foot>
  </section>
);

/* ── C · 성취 — 처음 해낸 것 모음 → 공유 ── */
const FIRSTS = [
  { date: "7.26", title: "가위질을 끝까지 해냈어요", basis: "색종이를 선을 따라 끝까지 잘랐어요" },
  { date: "7.18", title: "친구에게 먼저 말을 걸었어요", basis: "‘같이 놀자’고 다가갔어요" },
  { date: "7.12", title: "낮잠 없이 하루를 보냈어요", basis: "오후까지 밝게 지냈어요" },
  { date: "7.08", title: "블록 탑을 혼자 쌓았어요", basis: "다섯 개까지 혼자 올렸어요" },
  { date: "7.03", title: "새 반 친구 이름을 불렀어요", basis: "먼저 이름을 부르며 인사했어요" },
];

const VariantC = () => (
  <section className="rounded-2xl bg-card p-5 shadow-card" aria-labelledby="demo-c-title">
    <div className="flex items-center gap-2 text-sm font-semibold text-accent">
      <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      이번 달 처음
    </div>
    <h2 id="demo-c-title" className="mt-3 text-[26px] font-extrabold leading-[1.32] tracking-[-0.02em] break-keep">
      {EXAMPLE_NAME}가 처음 해낸 일이 <span className="num">5</span>가지 있었어요
    </h2>
    <p className="mt-3 text-base leading-relaxed text-muted-foreground break-keep">
      한 달 전에는 없던 장면들이에요. 매일 보면 지나치기 쉬워요.
    </p>

    <div className="mt-5 divide-y divide-border">
      {FIRSTS.map((f) => (
        <div key={f.date} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
          <span className="num w-11 shrink-0 text-[13px] font-bold text-accent">{f.date}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold leading-[1.45] text-foreground break-keep">{f.title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground break-keep">{f.basis}</p>
          </div>
        </div>
      ))}
    </div>

    <button
      type="button"
      className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-muted text-[15px] font-bold text-foreground active:scale-[0.99]"
    >
      <Share2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
      배우자에게 보내기
    </button>
    <Foot>선생님 알림장에서 ‘처음’으로 적힌 장면만 모았어요.</Foot>
  </section>
);

const VARIANTS: Record<DemoVariant, { node: React.ReactNode; label: string }> = {
  a: { node: <VariantA />, label: "A안 · 변화" },
  b: { node: <VariantB />, label: "B안 · 관심사" },
  c: { node: <VariantC />, label: "C안 · 성취" },
};

/**
 * `variant`가 있으면 그 한 안만 깔끔하게(라벨 없이, '예시' 배지만) 보여준다 — 실제 데모용.
 * 없으면 3안을 라벨과 함께 쌓아 비교용으로 보여준다.
 */
export default function DemoGrowthCards({ variant }: { variant?: DemoVariant }) {
  if (variant) {
    return (
      <div className="mb-12">
        <Badge />
        {VARIANTS[variant].node}
      </div>
    );
  }

  return (
    <div className="mb-12 space-y-10">
      {(Object.keys(VARIANTS) as DemoVariant[]).map((key) => (
        <div key={key}>
          <Badge label={VARIANTS[key].label} />
          {VARIANTS[key].node}
        </div>
      ))}
    </div>
  );
}
