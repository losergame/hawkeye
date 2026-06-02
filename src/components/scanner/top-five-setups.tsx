"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  ShieldAlert,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/cn";
import {
  computeMarketRegime,
  getTopFiveSetups,
  getScannerSummary,
  REGIME_TONE,
  REGIME_LABEL,
  type MarketRegime,
  type ScoredSetup,
} from "@/lib/scanner-scoring";
import type { StockSetup, StockSetupType } from "@/lib/types";

// ── Formatters ────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const SETUP_TYPE_FILTER: Array<"All" | StockSetupType> = [
  "All",
  "Momentum Breakout",
  "Pullback Buy",
  "Oversold Bounce",
  "Trend Continuation",
];

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 flex-1 bg-surface-2">
        <div className={cn("h-full transition-all duration-500", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums text-[10px] text-muted-foreground">
        {value}/{max}
      </span>
    </div>
  );
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const [tone, label] =
    score >= 85 ? ["border-positive/30 bg-positive/12 text-positive", "Strong"] :
    score >= 72 ? ["border-amber-400/30 bg-amber-400/10 text-amber-400", "Good"] :
    score >= 65 ? ["border-blue-400/30 bg-blue-400/10 text-blue-400", "Fair"] :
                  ["border-border bg-surface-1 text-muted-foreground", "Weak"];
  return (
    <span className={cn("border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", tone)}>
      {label}
    </span>
  );
}

// ── Regime badge ──────────────────────────────────────────────────────────────

function RegimeBadge({ regime }: { regime: MarketRegime }) {
  const tone = REGIME_TONE[regime];
  const cls =
    tone === "positive" ? "border-positive/30 bg-positive/10 text-positive" :
    tone === "negative"  ? "border-destructive/30 bg-destructive/10 text-destructive" :
    tone === "warning"   ? "border-amber-400/30 bg-amber-400/10 text-amber-400" :
                           "border-border bg-surface-1 text-muted-foreground";
  return (
    <span className={cn("border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", cls)}>
      {REGIME_LABEL[regime]}
    </span>
  );
}

// ── Rank medal ────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const [text, cls] =
    rank === 1 ? ["#1", "text-amber-400 border-amber-400/40 bg-amber-400/10"] :
    rank === 2 ? ["#2", "text-slate-300 border-border bg-surface-1"] :
    rank === 3 ? ["#3", "text-orange-400 border-orange-400/30 bg-orange-400/08"] :
                 [`#${rank}`, "text-muted-foreground border-border bg-surface-1"];
  return (
    <span className={cn("inline-flex h-7 w-7 items-center justify-center border text-[11px] font-bold", cls)}>
      {text}
    </span>
  );
}

// ── Setup card ────────────────────────────────────────────────────────────────

