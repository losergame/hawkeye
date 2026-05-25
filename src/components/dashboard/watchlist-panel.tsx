import { Bell } from "lucide-react";

import { MiniSparkline } from "@/components/charts";
import { ChangePill, Panel, ScrollBody, SectionHeader } from "@/components/shared/ui";
import { cn } from "@/lib/cn";
import type { StockProfile } from "@/lib/types";

export function WatchlistPanel({
  stocks: watchStocks,
  selected,
  onPick,
  onToggle
}: {
  stocks: StockProfile[];
  selected: string;
  onPick: (stock: StockProfile) => void;
  onToggle: (symbol: string) => void;
}) {
  return (
    <Panel tight className="flex min-h-[380px] max-h-[460px] flex-col self-start">
      <SectionHeader eyebrow="Watchlist" title="Realtime radar" action={<Bell className="size-5 text-cyan-200" />} />
      <ScrollBody className="grid gap-2">
        {watchStocks.map((stock) => (
          <div
            key={stock.symbol}
            className={cn(
              "rounded-lg border p-2.5 transition",
              selected === stock.symbol ? "border-cyan-300/35 bg-cyan-300/10" : "border-white/10 bg-white/[0.04]"
            )}
          >
            <button onClick={() => onPick(stock)} className="flex w-full items-center justify-between gap-3 text-left">
              <div>
                <p className="font-semibold text-white">{stock.symbol}</p>
                <p className="text-sm text-slate-400">{stock.name}</p>
              </div>
              <MiniSparkline data={stock.intraday} positive={stock.changePercent >= 0} />
            </button>
            <div className="mt-2 flex items-center justify-between gap-3">
              <ChangePill value={stock.changePercent} />
              <button onClick={() => onToggle(stock.symbol)} className="text-xs font-semibold text-slate-400 transition hover:text-white">
                Remove
              </button>
            </div>
          </div>
        ))}
      </ScrollBody>
    </Panel>
  );
}
