import { type NextRequest, NextResponse } from "next/server";

import {
  runFullScan, scanTicker, getTickerList,
  isDeadTicker, isValidQuote, MIN_TRADEABLE_PRICE,
} from "@/lib/scanner-engine";
import {
  getHistoricalCandles, getCachedReal, getCandleCoverage,
  prefetchTickers, MIN_BARS_SUFFICIENT,
} from "@/lib/real-candles";
import { readSetting } from "@/lib/google-sheets";
import type { OHLCBar } from "@/lib/indicators";
import type { StockSetup, StockSetupType } from "@/lib/types";

// ── Cache (5-minute TTL per universe) ─────────────────────────────────────

interface CacheEntry {
  results:        StockSetup[];
  totalScanned:   number;
  realScanned:    number;
  syntheticScanned: number;
  skippedCount:   number;
  universe:       string;
  ts:             number;
  candleSource:   "real" | "delayed" | "mock";
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key: string): CacheEntry | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return e;
}

// ── Market hours ──────────────────────────────────────────────────────────

function marketStatus(): "OPEN" | "PRE-MARKET" | "AFTER-HOURS" | "CLOSED" {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  const mins = Number(get("hour")) * 60 + Number(get("minute"));
  if (["Sat", "Sun"].includes(weekday)) return "CLOSED";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "OPEN";
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "PRE-MARKET";
  if (mins >= 16 * 60 && mins < 20 * 60) return "AFTER-HOURS";
  return "CLOSED";
}

// ── Batch live price fetch ────────────────────────────────────────────────

