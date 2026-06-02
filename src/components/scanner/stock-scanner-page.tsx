"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight,
  ChevronDown,
  Crosshair,
  RefreshCw,
  ShieldAlert,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Zap
} from "lucide-react";
import { toast } from "sonner";

import { DisclaimerCard } from "@/components/scanner/disclaimer-card";
import { TopFiveSetups } from "@/components/scanner/top-five-setups";
import { ScannerFilters, defaultFilters, type ScannerFiltersState } from "@/components/scanner/scanner-filters";
import { ScannerTable } from "@/components/scanner/scanner-table";
import { StockDetailModal } from "@/components/scanner/stock-detail-modal";
import { potentialGainPercent, StockSetupCard } from "@/components/scanner/stock-setup-card";
import { AppNav } from "@/components/shared/ui/app-nav";
import { Panel, SectionHeader } from "@/components/shared/ui";
import { cn } from "@/lib/cn";
import { scannerConditions } from "@/lib/mockStockSetups";
import { useSignalTracker }  from "@/hooks/useSignalTracker";
import { useDebounce }       from "@/hooks/useDebounce";
import { usePageVisible }    from "@/hooks/usePageVisible";
import { computeMarketRegime, getTopFiveSetups } from "@/lib/scanner-scoring";
import { ActiveStrategyPanel } from "@/components/shared/active-strategy-panel";
import type { StockSetup, StockSetupType } from "@/lib/types";

async function saveTopPicksToSheets(results: StockSetup[]): Promise<void> {
  try {
    const regime = computeMarketRegime(results);
    const top5   = getTopFiveSetups(results, "All", regime);
    if (top5.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    await fetch("/api/sheets/top-picks", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ picks: top5, date }),
    });
  } catch { /* sheets not configured — silent */ }
}

// ── Universe options ────────────────────────────────────────────────────────

const UNIVERSES = [
  { value: "sp500",      label: "S&P 500",    approxCount: 503 },
  { value: "nasdaq100",  label: "NASDAQ 100", approxCount: 101 },
  { value: "russell2000",label: "Russell 2000",approxCount: 287 },
] as const;
type UniverseKey = typeof UNIVERSES[number]["value"];

// ── API response type ────────────────────────────────────────────────────────

interface CandleCoverageStats {
  realCount:         number;
  insufficientCount: number;
  syntheticCount:    number;
  uncachedCount:     number;
  totalTickers:      number;
  realPct:           number;
  skippedCount:      number;
  minBarsSufficient: number;
}

interface ScanApiResponse {
  results: StockSetup[];
  total: number;
  totalScanned: number;
  page: number;
  pageSize: number;
  totalPages: number;
  universe: string;
  lastScanned: string;
  dataQuality: "live" | "hybrid" | "demo";
  candleSource?: "real" | "delayed" | "mock";
  marketStatus: "OPEN" | "PRE-MARKET" | "AFTER-HOURS" | "CLOSED";
  candleCoverage?: CandleCoverageStats;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 700) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const frame = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [target, duration]);
  return display;
}

function SetupTypeIcon({ type }: { type: string }) {
  const map: Record<string, React.ReactNode> = {
    "Momentum Breakout": <Zap className="size-3.5 text-positive" />,
    "Pullback Buy": <TrendingDown className="size-3.5 text-amber-400" />,
    "Oversold Bounce": <TrendingUp className="size-3.5 text-blue-400" />,
    "Trend Continuation": <ArrowUpRight className="size-3.5 text-purple-400" />
  };
  return (
    <span className="flex size-6 items-center justify-center border border-border bg-surface-1">
      {map[type] ?? <Zap className="size-3.5 text-muted-foreground" />}
    </span>
  );
}

function DataQualityBadge({ quality }: { quality: "live" | "hybrid" | "demo" }) {
  const styles = {
    live:   "border-positive text-positive",
    hybrid: "border-amber-400 text-amber-400",
    demo:   "border-muted-foreground text-muted-foreground",
  };
  const labels = { live: "LIVE", hybrid: "HYBRID", demo: "DEMO DATA" };
  return (
    <span className={cn("border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", styles[quality])}>
      {labels[quality]}
    </span>
  );
}

