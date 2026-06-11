"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, ComposedChart, CartesianGrid, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, BarChart2, CheckCircle, RefreshCw, Save, Settings, Trash2, X } from "lucide-react";

import { AppNav } from "@/components/shared/ui/app-nav";
import { cn } from "@/lib/cn";
import {
  computeAnalytics, computeConfidenceBuckets, computeHoldTimeAnalysis,
  computeRRAnalysis, computeTickerPerformance, computeRegimeAnalysis,
  checkDataIntegrity, generateHealthReport, generateOptimizationSuggestions,
  simulateRules, SETUP_TYPES, DEFAULT_SIMULATOR_FILTERS,
  computeFullDataIntegrity, sanitizeTrades, DEFAULT_SANITIZATION,
  computeRealismScore, computeFillQualityMetrics,
  formatHoldTime, winRateColor,
  type TradeAnalytics, type ScoreBucket, type TickerStats,
  type RegimeStats, type HoldTimeAnalysis, type RRAnalysis,
  type DataIntegrityResult, type HealthReport, type OptimizationReport,
  type SuggestionSeverity, type SimulatorFilters, type SimulationResult,
  type FullDataIntegrityReport, type SanitizationOptions, type RealismReport, type FillQualityMetrics,
} from "@/lib/paper-analytics";
import type { PaperTrade, PaperPosition, EquityCurvePoint, PaperAccount } from "@/lib/paper-trading";
import type { RulePreset } from "@/app/api/presets/route";
import { ActiveStrategyPanel } from "@/components/shared/active-strategy-panel";

// ── Formatters ────────────────────────────────────────────────────────────────

const $     = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const s$    = (v: number) => (v >= 0 ? "+" : "") + $.format(v);
const pct   = (v: number, dp = 1) => (v >= 0 ? "+" : "") + v.toFixed(dp) + "%";
const na    = (n: number, min = 3) => n >= min;

// ── Sub-components ────────────────────────────────────────────────────────────

