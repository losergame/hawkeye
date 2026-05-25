"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bot,
  CandlestickChart as CandleIcon,
  Check,
  ChevronRight,
  CircleDollarSign,
  BriefcaseBusiness,
  Eye,
  Gauge,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Zap
} from "lucide-react";

import { AssistantPanel } from "@/components/ai/assistant-panel";
import { AlertPanel } from "@/components/alerts/alert-panel";
import { CandlestickChart as PriceCandlestickChart, PriceAreaChart, SectorPerformanceChart } from "@/components/charts";
import { AdvancedTradingPanel } from "@/components/dashboard/advanced-trading-panel";
import { ChartModeToggle, TimeframeToggle } from "@/components/dashboard/chart-controls";
import { MarketList } from "@/components/dashboard/market-list";
import { QuoteContextPanel } from "@/components/dashboard/quote-context-panel";
import type { ChartMode } from "@/components/dashboard/types";
import { WatchlistPanel } from "@/components/dashboard/watchlist-panel";
import { MarketActivityGrid, TopMoversTape } from "@/components/market-data/market-activity-grid";
import { NewsPanel as MarketNewsPanel } from "@/components/market-data/news-panel";
import { PortfolioTrackerPanel } from "@/components/portfolio/portfolio-tracker-panel";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { HawkeyeLogo } from "@/components/shared/ui/hawkeye-logo";
import {
  ChangePill,
  ConfidenceBars,
  InsightIcon,
  MetricTile,
  Panel,
  RecommendationBadge,
  RiskMeter,
  ScrollBody,
  SectionHeader,
  SignalDot,
  Skeleton
} from "@/components/shared/ui";
import { cn } from "@/lib/cn";
import {
  dailyMarketSummary,
  dailyTopPicks,
  findStock,
  getStockSuggestions,
  heatmap,
  mostActive,
  resolveStockSymbol,
  sectorPerformance,
  stocks,
  topGainers,
  topLosers,
  trendingStocks
} from "@/lib/mock-data";
import type { ChartIndicator, ChartTimeframe, ChatMessage, StockProfile } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const easternDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
type FeedProvider = "demo" | "finnhub" | "polygon";
type MarketSessionTone = "open" | "pre" | "after" | "closed";

interface MarketSession {
  label: string;
  detail: string;
  tone: MarketSessionTone;
}

interface StockApiResponse {
  provider: FeedProvider;
  refreshSeconds: number | null;
  dataQuality: string;
  updatedAt: string;
  profile: StockProfile;
}

interface SearchSuggestion {
  symbol: string;
  name: string;
  subtitle: string;
  price?: number;
  changePercent?: number;
  source: "local" | "finnhub";
}

function getEasternMarketTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    weekday: value("weekday"),
    minutes: Number(value("hour")) * 60 + Number(value("minute"))
  };
}

function getMarketSession(now = new Date()): MarketSession {
  const { weekday, minutes } = getEasternMarketTime(now);
  const isWeekday = !["Sat", "Sun"].includes(weekday);

  if (!isWeekday) {
    return {
      label: "Market closed",
      detail: "Regular US session is Monday-Friday, 9:30 AM-4:00 PM ET.",
      tone: "closed"
    };
  }

  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) {
    return {
      label: "Market open",
      detail: "Regular US session is open until 4:00 PM ET.",
      tone: "open"
    };
  }

  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) {
    return {
      label: "Pre-market",
      detail: "Regular US session opens at 9:30 AM ET.",
      tone: "pre"
    };
  }

  if (minutes >= 16 * 60 && minutes < 20 * 60) {
    return {
      label: "After hours",
      detail: "Regular US session closed at 4:00 PM ET.",
      tone: "after"
    };
  }

  return {
    label: "Market closed",
    detail: "Regular US session opens at 9:30 AM ET.",
    tone: "closed"
  };
}

const marketSessionStyles: Record<MarketSessionTone, string> = {
  open: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  pre: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
  after: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  closed: "border-slate-300/15 bg-slate-300/8 text-slate-300"
};

const assistantTickerStopWords = new Set([
  "A",
  "AN",
  "ANY",
  "ARE",
  "BEST",
  "BUY",
  "CAN",
  "FOR",
  "GOOD",
  "HELP",
  "HOLD",
  "HOW",
  "IS",
  "ME",
  "MY",
  "PICK",
  "RATE",
  "SELL",
  "SHOULD",
  "STOCK",
  "STOCKS",
  "THE",
  "THIS",
  "TO",
  "TOP",
  "WHAT",
  "WHEN",
  "WHERE",
  "WHY",
  "YOU"
]);

