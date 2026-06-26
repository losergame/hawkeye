/**
 * Real historical candle fetcher
 *
 * Priority: Finnhub (daily bars, 252-day window) → Polygon.
 * No synthetic fallback — callers generate synthetic themselves when needed.
 *
 * Two-tier cache:
 *   1. In-memory Map — hot path, sub-millisecond
 *   2. Disk JSON files (candle-cache/{TICKER}.json) — survives server restarts
 *      Disk I/O is lazy-loaded at runtime so this file is safe to import from
 *      client bundles (disk ops are no-ops in browser context).
 *
 * TTLs:
 *   Real fetch success  → 4 hours
 *   Failed / no-data   → 5 minutes
 */

import type { OHLCBar } from "@/lib/indicators";
import { MIN_BARS_SUFFICIENT, MIN_BARS_FETCH, FETCH_DAYS } from "@/lib/candle-constants";

export { MIN_BARS_SUFFICIENT, MIN_BARS_FETCH, FETCH_DAYS };

// ── Ensure candle-cache directory exists on module load (server-side only) ────
// This runs once when the Next.js server process starts, creating the directory
// before any disk reads/writes so the first prefetch succeeds immediately.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs   = require("fs")   as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path") as typeof import("path");
  const dir  = path.join(process.cwd(), "candle-cache");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
} catch { /* non-fatal — browser bundle won't reach this */ }

// ── Types ────────────────────────────────────────────────────────────────────

export type CandleSource  = "alpaca" | "polygon" | "synthetic" | "finnhub"; // "finnhub" kept for legacy disk-cache compat
export type CandleQuality = "real" | "delayed" | "mock";

export interface CandleResult {
  bars:       OHLCBar[];
  source:     CandleSource;
  quality:    CandleQuality;
  ticker:     string;
  barCount:   number;
  sufficient: boolean;     // bars.length >= MIN_BARS_SUFFICIENT
  error?:     string;
}

export interface CandleCoverage {
  total:            number;
  real:             number;       // ≥ MIN_BARS_SUFFICIENT (full quality)
  insufficient:     number;       // 0 < bars < MIN_BARS_SUFFICIENT (partial)
  synthetic:        number;       // cached but no real bars at all
  uncached:         number;       // not in cache
  realPct:          number;
  syntheticPct:     number;
}

// ── Disk cache (runtime-only — safe to import from client bundles) ─────────
//
// We use require() inside functions rather than top-level import so webpack
// does NOT statically bundle node:fs / node:path into the client bundle.
// In browser context the try/catch makes all disk ops silent no-ops.

interface DiskEntry {
  // Core candle data
  ticker:    string;
  candles:   OHLCBar[];   // user-facing field name; "bars" kept for back-compat read
  bars?:     OHLCBar[];   // legacy field — read-only for old files, prefer "candles"
  barCount:  number;
  fetchedAt: string;      // ISO timestamp of when this fetch happened
  source:    CandleSource;
  quality:   CandleQuality;
  sufficient:boolean;
  // Expiry
  expiresAt: number;      // Unix ms
}

function getCacheDir(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    return path.join(process.cwd(), "candle-cache");
  } catch { return null; }
}

function diskRead(ticker: string): CandleResult | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs   = require("fs")   as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const dir  = path.join(process.cwd(), "candle-cache");
    const file = path.join(dir, `${ticker}.json`);
    if (!fs.existsSync(file)) return null;
    const entry = JSON.parse(fs.readFileSync(file, "utf-8")) as DiskEntry;
    // Support both new format (candles) and old format (bars) for backward compat
    const bars = entry.candles ?? entry.bars ?? [];
    // Stale by age
    if (Date.now() > entry.expiresAt) return null;
    // Stale by bar count — force re-fetch when threshold was raised
    if (bars.length < MIN_BARS_SUFFICIENT && entry.source !== "synthetic") return null;
    return {
      bars, source: entry.source, quality: entry.quality,
      ticker, barCount: bars.length,
      sufficient: bars.length >= MIN_BARS_SUFFICIENT,
    };
  } catch { return null; }
}

function diskWrite(ticker: string, result: CandleResult, ttl: number): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs   = require("fs")   as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const dir  = path.join(process.cwd(), "candle-cache");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry: DiskEntry = {
      ticker,
      candles:   result.bars,
      barCount:  result.bars.length,
      fetchedAt: new Date().toISOString(),
      source:    result.source,
      quality:   result.quality,
      sufficient:result.bars.length >= MIN_BARS_SUFFICIENT,
      expiresAt: Date.now() + ttl,
    };
    fs.writeFileSync(path.join(dir, `${ticker}.json`), JSON.stringify(entry));
  } catch { /* non-fatal */ }
}