function CandleSourceBadge({ source }: { source: "real" | "delayed" | "mock" | undefined }) {
  if (!source) return null;
  const styles = {
    real:    "border-positive/40 bg-positive/10 text-positive",
    delayed: "border-amber-400/40 bg-amber-400/10 text-amber-400",
    mock:    "border-border bg-surface-1 text-muted-foreground",
  };
  const labels = {
    real:    "REAL CANDLES",
    delayed: "DELAYED CANDLES",
    mock:    "MOCK CANDLES",
  };
  return (
    <span className={cn("border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", styles[source])}>
      {labels[source]}
    </span>
  );
}

function MarketStatusBadge({ status }: { status: string }) {
  const isOpen = status === "OPEN";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
      isOpen ? "border-positive text-positive" : "border-border text-muted-foreground"
    )}>
      {isOpen && <span className="size-1.5 animate-pulse rounded-full bg-positive" />}
      NYSE {status}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function StockScannerPage() {
  const [universe, setUniverse] = useState<UniverseKey>("sp500");
  const [allSetups, setAllSetups] = useState<StockSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalScanned, setTotalScanned] = useState(0);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [marketStatus, setMarketStatus] = useState<ScanApiResponse["marketStatus"]>("CLOSED");
  const [dataQuality, setDataQuality]   = useState<ScanApiResponse["dataQuality"]>("demo");
  const [candleSource, setCandleSource] = useState<ScanApiResponse["candleSource"]>("mock");
  const [coverage, setCoverage] = useState<CandleCoverageStats | null>(null);
  const [filters, setFilters] = useState<ScannerFiltersState>(defaultFilters);
  const [selectedSetup, setSelectedSetup] = useState<StockSetup | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openPlaybook, setOpenPlaybook] = useState<string | null>(null);

  // ── Signal tracker + paper trader integration ─────────────────────────────
  const { trackScanResults, getCalibrationLabel } = useSignalTracker();
  const isPageVisible = usePageVisible();

  // ── Fetch scan ────────────────────────────────────────────────────────────

  const fetchScan = useCallback(async (u: UniverseKey, forceRefresh = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        universe: u,
        pageSize: "500",
        ...(forceRefresh ? { refresh: "1" } : {}),
      });
      const res = await fetch(`/api/scanner?${params}`);
      if (!res.ok) throw new Error("Scan failed");
      const data: ScanApiResponse = await res.json();
      setAllSetups(data.results);
      setTotalScanned(data.totalScanned);
      setLastScanned(data.lastScanned);
      setMarketStatus(data.marketStatus);
      setDataQuality(data.dataQuality);
      setCandleSource(data.candleSource ?? "mock");
      if (data.candleCoverage) setCoverage(data.candleCoverage);
      // Auto-track all valid setups (deduped within 7 days internally)
      trackScanResults(data.results);
      // Save today's top 5 picks to Google Sheets (signal tracking only)
      void saveTopPicksToSheets(data.results);
      // NOTE: Paper Trader is intentionally NOT called here.
      // Scanner = finds ideas. Paper Trader = decides whether to buy.
      // Paper trades are only opened from the Paper Trader page.
    } catch {
      toast.error("Failed to load scanner data");
    } finally {
      setLoading(false);
    }
  }, [trackScanResults]);

  useEffect(() => {
    void fetchScan(universe);
  }, [universe, fetchScan]);

  // Auto-refresh every 5 min during market hours
  useEffect(() => {
    if (marketStatus !== "OPEN") return;
    // Pause auto-refresh when tab is hidden — saves API quota
    const id = setInterval(() => {
      if (isPageVisible) void fetchScan(universe);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [marketStatus, universe, fetchScan, isPageVisible]);

  function handleAddToWatchlist(ticker: string) {
    setWatchlist((prev) => {
      if (prev.includes(ticker)) {
        toast.info(`${ticker} removed from watchlist`);
        return prev.filter((t) => t !== ticker);
      }
      toast.success(`${ticker} added to watchlist`, { icon: "⭐" });
      return [...prev, ticker];
    });
  }

  function handleUniverseChange(u: UniverseKey) {
    setUniverse(u);
    setPage(1);
  }

  // ── Client-side filtering ─────────────────────────────────────────────────

  const debouncedSearch = useDebounce(filters.search, 300);

  const filteredSetups = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return allSetups
      .filter((setup) => {
        const matchesSearch =
          !query ||
          setup.ticker.toLowerCase().includes(query) ||
          setup.companyName.toLowerCase().includes(query);
        const matchesSetup = filters.setupType === "All" || setup.setupType === filters.setupType;
        const matchesStatus = filters.status === "All" || setup.status === filters.status;
        const matchesConf = !filters.confidence70 || setup.confidenceScore >= 70;
        const matchesRR = !filters.riskReward2 || setup.riskReward >= 2;
        return matchesSearch && matchesSetup && matchesStatus && matchesConf && matchesRR;
      })
      .sort((a, b) => {
        // Trading logic: Failed setups always sink to the bottom regardless of sort key
        const statusRank = (s: typeof a) =>
          s.status === "Triggered" ? 0 : s.status === "Waiting" ? 1 : s.status === "Completed" ? 2 : 3;
        const rankDiff = statusRank(a) - statusRank(b);
        if (rankDiff !== 0) return rankDiff;
        if (filters.sortBy === "potentialGain") return potentialGainPercent(b) - potentialGainPercent(a);
        return b.confidenceScore - a.confidenceScore;
      });
  }, [allSetups, filters, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredSetups.length / pageSize));
  const paginatedSetups = filteredSetups.slice((page - 1) * pageSize, page * pageSize);

  // Summary stats
  const triggeredCount = allSetups.filter((s) => s.status === "Triggered").length;
  const highConfCount = allSetups.filter((s) => s.confidenceScore >= 70).length;
  const avgConf =
    allSetups.length > 0
      ? Math.round(allSetups.reduce((s, x) => s + x.confidenceScore, 0) / allSetups.length)
      : 0;

  const lastScannedLabel = lastScanned
    ? new Date(lastScanned).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="gradient-overlay-dark pointer-events-none fixed inset-0" />
      <div className="bg-dot-grid pointer-events-none fixed inset-0" />

      <AppNav
        subtitle="Stock setup scanner"
        activePage="Scanner"
        right={
          <div className="flex items-center gap-2">
            {lastScannedLabel && (
              <span className="hidden text-[10px] text-muted-foreground sm:inline">
                Last scan {lastScannedLabel}
              </span>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchScan(universe, true)}
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              {loading ? "Scanning…" : "Refresh Scan"}
            </button>
          </div>
        }
      />

      <main id="main-content" className="relative mx-auto grid max-w-[1600px] gap-4 px-4 py-5 lg:px-6">
        {/* Active rule preset status */}
        <ActiveStrategyPanel />

        {/* Universe + status strip */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Universe</span>
            <div className="flex items-center border border-border bg-surface-1 p-0.5">
              {UNIVERSES.map((u) => (
                <button
                  key={u.value}
                  type="button"
                  onClick={() => handleUniverseChange(u.value)}
                  className={cn(
                    "px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition",
                    universe === u.value
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  )}
                >
                  {u.label}
                  <span className="ml-1.5 text-[9px] opacity-50">~{u.approxCount}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CandleSourceBadge source={candleSource} />
            <DataQualityBadge quality={dataQuality} />
            <MarketStatusBadge status={marketStatus} />
          </div>
        </div>

        {/* Hero */}
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel tight className="overflow-hidden">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-positive/80">
                  {UNIVERSES.find((u) => u.value === universe)?.label ?? ""} scan
                  {allSetups.length > 0 && ` · ${allSetups.length} setups found`}
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Stock Scanner
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Real indicator calculations (EMA, RSI(14), ATR, MACD) across {totalScanned || "…"} stocks.
                  {dataQuality === "demo"
                    ? " Using demo data — add FINNHUB_API_KEY for live prices."
                    : " Live prices injected for matched tickers via Finnhub."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:shrink-0">
                <HeroMetric label="Scanned" value={totalScanned} icon={<Target className="size-4 text-muted-foreground" />} />
                <HeroMetric label="Triggered" value={triggeredCount} icon={<Zap className="size-4 text-positive" />} trend="up" />
                <HeroMetric label="High conf." value={highConfCount} icon={<TrendingUp className="size-4 text-positive" />} />
                <HeroMetric label="Avg conf." value={avgConf} suffix="%" icon={<Star className="size-4 text-amber-400" />} />
              </div>
            </div>

            {/* Real candle coverage bar */}
            {coverage && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-surface-1 px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn("h-full rounded-full transition-all",
                        coverage.realPct >= 80 ? "bg-positive" :
                        coverage.realPct >= 40 ? "bg-amber-400" : "bg-destructive")}
                      style={{ width: `${coverage.realPct}%` }}
                    />
                  </div>
                  <span className={cn("text-[11px] font-bold tabular-nums",
                    coverage.realPct >= 80 ? "text-positive" :
                    coverage.realPct >= 40 ? "text-amber-400" : "text-destructive")}>
                    {coverage.realPct}%
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Real Candles ({coverage.realCount}/{coverage.totalTickers} ≥{coverage.minBarsSufficient ?? 200}b)
                  </span>
                </div>
                {coverage.insufficientCount > 0 && (
                  <span className="text-[11px] text-amber-400">
                    ⚠ {coverage.insufficientCount} insufficient
                  </span>
                )}
                {coverage.skippedCount > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {coverage.skippedCount} skipped
                  </span>
                )}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3 border border-border bg-surface-1 px-4 py-2.5">
              <span className="text-xs text-muted-foreground">
                {filteredSetups.length} setups match filters · {totalScanned} stocks scanned
              </span>
              {/* Calibration indicators */}
              <div className="hidden items-center gap-2 sm:flex">
                {(["Momentum Breakout", "Pullback Buy", "Oversold Bounce", "Trend Continuation"] as const).map((type) => {
                  const cl = getCalibrationLabel(type);
                  if (cl.arrow === "—") return null;
                  return (
                    <span
                      key={type}
                      title={`${type}: ${(cl.winRate * 100).toFixed(0)}% win rate from ${cl.dataPoints} signals`}
                      className={cn(
                        "text-[10px] font-bold",
                        cl.tone === "positive" ? "text-positive" :
                        cl.tone === "negative" ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {type.split(" ")[0]} {cl.arrow}
                    </span>
                  );
                })}
              </div>
              <div className="flex-1 h-1.5 bg-surface-2">
                <div
                  className="h-full bg-positive/60 transition-all duration-500"
                  style={{ width: totalScanned > 0 ? `${Math.min(100, (allSetups.length / totalScanned) * 100 * 3)}%` : "0%" }}
                />
              </div>
              <span className="font-mono text-xs font-bold text-positive">
                {totalScanned > 0
                  ? `${((filteredSetups.length / totalScanned) * 100).toFixed(1)}% match rate`
                  : "…"}
              </span>
            </div>
          </Panel>

          <DisclaimerCard />
        </section>

        {/* Mixed-data warning: real exit prices but mock candle levels */}
        {dataQuality !== "demo" && candleSource === "mock" && (
          <div className="flex items-start gap-2 border border-amber-400/25 bg-amber-400/[0.05] px-4 py-2.5 text-[11px] text-amber-400">
            <span className="mt-0.5 shrink-0">⚠️</span>
            <span>
              <strong>Scanner levels are based on synthetic candles.</strong>{" "}
              Entry, stop, and take-profit levels were calculated from seeded mock data — not real historical prices.
              Paper trading results using these levels against real Finnhub exit prices may not be reliable.
              Add a Finnhub or Polygon API key to enable real historical candle calculations for the top setups.
            </span>
          </div>
        )}
        {candleSource !== "mock" && (
          <div className="flex items-center gap-2 border border-positive/20 bg-positive/[0.04] px-4 py-2 text-[11px] text-positive">
            <span>✓</span>
            <span>
              Top setups re-scored using{" "}
              <strong>{candleSource === "real" ? "real-time" : "delayed"} historical candles</strong>.
              Entry, stop, and take-profit levels reflect actual market data.
            </span>
          </div>
        )}

        {/* Top 5 Setups */}
        <TopFiveSetups
          allSetups={allSetups}
          totalScanned={totalScanned}
          lastScanned={lastScanned}
          isLoading={loading}
          onOpen={setSelectedSetup}
        />

        {/* Filters */}
        <ScannerFilters
          filters={filters}
          onChange={(f) => { setFilters(f); setPage(1); }}
        />

        {/* Results */}
        <section className="grid gap-3">
          <div className="grid gap-3">
            <Panel tight>
              {/* Results header with pagination */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-positive/70">
                    Scanner results
                  </p>
                  <h2 className="mt-0.5 text-sm font-semibold text-foreground">
                    {loading
                      ? "Scanning…"
                      : `${filteredSetups.length} setup${filteredSetups.length !== 1 ? "s" : ""} found`}
                  </h2>
                </div>

                {!loading && filteredSetups.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="hidden sm:inline">
                      {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredSetups.length)}
                      {" "}of {filteredSetups.length}
                    </span>
                    <div className="flex items-center border border-border">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-2 py-1 hover:bg-muted disabled:opacity-30 transition"
                      >
                        ‹
                      </button>
                      <span className="border-l border-r border-border px-2.5 py-1 tabular-nums">
                        {page}/{totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="px-2 py-1 hover:bg-muted disabled:opacity-30 transition"
                      >
                        ›
                      </button>
                    </div>
                    <PageSizeDropdown
                      value={pageSize}
                      onChange={(n) => { setPageSize(n); setPage(1); }}
                    />
                  </div>
                )}
              </div>

              <ScannerTable
                setups={paginatedSetups}
                onOpen={setSelectedSetup}
                isLoading={loading}
                watchlist={watchlist}
                onWatchlist={handleAddToWatchlist}
              />

              {/* Mobile card grid */}
              {!loading && (
                <div className="grid gap-3 xl:hidden">
                  {paginatedSetups.map((setup) => (
                    <StockSetupCard
                      key={`${setup.ticker}-${setup.setupType}`}
                      setup={setup}
                      onOpen={setSelectedSetup}
                    />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!loading && filteredSetups.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center py-16"
                >
                  <Crosshair className="mb-3 size-8 text-muted-foreground" />
                  <p className="text-sm font-semibold">No setups match</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Adjust your filters or try a different universe.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFilters(defaultFilters)}
                    className="mt-4 border border-border px-4 py-2 text-xs transition hover:bg-muted"
                  >
                    Clear all filters
                  </button>
                </motion.div>
              )}

              {/* Bottom status bar */}
              {!loading && (
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground">
                  <span>
                    {filteredSetups.length} results · {totalScanned} scanned ·{" "}
                    {lastScannedLabel ? `last scan ${lastScannedLabel}` : "—"}
                  </span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                        const p = i + 1;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPage(p)}
                            className={cn(
                              "size-5 text-center text-[10px] transition hover:bg-muted",
                              p === page ? "bg-foreground text-background" : ""
                            )}
                          >
                            {p}
                          </button>
                        );
                      })}
                      {totalPages > 7 && <span className="px-1">…{totalPages}</span>}
                    </div>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </section>

        {/* Playbook + Methodology — compact 2-col strip */}
        <section className="grid gap-3 sm:grid-cols-2">
          <Panel tight>
            <SectionHeader
              eyebrow="Playbook"
              title="Scanner conditions"
              action={<ShieldAlert className="size-5 text-amber-400" />}
            />
            <div className="grid gap-1.5">
              {(Object.entries(scannerConditions) as [StockSetupType, string[]][]).map(([setupType, conditions]) => (
                <div key={setupType} className="overflow-hidden border border-border bg-surface-1">
                  <button
                    type="button"
                    onClick={() => setOpenPlaybook(openPlaybook === setupType ? null : setupType)}
                    className="flex w-full items-center justify-between p-3 text-left transition hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-2">
                      <SetupTypeIcon type={setupType} />
                      <span className="text-sm font-semibold text-foreground">{setupType}</span>
                    </div>
                    <motion.div
                      animate={{ rotate: openPlaybook === setupType ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </motion.div>
                  </button>
                  <motion.div
                    animate={{ height: openPlaybook === setupType ? "auto" : 0 }}
                    initial={{ height: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <ul className="space-y-1 border-t border-border px-3 pb-3 pt-2 text-xs leading-5 text-muted-foreground">
                      {conditions.map((condition) => (
                        <li key={condition} className="flex gap-2">
                          <span className="mt-[7px] size-1.5 shrink-0 bg-positive" />
                          <span>{condition}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel tight>
            <SectionHeader eyebrow="Methodology" title="TP / SL calculation" />
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="border border-border bg-surface-1 p-2.5">
                <p className="font-semibold text-foreground">Stop Loss methods</p>
                <ul className="mt-1.5 space-y-1">
                  <li><span className="text-destructive font-medium">1.5× ATR</span> — 1.5× 14-period ATR below entry</li>
                  <li><span className="text-destructive font-medium">Swing low</span> — below nearest swing low</li>
                  <li><span className="text-destructive font-medium">Below EMA</span> — 1% below reference EMA</li>
                </ul>
              </div>
              <div className="border border-border bg-surface-1 p-2.5">
                <p className="font-semibold text-foreground">Take Profit methods</p>
                <ul className="mt-1.5 space-y-1">
                  <li><span className="text-positive font-medium">Resistance</span> — nearest swing high above entry</li>
                  <li><span className="text-positive font-medium">Fib ext</span> — 0.618 or 1.618 Fibonacci extension</li>
                  <li><span className="text-positive font-medium">RR ratio</span> — minimum 2:1 risk-reward</li>
                </ul>
              </div>
            </div>
          </Panel>
        </section>
      </main>

      <StockDetailModal
        setup={selectedSetup}
        watchlist={watchlist}
        onClose={() => setSelectedSetup(null)}
        onAddToWatchlist={handleAddToWatchlist}
      />
    </div>
  );
}

// ── HeroMetric card ──────────────────────────────────────────────────────────

function PageSizeDropdown({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const options = [25, 50, 100];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={cn(
          "flex h-[26px] items-center gap-1 border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground",
          open && "bg-muted text-foreground"
        )}
      >
        {value}/page
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            className="absolute right-0 top-[calc(100%+2px)] z-50 border border-border bg-card py-0.5"
          >
            {options.map((n) => (
              <button
                key={n}
                type="button"
                onMouseDown={() => { onChange(n); setOpen(false); }}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-[11px] font-medium transition",
                  n === value
                    ? "bg-surface-1 text-foreground"
                    : "text-muted-foreground hover:bg-surface-1 hover:text-foreground"
                )}
              >
                {n}/page
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  suffix = "",
  trend,
  icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  trend?: "up" | "down";
  icon?: React.ReactNode;
}) {
  const display = useCountUp(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="min-w-24 border border-border bg-surface-1 p-3"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon}
      </div>
      <div className="flex items-center gap-1.5">
        <p className="text-2xl font-bold tabular-nums text-foreground">
          {display}{suffix}
        </p>
        {trend === "up" && <TrendingUp className="size-4 text-positive" />}
        {trend === "down" && <TrendingDown className="size-4 text-destructive" />}
      </div>
    </motion.div>
  );
}
