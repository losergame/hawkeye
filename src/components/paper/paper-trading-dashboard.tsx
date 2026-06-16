"use client";

import { useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight,
  BarChart2, CheckCircle, FlaskConical, Pause, Play, RefreshCw,
  RotateCcw, TrendingUp, X, XCircle, Zap,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { AppNav } from "@/components/shared/ui/app-nav";
import { cn } from "@/lib/cn";
import { positionAgeHours, formatHoldTime } from "@/lib/paper-analytics";
import { usePaperTrader } from "@/hooks/usePaperTrader";
import { MarketStatusBadge } from "@/components/paper/market-status-badge";
import { ActiveStrategyPanel } from "@/components/shared/active-strategy-panel";
import type { PaperPosition, PaperTrade } from "@/lib/paper-trading";

// ── Formatters ────────────────────────────────────────────────────────────────

const money  = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const signed = (v: number) => (v >= 0 ? "+" : "") + money.format(v);
const spct   = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, sub2, tone = "neutral", icon,
}: {
  label: string; value: string; sub?: string; sub2?: string;
  tone?: "positive" | "negative" | "neutral" | "amber"; icon: React.ReactNode;
}) {
  return (
    <div className={cn(
      "border bg-surface-1 p-4",
      tone === "amber" ? "border-amber-400/30" : "border-border",
    )}>
      <div className="mb-2 flex items-center justify-between">
        <p className={cn(
          "text-[10px] font-semibold uppercase tracking-wider",
          tone === "amber" ? "text-amber-400/80" : "text-muted-foreground",
        )}>{label}</p>
        {icon}
      </div>
      <p className={cn(
        "text-xl font-bold tabular-nums",
        tone === "positive" ? "text-positive" :
        tone === "negative" ? "text-destructive" :
        tone === "amber"    ? "text-amber-400"  : "text-foreground",
      )}>{value}</p>
      {sub  && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      {sub2 && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub2}</p>}
    </div>
  );
}

// ── Result badge ──────────────────────────────────────────────────────────────