// ── Cache TTLs ────────────────────────────────────────────────────────────────

const DISK_TTL = 24 * 60 * 60_000; // 24 hours — daily bars don't change intraday
const REAL_TTL =  4 * 60 * 60_000; // 4 hours  — memory hot-cache
const FAIL_TTL =  5 * 60_000;      // 5 minutes — retry failures quickly

const _mem = new Map<string, { result: CandleResult; expiresAt: number }>();

function memGet(ticker: string): CandleResult | null {
  const hit = _mem.get(ticker);
  return hit && hit.expiresAt > Date.now() ? hit.result : null;
}

function memSet(ticker: string, result: CandleResult, ttl: number): void {
  _mem.set(ticker, { result, expiresAt: Date.now() + ttl });
}

// Memory → disk → null
function cacheGet(ticker: string): CandleResult | null {
  const hot = memGet(ticker);
  if (hot) return hot;
  const cold = diskRead(ticker);
  if (cold) memSet(ticker, cold, REAL_TTL); // warm memory from disk
  return cold;
}

function cacheSet(ticker: string, result: CandleResult, ttl: number): void {
  memSet(ticker, result, ttl);
  // Disk uses a longer TTL (24h) — daily bars don't change intraday and survive server restarts.
  // Synthetic / failure markers are not written to disk (they'll be retried on next restart).
  if (result.source !== "synthetic") diskWrite(ticker, result, DISK_TTL);
}

// ── Alpaca ────────────────────────────────────────────────────────────────────

interface AlpacaBar {
  t: string;
  o: number; h: number; l: number; c: number; v: number;
}

interface AlpacaBarsResp {
  bars:             AlpacaBar[];
  symbol:           string;
  next_page_token?: string | null;
}

async function fetchAlpacaCandles(
  ticker: string, days: number, key: string, secret: string,
): Promise<CandleResult | null> {
  const end   = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const url   = new URL(
    `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(ticker)}/bars`,
  );
  url.searchParams.set("timeframe",  "1Day");
  url.searchParams.set("start",      start);
  url.searchParams.set("end",        end);
  url.searchParams.set("limit",      "1000");
  url.searchParams.set("feed",       "iex");
  url.searchParams.set("adjustment", "all");
  url.searchParams.set("sort",       "asc");

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      "APCA-API-KEY-ID":     key,
      "APCA-API-SECRET-KEY": secret,
    },
  });
  if (res.status === 429) throw new Error("Alpaca rate limit");
  if (!res.ok) throw new Error(`Alpaca ${res.status}`);

  const data = (await res.json()) as AlpacaBarsResp;
  if (!data.bars?.length) return null;

  const bars: OHLCBar[] = data.bars.map((b) => ({
    open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
  }));

  return { bars, source: "alpaca", quality: "real", ticker,
           barCount: bars.length, sufficient: bars.length >= MIN_BARS_SUFFICIENT };
}

// ── Polygon (fallback) ────────────────────────────────────────────────────────

interface PolygonAgg { c?: number; h?: number; l?: number; o?: number; v?: number; }

async function fetchPolygonCandles(
  ticker: string, days: number, key: string,
): Promise<CandleResult | null> {
  const to   = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const url  = new URL(
    `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`,
  );
  url.searchParams.set("adjusted", "true"); url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", String(days + 10)); url.searchParams.set("apiKey", key);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Polygon ${res.status}`);

  const data = (await res.json()) as { results?: PolygonAgg[] };
  if (!data.results?.length) return null;

  const bars: OHLCBar[] = data.results.map((r) => ({
    open: r.o ?? r.c ?? 0, high: r.h ?? r.c ?? 0,
    low:  r.l ?? r.c ?? 0, close: r.c ?? 0, volume: r.v ?? 0,
  }));

  return { bars, source: "polygon", quality: "delayed", ticker,
           barCount: bars.length, sufficient: bars.length >= MIN_BARS_SUFFICIENT };
}

// ── Internal fetch — priority: Alpaca → Polygon → null ───────────────────────

