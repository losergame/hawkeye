import { Target } from "lucide-react";

import { InsightIcon, MetricTile, Panel, SectionHeader } from "@/components/shared/ui";
import type { StockProfile } from "@/lib/types";

export function AdvancedTradingPanel({ selected }: { selected: StockProfile }) {
  return (
    <Panel tight className="self-start">
      <SectionHeader eyebrow="Advanced tools" title="Backtest and paper trade" action={<Target className="size-5 text-emerald-200" />} />
      <div className="grid gap-2 md:grid-cols-3">
        <MetricTile label="Backtest CAGR" value="18.6%" caption="EMA crossover, 18 months" />
        <MetricTile label="Win rate" value="61%" caption="42 simulated trades" />
        <MetricTile label="Max drawdown" value="-7.8%" caption="Position cap 12%" />
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-1 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <InsightIcon type="money" />
            Paper trading ticket
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <span className="rounded-lg bg-surface-1 px-3 py-2 text-muted-foreground">{selected.symbol}</span>
            <span className="rounded-lg bg-surface-1 px-3 py-2 text-muted-foreground">25 shares</span>
            <span className="rounded-lg bg-emerald-300 px-3 py-2 text-center font-bold text-slate-950">Buy</span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface-1 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <InsightIcon type="risk" />
            Trade idea
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{selected.swingTradeIdea}</p>
        </div>
      </div>
    </Panel>
  );
}
