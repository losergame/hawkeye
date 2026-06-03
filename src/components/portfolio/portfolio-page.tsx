"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  BarChart2,
  CircleDollarSign,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { AppNav } from "@/components/shared/ui/app-nav";
import { cn } from "@/lib/cn";
import { findStock, portfolioHoldings } from "@/lib/mock-data";
import {
  seedRowsFromHoldings,
  type StoredPortfolioRow,
} from "@/lib/portfolio-storage";
import { toast } from "sonner";

// ── Portfolio API helpers — Google Sheets as source of truth ─────────────────

async function sheetsLoad(): Promise<{ rows: StoredPortfolioRow[]; source: string }> {
  const res  = await fetch("/api/portfolio", { cache: "no-store" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ rows: StoredPortfolioRow[]; source: string }>;
}

async function sheetsSave(rows: StoredPortfolioRow[]): Promise<void> {
  const res = await fetch("/api/portfolio", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ rows }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

async function sheetsDelete(id: string): Promise<void> {
  const res = await fetch(`/api/portfolio/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

async function sheetsClosePosition(id: string): Promise<{ trade: { ticker: string; exitPrice: number; profitLoss: number; profitLossPercent: number } }> {
  const res = await fetch(`/api/portfolio/${encodeURIComponent(id)}/close`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ trade: { ticker: string; exitPrice: number; profitLoss: number; profitLossPercent: number } }>;
}

async function sheetsPatch(id: string, patch: Partial<StoredPortfolioRow>): Promise<void> {
  const res = await fetch(`/api/portfolio/${encodeURIComponent(id)}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const signed = (v: number) => (v >= 0 ? "+" : "") + money.format(v);
const signedPct = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const HOLDINGS_GRID_COLUMNS = "64px minmax(160px,1fr) 70px 95px 95px 105px 105px 80px 64px 250px";
const HOLDINGS_GRID_STYLE = { gridTemplateColumns: HOLDINGS_GRID_COLUMNS, minWidth: "1120px" };

// ── Fallback prices (used before first API fetch) ─────────────────────────────

const FALLBACK: Record<string, { price: number; changePercent: number }> = {
  NVDA: { price: 125.40, changePercent:  2.14 },
  AAPL: { price: 211.00, changePercent:  0.48 },
  MSFT: { price: 419.80, changePercent:  0.55 },
  TSLA: { price: 248.50, changePercent:  1.32 },
  AMD:  { price: 110.30, changePercent:  1.87 },
};

function getFallback(symbol: string) {
  if (FALLBACK[symbol]) return FALLBACK[symbol];
  const s = findStock(symbol);
  return { price: s.price, changePercent: s.changePercent };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveQuote {
  price: number;
  changePercent: number;
  isLive: boolean;
}

function newRowId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Holding colors ────────────────────────────────────────────────────────────

const COLORS = [
  "text-positive", "text-blue-400", "text-amber-400",
  "text-purple-400", "text-cyan-400", "text-rose-400",
  "text-orange-400", "text-teal-400",
];
const BG_COLORS = [
  "bg-positive", "bg-blue-400", "bg-amber-400",
  "bg-purple-400", "bg-cyan-400", "bg-rose-400",
  "bg-orange-400", "bg-teal-400",
];

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, tone = "neutral", icon,
}: {
  label: string; value: string; sub?: string;
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
        tone === "positive" ? "text-positive"
        : tone === "negative" ? "text-destructive"
        : "text-foreground",
      )}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PortfolioPage() {
  const [rows, setRows]               = useState<StoredPortfolioRow[]>([]);
  const [hydrated, setHydrated]       = useState(false);
  const [quotes, setQuotes]           = useState<Record<string, LiveQuote>>({});
  const [refreshing, setRefreshing]   = useState(false);
  const [closingId, setClosingId]     = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editShares, setEditShares]   = useState("");
  const [editCost, setEditCost]       = useState("");

  // Add-position form
  const [showAdd, setShowAdd]         = useState(false);
  const [addSymbol, setAddSymbol]     = useState("");
  const [addShares, setAddShares]     = useState("");
  const [addCost, setAddCost]         = useState("");

  // ── Debug state ───────────────────────────────────────────────────────────

  const [debugSource, setDebugSource]   = useState<string>("loading");
  const [lastLoadTime, setLastLoadTime] = useState<string | null>(null);
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);
  const [lastError, setLastError]       = useState<string | null>(null);
  const [showDebug, setShowDebug]       = useState(false);

  // ── Load: Google Sheets as source of truth ────────────────────────────────

  useEffect(() => {
    void (async () => {
      try {
        const { rows: fromSheets, source } = await sheetsLoad();
        if (fromSheets.length > 0) {
          setRows(fromSheets);
          setDebugSource(source);
        } else {
          // Sheets empty — seed with defaults and save them
          const seed = seedRowsFromHoldings(portfolioHoldings);
          setRows(seed);
          setDebugSource("seeded");
          void sheetsSave(seed).catch(() => {}); // best-effort seed write
        }
      } catch (err) {
        setLastError(String(err));
        setDebugSource("error");
        // Fallback to seed data so the page is usable
        setRows(seedRowsFromHoldings(portfolioHoldings));
        toast.error(`Portfolio load failed: ${String(err)}`);
      } finally {
        setHydrated(true);
        setLastLoadTime(new Date().toISOString());
      }
    })();
  }, []);

  const persist = useCallback(async (next: StoredPortfolioRow[]) => {
    setRows(next);
    try {
      await sheetsSave(next);
      setLastSaveTime(new Date().toISOString());
      setLastError(null);
    } catch (err) {
      setLastError(String(err));
      toast.error(`Portfolio save failed: ${String(err)}`);
      // Revert optimistic update
      const { rows: reverted } = await sheetsLoad().catch(() => ({ rows: next }));
      setRows(reverted);
    }
  }, []);

  // ── Live price fetch ───────────────────────────────────────────────────────

  const fetchQuotes = useCallback(async (symbols: string[]) => {
    if (!symbols.length) return;
    setRefreshing(true);
    try {
      const results = await Promise.allSettled(
        symbols.map(async (ticker) => {
          const res = await fetch(`/api/quote/${encodeURIComponent(ticker)}`, { cache: "no-store" });
          if (!res.ok) throw new Error();
          const d = (await res.json()) as { price: number; changePercent: number; source: string };
          return { ticker, price: d.price, changePercent: d.changePercent, isLive: d.source === "live" };
        }),
      );
      setQuotes((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === "fulfilled") {
            next[r.value.ticker] = {
              price: r.value.price,
              changePercent: r.value.changePercent,
              isLive: r.value.isLive,
            };
          }
        }
        return next;
      });
      setLastUpdated(
        new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Fetch on hydration + whenever symbol list changes + 30s refresh
  const symbolsKey = useMemo(
    () => [...new Set(rows.map((r) => r.symbol.toUpperCase()))].sort().join(","),
    [rows],
  );

  useEffect(() => {
    if (!hydrated) return;
    const syms = symbolsKey ? symbolsKey.split(",") : [];
    void fetchQuotes(syms);
    const id = window.setInterval(() => void fetchQuotes(syms), 30_000);
    return () => window.clearInterval(id);
  }, [hydrated, symbolsKey, fetchQuotes]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const { holdings, totals } = useMemo(() => {
    const raw = rows.map((row) => {
      const sym = row.symbol.toUpperCase();
      const q = quotes[sym] ?? { ...getFallback(sym), isLive: false };
      const costBasis   = row.shares * row.averageCost;
      const marketValue = row.shares * q.price;
      const gain        = marketValue - costBasis;
      return {
        id: row.id, ticker: sym,
        name: findStock(sym).name,
        shares: row.shares, avgCost: row.averageCost,
        currentPrice: q.price, changePercent: q.changePercent,
        costBasis, marketValue, gain,
        gainPercent: costBasis > 0 ? (gain / costBasis) * 100 : 0,
        allocation: 0,
        isLive: q.isLive,
      };
    });

    const totalValue = raw.reduce((s, h) => s + h.marketValue, 0);
    const totalCost  = raw.reduce((s, h) => s + h.costBasis,   0);
    const totalGain  = totalValue - totalCost;
    const dayChange  = raw.reduce((s, h) => s + h.marketValue * (h.changePercent / 100), 0);

    const holdings = raw.map((h) => ({
      ...h,
      allocation: totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0,
    }));

    return {
      holdings,
      totals: {
        value: totalValue, cost: totalCost, gain: totalGain,
        gainPercent: totalCost > 0 ? (totalGain / totalCost) * 100 : 0,
        dayChange,
        dayChangePercent: totalValue > 0 ? (dayChange / totalValue) * 100 : 0,
        positions: holdings.length,
      },
    };
  }, [rows, quotes]);

  // ── Edit handlers ──────────────────────────────────────────────────────────

  function startEdit(row: StoredPortfolioRow) {
    setEditingId(row.id);
    setEditShares(row.shares.toString());
    setEditCost(row.averageCost.toString());
    setShowAdd(false);
  }

  function saveEdit() {
    const shares = parseFloat(editShares);
    const cost   = parseFloat(editCost);
    if (!Number.isFinite(shares) || shares <= 0) return;
    if (!Number.isFinite(cost)   || cost   <= 0) return;
    const next = rows.map((r) =>
      r.id === editingId ? { ...r, shares, averageCost: cost } : r,
    );
    // Optimistic update, then full Sheets sync
    setRows(next);
    void sheetsPatch(editingId!, { shares, averageCost: cost })
      .then(() => {
        setLastSaveTime(new Date().toISOString());
        setLastError(null);
      })
      .catch(async (err) => {
        setLastError(String(err));
        toast.error(`Save failed: ${String(err)}`);
        const { rows: reverted } = await sheetsLoad().catch(() => ({ rows: next }));
        setRows(reverted);
      });
    setEditingId(null);
  }

  function cancelEdit() { setEditingId(null); }

  function deleteRow(id: string) {
    if (closingId) return;
    if (editingId === id) setEditingId(null);
    const next = rows.filter((r) => r.id !== id);
    setRows(next); // optimistic
    void sheetsDelete(id)
      .then(() => {
        setLastSaveTime(new Date().toISOString());
        setLastError(null);
      })
      .catch(async (err) => {
        setLastError(String(err));
        toast.error(`Delete failed: ${String(err)}`);
        const { rows: reverted } = await sheetsLoad().catch(() => ({ rows: rows }));
        setRows(reverted);
      });
  }

  async function closePosition(id: string) {
    if (closingId) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    const symbol = row.symbol.toUpperCase();
    const confirmed = window.confirm(
      `Close ${symbol} using the latest live quote? This saves a completed trade to PortfolioTrades and removes the open holding.`,
    );
    if (!confirmed) return;

    if (editingId === id) setEditingId(null);
    setClosingId(id);
    try {
      const { trade } = await sheetsClosePosition(id);
      const { rows: refreshed, source } = await sheetsLoad();
      setRows(refreshed);
      setDebugSource(source);
      setLastSaveTime(new Date().toISOString());
      setLastError(null);
      toast.success(
        `Closed ${trade.ticker} at ${money.format(trade.exitPrice)} (${signed(trade.profitLoss)}, ${signedPct(trade.profitLossPercent)})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLastError(message);
      toast.error(`Close failed: ${message}`);
    } finally {
      setClosingId(null);
    }
  }

  // ── Add position ───────────────────────────────────────────────────────────

  function submitAdd(e: FormEvent) {
    e.preventDefault();
    const sym    = addSymbol.trim().toUpperCase();
    const shares = parseFloat(addShares);
    const cost   = parseFloat(addCost);
    if (!sym || !Number.isFinite(shares) || shares <= 0) return;
    if (!Number.isFinite(cost) || cost <= 0) return;
    const next = [...rows, { id: newRowId(), symbol: sym, shares, averageCost: cost }];
    void persist(next);
    setAddSymbol(""); setAddShares(""); setAddCost("");
    setShowAdd(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <AppNav activePage="Portfolio" subtitle="Holdings & performance" />
        <div className="flex items-center justify-center pt-32">
          <RefreshCw className="size-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-dot-grid" />

      <AppNav
        activePage="Portfolio"
        subtitle="Holdings & performance"
        right={
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="hidden text-[10px] text-muted-foreground sm:inline">
                UPD {lastUpdated}
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchQuotes(symbolsKey.split(",").filter(Boolean))}
              disabled={refreshing}
              className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              {refreshing ? "Updating…" : "Refresh"}
            </button>
          </div>
        }
      />

      <main className="relative mx-auto max-w-[1400px] px-4 py-6 lg:px-6">

        {/* ── Header ── */}
        <div className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-positive/70">Portfolio</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Holdings Overview</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {rows.length} position{rows.length !== 1 ? "s" : ""} · editable ·{" "}
            <span className={debugSource === "sheets" ? "text-positive" : debugSource === "error" ? "text-destructive" : "text-muted-foreground"}>
              {debugSource === "sheets" ? "Google Sheets ✓" : debugSource === "error" ? "Sheets error" : debugSource}
            </span>
          </p>
        </div>

        {/* ── Metric cards ── */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Market value"
            value={money.format(totals.value)}
            sub={`${totals.positions} position${totals.positions !== 1 ? "s" : ""} · ${money.format(totals.cost)} cost basis`}
            icon={<BarChart2 className="size-4 text-muted-foreground" />}
          />
          <MetricCard
            label="Daily gain / loss"
            value={signed(totals.dayChange)}
            sub={signedPct(totals.dayChangePercent) + " today"}
            tone={totals.dayChange >= 0 ? "positive" : "negative"}
            icon={totals.dayChange >= 0
              ? <TrendingUp className="size-4 text-positive" />
              : <TrendingDown className="size-4 text-destructive" />}
          />
          <MetricCard
            label="Total gain / loss"
            value={signed(totals.gain)}
            sub={signedPct(totals.gainPercent) + " unrealized"}
            tone={totals.gain >= 0 ? "positive" : "negative"}
            icon={totals.gain >= 0
              ? <ArrowUpRight className="size-4 text-positive" />
              : <ArrowDownRight className="size-4 text-destructive" />}
          />
        </div>

        {/* ── Allocation bar ── */}
        {holdings.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Allocation by position</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden border border-border bg-surface-2">
              {holdings.map((h, i) => (
                <div
                  key={h.id}
                  className={cn("h-full transition-all duration-500", BG_COLORS[i % BG_COLORS.length])}
                  style={{ width: `${h.allocation}%` }}
                  title={`${h.ticker} ${h.allocation.toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {holdings.map((h, i) => (
                <div key={h.id} className="flex items-center gap-1.5 text-[11px]">
                  <span className={cn("size-2 shrink-0", BG_COLORS[i % BG_COLORS.length])} />
                  <span className="font-bold text-foreground">{h.ticker}</span>
                  <span className="text-muted-foreground">{h.allocation.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Holdings table ── */}
        <div className="overflow-x-auto border border-border bg-card">
          {/* Table header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Holdings</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {holdings.length} positions · {money.format(totals.value)} market value
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setShowAdd(true); setEditingId(null); }}
              className="flex items-center gap-1.5 border border-positive/30 bg-positive/10 px-3 py-1.5 text-[11px] font-semibold text-positive transition hover:bg-positive/20"
            >
              <Plus className="size-3.5" />
              Add position
            </button>
          </div>

          {/* Column headers */}
          <div
            className="grid border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            style={HOLDINGS_GRID_STYLE}
          >
            <span>Ticker</span>
            <span>Company</span>
            <span>Shares</span>
            <span>Avg cost</span>
            <span>Price</span>
            <span>Mkt value</span>
            <span>Gain / loss</span>
            <span>Return</span>
            <span>Alloc.</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Empty state */}
          {holdings.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center">
              <BarChart2 className="mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">No positions yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Click &ldquo;Add position&rdquo; to get started.</p>
            </div>
          )}

          {/* Holding rows */}
          {holdings.map((h, i) => {
            const isEditing = editingId === h.id;
            return (
              <div
                key={h.id}
                className={cn(
                  "grid items-center border-b border-border px-4 py-3 text-xs last:border-0 transition",
                  isEditing ? "bg-surface-1" : "hover:bg-surface-1/50",
                )}
                style={HOLDINGS_GRID_STYLE}
              >
                {/* Ticker */}
                <span className={cn("font-bold text-sm", COLORS[i % COLORS.length])}>{h.ticker}</span>

                {/* Company */}
                <div>
                  <p className="font-semibold text-foreground truncate">{h.name}</p>
                  <p className={cn("text-[10px]", h.changePercent >= 0 ? "text-positive" : "text-destructive")}>
                    {h.changePercent >= 0 ? "+" : ""}{h.changePercent.toFixed(2)}% today
                    {h.isLive && <span className="ml-1 opacity-60">·live</span>}
                  </p>
                </div>

                {/* Shares — editable */}
                {isEditing ? (
                  <input
                    type="number"
                    value={editShares}
                    onChange={(e) => setEditShares(e.target.value)}
                    min="0.001"
                    step="any"
                    className="w-full border border-positive/40 bg-background px-1.5 py-1 tabular-nums text-foreground outline-none focus:border-positive"
                  />
                ) : (
                  <span className="tabular-nums text-muted-foreground">{h.shares}</span>
                )}

                {/* Avg cost — editable */}
                {isEditing ? (
                  <input
                    type="number"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    min="0.01"
                    step="any"
                    className="w-full border border-positive/40 bg-background px-1.5 py-1 tabular-nums text-foreground outline-none focus:border-positive"
                  />
                ) : (
                  <span className="tabular-nums text-muted-foreground">{money.format(h.avgCost)}</span>
                )}

                {/* Current price */}
                <span className={cn(
                  "tabular-nums font-semibold",
                  h.changePercent >= 0 ? "text-positive" : "text-destructive",
                )}>
                  {money.format(h.currentPrice)}
                </span>

                {/* Market value */}
                <span className="tabular-nums font-semibold text-foreground">{money.format(h.marketValue)}</span>

                {/* Gain/loss $ */}
                <span className={cn("tabular-nums font-semibold", h.gain >= 0 ? "text-positive" : "text-destructive")}>
                  {signed(h.gain)}
                </span>

                {/* Return % */}
                <span className={cn("tabular-nums font-semibold", h.gain >= 0 ? "text-positive" : "text-destructive")}>
                  {signedPct(h.gainPercent)}
                </span>

                {/* Allocation */}
                <span className="tabular-nums text-muted-foreground">{h.allocation.toFixed(1)}%</span>

                {/* Row actions */}
                <div className="flex items-center justify-end gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={closingId !== null}
                        className="p-1.5 text-positive transition hover:bg-positive/10"
                        title="Save"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={closingId !== null}
                        className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        title="Cancel"
                      >
                        <X className="size-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(rows.find((r) => r.id === h.id)!)}
                        disabled={closingId !== null}
                        className="p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        title="Edit shares / avg cost"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void closePosition(h.id)}
                        disabled={closingId !== null}
                        className="inline-flex h-8 min-w-[112px] items-center justify-center gap-1.5 border border-positive/30 bg-positive/10 px-2 text-[10px] font-semibold uppercase tracking-wider text-positive transition hover:bg-positive/20 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Close Position"
                        aria-label={`Close Position ${h.ticker}`}
                      >
                        {closingId === h.id ? <Loader2 className="size-3 animate-spin" /> : <CircleDollarSign className="size-3" />}
                        {closingId === h.id ? "Closing" : "Close Position"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRow(h.id)}
                        disabled={closingId !== null}
                        className="inline-flex h-8 min-w-[126px] items-center justify-center gap-1.5 border border-border px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                        title="Delete / Remove Entry"
                        aria-label={`Delete / Remove Entry ${h.ticker}`}
                      >
                        <Trash2 className="size-3" />
                        Delete / Remove Entry
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add-position form row */}
          {showAdd && (
            <form
              onSubmit={submitAdd}
              className="grid items-center gap-2 border-t border-positive/20 bg-positive/[0.03] px-4 py-3"
              style={HOLDINGS_GRID_STYLE}
            >
              <input
                type="text"
                placeholder="TICKER"
                value={addSymbol}
                onChange={(e) => setAddSymbol(e.target.value.toUpperCase())}
                maxLength={10}
                className="border border-border bg-background px-2 py-1.5 text-xs font-bold uppercase tabular-nums text-foreground outline-none focus:border-positive"
                autoFocus
              />
              <span className="text-[10px] text-muted-foreground">New position</span>
              <input
                type="number"
                placeholder="Shares"
                value={addShares}
                onChange={(e) => setAddShares(e.target.value)}
                min="0.001"
                step="any"
                className="border border-border bg-background px-2 py-1.5 text-xs tabular-nums text-foreground outline-none focus:border-positive"
              />
              <input
                type="number"
                placeholder="Avg cost"
                value={addCost}
                onChange={(e) => setAddCost(e.target.value)}
                min="0.01"
                step="any"
                className="border border-border bg-background px-2 py-1.5 text-xs tabular-nums text-foreground outline-none focus:border-positive"
              />
              {/* spacer cells */}
              <span /><span /><span /><span />
              {/* action buttons */}
              <div className="col-span-2 flex items-center justify-end gap-1">
                <button
                  type="submit"
                  className="flex items-center gap-1 border border-positive/30 bg-positive/10 px-2.5 py-1.5 text-[11px] font-semibold text-positive transition hover:bg-positive/20"
                >
                  <Check className="size-3" /> Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setAddSymbol(""); setAddShares(""); setAddCost(""); }}
                  className="p-1.5 text-muted-foreground transition hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </form>
          )}

          {/* Totals row */}
          {holdings.length > 0 && (
            <div
              className="grid items-center border-t border-border bg-surface-1 px-4 py-3 text-xs font-bold"
              style={HOLDINGS_GRID_STYLE}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
              <span /><span /><span /><span />
              <span className="tabular-nums text-foreground">{money.format(totals.value)}</span>
              <span className={cn("tabular-nums", totals.gain >= 0 ? "text-positive" : "text-destructive")}>
                {signed(totals.gain)}
              </span>
              <span className={cn("tabular-nums", totals.gain >= 0 ? "text-positive" : "text-destructive")}>
                {signedPct(totals.gainPercent)}
              </span>
              <span className="text-muted-foreground">100%</span>
              <span />
            </div>
          )}
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground">
          Holdings saved to Google Sheets. Prices refresh every 30 seconds via Finnhub when configured, demo prices otherwise. Not financial advice.
          {lastError && (
            <span className="ml-2 text-destructive font-semibold">Last error: {lastError}</span>
          )}
          {" "}
          <button type="button" onClick={() => setShowDebug(v => !v)} className="ml-2 underline text-muted-foreground hover:text-foreground">
            {showDebug ? "Hide debug" : "Debug"}
          </button>

          {showDebug && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-left">
              {[
                { label: "Data Source", value: debugSource, tone: debugSource === "sheets" ? "text-positive" : "text-amber-400" },
                { label: "Holdings Loaded", value: `${rows.length}` },
                { label: "Last Loaded", value: lastLoadTime ? new Date(lastLoadTime).toLocaleTimeString() : "—" },
                { label: "Last Saved", value: lastSaveTime ? new Date(lastSaveTime).toLocaleTimeString() : "—" },
              ].map(({ label, value, tone }) => (
                <div key={label} className="border border-border bg-surface-1 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className={cn("mt-0.5 text-xs font-semibold", tone ?? "text-foreground")}>{value}</p>
                </div>
              ))}
            </div>
          )}
        </p>
      </main>
    </div>
  );
}
