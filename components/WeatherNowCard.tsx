import Link from "next/link";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
  Droplets,
  Umbrella,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

/**
 * "지금 날씨" 카드 — home·outfit 공용 (2026-07-16 일관성 감사에서 추출).
 *
 * 결론형 근거 카드: 온도 + (선택)한 줄 해석 + 핵심 3지표(바람·습도·강수).
 * - outfit: headline/subline(옷차림 조언)을 넘겨 온도|메시지 2열 레이아웃.
 * - home: 조언 없이(headline 생략) 컴팩트 레이아웃 + href로 env 전체 보기 링크.
 *   (홈의 조언은 AI 리포트 히어로가 전담 — 카드는 순수 현재 조건)
 */

// SKY 1=맑음 3=구름많음 4=흐림 / PTY 0=없음 1=비 2=비/눈 3=눈 4=소나기
function condition(sky: number | null | undefined, pty: number | null | undefined): {
  Icon: LucideIcon;
  label: string;
} {
  const p = pty ?? 0;
  if (p === 3) return { Icon: CloudSnow, label: "눈" };
  if (p === 2) return { Icon: CloudSnow, label: "비/눈" };
  if (p === 4) return { Icon: CloudRain, label: "소나기" };
  if (p === 1) return { Icon: CloudRain, label: "비" };
  const s = sky ?? 1;
  if (s >= 4) return { Icon: Cloud, label: "흐림" };
  if (s === 3) return { Icon: CloudSun, label: "구름많음" };
  return { Icon: Sun, label: "맑음" };
}

export interface WeatherNowCardProps {
  temp: number | null;
  feelsLike?: number | null;
  sky?: number | null;
  pty?: number | null;
  windSpeed?: number | null; // m/s
  humidity?: number | null; // %
  pop?: number | null; // 강수확률 %
  /** 옷차림 조언 등 한 줄 해석 (있으면 온도|메시지 2열) */
  headline?: string;
  subline?: string;
  /** 상세 화면 링크 (예: "/env") */
  href?: string;
  hrefLabel?: string;
}

export default function WeatherNowCard({
  temp,
  feelsLike,
  sky,
  pty,
  windSpeed,
  humidity,
  pop,
  headline,
  subline,
  href,
  hrefLabel = "환경정보 전체 보기",
}: WeatherNowCardProps) {
  const { Icon, label } = condition(sky, pty);
  const metrics: { Icon: LucideIcon; label: string; value: string }[] = [];
  if (windSpeed != null) metrics.push({ Icon: Wind, label: "바람", value: `${windSpeed}m/s` });
  if (humidity != null) metrics.push({ Icon: Droplets, label: "습도", value: `${humidity}%` });
  if (pop != null) metrics.push({ Icon: Umbrella, label: "강수", value: `${pop}%` });

  const hasMessage = Boolean(headline || subline);

  return (
    <section className="rounded-2xl bg-card p-4 shadow-soft">
      {hasMessage ? (
        // outfit: 온도 | 메시지 2열
        <div className="flex items-stretch gap-3.5">
          <div className="flex shrink-0 flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="text-[11px] font-medium">{label}</span>
            </div>
            <p className="mt-0.5 text-[40px] font-bold leading-none tracking-tight text-foreground tabular-nums">
              {temp != null ? `${temp}°` : "--°"}
            </p>
            {feelsLike != null && (
              <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">체감 {feelsLike}°</p>
            )}
          </div>
          <div className="w-px shrink-0 self-stretch bg-border/70" />
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            {headline && (
              <p className="text-[13.5px] font-semibold leading-snug text-foreground break-keep">{headline}</p>
            )}
            {subline && (
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground break-keep">{subline}</p>
            )}
          </div>
        </div>
      ) : (
        // home: 조건 + 온도 컴팩트 (조언은 AI 히어로가 전담)
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-accent">
              <Icon className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-[13px] font-medium text-muted-foreground">지금 · {label}</p>
              <p className="text-[32px] font-bold leading-none tracking-tight text-foreground tabular-nums">
                {temp != null ? `${temp}°` : "--°"}
              </p>
            </div>
          </div>
          {feelsLike != null && (
            <p className="self-end text-[12px] text-muted-foreground tabular-nums">체감 {feelsLike}°</p>
          )}
        </div>
      )}

      {metrics.length > 0 && (
        <div className="mt-3 flex items-center gap-4 border-t border-border/60 pt-2.5">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <m.Icon className="h-3.5 w-3.5 text-muted-foreground/70" strokeWidth={1.75} />
              <span className="text-muted-foreground/80">{m.label}</span>
              <span className="font-medium text-foreground tabular-nums">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {href && (
        <Link
          href={href}
          className="mt-3 flex min-h-11 items-center justify-end gap-0.5 text-[13px] font-semibold text-accent"
        >
          {hrefLabel}
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      )}
    </section>
  );
}
