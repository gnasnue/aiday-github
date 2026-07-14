import { useMemo, useState } from "react";
import { Check, Leaf, Sparkles } from "lucide-react";
import LineIcon, { type LineIconName } from "@/components/LineIcon";
import { withSubjectSuffix } from "@/lib/korean";
import { hasRespiratory, hasSkin } from "@/lib/domain/child-conditions";
import type { WeatherData } from "@/lib/weather-api";

type Gender = "male" | "female" | "unknown";

type CalloutIconName = LineIconName | "leaf" | "sparkles";

type Callout = {
  id: string;
  zone: "head" | "neck" | "skin" | "outfit";
  title: string;
  desc: string;
  icon: CalloutIconName;
  tone: "warn" | "ok";
};

// 콜아웃 아이콘 13px 라인 세트 — 커스텀 path 우선, 없는 것만 Lucide
const CalloutIcon = ({ name, className }: { name: CalloutIconName; className?: string }) => {
  if (name === "leaf") return <Leaf size={13} strokeWidth={1.5} className={className} aria-hidden="true" />;
  if (name === "sparkles") return <Sparkles size={13} strokeWidth={1.5} className={className} aria-hidden="true" />;
  return <LineIcon name={name} size={13} className={className} />;
};

// Zone content derived from today's real weather/air data + the child's
// conditions, mirroring the thresholds in lib/recommendation-engine.ts so
// the illustration never drifts from what the "오늘 챙길 것" checklist says.
function buildCallouts(weather: WeatherData, conditions: string[]): Callout[] {
  const hasRhinitis = hasRespiratory(conditions);
  const hasSensitiveSkin = hasSkin(conditions);

  const highPollen = weather.timeline.some((t) => t.pollen === "높음" || t.pollen === "매우높음");
  const badDust = weather.timeline.some((t) => t.dust === "나쁨" || t.dust === "매우나쁨");
  const hasStrongWind = weather.timeline.some((t) => t.wind === "강함");
  const avgHumidity =
    weather.timeline.reduce((s, t) => s + t.humidity, 0) / (weather.timeline.length || 1);
  const temps = weather.timeline.map((t) => t.temp);
  const tempRange = temps.length ? Math.max(...temps) - Math.min(...temps) : 0;

  const head: Callout =
    highPollen || badDust
      ? {
          id: "head",
          zone: "head",
          title: highPollen ? "꽃가루 높음" : "미세먼지 나쁨",
          desc: hasRhinitis ? "마스크 필수 챙기기" : "마스크 챙기기",
          icon: "mask",
          tone: "warn",
        }
      : { id: "head", zone: "head", title: "공기 양호", desc: "마스크 없이 괜찮아요", icon: "cloudsun", tone: "ok" };

  const neck: Callout = hasStrongWind
    ? { id: "neck", zone: "neck", title: "오후 바람 강함", desc: "목수건 챙기기", icon: "scarf", tone: "warn" }
    : { id: "neck", zone: "neck", title: "바람 약함", desc: "목수건 없이 괜찮아요", icon: "leaf", tone: "ok" };

  const skin: Callout =
    avgHumidity < 45 || hasSensitiveSkin
      ? { id: "skin", zone: "skin", title: "건조함 주의", desc: "보습제 발라주기", icon: "droplet", tone: "warn" }
      : { id: "skin", zone: "skin", title: "습도 적정", desc: "평소처럼 관리해주세요", icon: "sparkles", tone: "ok" };

  const outfit: Callout =
    tempRange >= 8
      ? { id: "outfit", zone: "outfit", title: "일교차 큼", desc: "얇은 가디건", icon: "cardigan", tone: "warn" }
      : weather.temp < 10
        ? { id: "outfit", zone: "outfit", title: "쌀쌀한 날씨", desc: "두꺼운 외투", icon: "cardigan", tone: "warn" }
        : { id: "outfit", zone: "outfit", title: "일교차 적음", desc: "평소 옷차림 괜찮아요", icon: "shirt", tone: "ok" };

  return [head, neck, skin, outfit];
}

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
  weather,
  conditions,
}: {
  gender: Gender;
  childName: string;
  weather: WeatherData;
  conditions: string[];
}) => {
  const [checked, setChecked] = useState<string[]>([]);
  const calloutsData = useMemo(() => buildCallouts(weather, conditions), [weather, conditions]);
  const toggle = (id: string) =>
    setChecked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 scroll-mt-14 break-keep text-[22px] font-bold tracking-[-0.01em]">
          {withSubjectSuffix(childName)} 위한 오늘의 종합 솔루션
        </h2>
        <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">탭하면 자세히 →</span>
      </div>

      <div className="mt-3 rounded-2xl border border-border/60 bg-card px-4 pb-3 pt-4">
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
                  stroke="hsl(34 30% 80%)" /* #dccfbe — 점선 리더 라인 전용 */
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
                className={`absolute ${sideClass} w-[39%] -translate-y-1/2 animate-fade-in`}
                style={{ top: layout.top }}
              >
                {/* 콜아웃 칩 — 1b: 톤과 무관하게 흰 배경 + 칩 보더, 상태는 아이콘·제목 색으로만 */}
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={`flex w-full items-start gap-1.5 rounded-xl border border-border-chip bg-card px-[9px] py-2 text-left transition-smooth ${
                    isChecked ? "opacity-[0.55]" : "hover:border-foreground/30"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-smooth ${
                      isChecked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border-control bg-card"
                    }`}
                  >
                    {isChecked && <Check className="h-2.5 w-2.5" strokeWidth={3.2} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <CalloutIcon
                        name={c.icon}
                        className={`shrink-0 ${c.tone === "warn" ? "text-status-warn" : "text-muted-foreground"}`}
                      />
                      <p
                        className={`break-keep text-[11px] font-bold leading-[1.35] ${
                          c.tone === "warn" ? "text-status-warn" : "text-foreground"
                        } ${isChecked ? "line-through" : ""}`}
                      >
                        {c.title}
                      </p>
                    </div>
                    <p
                      className={`mt-0.5 break-keep text-[11px] font-semibold leading-[1.35] text-foreground ${
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
