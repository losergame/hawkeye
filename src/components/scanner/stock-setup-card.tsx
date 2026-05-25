"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { ConfidenceBadge, RiskRewardBadge, StatusBadge } from "@/components/scanner/badges";
import { cn } from "@/lib/cn";
import type { StockSetup } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function potentialGainPercent(setup: StockSetup) {
  return ((setup.takeProfit1 - setup.entryPrice) / setup.entryPrice) * 100;
}

export function riskPercent(setup: StockSetup) {
  return ((setup.entryPrice - setup.stopLoss) / setup.entryPrice) * 100;
}

export function StockSetupCard({ setup, onOpen }: { setup: StockSetup; onOpen: (setup: StockSetup) => void }) {
  const [expanded, setExpanded] = useState(false);

  const setupTypeColor =
    setup.setupType === "Oversold Bounce"
      ? "text-[#F59E0B]"
      : setup.setupType === "Pullback Buy"
        ? "text-amber-300"
        : "text-[#00D084]/80";

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-[#00D084]/20 hover:bg-[#00D084]/[0.04]">
      <button
        type="button"
        onClick={() => onOpen(setup)}
        className="w-full p-3 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold text-white">{setup.ticker}</p>
            <p className="text-sm text-slate-400">{setup.companyName}</p>
          </div>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-[#00D084]/60" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge status={setup.status} />
          <ConfidenceBadge score={setup.confidenceScore} />
          <RiskRewardBadge value={setup.riskReward} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Metric label="Current" value={money.format(setup.currentPrice)} />
          <Metric label="Entry" value={money.format(setup.entryPrice)} />
          <Metric label="Stop" value={money.format(setup.stopLoss)} danger />
          <Metric label="TP1" value={`${money.format(setup.takeProfit1)} / +${potentialGainPercent(setup).toFixed(1)}%`} positive />
        </div>
        <p className={cn("mt-3 text-xs font-semibold uppercase tracking-[0.14em]", setupTypeColor)}>
          {setup.setupType}
        </p>
      </button>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="flex w-full items-center justify-center gap-1 text-xs text-slate-500 transition hover:text-slate-300"
        >
          {expanded ? "Less" : "More"}
          <ChevronDown className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
        <div className={cn("overflow-hidden transition-[max-height] duration-300 ease-in-out", expanded ? "max-h-40" : "max-h-0")}>
          <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-400">{setup.reason}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, danger = false, positive = false }: { label: string; value: string; danger?: boolean; positive?: boolean }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.03] p-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={cn(
        "mt-1 font-display text-sm font-semibold tabular-nums",
        danger ? "text-rose-300" : positive ? "text-[#00D084]" : "text-white"
      )}>
        {value}
      </p>
    </div>
  );
}
