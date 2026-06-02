export { LivePriceDisplay, LiveBadge, PriceFlash } from "@/components/shared/ui/live-price-display";

import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  Brain,
  CircleDollarSign,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { RecommendationAction, SignalStance } from "@/lib/types";

export const cardHeightTier = {
  small: "min-h-[180px] max-h-[240px]",
  medium: "min-h-[300px] max-h-[420px]",
  large: "min-h-[460px] max-h-[640px]",
  full: "min-h-[320px]"
} as const;

export function Panel({
  children,
  className,
  id,
  tight = false
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tight?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        "glass animate-fade-in rounded-xl overflow-hidden",
        tight ? "p-4" : "p-5",
        className
      )}
    >
      {children}
    </section>
  );
}

export function ScrollBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto pr-1", className)}>{children}</div>;
}

export function SectionHeader({
  eyebrow,
  title,
  action
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-positive/70">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function ChangePill({ value, label }: { value: number; label?: string }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold font-mono",
        positive
          ? "bg-positive/12 text-positive"
          : "bg-destructive/12 text-destructive"
      )}
    >
      {positive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {label ? `${label} ` : ""}
      {positive ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export function RecommendationBadge({ action }: { action: RecommendationAction }) {
  const config: Record<RecommendationAction, string> = {
    Buy: "border-positive/30 bg-positive/15 text-positive",
    Hold: "border-amber-400/30 bg-amber-400/15 text-amber-400",
    Sell: "border-destructive/30 bg-destructive/15 text-destructive"
  };
  return (
    <span className={cn("rounded-lg border px-3 py-1 text-sm font-bold font-display", config[action])}>
      {action}
    </span>
  );
}

export function SignalDot({ stance }: { stance: SignalStance }) {
  return (
    <span
      className={cn(
        "size-2.5 rounded-full flex-shrink-0",
        stance === "bullish" && "bg-positive shadow-[0_0_8px_rgba(0,232,122,0.7)]",
        stance === "neutral" && "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
        stance === "bearish" && "bg-destructive shadow-[0_0_8px_rgba(255,61,90,0.6)]"
      )}
    />
  );
}

export function RiskMeter({ score }: { score: number }) {
  const width = `${Math.max(8, Math.min(100, score * 10))}%`;
  const tone =
    score <= 4 ? "from-positive to-blue-400" :
    score <= 7 ? "from-amber-400 to-orange-400" :
                 "from-orange-400 to-destructive";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <ShieldCheck className="size-4 text-blue-400" />
          Risk score
        </span>
        <strong className="font-mono text-foreground">{score}/10</strong>
      </div>
      <div className="h-2 rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", tone)} style={{ width }} />
      </div>
    </div>
  );
}

export function ConfidenceBars({ bullish, bearish }: { bullish: number; bearish: number }) {
  return (
    <div className="grid gap-3">
      <ProgressLabel label="Bullish confidence" value={bullish} className="bg-positive" />
      <ProgressLabel label="Bearish confidence" value={bearish} className="bg-destructive" />
    </div>
  );
}

function ProgressLabel({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-all duration-700", className)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function MetricTile({
  icon,
  label,
  value,
  caption,
  className
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  caption?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface-1 p-4", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-3 text-muted-foreground">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em]">{label}</span>
        {icon}
      </div>
      <p className="font-display text-2xl font-semibold text-foreground">{value}</p>
      {caption && <div className="mt-2 text-sm text-muted-foreground">{caption}</div>}
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-2", className)}
      style={style}
    />
  );
}

export function InsightIcon({ type }: { type: "ai" | "money" | "risk" | "alert" }) {
  const cls = "size-4";
  if (type === "ai") return <Brain className={cls} />;
  if (type === "money") return <CircleDollarSign className={cls} />;
  if (type === "risk") return <AlertTriangle className={cls} />;
  return <Sparkles className={cls} />;
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="my-3 h-px bg-border" />;
  return (
    <div className="my-3 flex items-center gap-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export function LiveDot({ active = true }: { active?: boolean }) {
  return (
    <span className="relative flex size-2">
      {active && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-75" />
      )}
      <span className={cn("relative inline-flex size-2 rounded-full", active ? "bg-positive" : "bg-muted-foreground")} />
    </span>
  );
}
