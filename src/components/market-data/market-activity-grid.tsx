import { Activity, Bitcoin, CalendarClock, Gauge, LineChart, Radio, Sparkles, TrendingUp, Zap } from "lucide-react";
import type { ReactNode } from "react";

import { ChangePill, Panel, SectionHeader, SignalDot } from "@/components/shared/ui";
import { cn } from "@/lib/cn";
import { findStock, heatmap, topGainers, topLosers } from "@/lib/mock-data";
import type { StockProfile } from "@/lib/types";

const indexTrackers = [
  { symbol: "SPY", name: "S&P 500 ETF", price: 586.41, changePercent: 0.42, range: "Near 5D high" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", price: 513.22, changePercent: 0.77, range: "AI leadership" }
];

const futures = [
  { label: "ES", value: "5,912.25", move: 0.21 },
  { label: "NQ", value: "21,144.50", move: 0.48 },
  { label: "RTY", value: "2,118.10", move: -0.16 },
  { label: "CL", value: "78.42", move: -0.31 }
];

const economicEvents = [
  { time: "8:30 AM", event: "Initial claims", impact: "Med" },
  { time: "10:00 AM", event: "Existing home sales", impact: "Low" },
  { time: "2:00 PM", event: "Fed speaker", impact: "High" }
];

const aiAlerts = [
  { label: "NVDA reclaiming VWAP", tone: "bullish" as const },
  { label: "TSLA relative volume cooling", tone: "neutral" as const },
  { label: "AMD call activity elevated", tone: "bullish" as const },
  { label: "Energy breadth weakening", tone: "bearish" as const }
];

const crypto = [
  { symbol: "BTC", price: "$104.8K", move: 1.9 },
  { symbol: "ETH", price: "$3.82K", move: 0.8 },
  { symbol: "SOL", price: "$188.40", move: -0.4 }
];

const optionsFlow = [
  { symbol: "NVDA", flow: "Call sweep", premium: "$2.8M" },
  { symbol: "AMD", flow: "Bullish block", premium: "$1.1M" },
  { symbol: "TSLA", flow: "Put spread", premium: "$940K" }
];

function MicroBar({ value, tone = "cyan" }: { value: number; tone?: "cyan" | "green" | "rose" | "amber" }) {
  const toneClass = {
    cyan: "bg-cyan-300",
    green: "bg-emerald-300",
    rose: "bg-rose-300",
    amber: "bg-amber-300"
  }[tone];

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className={cn("h-full rounded-full", toneClass)} style={{ width: `${Math.max(8, Math.min(100, value))}%` }} />
    </div>
  );
}

function WidgetShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-[156px] rounded-lg border border-white/10 bg-white/[0.035] p-3", className)}>{children}</div>;
}

