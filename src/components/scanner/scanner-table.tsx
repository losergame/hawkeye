"use client";

import { ConfidenceBadge, RiskRewardBadge, StatusBadge } from "@/components/scanner/badges";
import { potentialGainPercent, riskPercent } from "@/components/scanner/stock-setup-card";
import type { StockSetup } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function ScannerTable({ setups, onOpen }: { setups: StockSetup[]; onOpen: (setup: StockSetup) => void }) {
  return (
    <div className="hidden overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] xl:block">
      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#0b1120]/95 text-xs uppercase tracking-[0.14em] text-slate-500 backdrop-blur">
            <tr>
              <th className="px-3 py-3">Ticker</th>
              <th className="px-3 py-3">Company Name</th>
              <th className="px-3 py-3">Current Price</th>
              <th className="px-3 py-3">Setup Type</th>
              <th className="px-3 py-3">Entry Price</th>
              <th className="px-3 py-3">Stop Loss</th>
              <th className="px-3 py-3">Take Profit 1</th>
              <th className="px-3 py-3">Take Profit 2</th>
              <th className="px-3 py-3">Risk/Reward</th>
              <th className="px-3 py-3">Confidence</th>
              <th className="px-3 py-3">Reason</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {setups.map((setup) => (
              <tr
                key={setup.ticker}
                role="button"
                tabIndex={0}
                aria-label={`Open ${setup.ticker} setup details`}
                onClick={() => onOpen(setup)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(setup);
                  }
                }}
                className="cursor-pointer border-b border-white/10 transition hover:bg-cyan-300/[0.06] focus-visible:bg-cyan-300/[0.08] focus-visible:outline-none"
              >
                <td className="px-3 py-3 font-bold text-cyan-100">{setup.ticker}</td>
                <td className="px-3 py-3 text-slate-300">{setup.companyName}</td>
                <td className="px-3 py-3 font-semibold text-white">{money.format(setup.currentPrice)}</td>
                <td className="px-3 py-3 text-slate-300">{setup.setupType}</td>
                <td className="px-3 py-3 text-white">{money.format(setup.entryPrice)}</td>
                <td className="px-3 py-3 text-rose-100">{money.format(setup.stopLoss)}</td>
                <td className="px-3 py-3 text-emerald-100">
                  {money.format(setup.takeProfit1)}
                  <span className="ml-1 text-xs text-emerald-300/70">+{potentialGainPercent(setup).toFixed(1)}%</span>
                </td>
                <td className="px-3 py-3 text-emerald-100">{money.format(setup.takeProfit2)}</td>
                <td className="px-3 py-3">
                  <RiskRewardBadge value={setup.riskReward} />
                  <span className="ml-2 text-xs text-slate-500">risk {riskPercent(setup).toFixed(1)}%</span>
                </td>
                <td className="px-3 py-3">
                  <ConfidenceBadge score={setup.confidenceScore} />
                </td>
                <td className="max-w-[280px] px-3 py-3 text-xs leading-5 text-slate-400">{setup.reason}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={setup.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