async function fetchFromApis(ticker: string): Promise<CandleResult | null> {
  const alpacaKey    = process.env.ALPACA_API_KEY;
  const alpacaSecret = process.env.ALPACA_API_SECRET;
  const polygonKey   = process.env.POLYGON_API_KEY;

  if (alpacaKey && alpacaSecret) {
    try {
      const r = await fetchAlpacaCandles(ticker, FETCH_DAYS, alpacaKey, alpacaSecret);
      if (r && r.bars.length >= MIN_BARS_FETCH) return r;
    } catch { /* fall through to Polygon */ }
  }

  if (polygonKey) {
    try {
      const r = await fetchPolygonCandles(ticker, FETCH_DAYS, polygonKey);
      if (r && r.bars.length >= MIN_BARS_FETCH) return r;
    } catch { /* no data */ }
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getRealCandles(ticker: string): Promise<CandleResult | null> {
  const cached = cacheGet(ticker);
  if (cached) return cached.source !== "synthetic" ? cached : null;

  const result = await fetchFromApis(ticker);
  if (result) { cacheSet(ticker, result, REAL_TTL); return result; }

  const miss: CandleResult = {
    bars: [], source: "synthetic", quality: "mock", ticker,
    barCount: 0, sufficient: false, error: "No real data available",
  };
  cacheSet(ticker, miss, FAIL_TTL);
  return null;
}

export function getCachedReal(ticker: string): CandleResult | null {
  const hit = cacheGet(ticker);
  return (!hit || hit.source === "synthetic") ? null : hit;
}

export async function getHistoricalCandles(ticker: string): Promise<CandleResult> {
  const r = await getRealCandles(ticker);
  if (r) return r;
  return {
    bars: [], source: "synthetic", quality: "mock", ticker,
    barCount: 0, sufficient: false, error: "No real data available",
  };
}

export function getCandleCoverage(tickers: string[]): CandleCoverage {
  let real = 0, insufficient = 0, synthetic = 0, uncached = 0;
  for (const t of tickers) {
    const hit = cacheGet(t);
    if (!hit) { uncached++; continue; }
    if (hit.source === "synthetic") { synthetic++; continue; }
    if (hit.sufficient) real++; else insufficient++;
  }
  const total = tickers.length;
  return {
    total, real, insufficient, synthetic, uncached,
    realPct:      total > 0 ? Math.round((real / total) * 100) : 0,
    syntheticPct: total > 0 ? Math.round((synthetic / total) * 100) : 0,
  };
}

export async function prefetchTickers(
  tickers: string[], concurrency = 8, delayMs = 1200,
): Promise<{ attempted: number; real: number; sufficient: number; failed: number }> {
  const todo = tickers.filter((t) => {
    const hit = cacheGet(t);
    return !hit || hit.source === "synthetic";
  });

  let real = 0, sufficient = 0, failed = 0;

  for (let i = 0; i < todo.length; i += concurrency) {
    const batch = todo.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(async (ticker) => {
      try {
        const r = await getRealCandles(ticker);
        if (r) { real++; if (r.sufficient) sufficient++; } else failed++;
      } catch { failed++; }
    }));
    if (i + concurrency < todo.length) {
      await new Promise<void>((res) => setTimeout(res, delayMs));
    }
  }

  return { attempted: todo.length, real, sufficient, failed };
}

/**
 * Invalidate all in-memory cache entries where barCount < MIN_BARS_SUFFICIENT.
 * Entries fetched with an old FETCH_DAYS value (e.g., 252 calendar days → 173
 * trading days) will be cleared so the next prefetch re-fetches them with the
 * new FETCH_DAYS (290 calendar days → ~200 trading days).
 *
 * Returns how many entries were cleared.
 */
export function invalidateInsufficientCaches(): number {
  let cleared = 0;
  for (const [ticker, entry] of _mem.entries()) {
    if (entry.result.barCount < MIN_BARS_SUFFICIENT && entry.result.source !== "synthetic") {
      _mem.delete(ticker);
      cleared++;
    }
  }
  return cleared;
}

export function invalidateCandle(ticker: string): void {
  _mem.delete(ticker);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs   = require("fs")   as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const file = path.join(process.cwd(), "candle-cache", `${ticker}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch { /* non-fatal */ }
}

// ── Quality helpers ───────────────────────────────────────────────────────────

export const QUALITY_LABEL: Record<CandleQuality, string> = {
  real: "REAL DATA", delayed: "DELAYED DATA", mock: "MOCK DATA",
};

export const QUALITY_STYLE: Record<CandleQuality, string> = {
  real:    "border-positive/30 bg-positive/10 text-positive",
  delayed: "border-amber-400/30 bg-amber-400/10 text-amber-400",
  mock:    "border-border bg-surface-1 text-muted-foreground",
};

// Suppress unused variable warning for getCacheDir (utility)
void (getCacheDir);
