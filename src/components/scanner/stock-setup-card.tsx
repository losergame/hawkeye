"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { ConfidenceBadge, DataSourceBadge, RiskRewardBadge, StatusBadge } from "@/components/scanner/badges";
import { cn } from "@/lib/cn";
import type { StockSetup } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function potentialGainPercent(setup: StockSetup): number {
  if (setup.entryPrice <= 0 || setup.takeProfit1 <= setup.entryPrice) return 0;
  return ((setup.takeProfit1 - setup.entryPrice) / setup.entryPrice) * 100;
}

export function riskPercent(setup: StockSetup): number {
  if (setup.entryPrice <= 0 || setup.stopLoss >= setup.entryPrice) return 0;
  return ((setup.entryPrice - setup.stopLoss) / setup.entryPrice) * 100;
}

export function StockSetupCard({ setup, onOpen }: { setup: StockSetup; onOpen: (setup: StockSetup) => void }) {
  const [expanded, setExpanded] = useState(false);

  const setupTypeColor =
    setup.setupType === "Oversold Bounce"
      ? "text-[#F59E0B]"
      : setup.setupType === "Pullback Buy"
        ? "text-amber-300"
        : "text-positive/80";

  return (
    <div className="overflow-hidden border border-border bg-surface-1 transition hover:border-positive/20 hover:bg-positive/[0.04]">
      <button
        type="button"
        onClick={() => onOpen(setup)}
        className="w-full p-3 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold text-foreground">{setup.ticker}</p>
            <p className="text-sm text-muted-foreground">{setup.companyName}</p>
          </div>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-positive/60" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge status={setup.status} />
          <ConfidenceBadge score={setup.confidenceScore} />
          <RiskRewardBadge value={setup.riskReward} />
          <DataSourceBadge
            candleSource={setup.candleSource}
            insufficientData={setup.insufficientData}
            barCount={setup.barCount}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Metric label="Current" value={money.format(setup.currentPrice)} />
          <Metric label="Entry" value={money.format(setup.entryPrice)} />
          <Metric
            label="Stop"
            value={money.format(setup.stopLoss)}
            method={setup.slMethod}
            danger
          />
          <Metric
            label="TP1"
            value={`${money.format(setup.takeProfit1)} / +${potentialGainPercent(setup).toFixed(1)}%`}
            method={setup.tp1Method}
            positive
          />
        </div>
        <p className={cn("mt-3 text-xs font-semibold uppercase tracking-[0.14em]", setupTypeColor)}>
          {setup.setupType}
        </p>
      </button>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          {expanded ? "Less" : "More"}
          <ChevronDown className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
        <div className={cn("overflow-hidden transition-[max-height] duration-300 ease-in-out", expanded ? "max-h-40" : "max-h-0")}>
          <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted-foreground">{setup.reason}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label, value, method, danger = false, positive = false,
}: {
  label: string;
  value: string;
  method?: string;
  danger?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="group relative border border-border bg-surface-1 p-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-1 text-sm font-semibold tabular-nums",
        danger ? "text-destructive" : positive ? "text-positive" : "text-foreground"
      )}>
        {value}
      </p>
      {method && (
        <>
          <span className="mt-0.5 block text-[9px] uppercase tracking-wider text-muted-foreground opacity-70">
            {method}
          </span>
          {/* Tooltip */}
          <div className="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-1 min-w-[140px] border border-border bg-popover px-2 py-1.5 text-[10px] text-muted-foreground group-hover:visible">
            <span className={cn("font-semibold", danger ? "text-destructive" : "text-positive")}>{label}: </span>
            {value}
            <br />
            <span className="text-foreground">Method: {method}</span>
          </div>
        </>
      )}
    </div>
  );
}