export function TopMoversTape({ onPick }: { onPick: (stock: StockProfile) => void }) {
  const movers = [...topGainers.slice(0, 4), ...topLosers.slice(0, 3)];

  return (
    <Panel tight className="overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-2 border-r border-white/10 pr-3 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/70">
          <Radio className="size-4" />
          Live tape
        </div>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {movers.map((item) => {
            const stock = findStock(item.symbol);
            return (
              <button
                key={`${item.symbol}-${item.changePercent}`}
                type="button"
                onClick={() => onPick(stock)}
                className="flex min-w-44 items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-left transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.06]"
              >
                <span>
                  <span className="block text-sm font-semibold text-white">{item.symbol}</span>
                  <span className="block truncate text-xs text-slate-500">{item.volume ?? item.name}</span>
                </span>
                <ChangePill value={item.changePercent} />
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function MarketActivityGrid({ compactMode }: { compactMode: boolean }) {
  const strongestSector = [...heatmap].sort((a, b) => b.changePercent - a.changePercent)[0];
  const weakestSector = [...heatmap].sort((a, b) => a.changePercent - b.changePercent)[0];

  return (
    <Panel tight>
      <SectionHeader eyebrow="Market activity" title="Cross-asset command center" action={<Activity className="size-5 text-cyan-200" />} />
      <div className={cn("grid [grid-auto-flow:dense] gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", compactMode && "gap-2")}>
        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">SPY / QQQ tracker</p>
            <LineChart className="size-4 text-cyan-200" />
          </div>
          <div className="grid gap-2">
            {indexTrackers.map((item) => (
              <div key={item.symbol} className="rounded-md border border-white/10 bg-slate-950/20 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">{item.symbol}</p>
                    <p className="text-xs text-slate-500">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">${item.price.toFixed(2)}</p>
                    <ChangePill value={item.changePercent} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-400">{item.range}</p>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">VIX volatility</p>
            <Gauge className="size-4 text-amber-200" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-semibold text-white">17.8</p>
              <p className="text-xs text-slate-500">Complacent but rising</p>
            </div>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-xs font-semibold text-amber-100">Watch</span>
          </div>
          <div className="mt-3 grid gap-2">
            <MicroBar value={58} tone="amber" />
            <div className="flex justify-between text-xs text-slate-500">
              <span>12 low</span>
              <span>25 stress</span>
            </div>
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Futures overview</p>
            <TrendingUp className="size-4 text-emerald-200" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {futures.map((future) => (
              <div key={future.label} className="rounded-md bg-white/[0.04] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-400">{future.label}</span>
                  <span className={future.move >= 0 ? "text-xs text-emerald-200" : "text-xs text-rose-200"}>{future.move >= 0 ? "+" : ""}{future.move}%</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-white">{future.value}</p>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Economic calendar</p>
            <CalendarClock className="size-4 text-cyan-200" />
          </div>
          <div className="grid gap-2">
            {economicEvents.map((event) => (
              <div key={event.event} className="flex items-center justify-between gap-3 rounded-md bg-white/[0.04] px-2.5 py-2">
                <div>
                  <p className="text-xs font-semibold text-white">{event.event}</p>
                  <p className="text-xs text-slate-500">{event.time} ET</p>
                </div>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-slate-300">{event.impact}</span>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">AI alerts feed</p>
            <Sparkles className="size-4 text-cyan-200" />
          </div>
          <div className="grid gap-2">
            {aiAlerts.map((alert) => (
              <div key={alert.label} className="flex items-center gap-2 text-sm text-slate-300">
                <SignalDot stance={alert.tone} />
                <span>{alert.label}</span>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Crypto snapshot</p>
            <Bitcoin className="size-4 text-amber-200" />
          </div>
          <div className="grid gap-2">
            {crypto.map((coin) => (
              <div key={coin.symbol} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-white">{coin.symbol}</span>
                <span className="text-slate-300">{coin.price}</span>
                <span className={coin.move >= 0 ? "text-emerald-200" : "text-rose-200"}>{coin.move >= 0 ? "+" : ""}{coin.move}%</span>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Options flow</p>
            <Zap className="size-4 text-amber-200" />
          </div>
          <div className="grid gap-2">
            {optionsFlow.map((item) => (
              <div key={`${item.symbol}-${item.flow}`} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <span className="font-bold text-white">{item.symbol}</span>
                <span className="truncate text-slate-400">{item.flow}</span>
                <span className="font-semibold text-cyan-100">{item.premium}</span>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Sector rotation</p>
            <Activity className="size-4 text-emerald-200" />
          </div>
          <div className="grid gap-3">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-emerald-100">{strongestSector.symbol}</span>
                <span className="text-emerald-200">+{strongestSector.changePercent.toFixed(2)}%</span>
              </div>
              <MicroBar value={82} tone="green" />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-rose-100">{weakestSector.symbol}</span>
                <span className="text-rose-200">{weakestSector.changePercent.toFixed(2)}%</span>
              </div>
              <MicroBar value={38} tone="rose" />
            </div>
          </div>
        </WidgetShell>
      </div>
    </Panel>
  );
}
