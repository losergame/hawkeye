"use client";

import { memo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronRight,
  Target,
  ShieldOff,
  Star,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";

import { RiskRewardBadge, StatusBadge } from "@/components/scanner/badges";
import { potentialGainPercent, riskPercent } from "@/components/scanner/stock-setup-card";
import { Skeleton } from "@/components/shared/ui";
import { cn } from "@/lib/cn";
import type { StockSetup } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type SortColumn = "ticker" | "currentPrice" | "setupType" | "entryPrice" | "riskReward" | "confidenceScore";
type SortDirection = "asc" | "desc";
interface SortState { column: SortColumn; direction: SortDirection; }

function sortSetups(setups: StockSetup[], sort: SortState) {
  return [...setups].sort((a, b) => {
    let cmp = 0;
    if (sort.column === "ticker" || sort.column === "setupType") {
      cmp = a[sort.column].localeCompare(b[sort.column]);
    } else {
      cmp = (a[sort.column] as number) - (b[sort.column] as number);
    }
    return sort.direction === "asc" ? cmp : -cmp;
  });
}

/* Mini sparkline — deterministic fake path from ticker seed */
const MiniSparkline = memo(function MiniSparkline({ setup, positive = true }: { setup: StockSetup; positive?: boolean }) {
  const seed = setup.ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = 40;
  const points = Array.from({ length: 18 }, (_, i) => {
    const wave = Math.sin((i + (seed % 5)) * 0.9) * 12;
    const trend = positive ? i * 0.9 : -i * 0.7;
    return Math.max(4, Math.min(56, base + wave + trend + ((seed * (i + 1)) % 8 - 4)));
  });
  const xs = points.map((_, i) => (i / (points.length - 1)) * 64);
  const pathD = points
    .map((y, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${(60 - y).toFixed(1)}`)
    .join(" ");

  const color = positive ? "var(--positive)" : "var(--destructive)";

  return (
    <svg width="64" height="28" viewBox="0 0 64 60" fill="none" className="opacity-70">
      <path d={pathD} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});

/* Confidence pill with color coded tier */
const ConfidencePill = memo(function ConfidencePill({ score }: { score: number }) {
  const tier =
    score >= 80 ? { bg: "bg-positive/15 text-positive border-positive/30", label: "Strong" } :
    score >= 65 ? { bg: "bg-amber-400/15 text-amber-400 border-amber-400/30", label: "Moderate" } :
                  { bg: "bg-destructive/15 text-destructive border-destructive/30", label: "Weak" };

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold font-mono", tier.bg)}>
        {score}%
      </span>
      <span className="hidden text-[10px] text-muted-foreground lg:inline">{tier.label}</span>
    </div>
  );
});

/* Expanded row detail */
const ExpandedRow = memo(function ExpandedRow({ setup, onOpenModal, onWatchlist, inWatchlist }: {
  setup: StockSetup;
  onOpenModal: (s: StockSetup) => void;
  onWatchlist: (ticker: string) => void;
  inWatchlist: boolean;
}) {
  const gain = potentialGainPercent(setup);
  const risk = riskPercent(setup);

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <td colSpan={12} className="border-b border-border bg-surface-1/60 px-4 pb-4 pt-2">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          {/* Key levels */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Key levels</p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <LevelItem label="Entry" value={money.format(setup.entryPrice)} color="text-foreground" />
              <LevelItem label="Stop" value={money.format(setup.stopLoss)} color="text-destructive" sub={setup.slMethod} />
              <LevelItem label="TP1" value={money.format(setup.takeProfit1)} color="text-positive" sub={setup.tp1Method} />
              <LevelItem label="TP2" value={money.format(setup.takeProfit2)} color="text-positive" sub={setup.tp2Method} />
            </div>
          </div>

          {/* Technical */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Technicals</p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <LevelItem label="RSI" value={String(setup.indicators.rsi)} color={setup.indicators.rsi < 35 ? "text-destructive" : setup.indicators.rsi > 65 ? "text-positive" : "text-foreground"} />
              <LevelItem label="MACD" value={setup.indicators.macd} color={setup.indicators.macd === "Bullish" ? "text-positive" : setup.indicators.macd === "Bearish" ? "text-destructive" : "text-muted-foreground"} />
              <LevelItem label="EMA20" value={money.format(setup.indicators.ema20)} color="text-muted-foreground" />
              <LevelItem label="EMA50" value={money.format(setup.indicators.ema50)} color="text-muted-foreground" />
            </div>
          </div>

          {/* Risk metrics */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risk / reward</p>
            <div className="space-y-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Target className="size-3" /> Potential gain</span>
                  <span className="font-mono text-positive">+{gain.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-positive" style={{ width: `${Math.min(100, gain * 3)}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><ShieldOff className="size-3" /> Risk</span>
                  <span className="font-mono text-destructive">-{risk.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-destructive" style={{ width: `${Math.min(100, risk * 5)}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col items-end justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpenModal(setup)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-positive/30 hover:bg-positive/10 hover:text-positive"
            >
              <ExternalLink className="size-3.5" />
              Full detail
            </button>
            <button
              type="button"
              onClick={() => onWatchlist(setup.ticker)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                inWatchlist
                  ? "border-positive/30 bg-positive/10 text-positive"
                  : "border-border bg-surface-1 text-muted-foreground hover:border-positive/25 hover:text-positive"
              )}
            >
              <Star className={cn("size-3.5", inWatchlist && "fill-current")} />
              {inWatchlist ? "Saved" : "Watchlist"}
            </button>
          </div>
        </div>

        {/* Reason */}
        <p className="mt-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Thesis: </span>
          {setup.reason}
        </p>
      </td>
    </motion.tr>
  );
});

function LevelItem({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="border border-border bg-card px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-xs font-semibold", color)}>{value}</p>
      {sub && <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

function SortableHeader({ label, column, sort, onSort, className }: {
  label: string; column: SortColumn; sort: SortState;
  onSort: (col: SortColumn) => void; className?: string;
}) {
  const active = sort.column === column;
  const Icon = active ? (sort.direction === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className={cn(
        "cursor-pointer select-none px-3 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider transition",
        "text-muted-foreground hover:text-foreground",
        active && "text-positive",
        className
      )}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className={cn("size-3 transition", active ? "text-positive" : "text-muted-foreground/40")} />
      </span>
    </th>
  );
}

export function ScannerTable({
  setups,
  onOpen,
  isLoading = false,
  watchlist = [],
  onWatchlist
}: {
  setups: StockSetup[];
  onOpen: (setup: StockSetup) => void;
  isLoading?: boolean;
  watchlist?: string[];
  onWatchlist?: (ticker: string) => void;
}) {
  const [sort, setSort] = useState<SortState>({ column: "confidenceScore", direction: "desc" });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const prevPrices = useRef<Map<string, number>>(new Map());

  const handleSort = (column: SortColumn) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "desc" }
    );
  };

  const toggleRow = (ticker: string) => {
    setExpandedRow((prev) => (prev === ticker ? null : ticker));
  };

  const sorted = sortSetups(setups, sort);

  function handleWatchlist(ticker: string) {
    onWatchlist?.(ticker);
    const inList = watchlist.includes(ticker);
    if (!inList) toast.success(`${ticker} added to watchlist`, { icon: "⭐" });
    else toast.info(`${ticker} removed from watchlist`);
  }

  return (
    <div className="hidden overflow-hidden rounded-xl border border-border xl:block">
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-card backdrop-blur-sm">
            <tr>
              <th className="w-8 px-3 py-3.5" />
              <SortableHeader label="Ticker" column="ticker" sort={sort} onSort={handleSort} />
              <th className="px-3 py-3.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Company</th>
              <SortableHeader label="Price" column="currentPrice" sort={sort} onSort={handleSort} />
              <th className="px-3 py-3.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">30d trend</th>
              <SortableHeader label="Setup" column="setupType" sort={sort} onSort={handleSort} />
              <SortableHeader label="Entry" column="entryPrice" sort={sort} onSort={handleSort} />
              <th className="px-3 py-3.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stop</th>
              <th className="px-3 py-3.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TP1</th>
              <SortableHeader label="R/R" column="riskReward" sort={sort} onSort={handleSort} />
              <SortableHeader label="Confidence" column="confidenceScore" sort={sort} onSort={handleSort} />
              <th className="px-3 py-3.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {[8, 48, 140, 70, 64, 110, 70, 70, 80, 64, 90, 70].map((w, j) => (
                      <td key={j} className="px-3 py-4">
                        <Skeleton className="h-3.5" style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((setup, idx) => {
                  const prevPrice = prevPrices.current.get(setup.ticker);
                  const flashClass =
                    prevPrice !== undefined
                      ? setup.currentPrice > prevPrice ? "animate-price-up"
                      : setup.currentPrice < prevPrice ? "animate-price-down"
                      : ""
                    : "";
                  prevPrices.current.set(setup.ticker, setup.currentPrice);

                  const isExpanded = expandedRow === setup.ticker;
                  const isPositiveTrend = setup.status !== "Failed";
                  const inWatchlist = watchlist.includes(setup.ticker);

                  return (
                    <>
                      <motion.tr
                        key={setup.ticker}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03, duration: 0.2 }}
                        onClick={() => toggleRow(setup.ticker)}
                        className={cn(
                          "cursor-pointer border-b border-border transition-colors duration-150",
                          isExpanded
                            ? "bg-surface-1 shadow-[inset_3px_0_0_var(--positive)]"
                            : "hover:bg-surface-1 hover:shadow-[inset_3px_0_0_var(--positive)]"
                        )}
                      >
                        {/* Expand chevron */}
                        <td className="px-3 py-3.5">
                          <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </motion.div>
                        </td>

                        {/* Ticker */}
                        <td className="px-3 py-3.5">
                          <span className="font-mono text-sm font-bold text-positive">{setup.ticker}</span>
                        </td>

                        {/* Company */}
                        <td className="px-3 py-3.5 text-sm text-muted-foreground">
                          <span className="max-w-[160px] truncate">{setup.companyName}</span>
                        </td>

                        {/* Price */}
                        <td
                          key={`${setup.ticker}-price-${setup.currentPrice}`}
                          className={cn("px-3 py-3.5 font-mono text-sm font-semibold tabular-nums text-foreground", flashClass)}
                        >
                          {money.format(setup.currentPrice)}
                        </td>

                        {/* Mini sparkline */}
                        <td className="px-3 py-3.5">
                          <MiniSparkline setup={setup} positive={isPositiveTrend} />
                        </td>

                        {/* Setup type */}
                        <td className="px-3 py-3.5 text-xs text-muted-foreground">{setup.setupType}</td>

                        {/* Entry */}
                        <td className="px-3 py-3.5 font-mono text-sm tabular-nums text-foreground">
                          {money.format(setup.entryPrice)}
                        </td>

                        {/* Stop */}
                        <td className="group relative px-3 py-3.5">
                          <span className="font-mono text-sm tabular-nums text-destructive">
                            {money.format(setup.stopLoss)}
                          </span>
                          {setup.slMethod && (
                            <span className="ml-1.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                              {setup.slMethod}
                            </span>
                          )}
                          {setup.slMethod && (
                            <div className="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-1 min-w-[160px] border border-border bg-popover px-2.5 py-2 text-[10px] text-muted-foreground group-hover:visible">
                              <span className="font-semibold text-destructive">SL: </span>{money.format(setup.stopLoss)}<br />
                              <span className="text-foreground">Method: {setup.slMethod}</span>
                            </div>
                          )}
                        </td>

                        {/* TP1 */}
                        <td className="group relative px-3 py-3.5">
                          <span className="font-mono text-sm tabular-nums text-positive">
                            {money.format(setup.takeProfit1)}
                          </span>
                          <span className="ml-1.5 text-[10px] text-positive/60">
                            +{potentialGainPercent(setup).toFixed(1)}%
                          </span>
                          {setup.tp1Method && (
                            <>
                              <span className="ml-1.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                                {setup.tp1Method}
                              </span>
                              <div className="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-1 min-w-[160px] border border-border bg-popover px-2.5 py-2 text-[10px] text-muted-foreground group-hover:visible">
                                <span className="font-semibold text-positive">TP1: </span>{money.format(setup.takeProfit1)}<br />
                                <span className="text-foreground">Method: {setup.tp1Method}</span>
                                {setup.tp2Method && <><br /><span className="text-foreground">TP2 ({setup.tp2Method}): {money.format(setup.takeProfit2)}</span></>}
                              </div>
                            </>
                          )}
                        </td>

                        {/* R/R */}
                        <td className="px-3 py-3.5">
                          <RiskRewardBadge value={setup.riskReward} />
                        </td>

                        {/* Confidence */}
                        <td className="px-3 py-3.5">
                          <ConfidencePill score={setup.confidenceScore} />
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3.5">
                          <StatusBadge status={setup.status} />
                        </td>
                      </motion.tr>

                      <AnimatePresence>
                        {isExpanded && (
                          <ExpandedRow
                            key={`${setup.ticker}-expanded`}
                            setup={setup}
                            onOpenModal={onOpen}
                            onWatchlist={handleWatchlist}
                            inWatchlist={inWatchlist}
                          />
                        )}
                      </AnimatePresence>
                    </>
                  );
                })}
          </tbody>
        </table>
      </div>

      {!isLoading && sorted.length > 0 && (
        <div className="flex items-center justify-between border-t border-border bg-surface-1 px-4 py-2 text-[11px] text-muted-foreground">
          <span>{sorted.length} setup{sorted.length !== 1 ? "s" : ""}</span>
          <span>Click any row to expand · Click again to collapse</span>
        </div>
      )}
    </div>
  );
}
