"use client";

import { X } from "lucide-react";

import { ConfidenceBadge, RiskRewardBadge, StatusBadge } from "@/components/scanner/badges";
import { potentialGainPercent, riskPercent } from "@/components/scanner/stock-setup-card";
import { scannerConditions } from "@/lib/mockStockSetups";
import type { StockSetup } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });

export function StockDetailModal({ setup, onClose }: { setup: StockSetup | null; onClose: () => void }) {
  if (!setup) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="glass max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-white">{setup.ticker}</h2>
              <StatusBadge status={setup.status} />
              <ConfidenceBadge score={setup.confidenceScore} />
              <RiskRewardBadge value={setup.riskReward} />
            </div>
            <p className="mt-1 text-sm text-slate-400">{setup.companyName} - {setup.setupType}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 bg-white/[0.05] p-2 text-slate-300 transition hover:text-white">
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-84px)] overflow-y-auto p-4">
          <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-lg border border-white/10 bg-[#06111f] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Chart placeholder</p>
              <div className="relative h-64 overflow-hidden rounded-lg border border-cyan-300/10 bg-[linear-gradient(180deg,rgba(34,211,238,0.12),transparent)]">
                <div className="absolute inset-x-6 bottom-8 top-8 grid grid-rows-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <span key={index} className="border-t border-white/10" />
                  ))}
                </div>
                <div className="absolute inset-x-8 bottom-10 flex h-36 items-end gap-3">
                  {[38, 52, 46, 66, 58, 73, 62, 86, 76, 92, 82, 96].map((height, index) => (
                    <span
                      key={index}
                      className="flex-1 rounded-t bg-cyan-300/80 shadow-[0_0_24px_rgba(34,211,238,0.22)]"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
                <div className="absolute bottom-3 left-4 text-xs text-slate-400">Mock technical view, API-ready</div>
                <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-cyan-100">
                  RSI {setup.indicators.rsi}
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <MetricGrid setup={setup} />
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Setup explanation</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{setup.reason}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <ListPanel title="Scanner conditions" items={scannerConditions[setup.setupType]} />
            <ListPanel title="Bullish factors" items={setup.bullishFactors} positive />
            <ListPanel title="Risk factors" items={setup.riskFactors} danger />
          </div>

          <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.055] p-4 text-sm leading-6 text-amber-100/85">
            These trade setups are for educational analysis only and are not financial advice. Always do your own research and manage risk.
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricGrid({ setup }: { setup: StockSetup }) {
  const metrics = [
    ["Current", money.format(setup.currentPrice)],
    ["Entry", money.format(setup.entryPrice)],
    ["Stop loss", money.format(setup.stopLoss)],
    ["Take profit 1", `${money.format(setup.takeProfit1)} (+${potentialGainPercent(setup).toFixed(1)}%)`],
    ["Take profit 2", money.format(setup.takeProfit2)],
    ["Risk", `${riskPercent(setup).toFixed(1)}%`],
    ["EMA 20 / 50", `${money.format(setup.indicators.ema20)} / ${money.format(setup.indicators.ema50)}`],
    ["EMA 200", money.format(setup.indicators.ema200)],
    ["Volume", `${compact.format(setup.indicators.volume)} vs ${compact.format(setup.indicators.avgVolume)}`]
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {metrics.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-1 text-sm font-semibold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ListPanel({ title, items, positive = false, danger = false }: { title: string; items: string[]; positive?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-slate-300">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className={positive ? "mt-1.5 size-2 rounded-full bg-emerald-300" : danger ? "mt-1.5 size-2 rounded-full bg-rose-300" : "mt-1.5 size-2 rounded-full bg-cyan-300"} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
