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
    <div className="h-1.5 overflow-hidden bg-border">
      <div className={cn("h-full", toneClass)} style={{ width: `${Math.max(8, Math.min(100, value))}%` }} />
    </div>
  );
}

function WidgetShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-[156px] border border-border bg-surface-1 p-3", className)}>{children}</div>;
}

export function TopMoversTape({ onPick }: { onPick: (stock: StockProfile) => void }) {
  const movers = [...topGainers.slice(0, 4), ...topLosers.slice(0, 3)];

  return (
    <Panel tight className="overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-2 border-r border-border pr-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
                className="flex min-w-44 items-center justify-between gap-3 border border-border bg-surface-1 px-3 py-2 text-left transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.06]"
              >
                <span>
                  <span className="block text-sm font-semibold text-foreground">{item.symbol}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.volume ?? item.name}</span>
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
            <p className="text-sm font-semibold text-foreground">SPY / QQQ tracker</p>
            <LineChart className="size-4 text-cyan-200" />
          </div>
          <div className="grid gap-2">
            {indexTrackers.map((item) => (
              <div key={item.symbol} className="border border-border bg-surface-1 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">{item.symbol}</p>
                    <p className="text-xs text-muted-foreground">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">${item.price.toFixed(2)}</p>
                    <ChangePill value={item.changePercent} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{item.range}</p>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">VIX volatility</p>
            <Gauge className="size-4 text-amber-200" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-semibold text-foreground">17.8</p>
              <p className="text-xs text-muted-foreground">Complacent but rising</p>
            </div>
            <span className="border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-xs font-semibold text-amber-600 dark:text-amber-100">Watch</span>
          </div>
          <div className="mt-3 grid gap-2">
            <MicroBar value={58} tone="amber" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>12 low</span>
              <span>25 stress</span>
            </div>
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Futures overview</p>
            <TrendingUp className="size-4 text-emerald-200" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {futures.map((future) => (
              <div key={future.label} className="bg-surface-1 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{future.label}</span>
                  <span className={future.move >= 0 ? "text-xs text-positive" : "text-xs text-destructive"}>{future.move >= 0 ? "+" : ""}{future.move}%</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-foreground">{future.value}</p>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Economic calendar</p>
            <CalendarClock className="size-4 text-cyan-200" />
          </div>
          <div className="grid gap-2">
            {economicEvents.map((event) => (
              <div key={event.event} className="flex items-center justify-between gap-3 bg-surface-1 px-2.5 py-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">{event.event}</p>
                  <p className="text-xs text-muted-foreground">{event.time} ET</p>
                </div>
                <span className="bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{event.impact}</span>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">AI alerts feed</p>
            <Sparkles className="size-4 text-cyan-200" />
          </div>
          <div className="grid gap-2">
            {aiAlerts.map((alert) => (
              <div key={alert.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <SignalDot stance={alert.tone} />
                <span>{alert.label}</span>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Crypto snapshot</p>
            <Bitcoin className="size-4 text-amber-200" />
          </div>
          <div className="grid gap-2">
            {crypto.map((coin) => (
              <div key={coin.symbol} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-foreground">{coin.symbol}</span>
                <span className="text-muted-foreground">{coin.price}</span>
                <span className={coin.move >= 0 ? "text-positive" : "text-destructive"}>{coin.move >= 0 ? "+" : ""}{coin.move}%</span>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Options flow</p>
            <Zap className="size-4 text-amber-200" />
          </div>
          <div className="grid gap-2">
            {optionsFlow.map((item) => (
              <div key={`${item.symbol}-${item.flow}`} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <span className="font-bold text-foreground">{item.symbol}</span>
                <span className="truncate text-muted-foreground">{item.flow}</span>
                <span className="font-semibold text-foreground">{item.premium}</span>
              </div>
            ))}
          </div>
        </WidgetShell>

        <WidgetShell>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Sector rotation</p>
            <Activity className="size-4 text-emerald-200" />
          </div>
          <div className="grid gap-3">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-foreground">{strongestSector.symbol}</span>
                <span className="text-positive">+{strongestSector.changePercent.toFixed(2)}%</span>
              </div>
              <MicroBar value={82} tone="green" />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-foreground">{weakestSector.symbol}</span>
                <span className="text-destructive">{weakestSector.changePercent.toFixed(2)}%</span>
              </div>
              <MicroBar value={38} tone="rose" />
            </div>
          </div>
        </WidgetShell>
      </div>
    </Panel>
  );
}
