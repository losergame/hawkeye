import { NextResponse } from "next/server";
import { findStock } from "@/lib/mock-data";

const CACHE_MS = 10_000;
const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,12}$/;

interface FinnhubQuote {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
}

interface QuotePayload {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  timestamp: string;
  marketStatus: "OPEN" | "PRE-MARKET" | "AFTER-HOURS" | "CLOSED";
  source: "live" | "demo";
}

const quoteCache = new Map<string, { expiresAt: number; data: QuotePayload }>();

function getMarketStatus(): QuotePayload["marketStatus"] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym = symbol.trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(sym)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const cached = quoteCache.get(sym);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ...cached.data, cache: "hit" });
  }

  const marketStatus = getMarketStatus();
  const mock = findStock(sym);
  const finnhubKey = process.env.FINNHUB_API_KEY;

  if (finnhubKey) {
    try {
      const url = new URL("https://finnhub.io/api/v1/quote");
      url.searchParams.set("symbol", sym);
      url.searchParams.set("token", finnhubKey);
      const res = await fetch(url.toString(), {
        next: { revalidate: 10 },
      });
      if (res.status === 429) {
        return NextResponse.json({ error: "Rate limited" }, { status: 429 });
      }
      if (!res.ok) throw new Error(`Finnhub ${res.status}`);
      const q = (await res.json()) as FinnhubQuote;
      if (!q.c || q.c <= 0) throw new Error("No quote data");

      const payload: QuotePayload = {
        symbol: sym,
        name: mock.name,
        price: q.c,
        change: q.d ?? 0,
        changePercent: q.dp ?? 0,
        high: q.h ?? q.c,
        low: q.l ?? q.c,
        open: q.o ?? q.c,
        prevClose: q.pc ?? q.c,
        timestamp: new Date().toISOString(),
        marketStatus,
        source: "live",
      };
      quoteCache.set(sym, { expiresAt: Date.now() + CACHE_MS, data: payload });
      return NextResponse.json({ ...payload, cache: "fresh" });
    } catch {
      // fall through to demo
    }
  }

  const payload: QuotePayload = {
    symbol: sym,
    name: mock.name,
    price: mock.price,
    change: mock.change,
    changePercent: mock.changePercent,
    high: mock.price * 1.005,
    low: mock.price * 0.995,
    open: mock.price - mock.change,
    prevClose: mock.price - mock.change,
    timestamp: new Date().toISOString(),
    marketStatus,
    source: "demo",
  };
  quoteCache.set(sym, { expiresAt: Date.now() + CACHE_MS, data: payload });
  return NextResponse.json({ ...payload, cache: "fresh" });
}
