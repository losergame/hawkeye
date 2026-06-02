"use client";

import { cn } from "@/lib/cn";
import type { StockSetupStatus } from "@/lib/types";

export function ConfidenceBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "border-positive/30 bg-positive/12 text-positive shadow-[0_0_10px_rgba(0,208,132,0.18)]"
      : score >= 70
        ? "border-positive/20 bg-positive/8 text-positive/80"
        : "border-amber-300/25 bg-amber-300/12 text-amber-600 dark:text-amber-100";

  return (
    <span className={cn("border px-2.5 py-1 text-xs font-bold font-display", tone)}>
      {score}%
    </span>
  );
}

export function RiskRewardBadge({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "border border-positive/20 bg-positive/10 px-2.5 py-1 text-xs font-bold font-display text-positive",
        value >= 2 && "shadow-[0_0_8px_rgba(0,208,132,0.35)]"
      )}
    >
      {value.toFixed(1)}:1
    </span>
  );
}

/**
 * Shows the candle data quality for a scanner result.
 * "REAL"        — ≥200 bars from Finnhub/Polygon, all indicators reliable
 * "DELAYED"     — ≥200 bars from Polygon (delayed ~15 min), reliable
 * "INSUFFICIENT"— real bars available but < 200, EMA 200 may be unreliable
 * "MOCK"        — synthetic LCG data (only shown when allowSynthetic=true)
 */
export function DataSourceBadge({
  candleSource,
  insufficientData,
  barCount,
}: {
  candleSource?: "real" | "delayed" | "mock";
  insufficientData?: boolean;
  barCount?: number;
}) {
  if (!candleSource || candleSource === "mock") return null;

  if (insufficientData) {
    return (
      <span
        title={`Only ${barCount ?? "?"} bars available — 200 required for full EMA reliability`}
        className="border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400"
      >
        ⚠ {barCount ?? "?"}b
      </span>
    );
  }

  const styles = {
    real:    "border-positive/40 bg-positive/10 text-positive",
    delayed: "border-cyan-400/40 bg-cyan-400/10 text-cyan-400",
    mock:    "border-border bg-surface-1 text-muted-foreground",
  } as const;

  const labels = {
    real:    "REAL",
    delayed: "DELAYED",
    mock:    "MOCK",
  } as const;

  return (
    <span className={cn("border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", styles[candleSource])}>
      {labels[candleSource]}
    </span>
  );
}

export function StatusBadge({ status }: { status: StockSetupStatus }) {
  const tone: Record<StockSetupStatus, string> = {
    Waiting:   "border-amber-300/25 bg-amber-300/10 text-amber-600 dark:text-amber-100",
    Triggered: "border-positive/30 bg-positive/12 text-positive shadow-[0_0_10px_rgba(0,208,132,0.15)]",
    Failed:    "border-destructive/25 bg-destructive/10 text-destructive",
    Completed: "border-cyan-300/25 bg-cyan-300/10 text-cyan-700 dark:text-cyan-100",
  };

  return <span className={cn("border px-2.5 py-1 text-xs font-bold", tone[status])}>{status}</span>;
}
