import { useState } from "react";
import { Check } from "lucide-react";
import { withSubjectSuffix } from "@/lib/korean";

type Gender = "male" | "female" | "unknown";

type Callout = {
  id: string;
  zone: "head" | "neck" | "skin" | "outfit";
  title: string;
  desc: string;
  emoji: string;
  tone: "warn" | "ok";
};

const calloutsData: Callout[] = [
  {
    id: "head",
    zone: "head",
    title: "꽃가루·미세먼지",
    desc: "마스크 챙기기",
    emoji: "😷",
    tone: "warn",
  },
  {
    id: "neck",
    zone: "neck",
    title: "오후 바람 강함",
    desc: "목수건 챙기기",
    emoji: "🧣",
    tone: "warn",
  },
  {
    id: "skin",
    zone: "skin",
    title: "건조함 주의",
    desc: "보습제 발라주기",
    emoji: "💧",
    tone: "ok",
  },
  {
    id: "outfit",
    zone: "outfit",
    title: "일교차 큼",
    desc: "얇은 가디건",
    emoji: "🧥",
    tone: "ok",
  },
];

const Character = ({ gender }: { gender: Gender }) => {
  const src = gender === "female"
    ? "/images/character-girl.png"
    : "/images/character-boy.png";

  return (
    <img
      src={src}
      alt={gender === "female" ? "여아 캐릭터" : "남아 캐릭터"}
      className="h-full w-auto object-contain"
    />
  );
};

// Anchor points on the character (% of container).
// Character image is 320px tall in a 340px container (image y: 2.9%–97.1%).
// Image-internal landmarks (verified by pixel analysis of 280x420 PNG):
//   face center ~17%, neck (narrowest) ~27%, chest/torso ~40%, hips/legs upper ~68%
// Mapped to container y: containerY = 2.9% + imgY * 94.2%
const anchors: Record<Callout["zone"], { x: number; y: number }> = {
  head: { x: 50, y: 19 },   // face center
  neck: { x: 50, y: 28 },   // neck (narrowest between head & shoulders)
  skin: { x: 50, y: 41 },   // chest / arms
  outfit: { x: 50, y: 67 }, // hips / legs (top of pants/skirt)
};

// Side + vertical position of each callout box (matches anchor y).
const boxLayout: Record<
  Callout["zone"],
  { side: "left" | "right"; top: string }
> = {
  head: { side: "right", top: "19%" },
  neck: { side: "left", top: "28%" },
  skin: { side: "right", top: "48%" },
  outfit: { side: "left", top: "70%" },
};

const CharacterReport = ({
  gender,
  childName,
}: {
  gender: Gender;
  childName: string;
}) => {
  const [checked, setChecked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setChecked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold tracking-tight">
          {withSubjectSuffix(childName)} 위한 오늘의 종합 솔루션
        </h2>
        <span className="text-[11px] text-muted-foreground">탭하면 자세히 →</span>
      </div>

      <div className="mt-3 rounded-3xl border border-border/60 bg-card px-4 pb-3 pt-4">
        <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          오늘의 준비물 잊지 말고 챙겨주세요
        </p>

        <div className="relative mx-auto h-[340px] w-full max-w-[340px]">
          {/* Character centered */}
          <div className="absolute left-1/2 top-1/2 h-[320px] -translate-x-1/2 -translate-y-1/2">
            <Character gender={gender} />
          </div>

          {/* SVG connector lines */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {calloutsData.map((c) => {
              const a = anchors[c.zone];
              const layout = boxLayout[c.zone];
              const ex = layout.side === "right" ? 62 : 38;
              const ey = parseFloat(layout.top);
              return (
                <line
                  key={c.id}
                  x1={a.x}
                  y1={a.y}
                  x2={ex}
                  y2={ey}
                  stroke="hsl(var(--border))"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          {/* Callouts */}
          {calloutsData.map((c) => {
            const layout = boxLayout[c.zone];
            const sideClass =
              layout.side === "right" ? "right-0" : "left-0";
            const isChecked = checked.includes(c.id);
            return (
              <div
                key={c.id}
                className={`absolute ${sideClass} w-[38%] -translate-y-1/2 animate-fade-in`}
                style={{ top: layout.top }}
              >
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={`flex w-full items-start gap-1.5 rounded-xl border px-2 py-1.5 text-left transition-smooth ${
                    c.tone === "warn"
                      ? "border-accent/20 bg-accent/[0.04]"
                      : "border-border/60 bg-background"
                  } ${isChecked ? "opacity-50" : "hover:border-foreground/30"}`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-smooth ${
                      isChecked
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background"
                    }`}
                  >
                    {isChecked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs">{c.emoji}</span>
                      <p
                        className={`text-[11px] font-bold leading-tight ${
                          c.tone === "warn" ? "text-accent" : "text-foreground"
                        } ${isChecked ? "line-through" : ""}`}
                      >
                        {c.title}
                      </p>
                    </div>
                    <p
                      className={`mt-0.5 text-[11px] font-semibold leading-tight text-foreground ${
                        isChecked ? "line-through" : ""
                      }`}
                    >
                      {c.desc}
                    </p>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CharacterReport;
