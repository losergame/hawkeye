"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Minus,
  RotateCcw,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import { AppNav } from "@/components/shared/ui/app-nav";
import { cn } from "@/lib/cn";
import { useSignalTracker } from "@/hooks/useSignalTracker";
import type { TrackedSignal, SignalStatus } from "@/lib/signal-tracker";
import type { StockSetupType } from "@/lib/types";

// ── Formatters ────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});
const pct = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const pctAbs = (v: number) => v.toFixed(1) + "%";

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<SignalStatus, string> = {
  pending:      "border-border text-muted-foreground",
  triggered:    "border-amber-400/30 bg-amber-400/10 text-amber-400",
  target_hit:   "border-positive/30 bg-positive/12 text-positive",
  stopped_out:  "border-destructive/30 bg-destructive/10 text-destructive",
  expired:      "border-border bg-surface-1 text-muted-foreground",
};
const STATUS_LABEL: Record<SignalStatus, string> = {
  pending:     "Pending",
  triggered:   "Triggered",
  target_hit:  "Target hit",
  stopped_out: "Stopped",
  expired:     "Expired",
};

function StatusChip({ status }: { status: SignalStatus }) {
  return (
    <span className={cn("border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Setup type color ──────────────────────────────────────────────────────────

const SETUP_COLOR: Record<string, string> = {
  "Momentum Breakout":  "text-positive",
  "Pullback Buy":       "text-amber-400",
  "Oversold Bounce":    "text-blue-400",
  "Trend Continuation": "text-purple-400",
};

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative" | "neutral";
  icon: React.ReactNode;
}) {
  return (
    <div className="border border-border bg-surface-1 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={cn(
        "text-2xl font-bold tabular-nums",
        tone === "positive" ? "text-positive" :
        tone === "negative" ? "text-destructive" :
        "text-foreground"
      )}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Setup breakdown row ───────────────────────────────────────────────────────

function SetupRow({
  type,
  stats,
}: {
  type: string;
  stats: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    avgReturn: number;
    avgRR: number;
    profitFactor: number;
    calibrationMultiplier: number;
  };
}) {
  const resolved = stats.wins + stats.losses;
  const wr = pctAbs(stats.winRate * 100);
  const hasData = resolved >= 5;

  return (
    <div className="grid items-center gap-3 border-b border-border px-4 py-3 text-xs last:border-0"
      style={{ gridTemplateColumns: "1.4fr 60px 60px 70px 70px 70px 80px" }}>
      <span className={cn("font-semibold", SETUP_COLOR[type] ?? "text-foreground")}>{type}</span>
      <span className="tabular-nums text-muted-foreground">{stats.total}</span>
      <span className={cn("tabular-nums font-semibold", hasData ? (stats.winRate >= 0.55 ? "text-positive" : stats.winRate >= 0.45 ? "text-foreground" : "text-destructive") : "text-muted-foreground")}>
        {hasData ? wr : "—"}
      </span>
      <span className={cn("tabular-nums", stats.avgReturn >= 0 ? "text-positive" : "text-destructive")}>
        {hasData ? pct(stats.avgReturn) : "—"}
      </span>
      <span className="tabular-nums text-muted-foreground">
        {hasData ? stats.avgRR.toFixed(2) + ":1" : "—"}
      </span>
      <span className={cn("tabular-nums", stats.profitFactor >= 1.5 ? "text-positive" : stats.profitFactor >= 1 ? "text-foreground" : "text-destructive")}>
        {hasData ? (isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞") : "—"}
      </span>
      <span className={cn("text-[10px] font-bold", stats.calibrationMultiplier > 1.05 ? "text-positive" : stats.calibrationMultiplier < 0.95 ? "text-destructive" : "text-muted-foreground")}>
        {hasData
          ? stats.calibrationMultiplier > 1.05 ? `↑ ×${stats.calibrationMultiplier.toFixed(2)}`
          : stats.calibrationMultiplier < 0.95 ? `↓ ×${stats.calibrationMultiplier.toFixed(2)}`
          : "→ neutral"
          : "needs data"}
      </span>
    </div>
  );
}

// ── Signal table row ──────────────────────────────────────────────────────────

type SortKey = "generatedAt" | "ticker" | "confidenceScore" | "actualReturn" | "status";

function SignalRow({ signal }: { signal: TrackedSignal }) {
  return (
    <div className="grid items-center gap-2 border-b border-border px-4 py-2.5 text-xs last:border-0 hover:bg-surface-1 transition"
      style={{ gridTemplateColumns: "60px 1fr 80px 70px 70px 70px 90px 90px 70px" }}>
      <span className={cn("font-bold", SETUP_COLOR[signal.setupType] ?? "text-foreground")}>
        {signal.ticker}
      </span>
      <span className="truncate text-muted-foreground">{signal.setupType}</span>
      <span className="tabular-nums text-foreground">{money.format(signal.entryPrice)}</span>
      <span className="tabular-nums text-destructive">{money.format(signal.stopLoss)}</span>
      <span className="tabular-nums text-positive">{money.format(signal.takeProfit1)}</span>
      <span className="tabular-nums text-muted-foreground">{signal.confidenceScore}%</span>
      <StatusChip status={signal.status} />
      <span className={cn(
        "tabular-nums font-semibold",
        signal.actualReturn === undefined ? "text-muted-foreground" :
        signal.actualReturn >= 0 ? "text-positive" : "text-destructive"
      )}>
        {signal.actualReturn !== undefined ? pct(signal.actualReturn) : "—"}
      </span>
      <span className="text-muted-foreground">{dateLabel(signal.generatedAt)}</span>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

type FilterStatus = "all" | SignalStatus;
type FilterSetup = "all" | StockSetupType;

export function SignalPerformanceDashboard() {
  const { signals, stats, sheetsAvailable, clearAll } = useSignalTracker();

  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [setupFilter, setSetupFilter] = useState<FilterSetup>("all");
  const [sortKey, setSortKey] = useState<SortKey>("generatedAt");
  const [sortAsc, setSortAsc] = useState(false);

  const setupTypes: StockSetupType[] = [
    "Momentum Breakout",
    "Pullback Buy",
    "Oversold Bounce",
    "Trend Continuation",
  ];

  const filteredSignals = useMemo(() => {
    return signals
      .filter((s) => {
        if (statusFilter !== "all" && s.status !== statusFilter) return false;
        if (setupFilter !== "all" && s.setupType !== setupFilter) return false;
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortKey === "generatedAt") cmp = a.generatedAt.localeCompare(b.generatedAt);
        else if (sortKey === "ticker") cmp = a.ticker.localeCompare(b.ticker);
        else if (sortKey === "confidenceScore") cmp = a.confidenceScore - b.confidenceScore;
        else if (sortKey === "actualReturn") cmp = (a.actualReturn ?? -999) - (b.actualReturn ?? -999);
        else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
        return sortAsc ? cmp : -cmp;
      });
  }, [signals, statusFilter, setupFilter, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <Minus className="size-3 text-muted-foreground/40" />;
    return sortAsc
      ? <ChevronUp className="size-3 text-positive" />
      : <ChevronDown className="size-3 text-positive" />;
  };

  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const wr = stats ? stats.winRate * 100 : 0;
  const avgRet = stats?.avgReturn ?? 0;
  const pf = stats?.profitFactor ?? 0;

  const isEmpty = signals.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-dot-grid" />

      <AppNav
        activePage="Signals"
        subtitle={sheetsAvailable ? "Signal performance · Google Sheets" : "Signal performance · localStorage"}
        right={
          signals.length > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
              Clear all
            </button>
          ) : null
        }
      />

      <main className="relative mx-auto max-w-[1600px] px-4 py-6 lg:px-6">

        {/* ── Header ── */}
        <div className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-positive/70">
            Signal performance
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            Performance Tracker
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Every scanner signal is tracked from generation to resolution.
            Confidence scores are calibrated from historical win rates.
            {isEmpty && " Run the scanner to start tracking signals automatically."}
          </p>
        </div>

        {/* ── Metric cards ── */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            label="Total signals"
            value={signals.length.toString()}
            sub={`${stats?.triggered ?? 0} triggered · ${stats?.pending ?? 0} pending`}
            icon={<Activity className="size-4 text-muted-foreground" />}
          />
          <MetricCard
            label="Win rate"
            value={wins + losses > 0 ? pctAbs(wr) : "—"}
            sub={`${wins}W · ${losses}L · ${stats?.expired ?? 0} expired`}
            tone={wins + losses >= 5 ? (wr >= 55 ? "positive" : wr >= 45 ? "neutral" : "negative") : "neutral"}
            icon={<Target className="size-4 text-muted-foreground" />}
          />
          <MetricCard
            label="Avg return"
            value={wins + losses > 0 ? pct(avgRet) : "—"}
            sub="per resolved signal"
            tone={avgRet > 0 ? "positive" : avgRet < 0 ? "negative" : "neutral"}
            icon={avgRet >= 0
              ? <TrendingUp className="size-4 text-positive" />
              : <TrendingDown className="size-4 text-destructive" />}
          />
          <MetricCard
            label="Avg R/R"
            value={stats?.avgRR !== undefined && wins + losses > 0 ? stats.avgRR.toFixed(2) + ":1" : "—"}
            sub="achieved risk-reward"
            icon={<BarChart2 className="size-4 text-muted-foreground" />}
          />
          <MetricCard
            label="Profit factor"
            value={wins + losses >= 5 ? (isFinite(pf) ? pf.toFixed(2) : "∞") : "—"}
            sub="gross gains ÷ gross losses"
            tone={pf >= 1.5 ? "positive" : pf >= 1 ? "neutral" : "negative"}
            icon={<Zap className="size-4 text-muted-foreground" />}
          />
        </div>

        {/* ── Best / Worst signals ── */}
        {stats?.bestSignal && stats?.worstSignal && (
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {[
              { label: "Best signal", s: stats.bestSignal, positive: true },
              { label: "Worst signal", s: stats.worstSignal, positive: false },
            ].map(({ label, s, positive }) => (
              <div key={label} className={cn(
                "border p-4",
                positive ? "border-positive/20 bg-positive/[0.04]" : "border-destructive/20 bg-destructive/[0.04]"
              )}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-foreground">{s.ticker}</p>
                    <p className="text-xs text-muted-foreground">{s.companyName} · {s.setupType}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Entry {money.format(s.entryPrice)} · SL {money.format(s.stopLoss)} · TP {money.format(s.takeProfit1)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-2xl font-bold tabular-nums", positive ? "text-positive" : "text-destructive")}>
                      {s.actualReturn !== undefined ? pct(s.actualReturn) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.actualRR !== undefined ? s.actualRR.toFixed(2) + ":1 R/R" : ""}
                    </p>
                    <StatusChip status={s.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Setup type breakdown ── */}
        <div className="mb-6 border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Setup performance by category</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">Calibration multipliers applied to confidence scores</p>
          </div>
          {/* Header */}
          <div className="grid gap-3 border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            style={{ gridTemplateColumns: "1.4fr 60px 60px 70px 70px 70px 80px" }}>
            <span>Setup type</span>
            <span>Total</span>
            <span>Win %</span>
            <span>Avg ret</span>
            <span>Avg R/R</span>
            <span>Prof. F</span>
            <span>Calibration</span>
          </div>
          {setupTypes.map((type) => (
            <SetupRow
              key={type}
              type={type}
              stats={stats?.bySetupType[type] ?? {
                total: 0, wins: 0, losses: 0, pending: 0, expired: 0,
                winRate: 0, avgReturn: 0, avgRR: 0, profitFactor: 0,
                calibrationMultiplier: 1,
              }}
            />
          ))}
        </div>

        {/* ── Signal log ── */}
        <div className="border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Signal log</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {filteredSignals.length} of {signals.length} signals
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {/* Status filter */}
              <div className="flex items-center border border-border bg-surface-1">
                {(["all", "pending", "triggered", "target_hit", "stopped_out", "expired"] as FilterStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "px-2.5 py-1.5 font-medium capitalize transition",
                      statusFilter === s ? "bg-foreground text-background" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    )}
                  >
                    {s === "all" ? "All" : STATUS_LABEL[s as SignalStatus]}
                  </button>
                ))}
              </div>
              {/* Setup filter */}
              <div className="flex items-center border border-border bg-surface-1">
                <button
                  type="button"
                  onClick={() => setSetupFilter("all")}
                  className={cn("px-2.5 py-1.5 font-medium transition", setupFilter === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-surface-2")}
                >All types</button>
                {setupTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSetupFilter(t)}
                    className={cn(
                      "px-2.5 py-1.5 font-medium transition",
                      setupFilter === t ? "bg-foreground text-background" : "text-muted-foreground hover:bg-surface-2"
                    )}
                  >
                    {t.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table header */}
          <div className="grid gap-2 border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            style={{ gridTemplateColumns: "60px 1fr 80px 70px 70px 70px 90px 90px 70px" }}>
            {[
              { label: "Ticker", key: "ticker" as SortKey },
              { label: "Setup", key: null },
              { label: "Entry", key: null },
              { label: "Stop", key: null },
              { label: "Target", key: null },
              { label: "Conf.", key: "confidenceScore" as SortKey },
              { label: "Status", key: "status" as SortKey },
              { label: "Return", key: "actualReturn" as SortKey },
              { label: "Date", key: "generatedAt" as SortKey },
            ].map(({ label, key }) => (
              <button
                key={label}
                type="button"
                disabled={!key}
                onClick={() => key && toggleSort(key)}
                className={cn(
                  "flex items-center gap-1 text-left",
                  key ? "hover:text-foreground cursor-pointer" : "cursor-default"
                )}
              >
                {label}
                {key && <SortIcon k={key} />}
              </button>
            ))}
          </div>

          {/* Rows */}
          {isEmpty ? (
            <div className="flex flex-col items-center py-16">
              <AlertTriangle className="mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">No signals tracked yet</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm text-center">
                Go to the Scanner page and run a scan. All generated setups are automatically saved here.
              </p>
            </div>
          ) : filteredSignals.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              <Minus className="mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">No signals match filters</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              {filteredSignals.map((s) => <SignalRow key={s.id} signal={s} />)}
            </div>
          )}

          {filteredSignals.length > 0 && (
            <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
              {filteredSignals.length} signals · {signals.filter(s => s.isSimulated).length} demo-simulated ·
              confidence scores calibrated after 5+ resolved signals per setup type
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
