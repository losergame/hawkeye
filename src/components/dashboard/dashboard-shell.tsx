"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { CandlestickChart as PriceCandlestickChart, PriceAreaChart } from "@/components/charts";
import type { ChartMode } from "@/components/dashboard/types";
import { AppNav } from "@/components/shared/ui/app-nav";
import { useLivePrice, useLivePrices } from "@/hooks/useLivePrice";
import { useWatchlist } from "@/hooks/useWatchlist";
import { cn } from "@/lib/cn";
import {
  dailyMarketSummary,
  dailyTopPicks,
  findStock,
  getStockSuggestions,
  heatmap,
  marketNews,
  sectorPerformance,
  stocks,
  topGainers,
  topLosers,
} from "@/lib/mock-data";
import type { ChartIndicator, ChartTimeframe, StockProfile } from "@/lib/types";

/* ── formatters ── */
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });

/* ── ticker tape — ETF proxies for major indices ── */
// Labels are display-friendly; tickers are the Finnhub-fetchable proxies.
const TAPE_SOURCES = [
  { ticker: "SPY",  label: "S&P 500",  fallbackVal: 548.29,  fallbackPct:  0.62 },
  { ticker: "QQQ",  label: "NASDAQ",   fallbackVal: 469.82,  fallbackPct:  0.88 },
  { ticker: "DIA",  label: "DOW",      fallbackVal: 398.71,  fallbackPct:  0.31 },
  { ticker: "GLD",  label: "GOLD",     fallbackVal: 229.14,  fallbackPct:  0.74 },
  { ticker: "USO",  label: "OIL",      fallbackVal:  71.84,  fallbackPct: -0.91 },
  { ticker: "NVDA", label: "NVDA",     fallbackVal: 125.40,  fallbackPct:  2.14 },
  { ticker: "AAPL", label: "AAPL",     fallbackVal: 211.00,  fallbackPct:  0.48 },
  { ticker: "TSLA", label: "TSLA",     fallbackVal: 248.50,  fallbackPct:  1.32 },
  { ticker: "MSFT", label: "MSFT",     fallbackVal: 419.80,  fallbackPct:  0.55 },
] as const;