function ResultBadge({ result }: { result: PaperTrade["result"] }) {
  const cls =
    result === "win"  ? "border-positive/30 bg-positive/10 text-positive" :
    result === "loss" ? "border-destructive/30 bg-destructive/10 text-destructive" :
                        "border-border text-muted-foreground";
  return (
    <span className={cn("border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", cls)}>
      {result === "win" ? "Win" : result === "loss" ? "Loss" : "B/E"}
    </span>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function PaperTradingDashboard() {
  const {
    account, openPositions, closedTrades, equityCurve, recentActions,
    auditLog,
    isRunning, isLoading, isSaving, debug,
    market, tradingAllowed, allowOutsideHours, setAllowOutsideHours,
    testMode, setTestMode,
    autoTradeEnabled, setAutoTradeEnabled,
    executeTopPick,
    start, pause, reset, rebuild, recalculate, closePosition, reload,
  } = usePaperTrader();

  const [showResetConfirm, setShowResetConfirm]   = useState(false);
  const [startingBalance, setStartingBalance]     = useState("1000");
  const [clearConfirmText, setClearConfirmText]   = useState("");
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false);
  const [rebuildConfirmText, setRebuildConfirmText] = useState("");
  const [activeTab, setActiveTab]               = useState<"positions" | "trades" | "activity">("positions");
  const [showDebug, setShowDebug]               = useState(false);

  function handleReset() {
    const bal = Number(startingBalance);
    if (!Number.isFinite(bal) || bal < 100) return;
    void reset(bal);
    setShowResetConfirm(false);
    setClearConfirmText("");
  }

  function handleRebuild() {
    void rebuild();
    setShowRebuildConfirm(false);
    setRebuildConfirmText("");
  }

  // ── P/L split: realized vs unrealized ───────────────────────────────────────
  // Realized = sum of closed trade profitLoss (excludes DATA_ERROR)
  const realizedPnL = closedTrades
    .filter((t) => t.dataQuality !== "DATA_ERROR" && t.result !== "DATA_ERROR")
    .reduce((sum, t) => sum + t.profitLoss, 0);

  // Unrealized = sum of open position mark-to-market P&L
  const unrealizedPnL = openPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);

  // Closed trades for win-rate label (DATA_ERROR excluded)
  const closedClean = closedTrades.filter(
    (t) => t.dataQuality !== "DATA_ERROR" && t.result !== "DATA_ERROR",
  );

  // Build equity chart data — seed with starting balance if empty
  const chartData = equityCurve.length > 0
    ? equityCurve
    : [{ date: "Start", accountValue: account.startingBalance, cashBalance: account.startingBalance, investedValue: 0, dailyPnL: 0, totalPnLPercent: 0 }];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-dot-grid" />

      <AppNav
        activePage="Paper Trader"
        subtitle="Paper trading simulator"
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isRunning ? pause : start}
              className={cn(
                "flex items-center gap-1.5 border px-3 py-1.5 text-[11px] font-semibold transition",
                isRunning
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
                  : "border-positive/30 bg-positive/10 text-positive hover:bg-positive/20",
              )}
            >
              {isRunning
                ? <><Pause className="size-3.5" /> Pause</>
                : <><Play  className="size-3.5" /> Start</>}
            </button>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={isLoading}
              className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", (isLoading || isSaving) && "animate-spin")} />
              {isSaving ? "Saving…" : "Reload"}
            </button>
            <button
              type="button"
              onClick={() => void recalculate()}
              disabled={isSaving}
              title="Recalculate account balance from PaperTrades history — non-destructive, no data removed"
              className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
              Recalculate
            </button>
            {/* Test mode toggle */}
            <button
              type="button"
              onClick={() => setTestMode(!testMode)}
              className={cn(
                "flex items-center gap-1.5 border px-3 py-1.5 text-[11px] font-semibold transition",
                testMode
                  ? "border-amber-400/40 bg-amber-400/15 text-amber-400 hover:bg-amber-400/25"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <FlaskConical className="size-3.5" />
              {testMode ? "Test: ON" : "Test: OFF"}
            </button>
            <button
              type="button"
              onClick={() => { setRebuildConfirmText(""); setShowRebuildConfirm(true); }}
              disabled={isSaving}
              title="Strip suspicious trades, recalculate account stats, keep open positions"
              className="flex items-center gap-1.5 border border-blue-400/30 bg-blue-400/10 px-3 py-1.5 text-[11px] font-semibold text-blue-400 transition hover:bg-blue-400/20 disabled:opacity-50"
            >
              <RotateCcw className={cn("size-3.5", isSaving && "animate-spin")} />
              Rebuild Account
            </button>
            <button
              type="button"
              onClick={() => { setClearConfirmText(""); setShowResetConfirm(true); }}
              title="Full wipe — reset to $1000, clear all trades and positions"
              className="flex items-center gap-1.5 border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] font-semibold text-destructive transition hover:bg-destructive/20"
            >
              <RotateCcw className="size-3.5" /> Clear Test Data
            </button>
          </div>
        }
      />

      <main className="relative mx-auto max-w-[1400px] px-4 py-6 lg:px-6">

        {/* ── Header ── */}
        <div className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-positive/70">Paper Trading</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Simulator</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Auto-buys top-ranked scanner signals with fake cash · no real trades
                {isRunning
                  ? <span className="ml-2 inline-flex items-center gap-1 text-positive"><span className="size-1.5 animate-blink bg-positive inline-block" /> Running</span>
                  : <span className="ml-2 text-amber-400">Paused</span>}
                {!tradingAllowed && (
                  <span className="ml-2 text-muted-foreground">· market closed, buys paused</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground border border-border bg-surface-1 px-3 py-2">
              <Activity className="size-3.5" />
              Max 3 positions · 2% risk/trade · 25% max/stock
            </div>
          </div>

          {/* Market status row */}
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <MarketStatusBadge market={market} />

            {/* Auto-trade toggle */}
            <div className="flex flex-col justify-between border border-border bg-surface-1 px-4 py-3 min-w-[200px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Auto-trade (5 min loop)
              </p>
              <div className="mt-2 flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  {autoTradeEnabled
                    ? "Paper Trader scans all universes every 5 min."
                    : "Off — only Execute Top Pick buys."}
                </p>
                <button
                  type="button"
                  onClick={() => setAutoTradeEnabled(!autoTradeEnabled)}
                  className={cn(
                    "shrink-0 border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition",
                    autoTradeEnabled
                      ? "border-positive/30 bg-positive/10 text-positive hover:bg-positive/20"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {autoTradeEnabled ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            {/* Outside hours toggle */}
            <div className="flex flex-col justify-between border border-border bg-surface-1 px-4 py-3 min-w-[200px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Trade outside hours
              </p>
              <div className="mt-2 flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  {allowOutsideHours
                    ? "Simulator runs 24/7 — buys anytime."
                    : "Only buys during NYSE regular hours."}
                </p>
                <button
                  type="button"
                  onClick={() => setAllowOutsideHours(!allowOutsideHours)}
                  className={cn(
                    "shrink-0 border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition",
                    allowOutsideHours
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {allowOutsideHours ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Reset confirm modal ── */}
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="border border-border bg-card p-6 w-full max-w-sm">
              <p className="mb-1 font-semibold text-destructive">⚠️ Clear All Test Data?</p>
              <p className="mb-4 text-sm text-muted-foreground">
                Wipes <strong className="text-foreground">all positions, all trades, and equity curve</strong>.
                Account resets to starting balance. Sheet tabs are preserved.
                Use <strong className="text-blue-400">Rebuild Account</strong> instead to keep open positions.
              </p>
              <label className="mb-3 block">
                <span className="text-xs text-muted-foreground">Starting balance ($)</span>
                <input
                  type="number"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground"
                  min="100"
                />
              </label>
              <label className="mb-4 block">
                <span className="text-xs text-muted-foreground">
                  Type <strong className="text-destructive">CLEAR</strong> to confirm
                </span>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder="CLEAR"
                  className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground"
                  autoComplete="off"
                />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={handleReset}
                  disabled={clearConfirmText !== "CLEAR"}
                  className="flex-1 border border-destructive/30 bg-destructive/10 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-not-allowed">
                  Clear All Data
                </button>
                <button type="button" onClick={() => { setShowResetConfirm(false); setClearConfirmText(""); }}
                  className="flex-1 border border-border py-2 text-sm text-muted-foreground transition hover:bg-muted">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Rebuild confirm modal ── */}
        {showRebuildConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="border border-border bg-card p-6 w-full max-w-sm">
              <p className="mb-1 font-semibold text-destructive">⚠️ Rebuild Account?</p>
              <p className="mb-4 text-sm text-muted-foreground">
                Recalculates account stats from scratch. Suspicious and DATA_ERROR trades will be{" "}
                <strong className="text-foreground">permanently removed</strong>. Open positions are kept.{" "}
                Current trades will be backed up to <strong className="text-foreground">PaperTrades_Backup</strong> first.
              </p>
              <label className="mb-4 block">
                <span className="text-xs text-muted-foreground">
                  Type <strong className="text-destructive">RESET</strong> to confirm
                </span>
                <input
                  type="text"
                  value={rebuildConfirmText}
                  onChange={(e) => setRebuildConfirmText(e.target.value)}
                  placeholder="RESET"
                  className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground"
                  autoComplete="off"
                />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={handleRebuild}
                  disabled={rebuildConfirmText !== "RESET" || isSaving}
                  className="flex-1 border border-destructive/30 bg-destructive/10 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-not-allowed">
                  {isSaving ? "Rebuilding…" : "Rebuild Account"}
                </button>
                <button type="button" onClick={() => { setShowRebuildConfirm(false); setRebuildConfirmText(""); }}
                  className="flex-1 border border-border py-2 text-sm text-muted-foreground transition hover:bg-muted">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Test Mode Banner ── */}
        {testMode && (
          <div className="mb-4 flex items-center justify-between gap-4 border border-amber-400/40 bg-amber-400/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                  TEST MODE ACTIVE
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Market hours bypassed · buys and Discord alerts enabled regardless of NYSE status
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void executeTopPick()}
              disabled={isSaving}
              className={cn(
                "flex shrink-0 items-center gap-2 border border-amber-400/40 bg-amber-400/15 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-400 transition",
                "hover:bg-amber-400/25 disabled:opacity-50",
              )}
            >
              {isSaving
                ? <><RefreshCw className="size-3.5 animate-spin" /> Executing…</>
                : <><Zap className="size-3.5" /> Execute Top Pick</>}
            </button>
          </div>
        )}

        {/* Active rule preset status */}
        <ActiveStrategyPanel
          closedTradeCount={closedTrades.length}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <RefreshCw className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* ── Metric cards ── */}
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {/* Account value — 2 cols, shows total (unrealized included) + locked-in cash */}
              <div className="sm:col-span-2 xl:col-span-2">
                <MetricCard
                  label="Account value"
                  value={money.format(account.totalAccountValue)}
                  sub={`Started with ${money.format(account.startingBalance)} · ${spct(account.totalPnLPercent)} return`}
                  sub2={`Locked in (cash): ${money.format(account.cashBalance)}`}
                  icon={<BarChart2 className="size-4 text-muted-foreground" />}
                />
              </div>

              {/* Realized P/L — closed trades only, green/red */}
              <MetricCard
                label="Realized P/L"
                value={signed(realizedPnL)}
                sub={`from ${closedClean.length} closed trade${closedClean.length !== 1 ? "s" : ""}`}
                tone={realizedPnL > 0 ? "positive" : realizedPnL < 0 ? "negative" : "neutral"}
                icon={realizedPnL >= 0
                  ? <ArrowUpRight className="size-4 text-positive" />
                  : <ArrowDownRight className="size-4 text-destructive" />}
              />

              {/* Unrealized P/L — open positions, always amber (not locked in) */}
              <MetricCard
                label="Unrealized P/L"
                value={unrealizedPnL !== 0 ? signed(unrealizedPnL) : "$0.00"}
                sub={`${openPositions.length} open position${openPositions.length !== 1 ? "s" : ""}`}
                tone="amber"
                icon={<TrendingUp className="size-4 text-amber-400" />}
              />

              {/* Win rate — closed trades only */}
              <MetricCard
                label="Win rate"
                value={closedClean.length > 0
                  ? `${(closedClean.filter(t => t.result === "win").length / closedClean.length * 100).toFixed(0)}%`
                  : "—"}
                sub={`${closedClean.filter(t => t.result === "win").length}W · ${closedClean.filter(t => t.result === "loss").length}L · closed only`}
                tone={
                  closedClean.length === 0 ? "neutral" :
                  (closedClean.filter(t => t.result === "win").length / closedClean.length) >= 0.55 ? "positive" :
                  (closedClean.filter(t => t.result === "win").length / closedClean.length) >= 0.45 ? "neutral" : "negative"
                }
                icon={(closedClean.length === 0 ||
                       closedClean.filter(t => t.result === "win").length / closedClean.length >= 0.5)
                  ? <CheckCircle className="size-4 text-positive" />
                  : <XCircle className="size-4 text-destructive" />}
              />

              {/* Invested — capital currently at risk */}
              <MetricCard
                label="Invested"
                value={money.format(account.equityValue)}
                sub={`${openPositions.length} position${openPositions.length !== 1 ? "s" : ""} · ${account.cashBalance > 0 ? ((account.equityValue / account.totalAccountValue) * 100).toFixed(0) : 0}% deployed`}
                icon={<Activity className="size-4 text-muted-foreground" />}
              />
            </div>

            {/* ── Equity curve ── */}
            <div className="mb-6 border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Account equity curve</p>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "text-[10px] font-semibold tabular-nums",
                    realizedPnL >= 0 ? "text-positive" : "text-destructive",
                  )}>
                    {signed(realizedPnL)} realized
                  </span>
                  <span className="text-[10px] font-semibold tabular-nums text-amber-400">
                    {unrealizedPnL !== 0 ? signed(unrealizedPnL) : "$0.00"} open
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--positive)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={false} tickLine={false} width={52}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0, fontSize: 11 }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                    formatter={(v) => [money.format(Number(v ?? 0)), "Account value"]}
                  />
                  <Area type="monotone" dataKey="accountValue" stroke="var(--positive)" strokeWidth={2}
                    fill="url(#eqGrad)" dot={false} activeDot={{ r: 3, fill: "var(--positive)", strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ── Tabs ── */}
            <div className="border border-border bg-card">
              <div className="flex border-b border-border">
                {([
                  { key: "positions", label: `Open (${openPositions.length})` },
                  { key: "trades",    label: `Closed (${closedTrades.length})` },
                  { key: "activity",  label: `Activity (${recentActions.length})` },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition border-r border-border last:border-0",
                      activeTab === key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-surface-1",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Open Positions */}
              {activeTab === "positions" && (
                openPositions.length === 0 ? (
                  <div className="flex flex-col items-center py-14">
                    <TrendingUp className="mb-2 size-8 text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">No open positions</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isRunning ? "Waiting for qualifying scanner signals…" : "Start the trader to auto-buy signals."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                      style={{ gridTemplateColumns: "56px 1fr 60px 80px 80px 90px 90px 70px 70px 55px 64px" }}>
                      <span>Ticker</span><span>Setup / Score</span><span>Shares</span>
                      <span>Entry</span><span>Current</span><span>Value</span>
                      <span>P/L</span><span>Stop</span><span>TP1</span><span className="text-center">Age</span><span />
                    </div>
                    {openPositions.map((p) => (
                      <OpenPositionRow key={p.positionId} position={p} onClose={closePosition} />
                    ))}
                  </>
                )
              )}

              {/* Closed Trades */}
              {activeTab === "trades" && (
                closedTrades.length === 0 ? (
                  <div className="flex flex-col items-center py-14">
                    <BarChart2 className="mb-2 size-8 text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">No closed trades yet</p>
                  </div>
                ) : (
                  <>
                    <div className="grid border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                      style={{ gridTemplateColumns: "56px 1fr 60px 80px 80px 90px 80px 80px 100px" }}>
                      <span>Ticker</span><span>Setup</span><span>Shares</span>
                      <span>Buy</span><span>Sell</span><span>P/L</span>
                      <span>Return</span><span>Result</span><span>Closed</span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {closedTrades.map((t) => (
                        <ClosedTradeRow key={t.tradeId} trade={t} />
                      ))}
                    </div>
                  </>
                )
              )}

              {/* Activity log */}
              {activeTab === "activity" && (
                recentActions.length === 0 ? (
                  <div className="flex flex-col items-center py-14">
                    <Activity className="mb-2 size-8 text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">No activity yet</p>
                  </div>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
                    {recentActions.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                        <span className={cn(
                          "border px-1.5 py-0.5 text-[10px] font-bold uppercase",
                          a.type === "buy"
                            ? "border-positive/30 bg-positive/10 text-positive"
                            : "border-destructive/30 bg-destructive/10 text-destructive",
                        )}>
                          {a.type}
                        </span>
                        <span className="font-bold text-foreground">{a.ticker}</span>
                        <span className="text-muted-foreground">{a.shares} shares @ {money.format(a.price)}</span>
                        <span className="ml-auto truncate text-muted-foreground">{a.reason}</span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* ── Debug panel ── */}
            <div className="mt-4 border border-border">
              <button
                type="button"
                onClick={() => setShowDebug((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-[11px] text-muted-foreground hover:bg-surface-1 transition"
              >
                <span className="font-bold uppercase tracking-wider">Execution Debug</span>
                <span>{showDebug ? "▲ Hide" : "▼ Show"}</span>
              </button>

              {showDebug && (
                <div className="border-t border-border bg-surface-1 p-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[11px]">
                    {[
                      {
                        label: "Market Status",
                        value: market.label,
                        tone: market.isOpen ? "text-positive" : "text-muted-foreground",
                      },
                      {
                        label: "Trader Running",
                        value: isRunning ? "YES — signals processed" : "NO — signals counted but skipped",
                        tone: isRunning ? "text-positive" : "text-destructive",
                      },
                      {
                        label: "Trading Allowed",
                        value: tradingAllowed
                          ? testMode ? "YES (test mode)" : "YES"
                          : "NO — buys gated",
                        tone: tradingAllowed ? "text-positive" : "text-destructive",
                      },
                      {
                        label: "Sheets Configured",
                        value: debug.sheetsConfigured ? "YES" : "NO — data not saved",
                        tone: debug.sheetsConfigured ? "text-positive" : "text-amber-400",
                      },
                      {
                        label: "Last Scan",
                        value: debug.lastScanTime
                          ? new Date(debug.lastScanTime).toLocaleTimeString()
                          : "Never",
                        tone: "text-foreground",
                      },
                      {
                        label: "Signals Checked",
                        value: String(debug.signalsChecked),
                        tone: "text-foreground",
                      },
                      {
                        label: "Last Buy Result",
                        value: debug.lastBuyResult ?? "No scan yet",
                        tone:
                          debug.lastBuyResult === "success" ? "text-positive" :
                          debug.lastBuyResult === "error"   ? "text-destructive" :
                          "text-amber-400",
                      },
                      {
                        label: "Last Position Created",
                        value: debug.lastPositionCreated
                          ? `${debug.lastPositionCreated.ticker} @ ${new Date(debug.lastPositionCreated.at).toLocaleTimeString()}`
                          : "None",
                        tone: debug.lastPositionCreated ? "text-positive" : "text-muted-foreground",
                      },
                    ].map(({ label, value, tone }) => (
                      <div key={label} className="border border-border bg-card p-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                        <p className={cn("mt-1 font-semibold tabular-nums", tone)}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Signal type distribution (before filtering) */}
                  {Object.keys(debug.signalTypeDistribution).length > 0 && (() => {
                    const total = Object.values(debug.signalTypeDistribution).reduce((a, b) => a + b, 0);
                    const ORDER = ["Momentum Breakout", "Pullback Buy", "Trend Continuation", "Oversold Bounce"];
                    const entries = [
                      ...ORDER.filter((k) => debug.signalTypeDistribution[k] !== undefined).map((k) => [k, debug.signalTypeDistribution[k]] as [string, number]),
                      ...Object.entries(debug.signalTypeDistribution).filter(([k]) => !ORDER.includes(k)),
                    ];
                    return (
                      <div className="mt-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Signal type distribution — {total} raw signals (before filtering)
                        </p>
                        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
                          {entries.map(([type, count]) => (
                            <div key={type} className="border border-border bg-card px-3 py-2 text-[11px]">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{type}</p>
                              <p className="mt-0.5 font-semibold tabular-nums text-foreground">
                                {count} <span className="text-muted-foreground font-normal">({total > 0 ? Math.round((count / total) * 100) : 0}%)</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Rejection reasons */}
                  {debug.recentRejections.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Recent rejections ({debug.recentRejections.length} signals)
                      </p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {debug.recentRejections.slice(0, 20).map((r, i) => (
                          <div key={i} className="flex items-start gap-2 border border-border bg-card px-3 py-2 text-[11px]">
                            <span className="font-bold text-destructive w-16 shrink-0">{r.ticker}</span>
                            {r.setupType && <span className="text-blue-400 font-medium w-32 shrink-0 truncate">{r.setupType}</span>}
                            <span className="text-amber-400 font-medium w-36 shrink-0">{r.reason.replace(/_/g, " ")}</span>
                            {r.detail && <span className="text-muted-foreground truncate">{r.detail}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {debug.recentRejections.length === 0 && debug.lastBuyResult === "rejected" && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Signals were rejected but no detail captured — check console for errors.
                    </p>
                  )}

                  {/* Per-position cycle detail */}
                  {debug.lastCycleDetails.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Last cycle detail
                      </p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {debug.lastCycleDetails.map((d, i) => (
                          <div key={i} className={cn(
                            "border bg-card px-3 py-2 text-[11px]",
                            d.action === "stopped-out" ? "border-destructive/30 bg-destructive/[0.03]" :
                            d.action === "tp-hit"      ? "border-positive/30 bg-positive/[0.03]" :
                            d.action === "bought"      ? "border-blue-400/30 bg-blue-400/[0.03]" :
                            "border-border",
                          )}>
                            <div className="flex items-center gap-3 mb-1">
                              <span className="font-bold text-foreground w-14 shrink-0">{d.ticker}</span>
                              <span className={cn(
                                "font-bold text-[10px] uppercase tracking-wider",
                                d.action === "stopped-out" ? "text-destructive" :
                                d.action === "tp-hit"      ? "text-positive" :
                                d.action === "bought"      ? "text-blue-400" : "text-muted-foreground",
                              )}>
                                {d.action.replace(/-/g, " ")}
                              </span>
                              <span className={cn(
                                "text-[10px] ml-auto",
                                d.priceSource === "fresh-finnhub" ? "text-positive" : "text-amber-400",
                              )}>
                                {d.priceSource}
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                              <span>Entry <span className="text-foreground tabular-nums font-semibold">${d.entryPrice.toFixed(2)}</span></span>
                              <span>Mkt <span className="text-foreground tabular-nums font-semibold">${d.currentPrice.toFixed(2)}</span></span>
                              <span>SL <span className="text-destructive tabular-nums font-semibold">${d.stopLoss.toFixed(2)}</span></span>
                              <span>TP1 <span className="text-positive tabular-nums font-semibold">${d.takeProfit1.toFixed(2)}</span></span>
                            </div>
                            <p className="mt-1 text-[10px] text-muted-foreground truncate">{d.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Trade Audit Log ── */}
            {auditLog.length > 0 && (
              <div className="mt-4 border border-border">
                <div className="flex items-center justify-between border-b border-border bg-surface-1 px-4 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Execution Audit Log
                  </p>
                  <span className={cn(
                    "text-[10px] font-bold",
                    auditLog.some(e => e.suspicious) ? "text-amber-400" : "text-muted-foreground",
                  )}>
                    {auditLog.filter(e => e.suspicious).length > 0
                      ? `⚠️ ${auditLog.filter(e => e.suspicious).length} suspicious`
                      : `${auditLog.length} entries`}
                  </span>
                </div>
                <div className="grid border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  style={{ gridTemplateColumns: "56px 80px 80px 80px 80px 70px 1fr" }}>
                  <span>Ticker</span><span>Entry</span><span>TP1</span>
                  <span>Exit</span><span>P/L %</span><span>Flag</span><span>Reason</span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-border">
                  {auditLog.map((e, i) => (
                    <div key={i} className={cn(
                      "grid items-center gap-2 px-4 py-2 text-[11px]",
                      e.suspicious ? "bg-amber-400/[0.04]" : "hover:bg-surface-1/50",
                    )} style={{ gridTemplateColumns: "56px 80px 80px 80px 80px 70px 1fr" }}>
                      <span className={cn("font-bold", e.suspicious ? "text-amber-400" : "text-positive")}>
                        {e.ticker}
                      </span>
                      <span className="tabular-nums text-muted-foreground">${e.entryPrice.toFixed(2)}</span>
                      <span className="tabular-nums text-muted-foreground">${e.tp1.toFixed(2)}</span>
                      <span className="tabular-nums text-foreground">${e.exitPrice.toFixed(2)}</span>
                      <span className={cn("tabular-nums font-semibold", e.profitPct >= 0 ? "text-positive" : "text-destructive")}>
                        {e.profitPct >= 0 ? "+" : ""}{e.profitPct.toFixed(1)}%
                      </span>
                      <span className={cn("text-[10px] font-bold", e.suspicious ? "text-amber-400" : "text-muted-foreground")}>
                        {e.suspicious ? "⚠️ FLAG" : "OK"}
                      </span>
                      <span className="truncate text-muted-foreground">{e.reasonClosed}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Disclaimer ── */}
            <div className="mt-4 flex items-start gap-2 border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[11px] text-muted-foreground">
              <AlertTriangle className="size-3.5 shrink-0 text-amber-400 mt-0.5" />
              <span>
                <strong className="text-foreground">Paper trading only.</strong> No real trades, no brokerage connection, no real money.
                Simulated results are not indicative of actual performance. Not financial advice.
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── Row components ────────────────────────────────────────────────────────────

function OpenPositionRow({
  position: p,
  onClose,
}: {
  position: PaperPosition;
  onClose: (id: string) => void;
}) {
  const ageH = p.openedAt ? positionAgeHours(p.openedAt) : 0;
  const n    = p.notes;
  return (
    <div className="border-b border-border last:border-0">
      <div className="grid items-center px-4 py-3 text-xs hover:bg-surface-1/50 transition"
        style={{ gridTemplateColumns: "56px 1fr 60px 80px 80px 90px 90px 70px 70px 55px 64px" }}>
        <span className="font-bold text-positive">{p.ticker}</span>
        <div>
          <p className="truncate text-muted-foreground">{p.setupType}</p>
          {n?.scannerScore && (
            <p className="text-[10px] text-muted-foreground">score {n.scannerScore} · conf {n.confidence}%</p>
          )}
        </div>
        <span className="tabular-nums text-muted-foreground">{p.shares}</span>
        <span className="tabular-nums text-foreground">{money.format(p.entryPrice)}</span>
        <span className={cn("tabular-nums font-semibold", p.currentPrice >= p.entryPrice ? "text-positive" : "text-destructive")}>
          {money.format(p.currentPrice)}
        </span>
        <span className="tabular-nums text-foreground">{money.format(p.positionValue)}</span>
        <span className={cn("tabular-nums font-semibold", p.unrealizedPnL >= 0 ? "text-positive" : "text-destructive")}>
          {signed(p.unrealizedPnL)}
        </span>
        <span className="tabular-nums text-destructive">{money.format(p.stopLoss)}</span>
        <span className="tabular-nums text-positive">{money.format(p.takeProfit1)}</span>
        {/* Age */}
        <span className="tabular-nums text-muted-foreground text-center">{formatHoldTime(ageH)}</span>
        <button type="button" onClick={() => onClose(p.positionId)}
          className="flex items-center justify-center p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          title="Close position">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function ClosedTradeRow({ trade: t }: { trade: PaperTrade }) {
  return (
    <div className="grid items-center border-b border-border px-4 py-3 text-xs last:border-0 hover:bg-surface-1/50 transition"
      style={{ gridTemplateColumns: "56px 1fr 60px 80px 80px 90px 80px 80px 100px" }}>
      <span className={cn("font-bold", t.result === "win" ? "text-positive" : "text-destructive")}>{t.ticker}</span>
      <span className="truncate text-muted-foreground">{t.setupType}</span>
      <span className="tabular-nums text-muted-foreground">{t.shares}</span>
      <span className="tabular-nums text-foreground">{money.format(t.buyPrice)}</span>
      <span className="tabular-nums text-foreground">{money.format(t.sellPrice)}</span>
      <span className={cn("tabular-nums font-semibold", t.profitLoss >= 0 ? "text-positive" : "text-destructive")}>
        {signed(t.profitLoss)}
      </span>
      <span className={cn("tabular-nums", t.profitLossPercent >= 0 ? "text-positive" : "text-destructive")}>
        {spct(t.profitLossPercent)}
      </span>
      <ResultBadge result={t.result} />
      <span className="text-muted-foreground">{dateLabel(t.closedAt)}</span>
    </div>
  );
}
