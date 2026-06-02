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

// ── Types ────────────────────────────────────────────────────────────────────

export type CandleSource  = "finnhub" | "polygon" | "synthetic";
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
  bars:      OHLCBar[];
  source:    CandleSource;
  quality:   CandleQuality;
  expiresAt: number;
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
    if (Date.now() > entry.expiresAt) return null;
    return {
      bars: entry.bars, source: entry.source, quality: entry.quality,
      ticker, barCount: entry.bars.length,
      sufficient: entry.bars.length >= MIN_BARS_SUFFICIENT,
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
      bars:      result.bars,
      source:    result.source,
      quality:   result.quality,
      expiresAt: Date.now() + ttl,
    };
    fs.writeFileSync(path.join(dir, `${ticker}.json`), JSON.stringify(entry));
  } catch { /* non-fatal */ }
}

// ── In-memory cache (hot path) ────────────────────────────────────────────────

const REAL_TTL = 4 * 60 * 60_000;
const FAIL_TTL = 5 * 60_000;

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
  if (result.source !== "synthetic") diskWrite(ticker, result, ttl);
}

// ── Finnhub ───────────────────────────────────────────────────────────────────

interface FinnhubCandleResp {
  c?: number[]; h?: number[]; l?: number[]; o?: number[];
  s?: "ok" | "no_data"; t?: number[]; v?: number[];
}

async function fetchFinnhubCandles(
  ticker: string, days: number, key: string,
): Promise<CandleResult | null> {
  const to   = Math.floor(Date.now() / 1000);
  const from = to - days * 86_400;
  const url  = new URL("https://finnhub.io/api/v1/stock/candle");
  url.searchParams.set("symbol", ticker); url.searchParams.set("resolution", "D");
  url.searchParams.set("from", String(from)); url.searchParams.set("to", String(to));
  url.searchParams.set("token", key);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 429) throw new Error("Finnhub rate limit");
  if (!res.ok) throw new Error(`Finnhub ${res.status}`);

  const data = (await res.json()) as FinnhubCandleResp;
  if (data.s !== "ok" || !data.c?.length) return null;

  const bars: OHLCBar[] = data.c.map((c, i) => ({
    open:   data.o![i] ?? c, high: data.h![i] ?? c,
    low:    data.l![i] ?? c, close: c, volume: data.v![i] ?? 0,
  }));

  return { bars, source: "finnhub", quality: "real", ticker,
           barCount: bars.length, sufficient: bars.length >= MIN_BARS_SUFFICIENT };
}

// ── Polygon ───────────────────────────────────────────────────────────────────

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

// ── Internal fetch ────────────────────────────────────────────────────────────

async function fetchFromApis(ticker: string): Promise<CandleResult | null> {
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const polygonKey = process.env.POLYGON_API_KEY;

  if (finnhubKey) {
    try {
      const r = await fetchFinnhubCandles(ticker, FETCH_DAYS, finnhubKey);
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
