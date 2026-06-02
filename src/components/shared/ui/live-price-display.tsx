"use client";

/**
 * LivePriceDisplay — shows a price that flashes green on uptick, red on downtick.
 * Uses useLivePrice (WebSocket or HTTP polling depending on env).
 *
 * Also exports:
 *   LiveBadge — "LIVE" or "CLOSED" pill
 *   PriceFlash — thin wrapper to apply flash class to any price string
 */

import { cn } from "@/lib/cn";
import { useLivePrice } from "@/hooks/useLivePrice";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

export function LivePriceDisplay({
  symbol,
  className,
  showChange = false,
  showBadge  = false,
}: {
  symbol:      string;
  className?:  string;
  showChange?: boolean;
  showBadge?:  boolean;
}) {
  const { price, change, changePercent, direction, isLive, marketStatus } = useLivePrice(symbol);

  const flashClass =
    direction === "up"   ? "animate-price-up" :
    direction === "down" ? "animate-price-down" : "";

  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      <span
        key={direction ?? "idle"}   // key forces re-mount so animation replays
        className={cn("rounded px-0.5 transition-colors", flashClass,
          direction === "up"   ? "text-positive" :
          direction === "down" ? "text-destructive" :
          "text-foreground")}
      >
        {price !== null ? fmt.format(price) : "—"}
      </span>

      {showChange && changePercent !== null && (
        <span className={cn("text-[11px] font-medium",
          changePercent >= 0 ? "text-positive" : "text-destructive")}>
          {fmtPct(changePercent)}
        </span>
      )}

      {showBadge && (
        <LiveBadge status={marketStatus} isLive={isLive} />
      )}
    </span>
  );
}

export function LiveBadge({
  status,
  isLive,
}: {
  status:  "OPEN" | "PRE-MARKET" | "AFTER-HOURS" | "CLOSED";
  isLive?: boolean;
}) {
  if (status === "OPEN" && isLive) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-positive/40 bg-positive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-positive">
        <span className="size-1.5 animate-pulse rounded-full bg-positive" />
        LIVE
      </span>
    );
  }

  const styles: Record<typeof status, string> = {
    "OPEN":        "border-positive/30 text-positive",
    "PRE-MARKET":  "border-amber-400/30 text-amber-400",
    "AFTER-HOURS": "border-amber-400/30 text-amber-400",
    "CLOSED":      "border-border text-muted-foreground",
  };

  return (
    <span className={cn(
      "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
      styles[status],
    )}>
      {status.replace("-", "–")}
    </span>
  );
}

/** Thin wrapper — applies flash animation to any pre-formatted price string. */
export function PriceFlash({
  value,
  direction,
  className,
}: {
  value:      string;
  direction:  "up" | "down" | null;
  className?: string;
}) {
  const flashClass =
    direction === "up"   ? "animate-price-up" :
    direction === "down" ? "animate-price-down" : "";

  return (
    <span
      key={direction ?? "idle"}
      className={cn("rounded px-0.5 tabular-nums transition-colors", flashClass,
        direction === "up"   ? "text-positive" :
        direction === "down" ? "text-destructive" : "",
        className,
      )}
    >
      {value}
    </span>
  );
}