async function fetchLivePrices(tickers: string[]): Promise<Map<string, number>> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key || tickers.length === 0) return new Map();
  const prices = new Map<string, number>();
  const BATCH = 20;
  for (let i = 0; i < tickers.length && i < 60; i += BATCH) {
    await Promise.allSettled(
      tickers.slice(i, i + BATCH).map(async (sym) => {
        try {
          const res = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`,
            { next: { revalidate: 30 } },
          );
          if (!res.ok) return;
          const data: { c?: number } = await res.json();
          if (data.c && data.c > 0) prices.set(sym, data.c);
        } catch { /* ignore */ }
      }),
    );
  }
  return prices;
}

// ── Fetch real candles for a set of tickers (with API calls) ─────────────

async function fetchRealCandles(tickers: string[]): Promise<{
  candles:       Map<string, OHLCBar[]>;
  sources:       Map<string, "real" | "delayed" | "mock">;
  overallSource: "real" | "delayed" | "mock";
}> {
  const candles = new Map<string, OHLCBar[]>();
  const sources = new Map<string, "real" | "delayed" | "mock">();
  let overallSource: "real" | "delayed" | "mock" = "mock";

  if (!process.env.FINNHUB_API_KEY && !process.env.POLYGON_API_KEY) {
    return { candles, sources, overallSource };
  }

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      const result = await getHistoricalCandles(ticker);
      if (result.bars.length >= 20) {
        candles.set(ticker, result.bars);
        sources.set(ticker, result.quality);
        if (result.quality === "real") overallSource = "real";
        else if (result.quality === "delayed" && overallSource === "mock") {
          overallSource = "delayed";
        }
      }
    }),
  );

  return { candles, sources, overallSource };
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const universe     = (searchParams.get("universe") || "sp500").toLowerCase();
  const page         = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize     = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || "25")));
  const setupFilter  = searchParams.get("setups");
  const searchQuery  = (searchParams.get("q") || "").toLowerCase();
  const forceRefresh = searchParams.get("refresh") === "1";
  const mktStatus    = marketStatus();
  const cacheKey     = universe;

  let cached = forceRefresh ? null : getCached(cacheKey);

  // Read allowSyntheticData setting — default OFF (false)
  let allowSynthetic = false;
  try {
    const setting = await readSetting("allowSyntheticData");
    allowSynthetic = setting === "true";
  } catch { /* default false */ }

  let deadSkippedOnScan = 0;

  if (!cached) {
    const rawTickers = getTickerList(universe);
    deadSkippedOnScan = rawTickers.filter((t) => isDeadTicker(t.ticker)).length;
    const tickers    = rawTickers.filter((t) => !isDeadTicker(t.ticker));
    const tickerMap  = new Map(tickers.map((t) => [t.ticker, t]));

    let allResults:       StockSetup[] = [];
    let realScanned       = 0;
    let syntheticScanned  = 0;
    let skippedCount      = 0;
    let overallSource: "real" | "delayed" | "mock" = "mock";

    if (!allowSynthetic) {
      // ── Real-only mode ──────────────────────────────────────────────────
      // Use only what is already in the 4-hour cache. No new API calls here.
      // Any ticker not cached is skipped; a background prefetch is triggered.

      const realTickers:   Array<{ ticker: string; bars: OHLCBar[]; quality: "real" | "delayed" | "mock" }> = [];
      const missingTickers: string[] = [];

      for (const t of tickers) {
        const cr = getCachedReal(t.ticker);
        if (cr) {
          realTickers.push({ ticker: t.ticker, bars: cr.bars, quality: cr.quality });
        } else {
          missingTickers.push(t.ticker);
          skippedCount++;
        }
      }

      // Fire-and-forget background prefetch for missing tickers
      if (missingTickers.length > 0) {
        void prefetchTickers(missingTickers, 8, 1200);
      }

      // Fetch live prices for real-candle tickers
      const livePrices = await fetchLivePrices(realTickers.map((t) => t.ticker).slice(0, 60));

      for (const { ticker, bars, quality } of realTickers) {
        const info = tickerMap.get(ticker);
        if (!info) continue;
        const livePrice = livePrices.get(ticker);
        const src = quality === "real" ? "real" : quality === "delayed" ? "delayed" : "mock";
        const setups = scanTicker(info, livePrice, bars, src).map((s) => ({
          ...s,
          // Tag each setup with whether a live Finnhub price was available at scan time.
          // "live" = Finnhub returned a fresh quote → entry price is real-time.
          // "demo" = Finnhub was rate-limited or unavailable → entry price is stale candle close.
          // The paper trader gate uses this to block trades without a live entry price.
          dataQuality: (livePrice ? "live" : "demo") as "live" | "demo",
        }));
        allResults.push(...setups);
        realScanned++;
        if (quality === "real" && overallSource !== "real") overallSource = "real";
        else if (quality === "delayed" && overallSource === "mock") overallSource = "delayed";
      }

    } else {
      // ── Hybrid mode (allowSynthetic=true) — existing behaviour ──────────
      // Pass 1: synthetic scan of all tickers
      allResults = runFullScan(tickers).filter((r) => !isDeadTicker(r.ticker));
      syntheticScanned = tickers.length;

      // Pass 2: re-score top 20 candidates with real candles
      const TOP_N = 20;
      const topCandidateTickers = [...new Set(
        [...allResults]
          .sort((a, b) => b.confidenceScore - a.confidenceScore)
          .slice(0, TOP_N)
          .map((r) => r.ticker),
      )];

      const { candles: realCandleMap, sources: candleSourceMap, overallSource: os } =
        await fetchRealCandles(topCandidateTickers);
      overallSource = os;

      if (realCandleMap.size > 0) {
        const livePrices = await fetchLivePrices(topCandidateTickers);
        const upgradedResults: StockSetup[] = [];

        for (const ticker of topCandidateTickers) {
          const info      = tickerMap.get(ticker);
          const realBars  = realCandleMap.get(ticker);
          if (!info || !realBars) continue;
          const livePrice = livePrices.get(ticker);
          const src       = candleSourceMap.get(ticker) ?? "mock";
          upgradedResults.push(...scanTicker(info, livePrice, realBars, src));
          realScanned++;
        }
        syntheticScanned -= realScanned;

        const upgradedTickers = new Set(topCandidateTickers);
        allResults = [
          ...allResults.filter((r) => !upgradedTickers.has(r.ticker)),
          ...upgradedResults,
        ];
      } else {
        // No real candles — inject live prices into synthetic results only
        if (process.env.FINNHUB_API_KEY) {
          const matched    = [...new Set(allResults.map((r) => r.ticker))].slice(0, 60);
          const livePrices = await fetchLivePrices(matched);
          if (livePrices.size > 0) {
            const liveResults: StockSetup[] = [];
            for (const [ticker, price] of livePrices) {
              const info = tickerMap.get(ticker);
              if (info) liveResults.push(...scanTicker(info, price));
            }
            const liveSet = new Set(liveResults.map((r) => r.ticker));
            allResults = [...allResults.filter((r) => !liveSet.has(r.ticker)), ...liveResults];
          }
        }
        overallSource = "mock";
      }
    }

    cached = {
      results:          allResults,
      totalScanned:     tickers.length,
      realScanned,
      syntheticScanned,
      skippedCount,
      universe,
      ts:               Date.now(),
      candleSource:     overallSource,
    };

    cache.set(cacheKey, cached);
  }

  // ── Coverage snapshot (always fresh from in-memory cache) ─────────────
  const allTickers = getTickerList(universe).filter((t) => !isDeadTicker(t.ticker));
  const coverage   = getCandleCoverage(allTickers.map((t) => t.ticker));

  // ── Filter + paginate ─────────────────────────────────────────────────

  const deadFromResults = cached.results.filter((r) => isDeadTicker(r.ticker)).length;
  let filtered = cached.results
    .filter((r) => !isDeadTicker(r.ticker))
    .filter((r) => {
      const p = r.currentPrice;
      if (p !== undefined && p !== null) {
        if (!isValidQuote(p)) return false;
        if (p < MIN_TRADEABLE_PRICE) return false;
      }
      return true;
    });

  // Block synthetic-candle results when allowSynthetic is false
  if (!allowSynthetic) {
    filtered = filtered.filter((r) => r.candleSource !== "mock");
  }

  // Apply active preset filters
  try {
    const presetScope = await readSetting("activePresetScope");
    if (presetScope?.includes("scanner")) {
      const [pscore, pconf, psetups, pexclude] = await Promise.all([
        readSetting("minScannerScore"),
        readSetting("minConfidence"),
        readSetting("setupTypesAllowed"),
        readSetting("excludedTickers"),
      ]);
      if (pscore && Number(pscore) > 0)
        filtered = filtered.filter((r) => (r.scannerScore ?? 100) >= Number(pscore));
      if (pconf && Number(pconf) > 0)
        filtered = filtered.filter((r) => r.confidenceScore >= Number(pconf));
      if (psetups) {
        const allowed = psetups.split("|").filter(Boolean);
        if (allowed.length > 0) filtered = filtered.filter((r) => allowed.includes(r.setupType));
      }
      if (pexclude) {
        const excluded = pexclude.split("|").filter(Boolean).map((t) => t.toUpperCase());
        if (excluded.length > 0) filtered = filtered.filter((r) => !excluded.includes(r.ticker));
      }
    }
  } catch { /* non-fatal */ }

  if (setupFilter && setupFilter !== "all") {
    const types = setupFilter.split(",").map((s) => s.trim()) as StockSetupType[];
    filtered = filtered.filter((r) => types.includes(r.setupType));
  }
  if (searchQuery) {
    filtered = filtered.filter((r) =>
      r.ticker.toLowerCase().includes(searchQuery) ||
      r.companyName.toLowerCase().includes(searchQuery),
    );
  }

  const hasLiveQuote = !!process.env.FINNHUB_API_KEY;
  const candleSource = cached.candleSource ?? "mock";
  const dataQuality: "live" | "hybrid" | "demo" =
    hasLiveQuote && candleSource !== "mock" ? "live"
    : hasLiveQuote ? "hybrid"
    : "demo";

  const total      = filtered.length;
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(total / pageSize);

  return NextResponse.json({
    results:      paginated,
    total,
    totalScanned: cached.totalScanned,
    page,
    pageSize,
    totalPages,
    universeDiagnostics: {
      rawTickers:    cached.totalScanned,
      deadSkipped:   deadSkippedOnScan + deadFromResults,
      validUniverse: filtered.length,
      minPriceFilter: MIN_TRADEABLE_PRICE,
    },
    candleCoverage: {
      realCount:         coverage.real,
      insufficientCount: coverage.insufficient,
      syntheticCount:    coverage.synthetic,
      uncachedCount:     coverage.uncached,
      totalTickers:      coverage.total,
      realPct:           coverage.realPct,
      syntheticPct:      coverage.syntheticPct,
      minBarsSufficient: MIN_BARS_SUFFICIENT,
      allowSynthetic,
      realScanned:       cached.realScanned,
      syntheticScanned:  cached.syntheticScanned,
      skippedCount:      cached.skippedCount,
    },
    universe,
    lastScanned:  new Date(cached.ts).toISOString(),
    dataQuality,
    candleSource,
    marketStatus: mktStatus,
  });
}
