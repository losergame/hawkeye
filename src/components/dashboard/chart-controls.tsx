import { CandlestickChart as CandleIcon, LineChart } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { ChartTimeframe } from "@/lib/types";
import type { ChartMode } from "@/components/dashboard/types";

const timeframeOptions: ChartTimeframe[] = ["1D", "1W", "1M", "3M", "YTD", "1Y"];

export function ChartModeToggle({ value, onChange }: { value: ChartMode; onChange: (value: ChartMode) => void }) {
  const modes: Array<{ value: ChartMode; label: string; icon: ReactNode }> = [
    { value: "line", label: "Line", icon: <LineChart className="size-4" /> },
    { value: "candles", label: "Candles", icon: <CandleIcon className="size-4" /> }
  ];

  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-1">
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          title={`${mode.label} chart`}
          aria-pressed={value === mode.value}
          onClick={() => onChange(mode.value)}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold text-slate-400 transition",
            value === mode.value ? "bg-cyan-300 text-slate-950 shadow-sm shadow-cyan-950/40" : "hover:bg-white/[0.07] hover:text-white"
          )}
        >
          {mode.icon}
          {mode.label}
        </button>
      ))}
    </div>
  );
}

export function TimeframeToggle({ value, onChange }: { value: ChartTimeframe; onChange: (value: ChartTimeframe) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-1">
      {timeframeOptions.map((timeframe) => (
        <button
          key={timeframe}
          type="button"
          aria-pressed={value === timeframe}
          onClick={() => onChange(timeframe)}
          className={cn(
            "h-8 rounded-md px-2.5 text-xs font-semibold transition",
            value === timeframe ? "bg-white text-slate-950 shadow-sm shadow-black/30" : "text-slate-400 hover:bg-white/[0.07] hover:text-white"
          )}
        >
          {timeframe}
        </button>
      ))}
    </div>
  );
}
