"use client";

import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ConfidenceBadge, RiskRewardBadge, StatusBadge } from "@/components/scanner/badges";
import { potentialGainPercent, riskPercent } from "@/components/scanner/stock-setup-card";
import { cn } from "@/lib/cn";
import { scannerConditions } from "@/lib/mockStockSetups";
import type { StockSetup } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });

function useChartReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(f);
  }, []);
  return ready;
}

function buildModalChartData(setup: StockSetup) {
  const seed = setup.ticker.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base = setup.currentPrice;
  const volatility = Math.abs(setup.entryPrice - setup.stopLoss) * 0.6;
  const trend = setup.status === "Triggered" ? 0.7 : setup.status === "Failed" ? -0.5 : 0.1;

  return Array.from({ length: 20 }, (_, i) => {
    const t = i / 19;
    const wave = Math.sin((i + (seed % 7)) * 0.85) * volatility * 0.25;
    const drift = trend * volatility * t;
    const raw = base - volatility * (1 - t) * 0.7 + wave + drift;
    return {
      label: `D-${20 - i}`,
      price: Number(Math.max(raw, base * 0.82).toFixed(2))
    };
  });
}

export function StockDetailModal({
  setup,
  watchlist = [],
  onClose,
  onAddToWatchlist
}: {
  setup: StockSetup | null;
  watchlist?: string[];
  onClose: () => void;
  onAddToWatchlist?: (ticker: string) => void;
}) {
  if (!setup) return null;

  const inWatchlist = watchlist.includes(setup.ticker);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[140] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="animate-modal-in glass max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold text-white">{setup.ticker}</h2>
              <StatusBadge status={setup.status} />
              <ConfidenceBadge score={setup.confidenceScore} />
              <RiskRewardBadge value={setup.riskReward} />
            </div>
            <p className="mt-1 text-sm text-slate-400">{setup.companyName} · {setup.setupType}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onAddToWatchlist && (
              <button
                type="button"
                onClick={() => onAddToWatchlist(setup.ticker)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition",
                  inWatchlist
                    ? "border-[#00D084]/30 bg-[#00D084]/15 text-[#00D084]"
                    : "border-white/[0.06] bg-white/[0.04] text-slate-300 hover:border-[#00D084]/25 hover:text-[#00D084]"
                )}
              >
                <Star className={cn("size-4", inWatchlist && "fill-current")} />
                {inWatchlist ? "Saved" : "Add to watchlist"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/[0.06] bg-white/[0.06] p-2.5 text-slate-300 transition hover:bg-white/[0.12] hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[calc(92vh-80px)] overflow-y-auto p-4">
          <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
            {/* Chart */}
            <ModalChart setup={setup} />

            <div className="grid gap-3">
              <MetricGrid setup={setup} />
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
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

function ModalChart({ setup }: { setup: StockSetup }) {
  const ready = useChartReady();
  const data = buildModalChartData(setup);
  const gradientId = `chart-grad-${setup.ticker}`;

  const allPrices = data.map((d) => d.price).concat([setup.entryPrice, setup.stopLoss, setup.takeProfit1]);
  const yMin = Math.min(...allPrices) * 0.997;
  const yMax = Math.max(...allPrices) * 1.003;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#060B13] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00D084]/70">Price chart</p>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-slate-400">
            RSI {setup.indicators.rsi}
          </span>
          <span className={cn(
            "rounded-full border px-2.5 py-1",
            setup.indicators.macd === "Bullish" ? "border-[#00D084]/20 bg-[#00D084]/10 text-[#00D084]/80" :
            setup.indicators.macd === "Bearish" ? "border-rose-300/20 bg-rose-300/10 text-rose-300/80" :
            "border-amber-300/20 bg-amber-300/10 text-amber-300/80"
          )}>
            MACD {setup.indicators.macd}
          </span>
        </div>
      </div>
      {ready ? (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00D084" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#00D084" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              tick={{ fill: "#64748b", fontSize: 10 }}
              width={44}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: "#0D1520", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#94a3b8" }}
              itemStyle={{ color: "#00D084" }}
              formatter={(v) => [money.format(Number(v ?? 0)), "Price"]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#00D084"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: "#00D084", strokeWidth: 0 }}
            />
            <ReferenceLine y={setup.entryPrice} stroke="#00D084" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: "Entry", position: "right", fill: "#00D084", fontSize: 10 }} />
            <ReferenceLine y={setup.stopLoss} stroke="#FF3B5C" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: "Stop", position: "right", fill: "#FF3B5C", fontSize: 10 }} />
            <ReferenceLine y={setup.takeProfit1} stroke="#00D084" strokeDasharray="3 3" strokeWidth={1} label={{ value: "TP1", position: "right", fill: "#00D084", fontSize: 10 }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[220px] animate-pulse rounded-lg bg-white/[0.04]" />
      )}
      <p className="mt-2 text-center text-[10px] text-slate-600">Synthetic path — API-ready for live data</p>
    </div>
  );
}

function MetricGrid({ setup }: { setup: StockSetup }) {
  const metrics = [
    { label: "Current", value: money.format(setup.currentPrice), highlight: true },
    { label: "Entry", value: money.format(setup.entryPrice) },
    { label: "Stop loss", value: money.format(setup.stopLoss), danger: true },
    { label: "Take profit 1", value: `${money.format(setup.takeProfit1)} (+${potentialGainPercent(setup).toFixed(1)}%)`, positive: true },
    { label: "Take profit 2", value: money.format(setup.takeProfit2), positive: true },
    { label: "Risk", value: `${riskPercent(setup).toFixed(1)}%` },
    { label: "EMA 20 / 50", value: `${money.format(setup.indicators.ema20)} / ${money.format(setup.indicators.ema50)}` },
    { label: "EMA 200", value: money.format(setup.indicators.ema200) },
    { label: "Volume", value: `${compact.format(setup.indicators.volume)} vs ${compact.format(setup.indicators.avgVolume)}` }
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {metrics.map(({ label, value, highlight, positive, danger }) => (
        <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.04] p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className={cn(
            "mt-1 font-display text-sm font-semibold tabular-nums",
            highlight ? "text-white" : positive ? "text-[#00D084]" : danger ? "text-rose-300" : "text-slate-200"
          )}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function ListPanel({ title, items, positive = false, danger = false }: { title: string; items: string[]; positive?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-slate-300">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              positive ? "bg-[#00D084]" : danger ? "bg-[#FF3B5C]" : "bg-[#00D084]"
            )} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