function Sect({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-card">
      <div className="border-b border-border bg-surface-1 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        {sub && <p className="mt-0.5 text-sm font-semibold text-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className={cn("text-xs font-bold tabular-nums", tone ?? "text-foreground")}>{value}</span>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function BucketTable({
  buckets, emptyMsg,
}: { buckets: ScoreBucket[]; emptyMsg: string }) {
  if (buckets.length === 0) return (
    <p className="px-4 py-6 text-xs text-muted-foreground">{emptyMsg}</p>
  );
  return (
    <>
      <div className="grid border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        style={{ gridTemplateColumns: "90px 50px 50px 60px 70px 80px" }}>
        <span>Range</span><span className="text-center">N</span>
        <span className="text-center">Wins</span><span className="text-center">Win%</span>
        <span className="text-right">Avg ret</span><span className="text-right">P/L</span>
      </div>
      {buckets.map((b) => (
        <div key={b.label} className="grid items-center gap-3 border-b border-border px-4 py-3 text-xs last:border-0"
          style={{ gridTemplateColumns: "90px 50px 50px 60px 70px 80px" }}>
          <span className="font-bold text-foreground">{b.label}</span>
          <span className="tabular-nums text-muted-foreground text-center">{b.trades}</span>
          <span className="tabular-nums text-muted-foreground text-center">{b.wins}</span>
          <span className={cn("tabular-nums font-bold text-center", winRateColor(b.winRate, b.trades))}>
            {na(b.trades) ? (b.winRate * 100).toFixed(0) + "%" : "—"}
          </span>
          <span className={cn("tabular-nums text-right", b.avgReturn >= 0 ? "text-positive" : "text-destructive")}>
            {pct(b.avgReturn)}
          </span>
          <span className={cn("tabular-nums text-right font-semibold", b.totalPnL >= 0 ? "text-positive" : "text-destructive")}>
            {s$(b.totalPnL)}
          </span>
        </div>
      ))}
    </>
  );
}

// ── Trade Replay modal ────────────────────────────────────────────────────────

function TradeReplayModal({ t, onClose }: { t: PaperTrade; onClose: () => void }) {
  const n  = (t.notes ?? {}) as Record<string, unknown>;
  const sb = n.scoreBreakdown as { trend?: number; momentum?: number; volume?: number; relativeStrength?: number; riskReward?: number; marketRegime?: number } | undefined;
  const closeReason =
    t.reasonClosed.includes("Take profit") ? "TP1 Hit" :
    t.reasonClosed.includes("Stop loss")   ? "Stop Loss Hit" :
    t.reasonClosed.includes("Manual")      ? "Manual Close" : t.reasonClosed;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="border border-border bg-card w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sticky top-0 bg-card">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground">{t.ticker}</span>
            <span className={cn("border px-2 py-0.5 text-[10px] font-bold uppercase",
              t.result === "win" ? "border-positive/30 bg-positive/10 text-positive"
              : "border-destructive/30 bg-destructive/10 text-destructive")}>
              {t.result.toUpperCase()}
            </span>
            <span className="text-xs text-muted-foreground">{t.setupType}</span>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["Entry", t.buyPrice, "text-foreground"], ["Stop", t.slAtEntry ?? 0, "text-destructive"],
               ["Target", t.tp1AtEntry ?? 0, "text-positive"],
               ["Exit", t.sellPrice, t.result === "win" ? "text-positive" : "text-destructive"]] as [string, number, string][])
              .map(([l, v, c]) => (
              <div key={l} className="border border-border bg-surface-1 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</p>
                <p className={cn("mt-1 text-sm font-bold tabular-nums", c)}>{v > 0 ? $.format(v) : "—"}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {([["Shares", String(t.shares), "text-foreground"],
               ["P/L", s$(t.profitLoss), t.profitLoss >= 0 ? "text-positive" : "text-destructive"],
               ["Return", pct(t.profitLossPercent), t.profitLoss >= 0 ? "text-positive" : "text-destructive"],
               ["Hold", formatHoldTime(t.holdTimeHours ?? 0), "text-foreground"]] as [string, string, string][])
              .map(([l, v, c]) => (
              <div key={l} className="border border-border bg-surface-1 p-2.5">
                <p className="text-[10px] text-muted-foreground">{l}</p>
                <p className={cn("mt-1 text-sm font-bold tabular-nums", c)}>{v}</p>
              </div>
            ))}
          </div>
          <div className="border border-border bg-surface-1 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Reason Closed</p>
            <p className="text-sm font-semibold text-foreground">{closeReason}</p>
          </div>
          {(n.scannerScore != null || sb) && (
            <div className="border border-border bg-surface-1 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Scanner Reasoning</p>
              <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
                {n.scannerScore != null && <span className="text-muted-foreground">Score <b className="text-foreground">{String(n.scannerScore)}</b></span>}
                {n.confidence   != null && <span className="text-muted-foreground">Conf. <b className="text-foreground">{String(n.confidence)}%</b></span>}
                {n.scannerRank  != null && <span className="text-muted-foreground">Rank <b className="text-foreground">#{String(n.scannerRank)}</b></span>}
                {n.marketRegime != null && <span className="text-muted-foreground">Regime <b className="text-foreground">{String(n.marketRegime)}</b></span>}
                {n.candleSource != null && <span className="text-muted-foreground">Candles <b className="text-foreground">{String(n.candleSource)}</b></span>}
              </div>
              {sb && (
                <div className="grid grid-cols-3 gap-1 text-[10px] border-t border-border pt-2">
                  <span className="text-muted-foreground">Trend <b className="text-foreground">{sb.trend ?? 0}/25</b></span>
                  <span className="text-muted-foreground">Mom. <b className="text-foreground">{sb.momentum ?? 0}/20</b></span>
                  <span className="text-muted-foreground">Vol. <b className="text-foreground">{sb.volume ?? 0}/15</b></span>
                  <span className="text-muted-foreground">RS <b className="text-foreground">{sb.relativeStrength ?? 0}/15</b></span>
                  <span className="text-muted-foreground">RR <b className="text-foreground">{sb.riskReward ?? 0}/15</b></span>
                  <span className="text-muted-foreground">Regime <b className="text-foreground">{sb.marketRegime ?? 0}/10</b></span>
                </div>
              )}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Opened {new Date(t.openedAt).toLocaleString()} · Closed {new Date(t.closedAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function AnalyticsDashboard() {
  const [trades, setTrades]         = useState<PaperTrade[]>([]);
  const [positions, setPos]         = useState<PaperPosition[]>([]);
  const [equity, setEquity]         = useState<EquityCurvePoint[]>([]);
  const [account, setAccount]       = useState<PaperAccount | null>(null);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<PaperTrade | null>(null);
  const [realCandlePct, setRealPct] = useState(0);

  // force=true (Refresh button): bypass browser cache to always show latest data.
  // force=false (auto load on mount): respect Cache-Control headers so repeat
  // visits within 30 s are served from browser cache instantly.
  const load = useCallback(async (force = false) => {
    const cacheOpt = force ? { cache: "no-cache" as const } : {};
    setLoading(true);
    try {
      const [tr, pos, eq, acc, cov] = await Promise.all([
        fetch("/api/paper/trades",     cacheOpt).then((r) => r.json()) as Promise<{ trades: PaperTrade[] }>,
        fetch("/api/paper/positions",  cacheOpt).then((r) => r.json()) as Promise<{ positions: PaperPosition[] }>,
        fetch("/api/paper/equity",     cacheOpt).then((r) => r.json()) as Promise<{ points: EquityCurvePoint[] }>,
        fetch("/api/paper/account",    cacheOpt).then((r) => r.json()) as Promise<{ account: PaperAccount }>,
        fetch("/api/scanner/prefetch", cacheOpt).then((r) => r.json()).catch(() => null) as Promise<{ sp500?: { realPct: number } } | null>,
      ]);
      setTrades(tr.trades ?? []);
      setPos(pos.positions ?? []);
      setEquity(eq.points ?? []);
      setAccount(acc.account ?? null);
      setRealPct(cov?.sp500?.realPct ?? 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Data sanitization toggles ─────────────────────────────────────────────
  const [sanitization, setSanitization] = useState<SanitizationOptions>(DEFAULT_SANITIZATION);

  const integrity  = useMemo(() => computeFullDataIntegrity(trades), [trades]);
  const sanitized  = useMemo(() => sanitizeTrades(trades, sanitization), [trades, sanitization]);
  const cleanTrades= sanitized.trades;
  const realism    = useMemo(() => computeRealismScore(realCandlePct), [realCandlePct]);
  const fillQuality= useMemo(() => computeFillQualityMetrics(cleanTrades), [cleanTrades]);

  const an    = useMemo(() => computeAnalytics(cleanTrades, equity, positions.length), [cleanTrades, equity, positions.length]);
  const confB = useMemo(() => computeConfidenceBuckets(cleanTrades), [cleanTrades]);
  const hold  = useMemo(() => computeHoldTimeAnalysis(cleanTrades), [cleanTrades]);
  const rr    = useMemo(() => computeRRAnalysis(cleanTrades), [cleanTrades]);
  const tick  = useMemo(() => computeTickerPerformance(cleanTrades), [cleanTrades]);
  const regime= useMemo(() => computeRegimeAnalysis(cleanTrades), [cleanTrades]);
  const integ = useMemo(() => checkDataIntegrity(cleanTrades), [cleanTrades]);
  const health= useMemo(() => generateHealthReport(an, an.scoreBuckets, confB, tick), [an, confB, tick]);
  const optim : OptimizationReport = useMemo(
    () => generateOptimizationSuggestions(trades, an.scoreBuckets, confB, an.bySetupType, tick.best, tick.worst, regime),
    [trades, an, confB, tick, regime],
  );

  // ── Rule Simulator state ──────────────────────────────────────────────────
  const [simFilters, setSimFilters] = useState<SimulatorFilters>(DEFAULT_SIMULATOR_FILTERS);
  const [excludeInput, setExcludeInput] = useState("");   // raw comma-separated input

  const baseResult: SimulationResult = useMemo(
    () => simulateRules(trades, DEFAULT_SIMULATOR_FILTERS),
    [trades],
  );
  const simResult: SimulationResult = useMemo(
    () => simulateRules(trades, simFilters),
    [trades, simFilters],
  );

  function patchSim(patch: Partial<SimulatorFilters>) {
    setSimFilters((prev) => ({ ...prev, ...patch }));
  }
  function applyOptimSuggestions() {
    const newFilters: SimulatorFilters = {
      ...simFilters,
      minScore:      optim.suggestedMinScore      ?? simFilters.minScore,
      minConfidence: optim.suggestedMinConfidence ?? simFilters.minConfidence,
      allowedSetups: optim.bestSetupType ? [optim.bestSetupType] : simFilters.allowedSetups,
      excludeTickers:optim.worstTicker ? [optim.worstTicker, ...simFilters.excludeTickers.filter((t) => t !== optim.worstTicker)] : simFilters.excludeTickers,
    };
    setSimFilters(newFilters);
    setExcludeInput(newFilters.excludeTickers.join(", "));
  }
  function resetSim() {
    setSimFilters(DEFAULT_SIMULATOR_FILTERS);
    setExcludeInput("");
  }
  function exportSim() {
    const data = { filters: simFilters, base: baseResult, simulated: simResult, timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `hawkeye-rule-test-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Preset state ──────────────────────────────────────────────────────────
  const [presets, setPresets]           = useState<RulePreset[]>([]);
  const [saveModalOpen, setSaveModal]   = useState(false);
  const [applyTarget, setApplyTarget]   = useState<RulePreset | null>(null);
  const [presetName, setPresetName]     = useState("");
  const [presetNotes, setPresetNotes]   = useState("");
  const [saving, setSaving]             = useState(false);
  const [applying, setApplying]         = useState(false);
  const [activePresetName, setActivePN] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/presets", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { presets: RulePreset[] }) => setPresets(d.presets ?? []))
      .catch(() => {});
    void fetch("/api/sheets/setup", { cache: "no-store" }) // reuse existing check
      .catch(() => {});
    // Read active preset name from settings
    void fetch("/api/paper/account", { cache: "no-store" }).catch(() => {});
  }, []);

  // Load active preset name from AppSettings via a quick settings read
  useEffect(() => {
    void (async () => {
      try {
        const res  = await fetch("/api/sheets/setup", { cache: "no-store" });
        const json = await res.json() as { configured?: boolean };
        if (!json.configured) return;
        // Fetch active preset name from our new presets list after presets load
      } catch { /* silent */ }
    })();
  }, []);

  async function savePreset() {
    if (!presetName.trim()) return;
    setSaving(true);
    try {
      const body: Omit<RulePreset, "id" | "createdAt"> = {
        presetName:           presetName.trim(),
        minScannerScore:      simFilters.minScore,
        minConfidence:        simFilters.minConfidence,
        setupTypesAllowed:    simFilters.allowedSetups,
        excludedTickers:      simFilters.excludeTickers,
        allowedMarketRegimes: simFilters.allowedRegimes,
        minRiskReward:        simFilters.minRR,
        notes:                presetNotes,
      };
      const res  = await fetch("/api/presets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { preset: RulePreset };
      setPresets((prev) => [...prev, data.preset]);
      setSaveModal(false);
      setPresetName(""); setPresetNotes("");
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  async function applyPreset(preset: RulePreset, scope: string) {
    setApplying(true);
    try {
      await fetch(`/api/presets/${encodeURIComponent(preset.id)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      setActivePN(preset.presetName);
      setApplyTarget(null);
    } catch { /* silent */ }
    finally { setApplying(false); }
  }

  async function deletePreset(id: string) {
    await fetch(`/api/presets/${encodeURIComponent(id)}`, { method: "DELETE" });
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }

  // Sample size check for current sim
  const simSampleWarning = simResult.includedTrades > 0 && simResult.includedTrades < 30;

  const startBal      = account?.startingBalance ?? 1000;
  const curBal        = account?.totalAccountValue ?? startBal;
  const totalRetDollar= curBal - startBal;
  const totalRetPct   = startBal > 0 ? (totalRetDollar / startBal) * 100 : 0;
  // Trade history shows all trades (not sanitized) so user sees the raw record
  const sortedTrades  = useMemo(() => [...trades].sort((a, b) => b.closedAt.localeCompare(a.closedAt)), [trades]);

  if (loading) return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav activePage="Analytics" subtitle="Paper trading research" />
      <div className="flex items-center justify-center pt-40">
        <RefreshCw className="size-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-dot-grid" />
      {selected && <TradeReplayModal t={selected} onClose={() => setSelected(null)} />}

      <AppNav activePage="Analytics" subtitle="Paper trading research"
        right={
          <button type="button" onClick={() => void load(true)} disabled={loading}
            className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />Refresh
          </button>
        }
      />

      <main className="relative mx-auto max-w-[1400px] px-4 py-6 lg:px-6 space-y-6">

        {/* Header */}
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-positive/70">Analytics</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Performance Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {an.totalTrades} closed · {an.openTrades} open · click any trade to replay
          </p>
        </div>

        {/* ── DATA INTEGRITY PANEL ── */}
        {(() => {
          const { status, statusLabel, statusDescription, qualityScore,
                  deadTickerCount, deadTickerNames, duplicateCount,
                  missingConfidence, missingScoreBreakdown, totalTrades } = integrity;
          const borderCls = status === "clean" ? "border-positive/30" : status === "minor" ? "border-amber-400/30" : "border-destructive/30";
          const bgCls     = status === "clean" ? "bg-positive/[0.04]"  : status === "minor" ? "bg-amber-400/[0.04]"  : "bg-destructive/[0.04]";
          const textCls   = status === "clean" ? "text-positive"        : status === "minor" ? "text-amber-400"        : "text-destructive";
          return (
            <div className={`border ${borderCls} ${bgCls}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-inherit">
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] font-bold uppercase tracking-wider border ${borderCls} px-2 py-0.5 ${textCls}`}>
                    {statusLabel}
                  </span>
                  <span className={`text-2xl font-bold tabular-nums ${textCls}`}>{qualityScore}<span className="text-sm font-normal text-muted-foreground">/100</span></span>
                  <span className="text-[10px] text-muted-foreground">Dataset Quality</span>
                </div>
                {/* Sanitization toggles */}
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground">Analytics filter:</span>
                  <button type="button"
                    onClick={() => setSanitization((p) => ({ ...p, excludeDeadTickers: !p.excludeDeadTickers }))}
                    className={cn("border px-2.5 py-1 font-semibold transition",
                      sanitization.excludeDeadTickers ? "border-positive/30 bg-positive/10 text-positive" : "border-border text-muted-foreground hover:bg-muted")}>
                    Exclude Dead Tickers {sanitization.excludeDeadTickers ? "ON" : "OFF"}
                  </button>
                  <button type="button"
                    onClick={() => setSanitization((p) => ({ ...p, excludeDuplicates: !p.excludeDuplicates }))}
                    className={cn("border px-2.5 py-1 font-semibold transition",
                      sanitization.excludeDuplicates ? "border-positive/30 bg-positive/10 text-positive" : "border-border text-muted-foreground hover:bg-muted")}>
                    Exclude Duplicates {sanitization.excludeDuplicates ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { l: "Total Trades",        v: String(totalTrades) },
                  { l: "Clean Trades",        v: String(sanitized.trades.length),           hi: true },
                  { l: "Dead Ticker Trades",  v: String(deadTickerCount),  warn: deadTickerCount > 0 },
                  { l: "Duplicate Trades",    v: String(duplicateCount),   warn: duplicateCount > 0 },
                  { l: "Missing Confidence",  v: String(missingConfidence) },
                  { l: "Missing Breakdown",   v: String(missingScoreBreakdown) },
                  { l: "Dead Excluded",       v: String(sanitized.deadExcluded) },
                  { l: "Dupes Excluded",      v: String(sanitized.duplicatesExcluded) },
                ].map(({ l, v, warn, hi }) => (
                  <div key={l} className="border border-border bg-surface-1 p-2.5">
                    <p className="text-[10px] text-muted-foreground">{l}</p>
                    <p className={cn("mt-1 text-sm font-bold tabular-nums",
                      warn ? "text-destructive" : hi ? "text-positive" : "text-foreground")}>{v}</p>
                  </div>
                ))}
              </div>
              {(deadTickerCount > 0 || duplicateCount > 0) && (
                <div className="border-t border-inherit px-4 py-2 text-[11px] text-destructive">
                  ⚠️ {statusDescription}
                  {deadTickerNames.length > 0 && ` Dead tickers: ${deadTickerNames.join(", ")}.`}
                </div>
              )}
              {status === "clean" && (
                <div className="border-t border-inherit px-4 py-2 text-[11px] text-positive">
                  ✓ {statusDescription}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Active rule preset status ── */}
        <ActiveStrategyPanel
          closedTradeCount={an.totalTrades}
          filteredTradeCount={simResult.includedTrades}
        />

        {/* ── PHASE 9: Data integrity warning ── */}
        {integ.total > 0 && integ.completenessRate < 1 && (
          <div className={cn(
            "flex items-start gap-3 border p-3 text-[11px]",
            integ.completenessRate > 0.7 ? "border-amber-400/25 bg-amber-400/[0.05] text-amber-400"
            : "border-destructive/25 bg-destructive/[0.05] text-destructive",
          )}>
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              <strong>Data completeness: {(integ.completenessRate * 100).toFixed(0)}%</strong>
              {" "}({integ.complete}/{integ.total} trades fully annotated).
              {integ.missingScore > 0    && ` ${integ.missingScore} missing scanner score.`}
              {integ.missingConf > 0     && ` ${integ.missingConf} missing confidence.`}
              {integ.missingBreakdown > 0&& ` ${integ.missingBreakdown} missing score breakdown.`}
              {" "}Historical trades lack notes. New trades via Execute Top Pick will be fully annotated.
            </div>
          </div>
        )}
        {integ.total > 0 && integ.completenessRate === 1 && (
          <div className="flex items-center gap-2 border border-positive/20 bg-positive/[0.04] p-3 text-[11px] text-positive">
            <CheckCircle className="size-4 shrink-0" />
            All {integ.total} trades fully annotated with scanner reasoning.
          </div>
        )}

        {an.totalTrades === 0 ? (
          <div className="flex flex-col items-center py-24 border border-border bg-card">
            <BarChart2 className="mb-3 size-10 text-muted-foreground" />
            <p className="text-sm font-semibold">No closed trades yet</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs text-center">
              Execute trades in the Paper Trader. Need ≥30 trades for meaningful analytics.
            </p>
          </div>
        ) : (
          <>
            {/* ── SAVE PRESET MODAL ── */}
            {saveModalOpen && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
                onClick={() => setSaveModal(false)}>
                <div className="border border-border bg-card w-full max-w-md p-5"
                  onClick={(e) => e.stopPropagation()}>
                  <p className="mb-1 font-semibold text-foreground">Save Rule Preset</p>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Saves the current simulator filters to Google Sheets.
                    Scanner rules are not changed until you click Apply.
                  </p>
                  {simSampleWarning && (
                    <div className="mb-3 flex items-start gap-2 border border-amber-400/25 bg-amber-400/[0.05] p-2.5 text-[11px] text-amber-400">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                      Low sample size ({simResult.includedTrades} trades). This rule may be overfit to limited data. Need ≥30 trades for reliable conclusions.
                    </div>
                  )}
                  <label className="block mb-3">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Preset Name *</span>
                    <input type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)}
                      placeholder="e.g. Conservative — Score 80+, Conf 75+"
                      className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground" />
                  </label>
                  <label className="block mb-4">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes (optional)</span>
                    <textarea value={presetNotes} onChange={(e) => setPresetNotes(e.target.value)}
                      placeholder="Why this rule set was created..."
                      rows={2}
                      className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground resize-none" />
                  </label>
                  {/* Filter summary */}
                  <div className="mb-4 border border-border bg-surface-1 p-3 text-[11px] text-muted-foreground space-y-1">
                    <p>Min score: <b className="text-foreground">{simFilters.minScore || "Off"}</b></p>
                    <p>Min confidence: <b className="text-foreground">{simFilters.minConfidence ? simFilters.minConfidence + "%" : "Off"}</b></p>
                    <p>Min R/R: <b className="text-foreground">{simFilters.minRR ? simFilters.minRR.toFixed(1) + ":1" : "Off"}</b></p>
                    {simFilters.allowedSetups.length > 0 && <p>Setups: <b className="text-foreground">{simFilters.allowedSetups.join(", ")}</b></p>}
                    {simFilters.excludeTickers.length > 0 && <p>Excluded: <b className="text-foreground">{simFilters.excludeTickers.join(", ")}</b></p>}
                    <p className="pt-1 border-t border-border text-positive">Simulated: {simResult.includedTrades} trades, {na(simResult.includedTrades) ? (simResult.winRate * 100).toFixed(0) + "% win" : "—"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void savePreset()} disabled={!presetName.trim() || saving}
                      className="flex-1 border border-positive/30 bg-positive/10 py-2 text-sm font-semibold text-positive transition hover:bg-positive/20 disabled:opacity-50">
                      {saving ? "Saving…" : "Save Preset"}
                    </button>
                    <button type="button" onClick={() => setSaveModal(false)}
                      className="flex-1 border border-border py-2 text-sm text-muted-foreground transition hover:bg-muted">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── APPLY PRESET MODAL ── */}
            {applyTarget && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
                onClick={() => setApplyTarget(null)}>
                <div className="border border-border bg-card w-full max-w-md p-5"
                  onClick={(e) => e.stopPropagation()}>
                  <p className="mb-1 font-semibold text-foreground">Apply Rule Preset to Live System?</p>
                  <p className="mb-1 text-sm text-muted-foreground">
                    Preset: <strong className="text-foreground">{applyTarget.presetName}</strong>
                  </p>
                  <div className="mb-4 border border-border bg-surface-1 p-3 text-[11px] text-muted-foreground space-y-1">
                    <p>Min score: <b className="text-foreground">{applyTarget.minScannerScore || "Off"}</b></p>
                    <p>Min confidence: <b className="text-foreground">{applyTarget.minConfidence ? applyTarget.minConfidence + "%" : "Off"}</b></p>
                    <p>Min R/R: <b className="text-foreground">{applyTarget.minRiskReward ? applyTarget.minRiskReward.toFixed(1) + ":1" : "Off"}</b></p>
                    {applyTarget.setupTypesAllowed.length > 0 && <p>Setups: <b className="text-foreground">{applyTarget.setupTypesAllowed.join(", ")}</b></p>}
                    {applyTarget.excludedTickers.length > 0 && <p>Excluded: <b className="text-foreground">{applyTarget.excludedTickers.join(", ")}</b></p>}
                  </div>
                  <p className="mb-4 text-[11px] text-amber-400 border border-amber-400/20 bg-amber-400/[0.05] p-2">
                    ⚠️ This updates AppSettings in Google Sheets. The scanner and paper trader will use these thresholds on the next run. A Discord alert will be sent.
                  </p>
                  <div className="grid gap-2">
                    <button type="button" disabled={applying}
                      onClick={() => void applyPreset(applyTarget, "scanner")}
                      className="border border-blue-400/30 bg-blue-400/10 py-2 text-sm font-semibold text-blue-400 transition hover:bg-blue-400/20 disabled:opacity-50">
                      {applying ? "Applying…" : "Apply to Scanner Only"}
                    </button>
                    <button type="button" disabled={applying}
                      onClick={() => void applyPreset(applyTarget, "scanner+paper")}
                      className="border border-positive/30 bg-positive/10 py-2 text-sm font-semibold text-positive transition hover:bg-positive/20 disabled:opacity-50">
                      {applying ? "Applying…" : "Apply to Scanner + Paper Trader"}
                    </button>
                    <button type="button" onClick={() => setApplyTarget(null)}
                      className="border border-border py-2 text-sm text-muted-foreground transition hover:bg-muted">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── SAVED PRESETS ── */}
            <Sect title="Promote Rules to Scanner"
              sub={activePresetName ? `Active preset: ${activePresetName}` : "No preset active — scanner using default thresholds"}>
              {presets.length === 0 ? (
                <div className="flex flex-col items-center py-10">
                  <Settings className="mb-2 size-7 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">No saved presets yet. Use the Rule Simulator above to test rules, then click Save as Preset.</p>
                </div>
              ) : (
                <>
                  <div className="grid border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                    style={{ gridTemplateColumns: "1fr 60px 65px 50px 80px 60px 80px" }}>
                    <span>Preset</span><span className="text-center">Score</span><span className="text-center">Conf.</span>
                    <span className="text-center">R/R</span><span>Setups</span><span>Excluded</span><span />
                  </div>
                  {presets.map((p) => (
                    <div key={p.id} className="grid items-center border-b border-border px-4 py-3 text-xs last:border-0"
                      style={{ gridTemplateColumns: "1fr 60px 65px 50px 80px 60px 80px" }}>
                      <div>
                        <p className="font-semibold text-foreground">{p.presetName}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</p>
                      </div>
                      <span className="tabular-nums text-muted-foreground text-center">{p.minScannerScore || "—"}</span>
                      <span className="tabular-nums text-muted-foreground text-center">{p.minConfidence ? p.minConfidence + "%" : "—"}</span>
                      <span className="tabular-nums text-muted-foreground text-center">{p.minRiskReward ? p.minRiskReward.toFixed(1) : "—"}</span>
                      <span className="truncate text-muted-foreground">{p.setupTypesAllowed.length > 0 ? p.setupTypesAllowed.map((s) => s.split(" ")[0]).join(", ") : "All"}</span>
                      <span className="truncate text-muted-foreground">{p.excludedTickers.length > 0 ? p.excludedTickers.join(", ") : "—"}</span>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setApplyTarget(p)}
                          className="border border-positive/30 bg-positive/10 px-2 py-1 text-[10px] font-bold text-positive transition hover:bg-positive/20">
                          Apply
                        </button>
                        <button type="button" onClick={() => void deletePreset(p.id)}
                          className="p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
              <div className="border-t border-border px-4 py-2.5 text-[10px] text-muted-foreground">
                Presets are stored in Google Sheets (RulePresets tab). Applying a preset writes thresholds to AppSettings —
                the scanner and paper trader read from AppSettings on each run. Changes take effect on the next scan/trade cycle.
              </div>
            </Sect>

            {/* ── OPTIMIZATION SUGGESTIONS ── */}
            {(() => {
              const SEVERITY_STYLE: Record<SuggestionSeverity, { border: string; bg: string; dot: string; badge: string }> = {
                critical: { border: "border-destructive/40", bg: "bg-destructive/[0.04]", dot: "bg-destructive", badge: "border-destructive/30 bg-destructive/10 text-destructive" },
                warning:  { border: "border-amber-400/35",   bg: "bg-amber-400/[0.04]",  dot: "bg-amber-400", badge: "border-amber-400/30 bg-amber-400/10 text-amber-400" },
                info:     { border: "border-border",          bg: "bg-surface-1",          dot: "bg-muted-foreground", badge: "border-border bg-surface-1 text-muted-foreground" },
                positive: { border: "border-positive/30",    bg: "bg-positive/[0.03]",   dot: "bg-positive", badge: "border-positive/30 bg-positive/10 text-positive" },
              };

              return (
                <Sect title="Optimization Suggestions"
                  sub={optim.insufficientData
                    ? `${optim.tradesAnalyzed} trades — minimum 10 needed for actionable suggestions`
                    : `${optim.suggestions.length} suggestion${optim.suggestions.length !== 1 ? "s" : ""} based on ${optim.tradesAnalyzed} trades`}>

                  {/* Parameter summary strip */}
                  {!optim.insufficientData && (
                    <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        { l: "Suggested min score",      v: optim.suggestedMinScore      != null ? String(optim.suggestedMinScore)      : "No change" },
                        { l: "Suggested min confidence", v: optim.suggestedMinConfidence != null ? optim.suggestedMinConfidence + "%" : "No change" },
                        { l: "Best setup type",          v: optim.bestSetupType  ?? "—" },
                        { l: "Worst setup type",         v: optim.worstSetupType ?? "—" },
                        { l: "Best ticker",              v: optim.bestTicker  ?? "—" },
                        { l: "Worst ticker",             v: optim.worstTicker ?? "—" },
                      ].map(({ l, v }) => (
                        <div key={l} className="border border-border bg-surface-1 p-3">
                          <p className="text-[10px] text-muted-foreground">{l}</p>
                          <p className="mt-1 text-xs font-bold text-foreground">{v}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Suggestion cards */}
                  <div className="divide-y divide-border">
                    {optim.suggestions.map((s) => {
                      const st = SEVERITY_STYLE[s.severity];
                      return (
                        <div key={s.id} className={cn("flex gap-3 px-4 py-3.5", st.bg, st.border === "border-border" ? "" : "border-l-2 " + st.border)}>
                          <div className={cn("mt-1.5 size-2 shrink-0 rounded-full", st.dot)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className={cn("border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", st.badge)}>
                                {s.severity}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{s.category}</span>
                              {s.dataPoints > 0 && (
                                <span className="text-[10px] text-muted-foreground ml-auto">{s.dataPoints} trade{s.dataPoints !== 1 ? "s" : ""}</span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-foreground">{s.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground leading-5">{s.detail}</p>
                            {s.action && (
                              <p className="mt-1.5 text-[11px] font-semibold text-foreground border border-border bg-card inline-block px-2 py-1">
                                → {s.action}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Disclaimer */}
                  <div className="border-t border-border px-4 py-2.5 text-[10px] text-muted-foreground">
                    Suggestions are based on historical paper trading results only. No scanner rules are changed automatically.
                    Statistical significance requires ≥30 trades per bucket. Use as a guide, not a directive.
                  </div>
                </Sect>
              );
            })()}

            {/* ── RULE SIMULATOR ── */}
            <Sect title="Rule Simulator"
              sub="Filter historical paper trades by proposed rules — see how performance would change">
              <div className="p-4 space-y-4">

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={applyOptimSuggestions}
                    className="border border-positive/30 bg-positive/10 px-3 py-1.5 text-[11px] font-semibold text-positive transition hover:bg-positive/20">
                    Apply Optimization Suggestions
                  </button>
                  <button type="button" onClick={resetSim}
                    className="border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    Reset Filters
                  </button>
                  <button type="button" onClick={() => setSaveModal(true)}
                    className="flex items-center gap-1.5 border border-blue-400/30 bg-blue-400/10 px-3 py-1.5 text-[11px] font-semibold text-blue-400 transition hover:bg-blue-400/20 ml-auto">
                    <Save className="size-3.5" /> Save as Preset
                  </button>
                  <button type="button" onClick={exportSim}
                    className="border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground">
                    Export ↓
                  </button>
                </div>

                {/* Filter inputs */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Min scanner score */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Minimum Scanner Score
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={95} step={5}
                        value={simFilters.minScore}
                        onChange={(e) => patchSim({ minScore: Number(e.target.value) })}
                        className="flex-1 h-1 accent-positive" />
                      <span className="w-10 text-right text-xs font-bold tabular-nums text-foreground">
                        {simFilters.minScore || "Off"}
                      </span>
                    </div>
                  </div>

                  {/* Min confidence */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Minimum Confidence %
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={95} step={5}
                        value={simFilters.minConfidence}
                        onChange={(e) => patchSim({ minConfidence: Number(e.target.value) })}
                        className="flex-1 h-1 accent-positive" />
                      <span className="w-10 text-right text-xs font-bold tabular-nums text-foreground">
                        {simFilters.minConfidence ? simFilters.minConfidence + "%" : "Off"}
                      </span>
                    </div>
                  </div>

                  {/* Min R/R */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Minimum Risk/Reward
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={5} step={0.5}
                        value={simFilters.minRR}
                        onChange={(e) => patchSim({ minRR: Number(e.target.value) })}
                        className="flex-1 h-1 accent-positive" />
                      <span className="w-12 text-right text-xs font-bold tabular-nums text-foreground">
                        {simFilters.minRR ? simFilters.minRR.toFixed(1) + ":1" : "Off"}
                      </span>
                    </div>
                  </div>

                  {/* Setup types */}
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Allowed Setup Types {simFilters.allowedSetups.length === 0 && <span className="font-normal">(all)</span>}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(SETUP_TYPES as readonly string[]).map((st) => {
                        const active = simFilters.allowedSetups.length === 0 || simFilters.allowedSetups.includes(st);
                        const isChecked = simFilters.allowedSetups.length > 0 && simFilters.allowedSetups.includes(st);
                        return (
                          <button key={st} type="button"
                            onClick={() => {
                              const current = simFilters.allowedSetups;
                              if (current.length === 0) {
                                // first click — select only this one
                                patchSim({ allowedSetups: [st] });
                              } else if (isChecked) {
                                const next = current.filter((s) => s !== st);
                                patchSim({ allowedSetups: next }); // empty = all
                              } else {
                                patchSim({ allowedSetups: [...current, st] });
                              }
                            }}
                            className={cn(
                              "border px-2 py-1 text-[10px] font-semibold transition",
                              isChecked || simFilters.allowedSetups.length === 0
                                ? "border-positive/40 bg-positive/10 text-positive"
                                : "border-border text-muted-foreground hover:bg-muted",
                            )}>
                            {st.split(" ")[0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Exclude tickers */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Exclude Tickers (comma-separated)
                    </label>
                    <input type="text"
                      value={excludeInput}
                      onChange={(e) => {
                        setExcludeInput(e.target.value);
                        const tickers = e.target.value.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
                        patchSim({ excludeTickers: tickers });
                      }}
                      placeholder="e.g. GDDY, PARA"
                      className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-foreground transition" />
                  </div>

                  {/* Regime filter */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Market Regime {simFilters.allowedRegimes.length === 0 && <span className="font-normal">(all)</span>}
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {["risk-on", "neutral", "defensive", "high-volatility"].map((r) => {
                        const active = simFilters.allowedRegimes.includes(r);
                        return (
                          <button key={r} type="button"
                            onClick={() => {
                              const next = active
                                ? simFilters.allowedRegimes.filter((x) => x !== r)
                                : [...simFilters.allowedRegimes, r];
                              patchSim({ allowedRegimes: next });
                            }}
                            className={cn(
                              "border px-2 py-1 text-[10px] font-semibold capitalize transition",
                              active
                                ? "border-positive/40 bg-positive/10 text-positive"
                                : "border-border text-muted-foreground hover:bg-muted",
                            )}>
                            {r.replace("-", " ")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Comparison results */}
                <div className="mt-2">
                  <div className="grid border border-border"
                    style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    {/* Header */}
                    <div className="border-b border-border bg-surface-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Metric</div>
                    <div className="border-b border-l border-border bg-surface-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current Rules</div>
                    <div className="border-b border-l border-border bg-surface-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-positive">Simulated Rules</div>

                    {/* Rows */}
                    {([
                      ["Trades included", String(baseResult.includedTrades), String(simResult.includedTrades)],
                      ["Trades excluded", String(baseResult.excludedTrades), String(simResult.excludedTrades)],
                      ["Win rate",
                        baseResult.includedTrades >= 3 ? (baseResult.winRate * 100).toFixed(0) + "%" : "—",
                        simResult.includedTrades  >= 3 ? (simResult.winRate  * 100).toFixed(0) + "%" : "—"],
                      ["Total P/L",
                        (baseResult.totalPnL >= 0 ? "+" : "") + "$" + Math.abs(baseResult.totalPnL).toFixed(2),
                        (simResult.totalPnL  >= 0 ? "+" : "") + "$" + Math.abs(simResult.totalPnL).toFixed(2)],
                      ["Profit factor",
                        baseResult.includedTrades >= 3 ? (isFinite(baseResult.profitFactor) ? baseResult.profitFactor.toFixed(2) : "∞") : "—",
                        simResult.includedTrades  >= 3 ? (isFinite(simResult.profitFactor)  ? simResult.profitFactor.toFixed(2)  : "∞") : "—"],
                      ["Expectancy/trade",
                        baseResult.includedTrades >= 3 ? (baseResult.expectancy >= 0 ? "+" : "") + "$" + Math.abs(baseResult.expectancy).toFixed(2) : "—",
                        simResult.includedTrades  >= 3 ? (simResult.expectancy  >= 0 ? "+" : "") + "$" + Math.abs(simResult.expectancy).toFixed(2)  : "—"],
                      ["Avg winner",
                        baseResult.wins >= 1 ? "+$" + baseResult.avgWinnerDollar.toFixed(2) : "—",
                        simResult.wins  >= 1 ? "+$" + simResult.avgWinnerDollar.toFixed(2)  : "—"],
                      ["Avg loser",
                        baseResult.losses >= 1 ? "-$" + baseResult.avgLoserDollar.toFixed(2) : "—",
                        simResult.losses  >= 1 ? "-$" + simResult.avgLoserDollar.toFixed(2)  : "—"],
                      ["Max drawdown",
                        baseResult.maxDrawdownPct > 0 ? "-" + baseResult.maxDrawdownPct.toFixed(1) + "%" : "0%",
                        simResult.maxDrawdownPct  > 0 ? "-" + simResult.maxDrawdownPct.toFixed(1)  + "%" : "0%"],
                    ] as [string, string, string][]).map(([label, base, sim]) => {
                      // Determine if simulated is better
                      const baseN = parseFloat(base.replace(/[^0-9.-]/g, "")) || 0;
                      const simN  = parseFloat(sim.replace(/[^0-9.-]/g, ""))  || 0;
                      const isWinRate   = label === "Win rate";
                      const isPF        = label === "Profit factor";
                      const isExp       = label === "Expectancy/trade";
                      const isPnL       = label === "Total P/L";
                      const isDrawdown  = label === "Max drawdown";
                      const improved = sim !== "—" && base !== "—" && (
                        (isWinRate || isPF || isExp || isPnL)
                          ? simN > baseN
                          : isDrawdown
                          ? simN < baseN   // lower drawdown = better
                          : false
                      );
                      const worse = sim !== "—" && base !== "—" && (
                        (isWinRate || isPF || isExp || isPnL)
                          ? simN < baseN
                          : isDrawdown
                          ? simN > baseN
                          : false
                      );
                      return (
                        <div key={label} className="contents">
                          <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">{label}</div>
                          <div className="border-b border-l border-border px-3 py-2 text-[11px] font-semibold tabular-nums text-foreground">{base}</div>
                          <div className={cn(
                            "border-b border-l border-border px-3 py-2 text-[11px] font-semibold tabular-nums",
                            improved ? "text-positive" : worse ? "text-destructive" : "text-foreground",
                          )}>
                            {sim}
                            {improved && " ↑"}
                            {worse    && " ↓"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Disclaimer */}
                <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
                  Backtest-style simulation using closed paper trades only. Results show what metrics would have been if the filter rules were applied at entry.
                  Past performance does not guarantee future results. Scanner rules are not changed automatically.
                </p>
              </div>
            </Sect>

            {/* ── PHASE 10: Scanner Health Report ── */}
            <Sect title="Scanner Health Report" sub={health.isStatistical ? "Statistically significant" : `Need ≥30 trades (have ${an.totalTrades})`}>
              <div className="p-4">
                <div className="border border-border bg-surface-1 p-4 mb-4">
                  <p className={cn("text-sm font-semibold", an.profitFactor >= 1 ? "text-positive" : "text-destructive")}>
                    {health.recommendation}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {health.insights.map((ins, i) => (
                    <div key={i} className="border border-border bg-surface-1 px-3 py-2 text-[11px] text-foreground">
                      {ins}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6 text-[11px]">
                  {[
                    { l: "Best setup",       v: health.bestSetup },
                    { l: "Worst setup",      v: health.worstSetup },
                    { l: "Best score range", v: health.bestScoreRange },
                    { l: "Best ticker",      v: health.bestTicker },
                    { l: "Profit factor",    v: isFinite(health.profitFactor) ? health.profitFactor.toFixed(2) : "∞" },
                    { l: "Expectancy",       v: s$(health.expectancy) },
                  ].map(({ l, v }) => (
                    <div key={l} className="border border-border bg-surface-1 p-2.5">
                      <p className="text-[10px] text-muted-foreground">{l}</p>
                      <p className="mt-1 font-semibold text-foreground">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Sect>

            {/* ── OVERVIEW ── */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {[
                { l: "Starting Balance", v: $.format(startBal), c: "text-foreground" },
                { l: "Current Balance",  v: $.format(curBal), c: curBal >= startBal ? "text-positive" : "text-destructive" },
                { l: "Total Return",     v: s$(totalRetDollar), c: totalRetDollar >= 0 ? "text-positive" : "text-destructive", sub: pct(totalRetPct) },
                { l: "Closed Trades",    v: String(an.totalTrades), c: "text-foreground", sub: `${an.wins}W · ${an.losses}L` },
                { l: "Open Positions",   v: String(an.openTrades), c: "text-foreground" },
                { l: "Profit Factor",    v: an.totalTrades >= 3 ? (isFinite(an.profitFactor) ? an.profitFactor.toFixed(2) : "∞") : "—",
                  c: an.profitFactor >= 1.5 ? "text-positive" : an.profitFactor >= 1 ? "text-foreground" : "text-destructive" },
              ].map(({ l, v, c, sub }) => (
                <div key={l} className="border border-border bg-surface-1 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{l}</p>
                  <p className={cn("mt-2 text-xl font-bold tabular-nums", c)}>{v}</p>
                  {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
                </div>
              ))}
            </div>

            {/* ── TRADE STATS + RISK METRICS ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Sect title="Trade Statistics">
                <div className="px-4">
                  <Stat label="Win Rate" value={na(an.totalTrades) ? (an.winRate * 100).toFixed(0) + "%" : "—"}
                    tone={winRateColor(an.winRate, an.totalTrades)} sub={`${an.wins}W / ${an.losses}L`} />
                  <Stat label="Loss Rate" value={na(an.totalTrades) ? (an.lossRate * 100).toFixed(0) + "%" : "—"} />
                  <Stat label="Average Winner" value={an.wins > 0 ? pct(an.avgWinnerPct) : "—"}
                    tone="text-positive" sub={an.wins > 0 ? $.format(an.avgWinnerDollar) : undefined} />
                  <Stat label="Average Loser" value={an.losses > 0 ? pct(an.avgLoserPct) : "—"}
                    tone="text-destructive" sub={an.losses > 0 ? $.format(an.avgLoserDollar) : undefined} />
                  <Stat label="Largest Winner" value={an.largestWinner ? pct(an.largestWinnerPct) : "—"}
                    tone="text-positive" sub={an.largestWinner?.ticker} />
                  <Stat label="Largest Loser" value={an.largestLoser ? pct(an.largestLoserPct) : "—"}
                    tone="text-destructive" sub={an.largestLoser?.ticker} />
                  <Stat label="Avg Hold Time" value={an.avgHoldTimeHours > 0 ? formatHoldTime(an.avgHoldTimeHours) : "—"} />
                </div>
              </Sect>
              <Sect title="Risk Metrics">
                <div className="px-4">
                  <Stat label="Profit Factor"
                    value={na(an.totalTrades, 5) ? (isFinite(an.profitFactor) ? an.profitFactor.toFixed(2) : "∞") : "—"}
                    tone={an.profitFactor >= 1.5 ? "text-positive" : an.profitFactor >= 1 ? "text-foreground" : "text-destructive"}
                    sub="< 1 = losing system" />
                  <Stat label="Expectancy / Trade"
                    value={na(an.totalTrades, 5) ? s$(an.expectancy) : "—"}
                    tone={an.expectancy >= 0 ? "text-positive" : "text-destructive"} />
                  <Stat label="Avg Planned R/R"
                    value={rr.tradesWithData >= 3 ? rr.avgPlannedRR.toFixed(2) + ":1" : "—"} />
                  <Stat label="Avg Actual R/R"
                    value={rr.tradesWithData >= 3 ? rr.avgActualRR.toFixed(2) + ":1" : "—"}
                    tone={rr.tradesWithData >= 3 ? (rr.avgActualRR >= rr.avgPlannedRR ? "text-positive" : "text-destructive") : undefined}
                    sub={rr.tradesWithData >= 3 ? `TP delivery: ${(rr.rrDeliveryRate * 100).toFixed(0)}%` : undefined} />
                  <Stat label="Max Drawdown"
                    value={an.maxDrawdownPct > 0 ? "-" + an.maxDrawdownPct.toFixed(1) + "%" : "0%"}
                    tone={an.maxDrawdownPct > 20 ? "text-destructive" : "text-foreground"} />
                  <Stat label="Current Drawdown"
                    value={an.currentDrawdownPct > 0 ? "-" + an.currentDrawdownPct.toFixed(1) + "%" : "0%"}
                    tone={an.currentDrawdownPct > 0 ? "text-destructive" : "text-positive"} />
                  {an.bestDay && <Stat label="Best Day" value={s$(an.bestDay.pnl)} tone="text-positive" sub={an.bestDay.date} />}
                  {an.worstDay && <Stat label="Worst Day" value={s$(an.worstDay.pnl)} tone="text-destructive" sub={an.worstDay.date} />}
                </div>
              </Sect>
            </div>

            {/* ── EQUITY CURVE ── */}
            {equity.length > 1 && (
              <Sect title="Equity Curve" sub={`Max drawdown: ${an.maxDrawdownPct.toFixed(1)}% · Return: ${pct(totalRetPct)}`}>
                <div className="p-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={(an.drawdownSeries.length > 0 ? an.drawdownSeries : equity) as object[]}
                      margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="var(--positive)" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="v" tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
                      <YAxis yAxisId="d" orientation="right" tickFormatter={(v: number) => `-${v.toFixed(0)}%`}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }}
                        formatter={(v, name) => name === "accountValue" ? [$.format(Number(v ?? 0)), "Balance"]
                          : name === "drawdownPct" ? ["-" + Number(v ?? 0).toFixed(1) + "%", "DD"] : [String(v), String(name)]} />
                      <Area yAxisId="v" type="monotone" dataKey="accountValue" stroke="var(--positive)"
                        strokeWidth={2} fill="url(#eg)" dot={false}
                        activeDot={{ r: 3, fill: "var(--positive)", strokeWidth: 0 }} />
                      {an.drawdownSeries.length > 0 && (
                        <Line yAxisId="d" type="monotone" dataKey="drawdownPct"
                          stroke="var(--destructive)" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Sect>
            )}

            {/* ── PHASE 2: EDGE ANALYSIS (score buckets) ── */}
            <Sect title="Phase 2 — Edge Analysis (Scanner Score)" sub="Do higher scores produce better outcomes?">
              <BucketTable buckets={an.scoreBuckets}
                emptyMsg="Scanner scores not yet recorded. Future trades via Execute Top Pick will populate this." />
            </Sect>

            {/* ── PHASE 3: CONFIDENCE ANALYSIS ── */}
            <Sect title="Phase 3 — Confidence Analysis" sub="Does confidence predict winners?">
              <BucketTable buckets={confB}
                emptyMsg="Confidence scores not yet recorded in trade notes." />
            </Sect>

            {/* ── PHASE 4: HOLD TIME ANALYSIS ── */}
            <Sect title="Phase 4 — Hold Time Analysis" sub="Do winners take longer or shorter than losers?">
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Winners</p>
                  <Stat label="Avg hold (winners)" value={hold.avgWinnersHours > 0 ? formatHoldTime(hold.avgWinnersHours) : "—"} tone="text-positive" />
                  <Stat label="Fastest winner" value={hold.fastestWinner ? formatHoldTime(hold.fastestWinner.holdTimeHours ?? 0) : "—"}
                    sub={hold.fastestWinner?.ticker} />
                  <Stat label="Longest winner" value={hold.longestWinner ? formatHoldTime(hold.longestWinner.holdTimeHours ?? 0) : "—"}
                    sub={hold.longestWinner?.ticker} />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Losers</p>
                  <Stat label="Avg hold (losers)" value={hold.avgLosersHours > 0 ? formatHoldTime(hold.avgLosersHours) : "—"} tone="text-destructive" />
                  <Stat label="Fastest loss" value={hold.fastestLoss ? formatHoldTime(hold.fastestLoss.holdTimeHours ?? 0) : "—"}
                    sub={hold.fastestLoss?.ticker} />
                  <Stat label="Longest loss" value={hold.longestLoss ? formatHoldTime(hold.longestLoss.holdTimeHours ?? 0) : "—"}
                    sub={hold.longestLoss?.ticker} />
                </div>
              </div>
            </Sect>

            {/* ── PHASE 5: R/R ANALYSIS ── */}
            <Sect title="Phase 5 — Risk/Reward Analysis" sub="Are setups delivering their planned R/R?">
              <div className="px-4">
                <Stat label="Avg planned R/R" value={rr.tradesWithData >= 3 ? rr.avgPlannedRR.toFixed(2) + ":1" : "—"} />
                <Stat label="Avg actual R/R"
                  value={rr.tradesWithData >= 3 ? rr.avgActualRR.toFixed(2) + ":1" : "—"}
                  tone={rr.tradesWithData >= 3 ? (rr.avgActualRR >= 0 ? "text-positive" : "text-destructive") : undefined} />
                <Stat label="TP delivery rate"
                  value={rr.tradesWithData >= 3 ? (rr.rrDeliveryRate * 100).toFixed(0) + "%" : "—"}
                  sub={rr.tradesWithData >= 3 ? `${rr.tradesWithData} trades with R/R data` : "Need tp1AtEntry + slAtEntry in trade records"} />
              </div>
            </Sect>

            {/* ── PHASES 6 & 7: TICKER PERFORMANCE ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              {([["Phase 6 — Best Performers", tick.best, true],
                 ["Phase 7 — Worst Performers", tick.worst, false]] as [string, TickerStats[], boolean][])
                .map(([title, list, isBest]) => (
                <Sect key={title} title={title} sub={`Top 10 tickers by ${isBest ? "highest" : "lowest"} P/L`}>
                  {list.length === 0 ? (
                    <p className="px-4 py-6 text-xs text-muted-foreground">Need more trades to identify patterns.</p>
                  ) : (
                    <>
                      <div className="grid border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                        style={{ gridTemplateColumns: "56px 40px 40px 55px 65px 70px" }}>
                        <span>Ticker</span><span className="text-center">N</span><span className="text-center">W</span>
                        <span className="text-center">Win%</span><span className="text-right">Avg ret</span><span className="text-right">P/L</span>
                      </div>
                      {list.map((t) => (
                        <div key={t.ticker} className="grid items-center border-b border-border px-4 py-2.5 text-xs last:border-0"
                          style={{ gridTemplateColumns: "56px 40px 40px 55px 65px 70px" }}>
                          <span className={cn("font-bold", t.totalPnL >= 0 ? "text-positive" : "text-destructive")}>{t.ticker}</span>
                          <span className="tabular-nums text-muted-foreground text-center">{t.trades}</span>
                          <span className="tabular-nums text-muted-foreground text-center">{t.wins}</span>
                          <span className={cn("tabular-nums font-bold text-center", winRateColor(t.winRate, t.trades))}>
                            {na(t.trades) ? (t.winRate * 100).toFixed(0) + "%" : "—"}
                          </span>
                          <span className={cn("tabular-nums text-right", t.avgReturn >= 0 ? "text-positive" : "text-destructive")}>
                            {pct(t.avgReturn)}
                          </span>
                          <span className={cn("tabular-nums text-right font-semibold", t.totalPnL >= 0 ? "text-positive" : "text-destructive")}>
                            {s$(t.totalPnL)}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </Sect>
              ))}
            </div>

            {/* ── PHASE 8: REGIME ANALYSIS ── */}
            <Sect title="Phase 8 — Market Regime Analysis" sub="Does the scanner perform better during certain conditions?">
              {regime.length === 0 ? (
                <p className="px-4 py-6 text-xs text-muted-foreground">
                  Market regime not yet recorded in trade notes. Future trades via Execute Top Pick will store regime at entry.
                </p>
              ) : (
                <>
                  <div className="grid border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                    style={{ gridTemplateColumns: "120px 50px 55px 65px 70px 75px" }}>
                    <span>Regime</span><span className="text-center">N</span><span className="text-center">Wins</span>
                    <span className="text-center">Win%</span><span className="text-right">PF</span><span className="text-right">P/L</span>
                  </div>
                  {regime.map((r: RegimeStats) => (
                    <div key={r.regime} className="grid items-center border-b border-border px-4 py-3 text-xs last:border-0"
                      style={{ gridTemplateColumns: "120px 50px 55px 65px 70px 75px" }}>
                      <span className="font-semibold text-foreground capitalize">{r.regime.replace("-", " ")}</span>
                      <span className="tabular-nums text-muted-foreground text-center">{r.trades}</span>
                      <span className="tabular-nums text-muted-foreground text-center">{r.wins}</span>
                      <span className={cn("tabular-nums font-bold text-center", winRateColor(r.winRate, r.trades))}>
                        {na(r.trades) ? (r.winRate * 100).toFixed(0) + "%" : "—"}
                      </span>
                      <span className={cn("tabular-nums text-right",
                        r.profitFactor >= 1.5 ? "text-positive" : r.profitFactor >= 1 ? "text-foreground" : "text-destructive")}>
                        {isFinite(r.profitFactor) ? r.profitFactor.toFixed(2) : "∞"}
                      </span>
                      <span className={cn("tabular-nums text-right font-semibold", r.totalPnL >= 0 ? "text-positive" : "text-destructive")}>
                        {s$(r.totalPnL)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </Sect>

            {/* ── SETUP PERFORMANCE ── */}
            <Sect title="Setup Performance" sub="Which setup types actually generate profit?">
              <div className="grid border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                style={{ gridTemplateColumns: "1fr 40px 55px 65px 65px 55px 65px 70px" }}>
                <span>Setup</span><span className="text-center">N</span><span className="text-center">Win%</span>
                <span className="text-right">Avg win</span><span className="text-right">Avg loss</span>
                <span className="text-right">PF</span><span className="text-right">P/L</span><span className="text-right">Expect.</span>
              </div>
              {an.bySetupType.map((s) => (
                <div key={s.setupType} className="grid items-center gap-2 border-b border-border px-4 py-3 text-xs last:border-0"
                  style={{ gridTemplateColumns: "1fr 40px 55px 65px 65px 55px 65px 70px" }}>
                  <span className="font-semibold text-foreground">{s.setupType}</span>
                  <span className="tabular-nums text-muted-foreground text-center">{s.total}</span>
                  <span className={cn("tabular-nums font-bold text-center", winRateColor(s.winRate, s.total))}>
                    {na(s.total) ? (s.winRate * 100).toFixed(0) + "%" : "—"}
                  </span>
                  <span className={cn("tabular-nums text-right", s.wins > 0 ? "text-positive" : "text-muted-foreground")}>
                    {s.wins > 0 ? $.format(s.avgWinnerDollar) : "—"}
                  </span>
                  <span className={cn("tabular-nums text-right", s.losses > 0 ? "text-destructive" : "text-muted-foreground")}>
                    {s.losses > 0 ? $.format(s.avgLoserDollar) : "—"}
                  </span>
                  <span className={cn("tabular-nums text-right",
                    !na(s.total) ? "text-muted-foreground" :
                    s.profitFactor >= 1.5 ? "text-positive" : s.profitFactor >= 1 ? "text-foreground" : "text-destructive")}>
                    {na(s.total) ? (isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞") : "—"}
                  </span>
                  <span className={cn("tabular-nums text-right font-semibold", s.totalPnL >= 0 ? "text-positive" : "text-destructive")}>
                    {s$(s.totalPnL)}
                  </span>
                  <span className={cn("tabular-nums text-right", !na(s.total) ? "text-muted-foreground" : s.expectancy >= 0 ? "text-positive" : "text-destructive")}>
                    {na(s.total) ? s$(s.expectancy) : "—"}
                  </span>
                </div>
              ))}
            </Sect>

            {/* ── ALL TRADES ── */}
            <Sect title="Trade History" sub={`${sortedTrades.length} closed · click to replay`}>
              <div className="grid border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                style={{ gridTemplateColumns: "56px 1fr 65px 65px 70px 60px 55px 50px" }}>
                <span>Ticker</span><span>Setup</span><span>Buy</span><span>Sell</span>
                <span>P/L</span><span>Return</span><span>Hold</span><span className="text-center">Score</span>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {sortedTrades.map((t) => {
                  const score = (t.notes as Record<string, unknown> | undefined)?.scannerScore;
                  return (
                    <button key={t.tradeId} type="button" onClick={() => setSelected(t)}
                      className="grid w-full items-center gap-2 border-b border-border px-4 py-2.5 text-left text-xs last:border-0 hover:bg-surface-1 transition"
                      style={{ gridTemplateColumns: "56px 1fr 65px 65px 70px 60px 55px 50px" }}>
                      <span className={cn("font-bold", t.result === "win" ? "text-positive" : "text-destructive")}>{t.ticker}</span>
                      <span className="truncate text-muted-foreground">{t.setupType}</span>
                      <span className="tabular-nums text-muted-foreground">{$.format(t.buyPrice)}</span>
                      <span className="tabular-nums text-muted-foreground">{$.format(t.sellPrice)}</span>
                      <span className={cn("tabular-nums font-semibold", t.profitLoss >= 0 ? "text-positive" : "text-destructive")}>
                        {s$(t.profitLoss)}
                      </span>
                      <span className={cn("tabular-nums", t.profitLoss >= 0 ? "text-positive" : "text-destructive")}>
                        {pct(t.profitLossPercent)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{formatHoldTime(t.holdTimeHours ?? 0)}</span>
                      <span className="tabular-nums text-muted-foreground text-center">
                        {score != null ? String(score) : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Sect>

            {/* ── FILL QUALITY METRICS ── */}
            {an.totalTrades > 0 && (
              <Sect title="Fill Quality Metrics" sub="Slippage, gap risk, and R/R delivery">
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {[
                    { l: "Total Slippage Cost",  v: s$(fillQuality.totalSlippageCost),   tone: "text-destructive" },
                    { l: "Avg Slippage %",        v: fillQuality.avgSlippagePctPerTrade.toFixed(3) + "%", tone: "text-destructive" },
                    { l: "Adverse Gaps",          v: String(fillQuality.adverseGapCount) + (fillQuality.adverseGapTotal > 0 ? ` (${s$(fillQuality.adverseGapTotal)})` : ""),
                                                  tone: fillQuality.adverseGapCount > 0 ? "text-destructive" : "text-muted-foreground" },
                    { l: "Favorable Gaps",        v: String(fillQuality.favorableGapCount) + (fillQuality.favorableGapTotal > 0 ? ` (+${$.format(fillQuality.favorableGapTotal)})` : ""),
                                                  tone: fillQuality.favorableGapCount > 0 ? "text-positive" : "text-muted-foreground" },
                    { l: "Avg Planned R/R",       v: fillQuality.avgPlannedRR > 0 ? fillQuality.avgPlannedRR.toFixed(2) + ":1" : "—" },
                    { l: "Avg Actual R/R",        v: fillQuality.avgActualRR > 0 ? fillQuality.avgActualRR.toFixed(2) + ":1" : "—",
                                                  tone: fillQuality.avgActualRR >= fillQuality.avgPlannedRR ? "text-positive" : "text-destructive" },
                  ].map(({ l, v, tone }) => (
                    <div key={l} className="border border-border bg-surface-1 p-3">
                      <p className="text-[10px] text-muted-foreground">{l}</p>
                      <p className={cn("mt-1 text-sm font-bold tabular-nums", tone ?? "text-foreground")}>{v}</p>
                    </div>
                  ))}
                </div>
                {an.totalTrades < 5 && (
                  <p className="px-4 pb-3 text-[11px] text-muted-foreground">Need ≥5 trades to show meaningful fill quality data.</p>
                )}
              </Sect>
            )}

            {/* ── PERFORMANCE REALISM SCORE ── */}
            <Sect title="Performance Realism Score"
              sub={`Current: ${realism.overallScore}/100 (was ~47/100 before slippage + gap risk + liquidity filter) — ${realism.summary}`}>
              <div className="grid gap-2 p-4 lg:grid-cols-2">
                {realism.factors.map((f) => (
                  <div key={f.name} className={cn(
                    "border bg-surface-1 p-3",
                    f.severity === "major" ? "border-destructive/25" :
                    f.severity === "minor" ? "border-amber-400/25" : "border-border",
                  )}>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-[11px] font-semibold text-foreground">{f.name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          "text-[10px] font-bold uppercase px-1.5 py-0.5 border",
                          f.severity === "major" ? "border-destructive/30 bg-destructive/10 text-destructive" :
                          f.severity === "minor" ? "border-amber-400/30 bg-amber-400/10 text-amber-400" :
                          "border-positive/30 bg-positive/10 text-positive",
                        )}>{f.severity}</span>
                        <span className={cn(
                          "text-sm font-bold tabular-nums",
                          f.score >= 75 ? "text-positive" : f.score >= 50 ? "text-amber-400" : "text-destructive",
                        )}>{f.score}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-5">{f.description}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border px-4 py-2.5 text-[10px] text-muted-foreground">
                Realism score evaluates how closely paper trading results approximate real-world execution.
                Major issues: synthetic candle data, no slippage, no liquidity constraints.
              </div>
            </Sect>

            {/* ── FINAL AUDIT REPORT ── */}
            {(() => {
              const scannerHealth = Math.round(
                (integrity.deadTickerCount === 0 ? 40 : 20) +
                (integrity.duplicateCount === 0 ? 30 : 15) +
                (an.totalTrades >= 10 ? 30 : an.totalTrades * 3),
              );
              const paperHealth = Math.min(100, Math.round(
                (an.totalTrades >= 5 ? 40 : an.totalTrades * 8) +
                (an.profitFactor > 0 ? 30 : 0) +
                (an.avgHoldTimeHours > 0 ? 30 : 0),
              ));
              const analyticsHealth = integrity.qualityScore;

              const items: { label: string; score: number; risks: string[]; actions: string[]; }[] = [
                {
                  label: "Scanner Health",
                  score: scannerHealth,
                  risks: [
                    ...(integrity.deadTickerCount > 0 ? [`${integrity.deadTickerCount} dead-ticker trade(s) in history (${integrity.deadTickerNames.join(", ")})`] : []),
                    "Synthetic candle data for most tickers — indicators may not reflect real patterns",
                    ...(an.totalTrades < 30 ? [`Only ${an.totalTrades} closed trades — insufficient for statistical conclusions`] : []),
                  ],
                  actions: [
                    ...(integrity.deadTickerCount > 0 ? ["Enable 'Exclude Dead Tickers' toggle to remove from statistics"] : []),
                    "Run scanner after market open for real Finnhub candle data on top 20 candidates",
                    ...(an.totalTrades < 30 ? ["Continue running paper trader to accumulate ≥30 trades"] : []),
                  ],
                },
                {
                  label: "Paper Trader Health",
                  score: paperHealth,
                  risks: [
                    ...(integrity.duplicateCount > 0 ? [`${integrity.duplicateCount} duplicate trade record(s) in history`] : []),
                    "Concurrent run cycles can still race if two POST /api/paper/run calls fire simultaneously at TP hit",
                    "30-min cooldown may allow re-entry within same trading session on trending tickers",
                    "No slippage model — actual fills would be 0.1–0.5% worse",
                  ],
                  actions: [
                    ...(integrity.duplicateCount > 0 ? ["Enable 'Exclude Duplicates' toggle above, then Clear Test Data + Rebuild Account for clean dataset"] : []),
                    "Consider extending cooldown to 60–120 min for daily-bar strategies",
                    "Future: add 0.1% slippage to every fill for realism",
                  ],
                },
                {
                  label: "Analytics Health",
                  score: analyticsHealth,
                  risks: [
                    ...(an.totalTrades < 10 ? ["Insufficient sample size — all analytics are noise at this stage"] : []),
                    ...(integrity.missingConfidence > an.totalTrades * 0.5 ? [`${integrity.missingConfidence} trades missing confidence scores — Phase 3 analysis unreliable`] : []),
                    ...(integrity.missingScoreBreakdown > an.totalTrades * 0.7 ? ["Most trades lack score breakdown — Phase 2 edge analysis unavailable"] : []),
                  ],
                  actions: [
                    ...(an.totalTrades < 10 ? ["Accumulate 30+ trades before drawing conclusions"] : []),
                    "Use Execute Top Pick (not scanner refresh) to ensure all new trades store full metadata",
                    "Historical trades pre-dating the notes system will always show as incomplete",
                  ],
                },
              ];

              return (
                <Sect title="Final Audit Report" sub="Verified findings from codebase inspection">
                  <div className="grid gap-4 p-4 lg:grid-cols-3">
                    {items.map(({ label, score, risks, actions }) => {
                      const color = score >= 75 ? "text-positive" : score >= 50 ? "text-amber-400" : "text-destructive";
                      const border = score >= 75 ? "border-positive/25" : score >= 50 ? "border-amber-400/25" : "border-destructive/25";
                      return (
                        <div key={label} className={cn("border bg-surface-1", border)}>
                          <div className="flex items-center justify-between border-b border-inherit px-3 py-2.5">
                            <p className="text-[11px] font-bold text-foreground">{label}</p>
                            <span className={cn("text-xl font-bold tabular-nums", color)}>{score}<span className="text-[10px] font-normal text-muted-foreground">/100</span></span>
                          </div>
                          <div className="px-3 py-2.5 space-y-3">
                            {risks.length > 0 && (
                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Risks</p>
                                {risks.map((r, i) => (
                                  <div key={i} className="flex gap-1.5 text-[10px] text-destructive mb-1">
                                    <span className="shrink-0">⚠</span><span>{r}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {actions.length > 0 && (
                              <div>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Actions</p>
                                {actions.map((a, i) => (
                                  <div key={i} className="flex gap-1.5 text-[10px] text-foreground mb-1">
                                    <span className="shrink-0 text-positive">→</span><span>{a}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {risks.length === 0 && actions.length === 0 && (
                              <p className="text-[10px] text-positive">No issues detected.</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Sect>
              );
            })()}
          </>
        )}
      </main>
    </div>
  );
}