function SetupCard({
  entry,
  onOpen,
  defaultOpen,
}: {
  entry: ScoredSetup;
  onOpen: (s: StockSetup) => void;
  defaultOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const { setup, scoreBreakdown: bd, score, rank, reasoning } = entry;

  const BREAKDOWN_ROWS = [
    { label: "Trend",            val: bd.trend,          max: 25, bar: "bg-positive" },
    { label: "Momentum",         val: bd.momentum,       max: 20, bar: "bg-blue-400" },
    { label: "Volume",           val: bd.volume,         max: 15, bar: "bg-amber-400" },
    { label: "Relative strength",val: bd.relativeStrength,max:15, bar: "bg-purple-400" },
    { label: "Risk / reward",    val: bd.riskReward,     max: 15, bar: "bg-cyan-400" },
    { label: "Market regime",    val: bd.marketRegime,   max: 10, bar: "bg-rose-400" },
  ];

  return (
    <div className={cn(
      "border border-border bg-card transition-colors",
      rank === 1 && "border-l-2 border-l-amber-400/60",
    )}>
      {/* Card header — always visible, clickable to expand */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 text-left hover:bg-surface-1 transition"
      >
        <div className="flex flex-wrap items-center gap-3">
          <RankBadge rank={rank} />

          {/* Ticker + company */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-bold text-foreground">{setup.ticker}</span>
              <span className="truncate text-xs text-muted-foreground">{setup.companyName}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {setup.setupType}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums text-xs text-foreground">
                {money.format(setup.currentPrice)}
              </span>
            </div>
          </div>

          {/* Score + badge */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums text-foreground">
                {score}<span className="text-xs font-normal text-muted-foreground">/100</span>
              </div>
              <ScoreBadge score={score} />
            </div>
            {expanded
              ? <ChevronUp className="size-4 text-muted-foreground" />
              : <ChevronDown className="size-4 text-muted-foreground" />}
          </div>
        </div>
      </button>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-border px-4 pb-4 pt-3">
              <div className="grid gap-4 lg:grid-cols-[1fr_200px]">

                {/* Left: price levels + reasoning */}
                <div className="space-y-3">
                  {/* Price levels */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { label: "Entry",   val: setup.entryPrice,   cls: "text-foreground" },
                      { label: "Stop",    val: setup.stopLoss,     cls: "text-destructive" },
                      { label: "TP1",     val: setup.takeProfit1,  cls: "text-positive" },
                      { label: "TP2",     val: setup.takeProfit2,  cls: "text-positive/70" },
                    ].map(({ label, val, cls }) => (
                      <div key={label} className="border border-border bg-surface-1 p-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                        <p className={cn("mt-1 text-sm font-bold tabular-nums", cls)}>
                          {money.format(val)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Key stats */}
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="text-muted-foreground">
                      R/R <span className={cn("font-bold tabular-nums", setup.riskReward >= 2 ? "text-positive" : "text-foreground")}>
                        {setup.riskReward.toFixed(1)}:1
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      Confidence <span className="font-bold text-foreground">{setup.confidenceScore}%</span>
                    </span>
                    <span className="text-muted-foreground">
                      RSI <span className="font-bold text-foreground">{setup.indicators.rsi}</span>
                    </span>
                    <span className="text-muted-foreground">
                      MACD <span className={cn(
                        "font-bold",
                        setup.indicators.macd === "Bullish" ? "text-positive" :
                        setup.indicators.macd === "Bearish" ? "text-destructive" : "text-foreground",
                      )}>{setup.indicators.macd}</span>
                    </span>
                    {setup.volRatio && (
                      <span className="text-muted-foreground">
                        Vol ratio <span className="font-bold text-amber-400">{setup.volRatio.toFixed(1)}×</span>
                      </span>
                    )}
                  </div>

                  {/* Reasoning */}
                  <div className="border border-border bg-surface-1 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Why this ranked</p>
                    <p className="text-xs leading-5 text-foreground">{reasoning}</p>
                  </div>
                </div>

                {/* Right: score breakdown */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Score breakdown
                  </p>
                  {BREAKDOWN_ROWS.map(({ label, val, max, bar }) => (
                    <div key={label}>
                      <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
                        <span>{label}</span>
                      </div>
                      <ScoreBar value={val} max={max} tone={bar} />
                    </div>
                  ))}
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs font-bold">
                    <span className="text-muted-foreground">Total</span>
                    <span className="text-foreground">{score}/100</span>
                  </div>
                </div>
              </div>

              {/* View full detail button */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpen(setup); }}
                className="mt-3 w-full border border-border bg-surface-1 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
              >
                View full setup detail ↗
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface TopFiveSetupsProps {
  allSetups: StockSetup[];
  totalScanned: number;
  lastScanned: string | null;
  isLoading: boolean;
  onOpen: (setup: StockSetup) => void;
}

export function TopFiveSetups({
  allSetups,
  totalScanned,
  lastScanned,
  isLoading,
  onOpen,
}: TopFiveSetupsProps) {
  const [typeFilter, setTypeFilter] = useState<"All" | StockSetupType>("All");

  const regime = useMemo(() => computeMarketRegime(allSetups), [allSetups]);

  const topFive = useMemo(
    () => getTopFiveSetups(allSetups, typeFilter, regime),
    [allSetups, typeFilter, regime],
  );

  const summary = useMemo(
    () => getScannerSummary(allSetups, topFive, regime),
    [allSetups, topFive, regime],
  );

  const lastScannedLabel = lastScanned
    ? new Date(lastScanned).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section className="border border-border bg-card">
      {/* Section header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-amber-400" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Daily Top 5 Setups
              </p>
            </div>
            <h2 className="mt-0.5 text-sm font-semibold text-foreground">
              Highest-ranked scanner picks — educational analysis only
            </h2>
          </div>

          {/* Stats strip */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <RegimeBadge regime={regime} />
            <span className="flex items-center gap-1">
              <Activity className="size-3" />
              {totalScanned} scanned
            </span>
            {lastScannedLabel && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {lastScannedLabel}
              </span>
            )}
            {topFive.length > 0 && (
              <span className="flex items-center gap-1">
                <Layers className="size-3" />
                avg {summary.avgScore}/100
              </span>
            )}
          </div>
        </div>

        {/* Setup type filter */}
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {SETUP_TYPE_FILTER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider transition border",
                typeFilter === t
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:bg-surface-1 hover:text-foreground",
              )}
            >
              {t === "All" ? "All setups" : t.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Regime warning for defensive */}
      {regime === "defensive" && (
        <div className="flex items-center gap-2 border-b border-destructive/15 bg-destructive/[0.04] px-4 py-2 text-xs text-destructive">
          <ShieldAlert className="size-3.5 shrink-0" />
          Defensive regime detected — aggressive breakout scores reduced. Pullback and bounce setups preferred.
        </div>
      )}

      {/* Cards */}
      <div className="divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse bg-surface-1/50" />
          ))
        ) : topFive.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <Zap className="mb-2 size-7 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">No qualifying setups</p>
            <p className="mt-1 text-xs text-muted-foreground text-center max-w-xs">
              No setups meet the Top 5 thresholds (score ≥ 65, R/R ≥ 1.5, confidence ≥ 60) for the selected filter.
            </p>
          </div>
        ) : (
          topFive.map((entry) => (
            <SetupCard
              key={entry.setup.ticker + entry.setup.setupType}
              entry={entry}
              onOpen={onOpen}
              defaultOpen={false}
            />
          ))
        )}
      </div>

      {/* Disclaimer */}
      <div className="border-t border-border bg-surface-1 px-4 py-2.5 text-[10px] text-muted-foreground">
        These are scanner-generated trade ideas for educational analysis only, not financial advice.
        Scores derived from technical indicators on synthetic price data. Always conduct your own research.
      </div>
    </section>
  );
}
