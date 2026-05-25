import { NextResponse } from "next/server";

import { getCompanyNews, getStockProfile } from "@/lib/market-data";
import type { ChartTimeframe } from "@/lib/types";

const QUOTE_CACHE_MS = 25_000;
const MAX_QUOTE_CACHE_ENTRIES = 150;
const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,12}$/;
type StockRoutePayload = {
  provider: string;
  refreshSeconds: number | null;
  dataQuality: string;
  updatedAt: string;
  profile: unknown;
};

const responseCache = new Map<string, { expiresAt: number; payload: StockRoutePayload }>();

function setResponseCache(key: string, value: { expiresAt: number; payload: StockRoutePayload }) {
  if (responseCache.size >= MAX_QUOTE_CACHE_ENTRIES) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }

  responseCache.set(key, value);
}

const timeframes = new Set<ChartTimeframe>(["1D", "1W", "1M", "3M", "YTD", "1Y"]);

export async function GET(request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await params;
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(normalizedSymbol)) {
      return NextResponse.json({ error: "Invalid stock symbol" }, { status: 400 });
    }

    const requestUrl = new URL(request.url);
    const requestedTimeframe = requestUrl.searchParams.get("timeframe")?.toUpperCase() as ChartTimeframe | undefined;
    const timeframe = requestedTimeframe && timeframes.has(requestedTimeframe) ? requestedTimeframe : "1D";
    const cacheKey = `${normalizedSymbol}:${timeframe}`;
    const cached = responseCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        ...cached.payload,
        cache: "memory",
        cacheTtlMs: cached.expiresAt - Date.now()
      });
    }

    const [quote, news] = await Promise.all([getStockProfile(normalizedSymbol, timeframe), getCompanyNews(normalizedSymbol)]);
    const { profile, provider } = quote;

    const payload = {
      provider,
      refreshSeconds: provider === "demo" ? null : 30,
      dataQuality:
        provider === "demo"
          ? "Demo quote. Add FINNHUB_API_KEY or POLYGON_API_KEY for market data."
          : `Quote refreshed from ${provider}. Provider plan controls exchange delay and entitlement.`,
      updatedAt: new Date().toISOString(),
      profile: {
        ...profile,
        news
      }
    };

    setResponseCache(cacheKey, { expiresAt: Date.now() + QUOTE_CACHE_MS, payload });
    return NextResponse.json({ ...payload, cache: "fresh", cacheTtlMs: QUOTE_CACHE_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: "Stock quote unavailable", detail: message }, { status: 500 });
  }
}
