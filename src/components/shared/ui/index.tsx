import type { ReactNode } from "react";
import { AlertTriangle, Brain, CircleDollarSign, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

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
    <section id={id} className={cn("glass animate-fade-in rounded-lg overflow-hidden", tight ? "p-3.5" : "p-4", className)}>
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
        {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">{eyebrow}</p> : null}
        <h2 className="text-base font-semibold text-white">{title}</h2>
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
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        positive ? "bg-emerald-400/12 text-emerald-200" : "bg-rose-400/12 text-rose-200"
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
  const config = {
    Buy: "border-emerald-300/30 bg-emerald-400/15 text-emerald-100",
    Hold: "border-amber-300/30 bg-amber-400/15 text-amber-100",
    Sell: "border-rose-300/30 bg-rose-400/15 text-rose-100"
  } satisfies Record<RecommendationAction, string>;

  return (
    <span className={cn("rounded-full border px-3 py-1 text-sm font-bold", config[action])}>
      {action}
    </span>
  );
}

export function SignalDot({ stance }: { stance: SignalStance }) {
  return (
    <span
      className={cn(
        "size-2.5 rounded-full",
        stance === "bullish" && "bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.6)]",
        stance === "neutral" && "bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.45)]",
        stance === "bearish" && "bg-rose-300 shadow-[0_0_16px_rgba(253,164,175,0.5)]"
      )}
    />
  );
}

export function RiskMeter({ score }: { score: number }) {
  const width = `${Math.max(10, Math.min(100, score * 10))}%`;
  const tone = score <= 4 ? "from-emerald-300 to-cyan-300" : score <= 7 ? "from-amber-300 to-orange-300" : "from-orange-300 to-rose-300";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-2 text-slate-300">
          <ShieldCheck className="size-4 text-cyan-200" />
          Risk score
        </span>
        <strong className="text-white">{score}/10</strong>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className={cn("h-full rounded-full bg-gradient-to-r", tone)} style={{ width }} />
      </div>
    </div>
  );
}

export function ConfidenceBars({ bullish, bearish }: { bullish: number; bearish: number }) {
  return (
    <div className="grid gap-3">
      <ProgressLabel label="Bullish confidence" value={bullish} className="bg-emerald-300" />
      <ProgressLabel label="Bearish confidence" value={bearish} className="bg-rose-300" />
    </div>
  );
}

function ProgressLabel({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className={cn("h-full rounded-full", className)} style={{ width: `${value}%` }} />
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
    <div className={cn("rounded-lg border border-white/10 bg-white/[0.045] p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-3 text-slate-400">
        <span className="text-xs font-medium uppercase tracking-[0.14em]">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {caption ? <div className="mt-2 text-sm text-slate-400">{caption}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-white/10", className)} />;
}

export function InsightIcon({ type }: { type: "ai" | "money" | "risk" | "alert" }) {
  const iconClass = "size-4";
  if (type === "ai") return <Brain className={iconClass} />;
  if (type === "money") return <CircleDollarSign className={iconClass} />;
  if (type === "risk") return <AlertTriangle className={iconClass} />;
  return <Sparkles className={iconClass} />;
}
