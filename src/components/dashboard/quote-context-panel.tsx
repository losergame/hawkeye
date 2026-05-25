import { AlertCircle, Gauge, LineChart, Target } from "lucide-react";

import { cn } from "@/lib/cn";
import type { StockProfile } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${percent.format(value)}%`;
}

export function QuoteContextPanel({ stock, sessionData }: { stock: StockProfile; sessionData: Array<{ label: string; value: number }> }) {
  const latest = sessionData.at(-1)?.value ?? stock.price;
  const open = sessionData[0]?.value ?? latest;
  const sessionHigh = Math.max(...sessionData.map((point) => point.value), latest);
  const sessionLow = Math.min(...sessionData.map((point) => point.value), latest);
  const range = Math.max(sessionHigh - sessionLow, 0.01);
  const rangePosition = Math.max(0, Math.min(100, ((latest - sessionLow) / range) * 100));
  const moveFromOpen = open > 0 ? ((latest - open) / open) * 100 : 0;
  const previousClose = stock.price - stock.change;
  const latestCandle = stock.candles.at(-1);
  const vwap = latestCandle?.vwap ?? latest;
  const ema50 = latestCandle?.ema50 ?? latest;
  const ema200 = latestCandle?.ema200 ?? latest;
  const vwapGap = vwap > 0 ? ((latest - vwap) / vwap) * 100 : 0;
  const volumePace = stock.averageVolume > 0 ? stock.volume / stock.averageVolume : 0;
  const technicalPosture = latest >= vwap ? "Above VWAP" : "Below VWAP";
  const trendPosture = ema50 >= ema200 ? "50 EMA above 200" : "50 EMA below 200";
  const rangeLabel = rangePosition >= 67 ? "near session highs" : rangePosition <= 33 ? "near session lows" : "mid-range";

  const items = [
    {
      label: "Session read",
      value: formatSignedPercent(moveFromOpen),
      caption: `${money.format(sessionLow)} low / ${money.format(sessionHigh)} high`,
      icon: <LineChart className="size-4 text-cyan-200" />,
      tone: moveFromOpen >= 0 ? "text-emerald-200" : "text-rose-200"
    },
    {
      label: "VWAP posture",
      value: technicalPosture,
      caption: `${formatSignedPercent(vwapGap)} vs VWAP, ${trendPosture}`,
      icon: <Target className="size-4 text-emerald-200" />,
      tone: latest >= vwap ? "text-emerald-200" : "text-rose-200"
    },
    {
      label: "Volume pace",
      value: `${volumePace.toFixed(2)}x`,
      caption: `${compact.format(stock.volume)} traded vs ${compact.format(stock.averageVolume)} avg`,
      icon: <Gauge className="size-4 text-cyan-200" />,
      tone: volumePace >= 1 ? "text-emerald-200" : "text-slate-200"
    },
    {
      label: "Prior close",
      value: money.format(previousClose),
      caption: `${formatSignedPercent(stock.changePercent)} from previous close`,
      icon: <AlertCircle className="size-4 text-amber-200" />,
      tone: stock.changePercent >= 0 ? "text-emerald-200" : "text-rose-200"
    }
  ];

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.025] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Market context</p>
          <p className="mt-1 text-xs text-slate-500">Live quote checkpoints from the current session and technical overlays.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-slate-300">
          Price is {rangeLabel}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-white/10 bg-slate-950/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</span>
              {item.icon}
            </div>
            <p className={cn("text-lg font-semibold", item.tone)}>{item.value}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">{item.caption}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/20 p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span>Range position</span>
          <span>{rangePosition.toFixed(0)}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-rose-300 via-amber-300 to-emerald-300" style={{ width: `${rangePosition}%` }} />
        </div>
        <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
          <span>Support {money.format(sessionLow)}</span>
          <span className="sm:text-center">VWAP {money.format(vwap)}</span>
          <span className="sm:text-right">Resistance {money.format(sessionHigh)}</span>
        </div>
      </div>
    </div>
  );
}