function formatPct(pct: number) {
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

/* ── market session ── */
type MarketSessionTone = "open" | "pre" | "after" | "closed";
interface MarketSession { label: string; tone: MarketSessionTone }

function getMarketSession(now = new Date()): MarketSession {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  const mins = Number(get("hour")) * 60 + Number(get("minute"));
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  if (!isWeekday) return { label: "CLOSED", tone: "closed" };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { label: "OPEN", tone: "open" };
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return { label: "PRE-MARKET", tone: "pre" };
  if (mins >= 16 * 60 && mins < 20 * 60) return { label: "AFTER-HOURS", tone: "after" };
  return { label: "CLOSED", tone: "closed" };
}

/* ── live clock ── */
function LiveClock() {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const p = new Intl.DateTimeFormat("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
      }).formatToParts(now);
      const v = (t: Intl.DateTimeFormatPartTypes) => p.find(x => x.type === t)?.value ?? "";
      setDisplay(`${v("weekday")}, ${v("month")} ${v("day")}, ${v("year")}  ·  ${v("hour")}:${v("minute")}:${v("second")} LOCAL`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{display}</span>;
}

/* ── mini SVG oscillator ── */
function MiniOscChart({ values, type }: { values: number[]; type: "rsi" | "macd" }) {
  if (!values.length) return <div className="h-12" />;
  const W = 400, H = 48;
  const lo = type === "rsi" ? 0 : Math.min(...values) - (Math.max(...values) - Math.min(...values)) * 0.1;
  const hi = type === "rsi" ? 100 : Math.max(...values) + (Math.max(...values) - Math.min(...values)) * 0.1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const y70 = y(70), y30 = y(30), y50 = y(50), y0 = y(0);
  return (
    <div className="h-12 relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full block">
        {type === "rsi" && (
          <>
            <line x1="0" x2={W} y1={y70} y2={y70} stroke="var(--destructive)" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.6" />
            <line x1="0" x2={W} y1={y30} y2={y30} stroke="var(--muted-foreground)" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.4" />
            <line x1="0" x2={W} y1={y50} y2={y50} stroke="var(--border)" strokeWidth="1" />
          </>
        )}
        {type === "macd" && (
          <line x1="0" x2={W} y1={y0} y2={y0} stroke="var(--muted-foreground)" strokeWidth="0.5" />
        )}
        <path d={path} fill="none" stroke="var(--foreground)" strokeWidth="1" />
      </svg>
    </div>
  );
}

/* ── stat cell ── */
function StatCell({
  label, value, sub, subPositive
}: { label: string; value: string; sub: string; subPositive?: boolean }) {
  return (
    <div className="px-3 py-2.5 border-r border-border last:border-r-0 flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
      <span className={cn("text-[10px]", subPositive === true ? "text-positive" : subPositive === false ? "text-destructive" : "text-muted-foreground")}>{sub}</span>
    </div>
  );
}

/* ── confidence bar ── */
function ConfBar({ label, value, red }: { label: string; value: number; red?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-0.5">
        <span>{label}</span>
        <span className="text-foreground font-bold">{value}%</span>
      </div>
      <div className="h-1.5 bg-muted border border-border relative">
        <div className={cn("h-full absolute left-0 top-0", red ? "bg-destructive" : "bg-foreground")} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/* ── news item ── */
function NewsItem({ source, time, headline, sentiment, url }: {
  source: string; time: string; headline: string; sentiment: string; url?: string;
}) {
  return (
    <div className="py-2 border-b border-dashed border-border last:border-0">
      <div className="flex justify-between text-[9px] uppercase tracking-[0.1em] text-muted-foreground mb-0.5">
        <span>{source}</span>
        <span>{time}</span>
      </div>
      <div className="text-[11px] leading-[1.45]">
        <span className={cn(
          "inline-block size-1.5 mr-1.5 align-middle",
          sentiment === "bullish" ? "bg-foreground" : sentiment === "bearish" ? "bg-destructive" : "bg-muted-foreground"
        )} />
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline hover:text-positive transition-colors"
          >
            {headline}
          </a>
        ) : (
          <span className="font-medium">{headline}</span>
        )}
      </div>
    </div>
  );
}

/* ── search suggestion type ── */
interface SearchSuggestion {
  symbol: string;
  name: string;
  subtitle: string;
  price?: number;
  changePercent?: number;
}



interface StockApiResponse {
  provider: "demo" | "finnhub" | "polygon";
  refreshSeconds: number | null;
  dataQuality: string;
  updatedAt: string;
  profile: StockProfile;
}

const indicatorOptions: Array<{ id: ChartIndicator; label: string }> = [
  { id: "vwap", label: "VWAP" },
  { id: "ema20", label: "EMA 20" },
  { id: "ema50", label: "EMA 50" },
  { id: "ema200", label: "EMA 200" },
  { id: "bollinger", label: "Bollinger" },
];

function timeframeCount(tf: ChartTimeframe) {
  switch (tf) {
    case "1D": return 90;
    case "1W": return 120;
    case "1M": return 45;
    case "3M": return 90;
    case "YTD": return 160;
    case "1Y": return 220;
    default: return 30;
  }
}

const TIMEFRAMES: ChartTimeframe[] = ["1D", "1W", "1M", "3M", "YTD", "1Y"];
export function DashboardShell() {
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StockProfile>(stocks[0]);
  // ── Watchlist — Google Sheets as source of truth ─────────────────────────
  const {
    tickers: watchlist,
    add: addToWatchlistSheets,
    remove: removeFromWatchlistSheets,
    has: isInWatchlist,
  } = useWatchlist();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedProvider, setFeedProvider] = useState<"demo" | "finnhub" | "polygon">("demo");
  const [dataQuality, setDataQuality] = useState("Demo quote · add FINNHUB_API_KEY or POLYGON_API_KEY for live data");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [apiSuggestions, setApiSuggestions] = useState<SearchSuggestion[]>([]);
  const [chartMode, setChartMode] = useState<ChartMode>("line");
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("1D");
  const [activeIndicators, setActiveIndicators] = useState<ChartIndicator[]>(["vwap", "ema50"]);
  const [marketSession, setMarketSession] = useState<MarketSession>(() => getMarketSession());
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  // ── Live price hook (WS or 12s polling) ──────────────────────────────────
  const liveQuote = useLivePrice(selected.symbol);

  // ── Watchlist batch live prices (WS or 15s polling) ─────────────────────
  const { prices: wlLivePrices } = useLivePrices(watchlist);
  const [watchlistPrices, setWatchlistPrices] = useState<
    Record<string, { price: number; changePercent: number }>
  >({});

  const loadStock = useCallback(async (symbol: string, opts?: { foreground?: boolean }) => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    if (opts?.foreground) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch(`/api/stocks/${encodeURIComponent(sym)}?timeframe=${chartTimeframe}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as StockApiResponse;
      setSelected(data.profile);
      setFeedProvider(data.provider);
      setDataQuality(data.dataQuality);
      setLastUpdated(data.updatedAt);
    } catch {
      setSelected(findStock(sym));
      setFeedProvider("demo");
      setDataQuality("Demo fallback · quote route unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chartTimeframe]);

  useEffect(() => {
    void loadStock(selected.symbol);
    const id = window.setInterval(() => void loadStock(selected.symbol), 30_000);
    return () => window.clearInterval(id);
  }, [loadStock, selected.symbol]);

  useEffect(() => {
    const update = () => setMarketSession(getMarketSession());
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ── Ticker tape live price state ─────────────────────────────────────────
  const [tapePrices, setTapePrices] = useState<Record<string, { val: number; pct: number }>>(() =>
    Object.fromEntries(TAPE_SOURCES.map(s => [s.ticker, { val: s.fallbackVal, pct: s.fallbackPct }]))
  );

  useEffect(() => {
    if (liveQuote.marketStatus === "CLOSED") return;
    async function refreshTape() {
      const results = await Promise.allSettled(
        TAPE_SOURCES.map(async (s) => {
          const res = await fetch(`/api/quote/${encodeURIComponent(s.ticker)}`, { cache: "no-store" });
          if (!res.ok) throw new Error();
          const data = (await res.json()) as { price: number; changePercent: number };
          return { ticker: s.ticker, val: data.price, pct: data.changePercent };
        })
      );
      setTapePrices((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === "fulfilled") next[r.value.ticker] = { val: r.value.val, pct: r.value.pct };
        }
        return next;
      });
    }
    void refreshTape();
    const id = window.setInterval(() => void refreshTape(), 60_000);
    return () => window.clearInterval(id);
  }, [liveQuote.marketStatus]);

  // ── Sync useLivePrices into watchlistPrices state ────────────────────────
  useEffect(() => {
    if (Object.keys(wlLivePrices).length === 0) return;
    setWatchlistPrices((prev) => {
      const next = { ...prev };
      for (const [sym, price] of Object.entries(wlLivePrices)) {
        next[sym] = { price, changePercent: prev[sym]?.changePercent ?? 0 };
      }
      return next;
    });
  }, [wlLivePrices]);

  useEffect(() => {
    if (!searchFocused) { setApiSuggestions([]); return; }
    const ctrl = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?query=${encodeURIComponent(search.trim())}`, { cache: "no-store", signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: SearchSuggestion[] };
        setApiSuggestions(data.suggestions);
      } catch { /* aborted */ }
    }, search.trim() ? 180 : 0);
    return () => { ctrl.abort(); window.clearTimeout(id); };
  }, [search, searchFocused]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const livePrice = liveQuote.price ?? selected.price;
  const priceChange = liveQuote.change ?? selected.change;
  const priceChangePercent = liveQuote.changePercent ?? selected.changePercent;
  const isLiveProvider = feedProvider !== "demo" || liveQuote.isLive;
  const updatedLabel =
    (liveQuote.lastUpdated ?? (lastUpdated ? new Date(lastUpdated) : null))
      ?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }) ?? "—";

  const localSuggestions = useMemo<SearchSuggestion[]>(
    () => getStockSuggestions(search).map(s => ({
      symbol: s.symbol, name: s.name, subtitle: `${s.sector} / ${s.industry}`,
      price: s.price, changePercent: s.changePercent,
    })),
    [search]
  );
  const suggestions = apiSuggestions.length ? apiSuggestions : localSuggestions;
  const showSuggestions = searchFocused && suggestions.length > 0;

  const lineChartData = useMemo(() => {
    if (chartTimeframe !== "1D") {
      return selected.candles
        .slice(-Math.min(timeframeCount(chartTimeframe), selected.candles.length))
        .map(p => ({ label: p.label, value: p.close }));
    }
    return selected.intraday.map((p, i, arr) => ({
      ...p,
      label: i === arr.length - 1 ? "Latest" : p.label,
      value: i === arr.length - 1 ? livePrice : p.value,
    }));
  }, [chartTimeframe, livePrice, selected.candles, selected.intraday]);

  const candleChartData = useMemo(
    () => selected.candles.slice(-Math.min(timeframeCount(chartTimeframe), selected.candles.length)),
    [chartTimeframe, selected.candles]
  );

  const rsiValues = useMemo(() => selected.rsi.map(p => p.value), [selected.rsi]);
  const macdValues = useMemo(() => selected.macd.map(p => p.macd), [selected.macd]);
  const latestRsi = selected.rsi[selected.rsi.length - 1]?.value ?? 50;
  const latestMacd = selected.macd[selected.macd.length - 1]?.macd ?? 0;

  const lastCandle = selected.candles[selected.candles.length - 1];
  const prevClose = livePrice - priceChange;
  const intradayVals = selected.intraday.map(p => p.value);
  const dayLow  = intradayVals.length ? Math.min(...intradayVals) : livePrice;
  const dayHigh = intradayVals.length ? Math.max(...intradayVals) : livePrice;
  const perfVals = selected.performance.map(p => p.value);
  const low52  = perfVals.length ? Math.min(...perfVals) : livePrice;
  const high52 = perfVals.length ? Math.max(...perfVals) : livePrice;
  const vwap = lastCandle?.vwap ?? livePrice;
  const ema50 = lastCandle?.ema50 ?? livePrice;
  const ema200 = lastCandle?.ema200 ?? livePrice;

  const watchlistStocks = watchlist.map(findStock);

  const toggleIndicator = useCallback((id: ChartIndicator) => {
    setActiveIndicators(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }, []);

  function toggleWatchlist(sym: string) {
    if (isInWatchlist(sym)) {
      void removeFromWatchlistSheets(sym);
    } else {
      void addToWatchlistSheets(sym);
    }
  }

  function selectStock(stock: StockProfile) {
    setSelected(stock);
    setSearch("");
    setSearchFocused(false);
  }

  async function runSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const sym = search.trim().toUpperCase();
    if (!sym) return;
    await loadStock(sym, { foreground: true });
    setSearch("");
    setSearchFocused(false);
  }

  const isOpen = marketSession.tone === "open";
  const compact_px = density === "compact";

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-background text-foreground">
      {/* ── Status bar ── */}
      <div className="border-b border-border bg-sidebar px-4 flex items-center justify-between gap-6 text-[11px] text-muted-foreground uppercase tracking-[0.08em] shrink-0 h-7">
        <div className="flex items-center gap-4">
          <span>
            <span className={cn(
              "inline-block size-1.5 mr-1.5 align-middle",
              isOpen ? "animate-blink" : ""
            )} style={{ background: "var(--foreground)" }} />
            NYSE {marketSession.label}
          </span>
          <LiveClock />
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <span className={isLiveProvider ? "text-positive font-semibold" : ""}>FEED: {liveQuote.isLive ? "LIVE" : feedProvider.toUpperCase()}</span>
          <span>INT {liveQuote.pollIntervalMs / 1000}s</span>
          <span>BAR 5m</span>
          <span>UPD {updatedLabel}</span>
        </div>
      </div>

      {/* ── Header (shared nav) ── */}
      <AppNav
        activePage="Dashboard"
        right={
          <div className="flex items-center gap-2">
            {/* Search */}
            <form onSubmit={runSearch} className="relative w-[280px]">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">⌕</span>
              <input
                ref={searchRef}
                value={search}
                onChange={e => { setSearch(e.target.value); setSearchFocused(true); }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Search symbol or company"
                className="w-full border border-border bg-background py-1.5 pl-7 pr-14 text-[13px] outline-none focus:border-foreground transition"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 border border-border bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5">⌘K</span>
              {showSuggestions && (
                <div className="absolute left-0 right-0 top-[calc(100%+1px)] z-50 bg-popover border border-border max-h-[360px] overflow-auto">
                  {suggestions.map(s => (
                    <button key={s.symbol} type="button"
                      onMouseDown={e => { e.preventDefault(); void loadStock(s.symbol, { foreground: true }); setSearch(""); setSearchFocused(false); }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left border-b border-border last:border-0 hover:bg-muted transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-positive">{s.symbol}</span>
                          <span className="truncate text-[11px] text-muted-foreground">{s.name}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">{typeof s.price === "number" ? money.format(s.price) : "—"}</p>
                        {typeof s.changePercent === "number" && (
                          <p className={cn("text-[10px] tabular-nums", s.changePercent >= 0 ? "text-positive" : "text-destructive")}>
                            {formatPct(s.changePercent)}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </form>
            {/* Analyze */}
            <button type="button" disabled={loading}
              onClick={() => { if (search.trim()) void loadStock(search.trim().toUpperCase(), { foreground: true }); }}
              className="hidden sm:block shrink-0 bg-foreground text-background px-4 py-1.5 text-[11px] uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-60 transition border border-foreground"
            >
              {loading ? <RefreshCw className="size-3.5 animate-spin inline" /> : "Analyze ↗"}
            </button>
            {/* Density toggle */}
            <button type="button"
              onClick={() => setDensity(d => d === "comfortable" ? "compact" : "comfortable")}
              className="hidden sm:block shrink-0 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted transition"
            >
              {density === "compact" ? "Full" : "Compact"}
            </button>
          </div>
        }
      />

      {/* ── Ticker tape — live ETF proxies, refreshes every 60s during market hours ── */}
      <div className="border-b border-border h-8 overflow-hidden flex items-center shrink-0 bg-background">
        <div className="inline-flex animate-marquee whitespace-nowrap">
          {[...TAPE_SOURCES, ...TAPE_SOURCES].map((src, i) => {
            const live = tapePrices[src.ticker];
            const val = live?.val ?? src.fallbackVal;
            const pct = live?.pct ?? src.fallbackPct;
            return (
              <div key={i} className="inline-flex items-center gap-2 px-4 border-r border-border text-[11px] tracking-[0.04em] h-8">
                <span className="font-bold">{src.label}</span>
                <span className="tabular-nums">{val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span>
                <span className={cn("tabular-nums", pct >= 0 ? "text-positive" : "text-destructive")}>{formatPct(pct)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main 3-col grid ── */}
      <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: "220px 1fr 380px" }}>

        {/* Left rail: watchlist + top picks */}
        <aside className="border-r border-border bg-sidebar flex flex-col overflow-hidden">
          {/* Watchlist */}
          <div className="border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground bg-background border-b border-border">
              <span>Watchlist · {watchlistStocks.length}</span>
              <button type="button" className="text-[13px] px-2 py-0.5 border border-border hover:bg-muted leading-none">+</button>
            </div>
            <div className="overflow-y-auto max-h-[280px]">
              {watchlistStocks.map(s => {
                const active = s.symbol === selected.symbol;
                const live = watchlistPrices[s.symbol];
                const displayPrice = active
                  ? livePrice
                  : (live?.price ?? s.price);
                const displayPct = active
                  ? priceChangePercent
                  : (live?.changePercent ?? s.changePercent);
                return (
                  <button key={s.symbol} type="button"
                    onClick={() => selectStock(s)}
                    className={cn(
                      "w-full grid items-baseline px-3 py-1.5 border-b border-border text-left transition",
                      active ? "bg-foreground text-background" : "hover:bg-muted"
                    )}
                    style={{ gridTemplateColumns: "1fr auto" }}
                  >
                    <div>
                      <div className="text-[12px] font-bold">{s.symbol}</div>
                      <div className={cn("text-[10px]", active ? "opacity-70" : "text-muted-foreground")}>{s.industry}</div>
                    </div>
                    <div>
                      <div className="text-[12px] text-right tabular-nums">{displayPrice.toFixed(2)}</div>
                      <div className={cn("text-[10px] text-right tabular-nums",
                        active ? "opacity-70" : displayPct >= 0 ? "text-positive" : "text-destructive"
                      )}>{formatPct(displayPct)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top Picks */}
          <div className="flex flex-col overflow-hidden flex-1 min-h-0">
            <div className="px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground bg-background border-b border-border shrink-0">
              Top Picks · AI
            </div>
            <div className="overflow-y-auto flex-1">
              {dailyTopPicks.map(pick => {
                const s = findStock(pick.symbol);
                return (
                  <button key={pick.symbol} type="button"
                    onClick={() => selectStock(s)}
                    className="w-full px-3 py-2.5 border-b border-border text-left hover:bg-muted transition block"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-bold">{pick.symbol}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 border border-foreground leading-tight">{pick.action.toUpperCase()}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-[1.4] mb-1">{pick.thesis}</div>
                    <div className="text-[9px] text-muted-foreground">RISK {pick.risk}/10</div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center: chart + price + stats + oscillators */}
        <section id="chart-panel" className="border-r border-border flex flex-col overflow-y-auto">
          {/* Ticker bar */}
          <div className="border-b border-border shrink-0" style={{ padding: compact_px ? "10px 20px 8px" : "16px 20px 14px" }}>
            <div className="grid gap-6 items-end" style={{ gridTemplateColumns: "auto auto 1fr auto" }}>
              <div className="text-[28px] font-bold tracking-[-0.01em] leading-none">{selected.symbol}</div>
              <div className="flex flex-col gap-0.5">
                <div className="text-[12px] text-muted-foreground">{selected.name}</div>
                <div className="flex">
                  {[selected.sector, selected.industry, "NASDAQ"].map((tag, i, arr) => (
                    <span key={tag} className={cn(
                      "text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 border border-border text-muted-foreground",
                      i < arr.length - 1 ? "border-r-0" : ""
                    )}>{tag}</span>
                  ))}
                </div>
              </div>
              <div />
              <div className="text-right flex flex-col items-end">
                <div
                  key={liveQuote.lastUpdated?.getTime() ?? 0}
                  className={cn(
                    "text-[32px] font-bold tracking-[-0.02em] leading-none tabular-nums",
                    liveQuote.direction === "up" && "animate-price-up",
                    liveQuote.direction === "down" && "animate-price-down"
                  )}
                >
                  {livePrice.toFixed(2)}
                </div>
                <div className={cn("text-sm mt-1 tabular-nums", priceChangePercent >= 0 ? "text-positive" : "text-destructive")}>
                  {priceChangePercent >= 0 ? "▲" : "▼"} {Math.abs(priceChange).toFixed(2)} ({Math.abs(priceChangePercent).toFixed(2)}%)
                </div>
                {liveQuote.marketStatus !== "OPEN" && liveQuote.marketStatus !== "CLOSED" && (
                  <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground border border-border px-1.5 py-0.5">
                    {liveQuote.marketStatus}
                  </div>
                )}
                {liveQuote.marketStatus === "CLOSED" && (
                  <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground border border-border px-1.5 py-0.5">
                    CLOSED · last close
                  </div>
                )}
              </div>
            </div>
            {/* Quick actions */}
            <div className="flex items-center gap-0 mt-3">
              <button type="button" onClick={() => loadStock(selected.symbol)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] border border-r-0 border-border hover:bg-muted transition"
              >
                <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
                Refresh
              </button>
              <button type="button" onClick={() => toggleWatchlist(selected.symbol)}
                className="px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] border border-r-0 border-border hover:bg-muted transition"
              >
                {isInWatchlist(selected.symbol) ? "★ Watchlist" : "+ Watchlist"}
              </button>
              <Link href="/scanner"
                className="px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] border border-r-0 border-border hover:bg-muted transition"
              >
                Scanner
              </Link>
              <Link href={`/stocks/${selected.symbol}`}
                className="px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] border border-border hover:bg-muted transition"
              >
                Detail ↗
              </Link>
              <div className="ml-auto text-[10px] text-muted-foreground px-2">{dataQuality}</div>
            </div>
          </div>

          {/* Chart controls */}
          <div className="border-b border-border bg-sidebar px-5 py-2 flex flex-wrap items-center gap-4 text-[11px] shrink-0">
            {/* Timeframe */}
            <div className="flex">
              {TIMEFRAMES.map((tf, i) => (
                <button key={tf} type="button"
                  onClick={() => setChartTimeframe(tf)}
                  className={cn(
                    "py-1 px-2.5 text-[11px] uppercase tracking-[0.06em] border transition",
                    i < TIMEFRAMES.length - 1 ? "border-r-0" : "",
                    chartTimeframe === tf
                      ? "bg-foreground text-background border-foreground"
                      : "text-muted-foreground hover:bg-muted border-border"
                  )}
                >{tf}</button>
              ))}
            </div>
            {/* Mode */}
            <div className="flex">
              {(["line", "candles"] as ChartMode[]).map((mode, i) => (
                <button key={mode} type="button"
                  onClick={() => setChartMode(mode)}
                  className={cn(
                    "py-1 px-2.5 text-[11px] uppercase tracking-[0.06em] border transition",
                    i === 0 ? "border-r-0" : "",
                    chartMode === mode
                      ? "bg-foreground text-background border-foreground"
                      : "text-muted-foreground hover:bg-muted border-border"
                  )}
                >
                  {mode === "line" ? "Line" : "Candle"}
                </button>
              ))}
            </div>
            {/* Overlays */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mr-1">Overlays</span>
              {indicatorOptions.map(ind => {
                const on = activeIndicators.includes(ind.id);
                return (
                  <label key={ind.id}
                    className={cn(
                      "flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 border cursor-pointer transition",
                      on ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleIndicator(ind.id)} className="sr-only" />
                    {ind.label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Chart */}
          <div className="px-5 pt-4 shrink-0 min-h-0">
            {loading ? (
              <div className="h-64 bg-muted animate-pulse" />
            ) : chartMode === "line" ? (
              <PriceAreaChart data={lineChartData} />
            ) : (
              <PriceCandlestickChart data={candleChartData} indicators={activeIndicators} />
            )}
          </div>

          {/* Stats strip */}
          <div className="border-t border-b border-border shrink-0 grid" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
            <StatCell label="Open" value={lastCandle?.open.toFixed(2) ?? "—"} sub={`Prev ${prevClose.toFixed(2)}`} />
            <StatCell label="Day Range" value={`${dayLow.toFixed(2)} – ${dayHigh.toFixed(2)}`} sub={`Range ${(((dayHigh - dayLow) / prevClose) * 100).toFixed(2)}%`} />
            <StatCell label="52-Week" value={`${low52.toFixed(2)} – ${high52.toFixed(2)}`} sub={`${(((livePrice - low52) / (high52 - low52 || 1)) * 100).toFixed(0)}% of range`} />
            <StatCell label="Volume" value={compact.format(selected.volume)} sub={`${((selected.volume / selected.averageVolume) * 100).toFixed(0)}% of avg`} subPositive={selected.volume >= selected.averageVolume} />
            <StatCell label="Market Cap" value={selected.marketCap} sub={`P/E ${selected.peRatio.toFixed(1)}`} />
            <StatCell label="Beta · Yield" value={`${selected.beta.toFixed(2)} · ${selected.dividendYield.toFixed(2)}%`} sub={`ER ${selected.nextEarningsDate}`} />
          </div>

          {/* RSI + MACD */}
          <div className="border-b border-border shrink-0 grid grid-cols-2">
            <div className="px-4 py-2.5 border-r border-border">
              <div className="flex justify-between items-center text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5">
                <span>RSI (14)</span>
                <span>
                  <span className="text-foreground font-bold tabular-nums">{latestRsi.toFixed(1)}</span>
                  <span className="ml-2 font-normal">
                    {latestRsi > 70 ? "OVERBOUGHT" : latestRsi < 30 ? "OVERSOLD" : "NEUTRAL"}
                  </span>
                </span>
              </div>
              <MiniOscChart values={rsiValues} type="rsi" />
            </div>
            <div className="px-4 py-2.5">
              <div className="flex justify-between items-center text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5">
                <span>MACD (12,26,9)</span>
                <span>
                  <span className="text-foreground font-bold tabular-nums">{latestMacd.toFixed(2)}</span>
                  <span className="ml-2 font-normal">{latestMacd > 0 ? "BULLISH" : "BEARISH"}</span>
                </span>
              </div>
              <MiniOscChart values={macdValues} type="macd" />
            </div>
          </div>
        </section>

        {/* Right rail: AI */}
        <aside className="flex flex-col overflow-y-auto">
          {/* Verdict */}
          <div className="border-b border-border px-4 py-3.5">
            <h3 className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold mb-3">
              <span>AI Recommendation</span>
              <span className="border border-border px-1.5 py-0.5 text-[9px] tracking-[0.08em]">MODEL v3.4</span>
            </h3>
            <div className="grid gap-3 items-end mb-3" style={{ gridTemplateColumns: "1fr auto" }}>
              <div>
                <div className="text-[28px] font-bold tracking-[0.02em] leading-none">{selected.recommendation.toUpperCase()}</div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mt-1">
                  {selected.recommendation === "Buy" ? "Strong signal" : selected.recommendation === "Sell" ? "Weak signal" : "Mixed signal"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[28px] font-bold leading-none tabular-nums">{selected.bullishConfidence}%</div>
                <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Bull confidence</div>
              </div>
            </div>
            {/* Bar */}
            <div className="h-2 border border-border flex mb-3">
              <div className="bg-foreground" style={{ width: `${selected.bullishConfidence}%` }} />
              <div className="flex-1 bg-muted" />
            </div>
            <p className="text-[12px] leading-[1.55] mb-3 text-foreground">{selected.whyThisStock}</p>
            <div className="border-t border-dashed border-border my-3" />
            <div className="grid gap-2 mb-3">
              <ConfBar label="Bullish" value={selected.bullishConfidence} />
              <ConfBar label="Bearish" value={selected.bearishConfidence} red />
            </div>
            <div className="border-t border-dashed border-border my-3" />
            {/* Risk scale */}
            <div className="grid items-center gap-2.5" style={{ gridTemplateColumns: "auto 1fr auto" }}>
              <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Risk</span>
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className={cn("flex-1 h-3 border",
                    i < selected.riskScore ? "bg-foreground border-foreground" : "bg-muted border-border"
                  )} />
                ))}
              </div>
              <span className="text-sm font-bold tabular-nums">{selected.riskScore}/10</span>
            </div>
          </div>

          {/* Signal decomp */}
          <div className="border-b border-border px-4 py-3.5">
            <h3 className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold mb-3">
              <span>Signal Decomposition</span>
              <span className="border border-border px-1.5 py-0.5 text-[9px] tracking-[0.08em]">6 FACTORS</span>
            </h3>
            {selected.reasoning.map(r => (
              <div key={r.label} className="grid gap-2.5 py-2 border-b border-dashed border-border last:border-0 items-start"
                style={{ gridTemplateColumns: "14px 1fr auto" }}
              >
                <div className={cn("size-2 mt-1 border",
                  r.stance === "bullish" ? "bg-foreground border-foreground" :
                  r.stance === "bearish" ? "bg-destructive border-destructive" :
                  "bg-muted border-muted-foreground"
                )} />
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.06em]">{r.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-[1.45]">{r.summary}</div>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">{r.score}/100</div>
              </div>
            ))}
          </div>

          {/* Trade plan */}
          <div className="border-b border-border px-4 py-3.5">
            <h3 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold mb-3">Trade Plan</h3>
            {[
              ["Action", selected.recommendation.toUpperCase()],
              ["Earnings", selected.nextEarningsDate],
              ["VWAP", vwap.toFixed(2)],
              ["EMA 50", ema50.toFixed(2)],
              ["EMA 200", ema200.toFixed(2)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px] py-0.5 border-b border-dashed border-border last:border-0">
                <span className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{k}</span>
                <span className="tabular-nums font-bold">{v}</span>
              </div>
            ))}
            <div className="border-t border-dashed border-border my-3" />
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1">Swing idea</div>
            <p className="text-[12px] leading-[1.5] mb-3">{selected.swingTradeIdea}</p>
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-1">Options flow</div>
            <p className="text-[12px] leading-[1.5]">{selected.unusualOptionsActivity}</p>
          </div>

          {/* Per-ticker news */}
          <div className="px-4 py-3.5">
            <h3 className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold mb-3">
              <span>{selected.symbol} News</span>
              <span className="border border-border px-1.5 py-0.5 text-[9px] tracking-[0.08em]">{selected.news.length}</span>
            </h3>
            {selected.news.map((n, i) => (
              <NewsItem key={i} source={n.source} time={n.publishedAt} headline={n.headline} sentiment={n.sentiment} url={n.url} />
            ))}
          </div>
        </aside>
      </div>

      {/* ── Bottom strip ── */}
      <div className="border-t border-border grid shrink-0" style={{ gridTemplateColumns: "320px 1fr 1fr 380px" }}>
        {/* A: Movers */}
        <section className="border-r border-border px-4 py-3 overflow-y-auto max-h-[260px]">
          <h4 className="flex justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold mb-2">
            <span>Movers</span><span>Session</span>
          </h4>
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground pb-1 mb-1">▲ Gainers</div>
          {topGainers.map(s => (
            <div key={s.symbol}
              onClick={() => selectStock(findStock(s.symbol))}
              className="grid gap-2 py-1 text-[11px] border-b border-dashed border-border last:border-0 cursor-pointer hover:bg-muted"
              style={{ gridTemplateColumns: "1fr auto auto" }}
            >
              <span className="font-bold">{s.symbol}</span>
              <span className="text-right tabular-nums">{s.price.toFixed(2)}</span>
              <span className={cn("text-right tabular-nums", s.changePercent >= 0 ? "text-positive" : "text-destructive")}>
                {formatPct(s.changePercent)}
              </span>
            </div>
          ))}
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground py-1 mt-1 border-y border-border">▼ Losers</div>
          {topLosers.map(s => (
            <div key={s.symbol}
              onClick={() => selectStock(findStock(s.symbol))}
              className="grid gap-2 py-1 text-[11px] border-b border-dashed border-border last:border-0 cursor-pointer hover:bg-muted"
              style={{ gridTemplateColumns: "1fr auto auto" }}
            >
              <span className="font-bold">{s.symbol}</span>
              <span className="text-right tabular-nums">{s.price.toFixed(2)}</span>
              <span className="text-right tabular-nums text-destructive">{s.changePercent.toFixed(2)}%</span>
            </div>
          ))}
        </section>

        {/* B: Heatmap + Sectors */}
        <section className="border-r border-border px-4 py-3 overflow-y-auto max-h-[260px]">
          <h4 className="flex justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold mb-2">
            <span>Heatmap · S&P weighted</span><span>By MCap</span>
          </h4>
          <div className="grid gap-px bg-border border border-border mb-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {heatmap.slice(0, 12).map(h => {
              const intensity = Math.min(0.45, Math.abs(h.changePercent) / 6);
              const isUp = h.changePercent >= 0;
              const s = stocks.find(x => x.symbol === h.symbol);
              return (
                <button key={h.symbol} type="button"
                  onClick={() => s && selectStock(s)}
                  className="bg-background p-2 min-h-[56px] flex flex-col justify-between relative overflow-hidden hover:outline hover:outline-1 hover:outline-foreground hover:-outline-offset-1"
                >
                  <span className="text-[12px] font-bold relative z-10">{h.symbol}</span>
                  <span className={cn("text-[10px] text-right relative z-10 tabular-nums", isUp ? "text-positive" : "text-destructive")}>
                    {formatPct(h.changePercent)}
                  </span>
                  <div className={cn("absolute inset-0 pointer-events-none", isUp ? "bg-foreground" : "bg-destructive")}
                    style={{ opacity: intensity * 0.18 }}
                  />
                </button>
              );
            })}
          </div>
          <div className="border-t border-dashed border-border mb-2" />
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Sectors</div>
          {sectorPerformance.map(s => {
            const pctAbs = Math.min(Math.abs(s.changePercent) / 3, 1) * 50;
            const isUp = s.changePercent >= 0;
            return (
              <div key={s.sector} className="grid gap-2 py-0.5 items-center text-[11px]"
                style={{ gridTemplateColumns: "96px 1fr 56px" }}
              >
                <span className="text-[10px] uppercase tracking-[0.04em] text-muted-foreground truncate">{s.sector}</span>
                <div className="h-2.5 relative" style={{
                  background: "linear-gradient(to right, transparent calc(50% - 0.5px), var(--border) calc(50% - 0.5px), var(--border) calc(50% + 0.5px), transparent calc(50% + 0.5px))"
                }}>
                  <div className={cn("absolute top-0 bottom-0", isUp ? "bg-foreground" : "bg-destructive")}
                    style={isUp ? { left: "50%", width: pctAbs + "%" } : { right: "50%", width: pctAbs + "%" }}
                  />
                </div>
                <span className={cn("text-right tabular-nums", isUp ? "text-positive" : "text-destructive")}>
                  {formatPct(s.changePercent)}
                </span>
              </div>
            );
          })}
        </section>

        {/* C: AI Brief + Fear & Greed */}
        <section className="border-r border-border px-4 py-3 overflow-y-auto max-h-[260px]">
          <h4 className="flex justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold mb-2">
            <span>AI Market Brief</span><span>0930 ET</span>
          </h4>
          <p className="text-[12px] leading-[1.5] mb-3">{dailyMarketSummary}</p>
          <div className="border-t border-dashed border-border mb-3" />
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5">Fear & Greed</div>
          <div className="flex items-center gap-3 mb-2">
            <div className="text-[32px] font-bold leading-none pr-3 border-r border-border shrink-0 tabular-nums">63</div>
            <div className="flex-1">
              <div className="flex h-2.5 border border-border mb-0.5">
                <div className="flex-[0_0_25%] bg-destructive opacity-50" />
                <div className="flex-[0_0_25%] bg-destructive opacity-25" />
                <div className="flex-[0_0_25%] bg-foreground opacity-25" />
                <div className="flex-[0_0_25%] bg-foreground opacity-55" />
              </div>
              <div className="relative h-0">
                <div className="absolute -translate-x-1/2" style={{ left: "63%", top: 0 }}>
                  <div className="size-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent" style={{ borderTopColor: "var(--foreground)" }} />
                </div>
              </div>
              <div className="flex justify-between text-[9px] uppercase tracking-[0.08em] text-muted-foreground mt-1.5">
                <span>Fear</span><span>Neutral</span><span>Greed</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] leading-[1.5] text-muted-foreground">
            Momentum and options demand are supportive. Rates remain the main pressure point.
          </p>
        </section>

        {/* D: Market News */}
        <section className="px-4 py-3 overflow-y-auto max-h-[260px]">
          <h4 className="flex justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold mb-2">
            <span>Market News</span><span>Live</span>
          </h4>
          {marketNews.map((n, i) => (
            <NewsItem key={i} source={n.source} time={n.publishedAt} headline={n.headline} sentiment={n.sentiment} url={n.url} />
          ))}
        </section>
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-border bg-sidebar px-4 py-1.5 text-[10px] text-muted-foreground uppercase tracking-[0.1em] flex justify-between shrink-0">
        <span>HAWKEYE / DESK · Demo feed · Not financial advice</span>
        <span>Session {marketSession.label} · <LiveClock /></span>
      </div>
    </div>
  );
}
