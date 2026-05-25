"use client";

import { ArrowUpRight } from "lucide-react";

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
  return (
    <button
      type="button"
      onClick={() => onOpen(setup)}
      className="rounded-lg border border-white/10 bg-white/[0.045] p-3 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.07]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-white">{setup.ticker}</p>
          <p className="text-sm text-slate-400">{setup.companyName}</p>
        </div>
        <ArrowUpRight className="size-4 text-cyan-200" />
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
        <Metric label="TP1" value={`${money.format(setup.takeProfit1)} / +${potentialGainPercent(setup).toFixed(1)}%`} />
      </div>
      <p className={cn("mt-3 text-xs font-semibold uppercase tracking-[0.14em]", setup.setupType === "Oversold Bounce" ? "text-amber-200" : "text-cyan-200")}>
        {setup.setupType}
      </p>
    </button>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/10 p-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={cn("mt-1 font-semibold", danger ? "text-rose-100" : "text-white")}>{value}</p>
    </div>
  );
}
