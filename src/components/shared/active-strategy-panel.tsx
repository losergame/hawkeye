"use client";

import { AlertTriangle, Settings, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useActivePreset } from "@/hooks/useActivePreset";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ActiveStrategyPanelProps {
  /** Historical closed trades count — used for sample-size warning.
   *  Pass undefined if not available (shows a generic note instead). */
  closedTradeCount?: number;
  /** Trades that WOULD pass the current preset rules — for exclusion warning. */
  filteredTradeCount?: number;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActiveStrategyPanel({
  closedTradeCount,
  filteredTradeCount,
  className,
}: ActiveStrategyPanelProps) {
  const { preset, loading, disabling, disable } = useActivePreset();

  if (loading) {
    return (
      <div className={cn("border border-border bg-surface-1 px-4 py-3", className)}>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Settings className="size-3.5 animate-spin" />
          Loading active strategy…
        </div>
      </div>
    );
  }

  // ── No active preset ──────────────────────────────────────────────────────

  if (!preset?.active) {
    return (
      <div className={cn(
        "flex items-start gap-2 border border-border bg-surface-1 px-4 py-3 text-[11px]",
        className,
      )}>
        <Settings className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />
        <span className="text-muted-foreground">
          <strong className="text-foreground">No active rule preset.</strong>{" "}
          Scanner and Paper Trader are using default thresholds (score ≥75, confidence ≥70, R/R ≥2.0).
          Go to <strong className="text-foreground">Analytics → Promote Rules</strong> to apply a tested rule set.
        </span>
      </div>
    );
  }

  // ── Warnings ──────────────────────────────────────────────────────────────

  const warnings: string[] = [];

  // Sample size warning
  if (closedTradeCount !== undefined && closedTradeCount < 30) {
    warnings.push(`Low sample size (${closedTradeCount} trades). Preset may be overfit — need ≥30 for statistical reliability.`);
  }

  // Exclusion rate warning — if preset filters out > 60% of historical trades
  if (closedTradeCount !== undefined && filteredTradeCount !== undefined && closedTradeCount > 0) {
    const excluded = closedTradeCount - filteredTradeCount;
    const rate     = excluded / closedTradeCount;
    if (rate > 0.60) {
      warnings.push(`Preset excludes ${(rate * 100).toFixed(0)}% of historical trades (${excluded} of ${closedTradeCount}). Very restrictive — may reduce future trade frequency significantly.`);
    }
  }

  // Scope mismatch warning
  if (preset.scope === "scanner") {
    warnings.push("Preset applied to Scanner only. Paper Trader is still using default thresholds and may open trades the scanner wouldn't show.");
  }

  // Scope label
  const scopeLabel =
    preset.scope === "scanner+paper" ? "Scanner + Paper Trader" :
    preset.scope === "scanner"       ? "Scanner only" :
    preset.scope ?? "Unknown";

  const appliedDate = preset.appliedAt
    ? new Date(preset.appliedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className={cn("border border-border bg-card", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-positive animate-blink" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Active Rule Preset
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="border border-positive/30 bg-positive/10 px-2 py-0.5 text-[10px] font-bold text-positive">
            {scopeLabel.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={() => void disable()}
            disabled={disabling}
            title="Disable preset — return to default rules"
            className="flex items-center gap-1 border border-destructive/25 bg-destructive/[0.06] px-2 py-0.5 text-[10px] font-semibold text-destructive transition hover:bg-destructive/15 disabled:opacity-50"
          >
            <X className="size-3" />
            {disabling ? "Disabling…" : "Disable"}
          </button>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="border-b border-border divide-y divide-border">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 bg-amber-400/[0.05] px-4 py-2 text-[11px] text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Cell label="Preset Name"    value={preset.presetName ?? "—"} wide />
        <Cell label="Last Updated"   value={appliedDate} />
        <Cell label="Min Score"      value={preset.minScannerScore  > 0 ? String(preset.minScannerScore)  : "Default (75)"} />
        <Cell label="Min Confidence" value={preset.minConfidence    > 0 ? preset.minConfidence + "%"      : "Default (70%)"} />
        <Cell label="Min R/R"        value={preset.minRiskReward    > 0 ? preset.minRiskReward.toFixed(1) + ":1" : "Default (2.0)"} />
        <Cell label="Setup Types"
          value={preset.setupTypesAllowed.length > 0
            ? preset.setupTypesAllowed.map((s) => s.split(" ")[0]).join(", ")
            : "All"} />
        <Cell label="Excluded Tickers"
          value={preset.excludedTickers.length > 0 ? preset.excludedTickers.join(", ") : "None"} />
        <Cell label="Market Regimes"
          value={preset.allowedMarketRegimes.length > 0
            ? preset.allowedMarketRegimes.map((r) => r.replace("-", " ")).join(", ")
            : "All"} />
      </div>
    </div>
  );
}

function Cell({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-foreground truncate" title={value}>{value}</p>
    </div>
  );
}