function extractAssistantTicker(content: string) {
  const cashtag = content.match(/\$([A-Za-z]{1,5}(?:\.[A-Za-z])?)\b/);
  if (cashtag?.[1]) {
    return cashtag[1].toUpperCase();
  }

  const explicitTicker = content.match(/\b(?:analyze|analyse|check|lookup|rate|review)\s+\$?([A-Za-z]{1,5}(?:\.[A-Za-z])?)\b/i);
  if (explicitTicker?.[1] && !assistantTickerStopWords.has(explicitTicker[1].toUpperCase())) {
    return explicitTicker[1].toUpperCase();
  }

  const tokens = content
    .toUpperCase()
    .replace(/[^A-Z0-9. ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const knownSymbol = tokens.find((token) => stocks.some((stock) => stock.symbol === token));
  if (knownSymbol) {
    return knownSymbol;
  }

  for (let start = 0; start < tokens.length; start += 1) {
    for (let length = Math.min(3, tokens.length - start); length > 0; length -= 1) {
      const phrase = tokens.slice(start, start + length).join(" ");
      const resolved = resolveStockSymbol(phrase);
      if (stocks.some((stock) => stock.symbol === resolved)) {
        return resolved;
      }
    }
  }

  const typedUppercaseTicker = content.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g)?.find((token) => !assistantTickerStopWords.has(token));
  return typedUppercaseTicker?.toUpperCase();
}

function getTopPicksMessage() {
  const picks = dailyTopPicks
    .map((pick) => `${pick.symbol} (${pick.action}, risk ${pick.risk}/10): ${pick.thesis}`)
    .join("; ");

  return `For ideas to research, the model's current top picks are ${picks}. Treat these as a watchlist, not financial advice: confirm the live quote, market session, and your risk before trading.`;
}

function getFallbackAssistantMessage() {
  return "Ask me to analyze a ticker like 'analyze MU', or ask for top picks, risk, swing trade ideas, earnings setups, or watchlist names. I will keep general questions separate from ticker analysis.";
}

const navItems = [
  { id: "chart-panel", label: "Dashboard", icon: LayoutDashboard },
  { href: "/scanner", label: "Stock Scanner", icon: Target },
  { id: "watchlist-section", label: "Watchlist", icon: Eye },
  { id: "portfolio-section", label: "Portfolio", icon: BriefcaseBusiness },
  { id: "alerts-section", label: "Settings", icon: Settings }
];

const indicatorOptions: Array<{ id: ChartIndicator; label: string }> = [
  { id: "vwap", label: "VWAP" },
  { id: "ema20", label: "EMA 20" },
  { id: "ema50", label: "EMA 50" },
  { id: "ema200", label: "EMA 200" },
  { id: "bollinger", label: "Bollinger" }
];

function timeframeCount(timeframe: ChartTimeframe) {
  switch (timeframe) {
    case "1D":
      return 90;
    case "1W":
      return 120;
    case "1M":
      return 45;
    case "3M":
      return 90;
    case "YTD":
      return 160;
    case "1Y":
      return 220;
    default:
      return 30;
  }
}

export function DashboardShell() {
  const headerRef = useRef<HTMLElement | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StockProfile>(stocks[0]);
  const [watchlist, setWatchlist] = useState(["NVDA", "MSFT", "AMD", "META"]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedProvider, setFeedProvider] = useState<FeedProvider>("demo");
  const [dataQuality, setDataQuality] = useState("Demo quote. Add FINNHUB_API_KEY or POLYGON_API_KEY for market data.");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [apiSuggestions, setApiSuggestions] = useState<SearchSuggestion[]>([]);
  const [chartMode, setChartMode] = useState<ChartMode>("line");
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("1D");
  const [activeIndicators, setActiveIndicators] = useState<ChartIndicator[]>(["vwap", "ema20", "ema50"]);
  const [dashboardCompact, setDashboardCompact] = useState(false);
  const [marketSession, setMarketSession] = useState<MarketSession>(() => getMarketSession());
  const [headerHeight, setHeaderHeight] = useState(0);
  const [headerCompact, setHeaderCompact] = useState(false);
  const [simpleSignalOpen, setSimpleSignalOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("Analyze NVDA for me");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Ask for a ticker analysis, swing setup, earnings play, or risk read. I will answer using the live dashboard context."
    }
  ]);

  const loadStock = useCallback(async (symbol: string, options?: { announce?: boolean; foreground?: boolean }) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    if (options?.foreground) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const response = await fetch(`/api/stocks/${encodeURIComponent(normalized)}?timeframe=${chartTimeframe}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Quote request failed");
      }

      const data = (await response.json()) as StockApiResponse;
      setSelected(data.profile);
      setFeedProvider(data.provider);
      setDataQuality(data.dataQuality);
      setLastUpdated(data.updatedAt);
      setFeedError(null);

      if (options?.announce) {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: `${data.profile.symbol}: ${data.profile.recommendation}. ${data.profile.whyThisStock} Risk ${data.profile.riskScore}/10, bullish confidence ${data.profile.bullishConfidence}%.`
          }
        ]);
      }
    } catch {
      const fallback = findStock(normalized);
      setSelected(fallback);
      setFeedProvider("demo");
      setDataQuality("Demo fallback shown because the quote route could not refresh.");
      setFeedError("Quote refresh failed. Showing local demo data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chartTimeframe]);

  useEffect(() => {
    void loadStock(selected.symbol);
    const id = window.setInterval(() => {
      void loadStock(selected.symbol);
    }, 30_000);

    return () => window.clearInterval(id);
  }, [loadStock, selected.symbol]);

  useEffect(() => {
    const updateMarketSession = () => setMarketSession(getMarketSession());
    updateMarketSession();
    const id = window.setInterval(updateMarketSession, 60_000);

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setSimpleSignalOpen(false);
  }, [selected.symbol]);

  useEffect(() => {
    if (!searchFocused) {
      setApiSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/stocks/search?query=${encodeURIComponent(search.trim())}`, {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) return;
        const data = (await response.json()) as { suggestions: SearchSuggestion[] };
        setApiSuggestions(data.suggestions);
      } catch {
        if (!controller.signal.aborted) {
          setApiSuggestions([]);
        }
      }
    }, search.trim() ? 180 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(id);
    };
  }, [search, searchFocused]);

  const livePrice = selected.price;
  const selectedChange = selected.changePercent;
  const watchlistStocks = watchlist.map(findStock);
  const isLiveProvider = feedProvider !== "demo";
  const feedLabel = feedProvider === "demo" ? "Demo feed" : `${feedProvider} quote`;
  const updatedLabel = lastUpdated ? new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "Not refreshed yet";
  const chartDateLabel = easternDate.format(lastUpdated ? new Date(lastUpdated) : new Date());
  const chartSubtitle =
    chartMode === "line"
      ? `${chartDateLabel} ET ${chartTimeframe} view, session anchors plus latest quote`
      : `${chartDateLabel} ET ${chartTimeframe} OHLC view with volume`;
  const localSearchSuggestions = useMemo<SearchSuggestion[]>(
    () =>
      getStockSuggestions(search).map((stock) => ({
        symbol: stock.symbol,
        name: stock.name,
        subtitle: `${stock.sector} / ${stock.industry}`,
        price: stock.price,
        changePercent: stock.changePercent,
        source: "local"
      })),
    [search]
  );
  const searchSuggestions = apiSuggestions.length ? apiSuggestions : localSearchSuggestions;
  const showSearchSuggestions = searchFocused && searchSuggestions.length > 0;
  const secondarySignal =
    selected.analystRating.trim().toLowerCase() === selected.recommendation.trim().toLowerCase()
      ? `${selected.bullishConfidence}% bullish confidence`
      : `${selected.analystRating} analyst sentiment`;
  const confidenceBreakdown =
    selected.confidenceBreakdown ??
    selected.reasoning.map((item) => ({
      label: item.label,
      weight: item.weight ?? 12,
      score: item.score,
      detail: item.summary
    }));
  const simpleSignal =
    selected.eli5Summary ??
    (selected.recommendation === "Buy"
      ? "This stock is acting strong. Buyers are paying up, but you still need a plan."
      : selected.recommendation === "Sell"
        ? "This stock is acting weak. It needs to prove itself before it deserves attention."
        : "This stock is mixed. Waiting for a clearer move is the smarter choice.");
  const lineChartData = useMemo(() => {
    if (chartTimeframe !== "1D") {
      return selected.candles.slice(-Math.min(timeframeCount(chartTimeframe), selected.candles.length)).map((point) => ({
        label: point.label,
        value: point.close
      }));
    }

    return selected.intraday.map((point, index, points) => ({
        ...point,
        label: index === points.length - 1 ? "Latest" : point.label,
        value: index === points.length - 1 ? livePrice : point.value
      }));
  }, [chartTimeframe, livePrice, selected.candles, selected.intraday]);
  const candleChartData = useMemo(
    () => selected.candles.slice(-Math.min(timeframeCount(chartTimeframe), selected.candles.length)),
    [chartTimeframe, selected.candles]
  );
  const toggleIndicator = useCallback((indicator: ChartIndicator) => {
    setActiveIndicators((current) => (current.includes(indicator) ? current.filter((item) => item !== indicator) : [...current, indicator]));
  }, []);

  useEffect(() => {
    const syncHeaderHeight = () => {
      const measuredHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
      if (!measuredHeight) return;
      const boundedHeight = Math.min(measuredHeight, 180);
      setHeaderHeight((currentHeight) => Math.max(currentHeight, boundedHeight));
    };

    syncHeaderHeight();
    const observer = new ResizeObserver(syncHeaderHeight);
    if (headerRef.current) observer.observe(headerRef.current);

    window.addEventListener("resize", syncHeaderHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncHeaderHeight);
    };
  }, []);

  useEffect(() => {
    const syncCompactHeader = () => {
      setHeaderCompact((isCompact) => window.scrollY > (isCompact ? 24 : 72));
    };

    syncCompactHeader();
    window.addEventListener("scroll", syncCompactHeader, { passive: true });
    return () => window.removeEventListener("scroll", syncCompactHeader);
  }, []);

  const scrollToSection = useCallback((id: string) => {
    window.requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;

      const lockedHeaderHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
      const targetTop = target.getBoundingClientRect().top + window.scrollY - lockedHeaderHeight - 16;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    });
  }, []);

  const selectStockAndFocus = useCallback(
    (stock: StockProfile) => {
      setSelected(stock);
      window.setTimeout(() => scrollToSection("chart-panel"), 0);
    },
    [scrollToSection]
  );

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = search.trim().toUpperCase();
    if (!symbol) return;

    await loadStock(symbol, { announce: true, foreground: true });
    setSearch("");
    scrollToSection("chart-panel");
  }

  function toggleWatchlist(symbol: string) {
    setWatchlist((current) => (current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]));
  }

  async function handleAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = assistantInput.trim();
    if (!content) return;

    setAssistantInput("");

    const symbol = extractAssistantTicker(content);
    const isTopPickQuestion = /\b(buy|best|pick|picks|recommend|recommendation|watchlist|idea|ideas)\b/i.test(content);

    if (!symbol) {
      setMessages((current) => [
        ...current,
        { role: "user", content },
        {
          role: "assistant",
          content: isTopPickQuestion ? getTopPicksMessage() : getFallbackAssistantMessage()
        }
      ]);
      return;
    }

    let stock = findStock(symbol);

    try {
      const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}?timeframe=${chartTimeframe}`, { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as StockApiResponse;
        stock = data.profile;
        setSelected(data.profile);
        setFeedProvider(data.provider);
        setDataQuality(data.dataQuality);
        setLastUpdated(data.updatedAt);
        setFeedError(null);
      }
    } catch {
      stock = findStock(symbol);
    }

    setMessages((current) => [
      ...current,
      { role: "user", content },
      {
        role: "assistant",
        content: `${stock.symbol} is a ${stock.recommendation.toUpperCase()} in this model. ${stock.shortTermTrend} ${stock.swingTradeIdea} Options note: ${stock.unusualOptionsActivity}`
      }
    ]);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030712] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(120deg,rgba(20,184,166,0.15),transparent_34%),linear-gradient(240deg,rgba(244,63,94,0.12),transparent_33%),linear-gradient(180deg,rgba(15,23,42,0),#030712_82%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:32px_32px]" />

      <header
        ref={headerRef}
        className={cn(
          "fixed left-0 right-0 top-0 z-[100] border-b border-white/10 bg-[#030712]/94 shadow-2xl shadow-black/25 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-500 ease-out",
          headerCompact && "border-cyan-300/15 bg-[#030712]/97 shadow-black/35"
        )}
      >
        <div
          className={cn(
            "mx-auto flex max-w-[1500px] flex-col px-4 transition-[gap,padding] duration-500 ease-out lg:px-6 xl:flex-row xl:items-center xl:justify-between",
            headerCompact ? "gap-2 py-2" : "gap-3 py-3"
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              onClick={(event) => {
                if (window.location.pathname === "/") {
                  event.preventDefault();
                  scrollToSection("chart-panel");
                }
              }}
              className="group flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            >
              <HawkeyeLogo compact={headerCompact} />
            </Link>
            <div className="hidden h-8 w-px bg-white/10 md:block" />
            <nav className="hidden items-center gap-1 rounded-lg border border-white/10 bg-white/[0.035] p-1 text-xs font-semibold text-slate-400 lg:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                const className = cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 transition hover:bg-white/[0.07] hover:text-white",
                  item.id === "chart-panel" && "bg-cyan-300/12 text-cyan-50"
                );

                return item.href ? (
                  <Link key={item.label} href={item.href} className={className}>
                    <Icon className="size-3.5" />
                    {item.label}
                  </Link>
                ) : (
                  <button key={item.label} type="button" onClick={() => item.id && scrollToSection(item.id)} className={className}>
                    <Icon className="size-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className={cn("flex flex-wrap text-slate-300 transition-all duration-300", headerCompact ? "gap-1 text-xs" : "gap-2 text-sm")}>
              <span className={cn("rounded-full border transition-all", marketSessionStyles[marketSession.tone], headerCompact ? "px-2.5 py-0.5" : "px-3 py-1")} title={marketSession.detail}>
                {marketSession.label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border transition-all",
                  headerCompact ? "px-2.5 py-0.5" : "px-3 py-1",
                  isLiveProvider ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100"
                )}
              >
                <span className={cn("size-2 rounded-full", isLiveProvider ? "bg-cyan-200" : "bg-amber-200")} />
                {feedLabel}
              </span>
              <span className={cn("rounded-full border border-white/10 bg-white/5 transition-all", headerCompact ? "px-2.5 py-0.5" : "px-3 py-1")}>Updated {updatedLabel}</span>
              <button
                type="button"
                onClick={() => setDashboardCompact((value) => !value)}
                className={cn(
                  "rounded-full border font-semibold transition",
                  headerCompact ? "px-2.5 py-0.5" : "px-3 py-1",
                  dashboardCompact ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/[0.08]"
                )}
              >
                {dashboardCompact ? "Compact on" : "Compact"}
              </button>
              <ThemeToggle compact={headerCompact} />
            </div>
          </div>

          <form onSubmit={runSearch} className={cn("relative flex w-full flex-col gap-3 sm:flex-row xl:max-w-xl", headerCompact && "xl:max-w-lg")}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onInput={(event) => {
                  setSearch(event.currentTarget.value);
                  setSearchFocused(true);
                }}
                onPointerDown={() => {
                  setSearchFocused(true);
                  if (search.trim().toUpperCase() === selected.symbol) {
                    setSearch("");
                  }
                }}
                onKeyDown={() => setSearchFocused(true)}
                onFocus={(event) => {
                  setSearchFocused(true);
                  event.currentTarget.select();
                }}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                className={cn(
                  "w-full rounded-lg border border-white/10 bg-white/[0.06] pl-10 pr-4 text-sm text-white outline-none transition focus:border-cyan-300/50 focus:bg-white/[0.09]",
                  headerCompact ? "h-9" : "h-11"
                )}
                placeholder="Search ticker or company"
              />
              {showSearchSuggestions ? (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-lg border border-white/10 bg-[#111827]/98 shadow-2xl shadow-black/45 backdrop-blur-xl">
                  <div className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {search.trim() ? "Suggested stocks" : "Recommended stocks"}
                  </div>
                  <div className="max-h-[420px] overflow-y-auto py-1">
                    {searchSuggestions.map((stock) => (
                      <button
                        key={stock.symbol}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setSearchFocused(false);
                          setSearch("");
                          void loadStock(stock.symbol, { announce: true, foreground: true }).then(() => scrollToSection("chart-panel"));
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.08]"
                      >
                        <Search className="size-4 shrink-0 text-slate-400" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{stock.symbol}</span>
                              <span className="truncate text-sm text-slate-400">{stock.name}</span>
                            </div>
                          <p className="truncate text-xs text-slate-500">{stock.subtitle}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">{typeof stock.price === "number" ? money.format(stock.price) : "Live lookup"}</p>
                          {typeof stock.changePercent === "number" ? <ChangePill value={stock.changePercent} /> : <span className="text-xs text-cyan-200">Finnhub</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              disabled={loading}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70",
                headerCompact ? "h-9" : "h-11"
              )}
            >
              {loading ? <RefreshCw className="size-4 animate-spin" /> : <Zap className="size-4" />}
              {loading ? "Refreshing" : "Analyze"}
            </button>
          </form>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        style={{ paddingTop: headerHeight ? headerHeight + 16 : undefined }}
        className={cn("relative z-10 mx-auto grid max-w-[1680px] [grid-auto-flow:dense] px-4 pb-4 pt-32 outline-none lg:px-5", dashboardCompact ? "gap-2" : "gap-3")}
      >
        <TopMoversTape onPick={selectStockAndFocus} />

        <div className={cn("grid items-start [grid-auto-flow:dense] xl:grid-cols-[minmax(0,1.45fr)_420px]", dashboardCompact ? "gap-2" : "gap-3")}>
          <div className={cn("grid min-w-0", dashboardCompact ? "gap-2" : "gap-3")}>
          <Panel id="chart-panel" className="scroll-mt-24 min-w-0" tight>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold text-white">{selected.symbol}</h1>
                  <RecommendationBadge action={selected.recommendation} />
                  <ChangePill value={selectedChange} />
                </div>
                <p className="max-w-3xl text-sm leading-6 text-slate-300">{selected.name} · {selected.industry} · {selected.sector}</p>
                <div className="mt-2 flex max-w-3xl items-start gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-slate-300">
                  <AlertCircle className={cn("mt-0.5 size-4 shrink-0", isLiveProvider ? "text-cyan-200" : "text-amber-200")} />
                  <span>{dataQuality}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => loadStock(selected.symbol)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white transition hover:bg-white/[0.1]"
                >
                  <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
                  Refresh
                </button>
                <button
                  onClick={() => toggleWatchlist(selected.symbol)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white transition hover:bg-white/[0.1]"
                >
                  {watchlist.includes(selected.symbol) ? <Check className="size-4 text-emerald-200" /> : <Plus className="size-4" />}
                  Watchlist
                </button>
                <Link
                  href="/scanner"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 text-sm text-emerald-100 transition hover:bg-emerald-300/15"
                >
                  <Zap className="size-4" />
                  Scanner
                </Link>
                <Link
                  href={`/stocks/${selected.symbol}`}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 text-sm text-cyan-100 transition hover:bg-cyan-300/15"
                >
                  Detail
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="grid gap-4">
                <Skeleton className="h-72" />
                <div className="grid gap-3 sm:grid-cols-4">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Price chart</p>
                    <p className="mt-1 text-xs text-slate-500">{chartSubtitle}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-3 py-1 text-xs font-semibold text-cyan-100">
                      {chartDateLabel} ET
                    </span>
                    <TimeframeToggle value={chartTimeframe} onChange={setChartTimeframe} />
                    <ChartModeToggle value={chartMode} onChange={setChartMode} />
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {indicatorOptions.map((indicator) => {
                    const active = activeIndicators.includes(indicator.id);
                    return (
                      <button
                        key={indicator.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleIndicator(indicator.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-semibold transition",
                          active ? "border-cyan-300/35 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.07] hover:text-white"
                        )}
                      >
                        {indicator.label}
                      </button>
                    );
                  })}
                </div>
                {chartMode === "line" ? (
                  <PriceAreaChart data={lineChartData} />
                ) : (
                  <PriceCandlestickChart data={candleChartData} indicators={activeIndicators} />
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricTile
                    icon={<RefreshCw className={cn("size-4 text-emerald-200", refreshing && "animate-spin")} />}
                    label="Market price"
                    value={money.format(livePrice)}
                    caption={isLiveProvider ? `Auto-refreshes every 30s from ${feedProvider}.` : "Demo quote until a market-data key is configured."}
                  />
                  <MetricTile icon={<Gauge className="size-4 text-cyan-200" />} label="Volume" value={compact.format(selected.volume)} caption={`${compact.format(selected.averageVolume)} avg volume`} />
                  <MetricTile icon={<CircleDollarSign className="size-4 text-amber-200" />} label="Market cap" value={selected.marketCap} caption={`P/E ${selected.peRatio}`} />
                  <MetricTile icon={<Shield className="size-4 text-rose-200" />} label="Beta" value={selected.beta.toFixed(2)} caption={`${selected.dividendYield.toFixed(2)}% dividend yield`} />
                </div>
                <QuoteContextPanel stock={selected} sessionData={lineChartData} />
              </>
            )}
          </Panel>

            <div id="market-pulse" className={cn("grid scroll-mt-24 items-start md:grid-cols-2", dashboardCompact ? "gap-2" : "gap-3")}>
              <MarketList title="Top gainers" icon={<TrendingUp className="size-5 text-emerald-200" />} items={topGainers} onPick={selectStockAndFocus} />
              <MarketList title="Top losers" icon={<TrendingDown className="size-5 text-rose-200" />} items={topLosers} onPick={selectStockAndFocus} />
            </div>
          </div>

          <div className={cn("grid self-start", dashboardCompact ? "gap-2" : "gap-3")}>
            <Panel tight className="flex min-h-[740px] max-h-[823px] flex-col self-start">
              <SectionHeader eyebrow="AI recommendation" title="Decision engine" action={<Bot className="size-5 text-cyan-200" />} />
              <ScrollBody>
                {feedError ? <p className="mb-4 rounded-lg border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{feedError}</p> : null}
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Current signal</p>
                    <div className="mt-2 flex items-center gap-3">
                      <RecommendationBadge action={selected.recommendation} />
                      <span className="text-sm text-slate-300">{secondarySignal}</span>
                    </div>
                  </div>
                  <p className="text-right text-3xl font-semibold text-white">{selected.bullishConfidence}%</p>
                </div>
                <p className="mb-3 text-sm leading-6 text-slate-300">{selected.whyThisStock}</p>
                <button
                  type="button"
                  onClick={() => setSimpleSignalOpen((value) => !value)}
                  className="mb-3 inline-flex h-8 items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.12]"
                >
                  <Bot className="size-3.5" />
                  Explain like I am 5
                </button>
                {simpleSignalOpen ? (
                  <div className="mb-5 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.07] p-3 text-sm leading-6 text-cyan-50">
                    {simpleSignal}
                  </div>
                ) : null}
                <div className="mb-5 grid gap-4">
                  <RiskMeter score={selected.riskScore} />
                  <ConfidenceBars bullish={selected.bullishConfidence} bearish={selected.bearishConfidence} />
                </div>
                <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.035] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Confidence weights</p>
                    <span className="text-xs text-slate-500">Model logic</span>
                  </div>
                  <div className="grid gap-2">
                    {confidenceBreakdown.slice(0, 5).map((factor) => (
                      <div key={factor.label}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                          <span className="font-semibold text-slate-300">{factor.label}</span>
                          <span className="text-slate-500">
                            {factor.weight}% / {factor.score}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(6, Math.min(100, factor.score))}%` }} />
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{factor.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3">
                  {selected.reasoning.map((item) => (
                    <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-semibold text-white">
                          <SignalDot stance={item.stance} />
                          {item.label}
                        </span>
                        <span className="text-xs text-slate-400">{item.score}/100</span>
                      </div>
                      <p className="text-sm leading-5 text-slate-300">{item.summary}</p>
                    </div>
                  ))}
                </div>
              </ScrollBody>
            </Panel>
            <MarketList title="Most active" icon={<CandleIcon className="size-5 text-cyan-200" />} items={mostActive} onPick={selectStockAndFocus} className="min-h-[260px] max-h-[300px]" />
            <Panel tight className="flex min-h-[190px] max-h-[220px] flex-col self-start">
              <SectionHeader title="Fear & greed" eyebrow="Sentiment" action={<Gauge className="size-5 text-amber-200" />} />
              <div className="flex items-center gap-4">
                <div className="grid size-20 shrink-0 place-items-center rounded-full border border-amber-200/20 bg-[conic-gradient(from_180deg,#fb7185_0_18%,#fbbf24_18%_58%,#34d399_58%_100%)] p-1">
                  <div className="grid size-full place-items-center rounded-full bg-[#07111f]">
                    <div className="text-center">
                      <p className="text-xl font-bold text-white">63</p>
                      <p className="text-[11px] text-slate-400">Greed</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm text-slate-300">
                  <p>Momentum and options demand are supportive.</p>
                  <p className="text-slate-400">Rates remain the main pressure point.</p>
                </div>
              </div>
            </Panel>
          </div>
        </div>

        <MarketActivityGrid compactMode={dashboardCompact} />

        <div id="news-section" className={cn("grid scroll-mt-24 items-start [grid-auto-flow:dense] xl:grid-cols-[minmax(0,0.95fr)_minmax(460px,0.75fr)]", dashboardCompact ? "gap-2" : "gap-3")}>
          <Panel tight className="flex min-h-[300px] max-h-[500px] flex-col self-start">
            <SectionHeader eyebrow="Daily market summary" title="AI market brief" action={<InsightIcon type="ai" />} />
            <p className="mb-5 max-w-5xl text-sm leading-6 text-slate-300">{dailyMarketSummary}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {dailyTopPicks.map((pick) => (
                <button
                  key={pick.symbol}
                  onClick={() => selectStockAndFocus(findStock(pick.symbol))}
                  className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.075]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-lg font-semibold text-white">{pick.symbol}</span>
                    <RecommendationBadge action={pick.action} />
                  </div>
                  <p className="text-sm leading-5 text-slate-300">{pick.thesis}</p>
                  <p className="mt-2 text-xs text-slate-500">Risk {pick.risk}/10</p>
                </button>
              ))}
            </div>
          </Panel>

          <MarketNewsPanel selected={selected} />
        </div>

        <div id="portfolio-section" className={cn("grid scroll-mt-24 [grid-auto-flow:dense] xl:grid-cols-[minmax(0,1fr)_minmax(540px,0.82fr)]", dashboardCompact ? "gap-2" : "gap-3")}>
          <PortfolioTrackerPanel className="h-full" onPickSymbol={(symbol) => selectStockAndFocus(findStock(symbol))} />

          <div className="grid gap-3 self-start">
            <Panel tight>
              <SectionHeader eyebrow="Market heatmap" title="Sector pulse" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {heatmap.map((tile) => (
                  <button
                    key={tile.symbol}
                    onClick={() => selectStockAndFocus(findStock(tile.symbol))}
                    className={cn(
                      "min-h-20 rounded-lg border p-3 text-left transition hover:scale-[1.015]",
                      tile.changePercent >= 0
                        ? "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100"
                        : "border-rose-300/20 bg-rose-400/[0.08] text-rose-100"
                    )}
                    style={{ gridColumn: tile.weight > 14 ? "span 2" : undefined }}
                  >
                    <p className="text-sm font-bold">{tile.symbol}</p>
                    <p className="mt-1 text-xs opacity-75">{tile.sector}</p>
                    <p className="mt-3 text-lg font-semibold">{tile.changePercent > 0 ? "+" : ""}{tile.changePercent.toFixed(2)}%</p>
                  </button>
                ))}
              </div>
            </Panel>
            <AdvancedTradingPanel selected={selected} />
            <Panel tight>
              <SectionHeader eyebrow="Sector performance" title="Breadth monitor" />
              <SectorPerformanceChart data={sectorPerformance} />
            </Panel>
            <AssistantPanel input={assistantInput} messages={messages} onInput={setAssistantInput} onSubmit={handleAssistant} />
          </div>
        </div>

        <div
          className={cn(
            "grid items-start [grid-auto-flow:dense] xl:grid-cols-[minmax(320px,0.95fr)_minmax(420px,1.3fr)_minmax(340px,1.05fr)]",
            dashboardCompact ? "gap-2" : "gap-3"
          )}
        >
          <div id="watchlist-section" className="scroll-mt-24">
            <WatchlistPanel stocks={watchlistStocks} selected={selected.symbol} onPick={selectStockAndFocus} onToggle={toggleWatchlist} />
          </div>

          <Panel tight className="flex min-h-[460px] max-h-[600px] flex-col self-start">
            <SectionHeader eyebrow="Trending" title="Stocks in focus" action={<Star className="size-5 text-amber-200" />} />
            <ScrollBody className="grid gap-2">
              {trendingStocks.map((item) => (
                <button
                  key={item.symbol}
                  onClick={() => selectStockAndFocus(findStock(item.symbol))}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-left transition hover:bg-white/[0.075]"
                >
                  <div>
                    <p className="font-semibold text-white">{item.symbol}</p>
                    <p className="text-sm text-slate-400">{item.topic}</p>
                  </div>
                  <SignalDot stance={item.sentiment} />
                </button>
              ))}
            </ScrollBody>
          </Panel>

          <div id="alerts-section" className="scroll-mt-24">
            <AlertPanel selected={selected} />
          </div>
        </div>
      </main>
    </div>
  );
}
