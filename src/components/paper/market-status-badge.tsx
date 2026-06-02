"use client";

import { cn } from "@/lib/cn";
import type { MarketInfo } from "@/lib/market-hours";

function timeLabel(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h12",
  }) + " ET";
}

const STATUS_STYLE: Record<string, string> = {
  "open":        "border-positive/30 bg-positive/10 text-positive",
  "pre-market":  "border-amber-400/30 bg-amber-400/10 text-amber-400",
  "after-hours": "border-blue-400/30 bg-blue-400/10 text-blue-400",
  "closed":      "border-border bg-surface-1 text-muted-foreground",
  "holiday":     "border-border bg-surface-1 text-muted-foreground",
};

interface Props {
  market: MarketInfo;
  compact?: boolean;
}

export function MarketStatusBadge({ market, compact = false }: Props) {
  const style = STATUS_STYLE[market.status] ?? STATUS_STYLE["closed"];
  const isOpen = market.status === "open";

  if (compact) {
    return (
      <span className={cn("flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", style)}>
        {isOpen && <span className="size-1.5 animate-blink bg-positive inline-block" />}
        NYSE {market.label}
      </span>
    );
  }

  return (
    <div className="border border-border bg-surface-1 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Market Status
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("flex items-center gap-1.5 border px-3 py-1.5 text-sm font-bold uppercase tracking-wider", style)}>
          {isOpen && <span className="size-2 animate-blink bg-positive inline-block" />}
          NYSE {market.label}
        </span>
        <div className="text-xs text-muted-foreground">
          <p>
            <span className="text-foreground font-semibold">
              {market.isOpen ? "Closes" : "Opens"}
            </span>{" "}
            {market.isOpen
              ? timeLabel(market.nextClose)
              : timeLabel(market.nextOpen)}
          </p>
          <p className="mt-0.5 text-[10px]">ET: {market.etTime}</p>
        </div>
      </div>
    </div>
  );
}
