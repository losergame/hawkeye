/**
 * GET /api/scanner/cache-stats
 *
 * Returns statistics about the persistent candle disk cache.
 * Read-only — no writes, no API calls.
 *
 * Protected by CRON_SECRET (same admin gate as /api/scanner/prefetch).
 * Access from browser: must be logged in (session auth handled by middleware).
 *
 * Response:
 *   totalFiles      — all .json files in candle-cache/
 *   valid           — not expired (fetchedAt < 24h ago)
 *   stale           — expired (> 24h old), will be re-fetched next prefetch
 *   sufficient      — bars >= MIN_BARS_SUFFICIENT (170)
 *   insufficient    — bars < MIN_BARS_SUFFICIENT, blocked from paper trading
 *   oldFormat       — files written before the new DiskEntry format (no candles field)
 *   oldestFetchedAt — ISO timestamp of the oldest valid file
 *   newestFetchedAt — ISO timestamp of the most recently fetched file
 *   sampleTickers   — 5 random cached tickers for spot-checking
 */

import { NextResponse } from "next/server";
import { MIN_BARS_SUFFICIENT } from "@/lib/candle-constants";

interface DiskEntryMinimal {
  candles?:   unknown[];
  bars?:      unknown[];
  barCount?:  number;
  fetchedAt?: string;
  sufficient?:boolean;
  source?:    string;
  expiresAt:  number;
}

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs   = require("fs")   as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");

    const dir = path.join(process.cwd(), "candle-cache");
    if (!fs.existsSync(dir)) {
      return NextResponse.json({
        totalFiles: 0, valid: 0, stale: 0, sufficient: 0,
        insufficient: 0, oldFormat: 0,
        message: "candle-cache/ directory does not exist — run a prefetch first.",
      });
    }

    const files = fs.readdirSync(dir).filter((f: string) => f.endsWith(".json"));
    const now   = Date.now();

    let valid = 0, stale = 0, sufficient = 0, insufficient = 0, oldFormat = 0;
    let oldestMs = Infinity, newestMs = -Infinity;
    const sample: Array<{ ticker: string; bars: number; source: string; ageHours: number; sufficient: boolean }> = [];

    for (const file of files) {
      try {
        const raw   = fs.readFileSync(path.join(dir, file), "utf-8") as string;
        const entry = JSON.parse(raw) as DiskEntryMinimal;
        const bars  = (entry.candles ?? entry.bars ?? []) as unknown[];
        const barCount = entry.barCount ?? bars.length;

        if (!entry.candles) oldFormat++;

        if (entry.expiresAt > now) {
          valid++;
          // Track oldest/newest by fetchedAt (new format) or expiresAt - DISK_TTL
          const fetchedMs = entry.fetchedAt
            ? new Date(entry.fetchedAt).getTime()
            : entry.expiresAt - 24 * 60 * 60_000;
          if (fetchedMs < oldestMs) oldestMs = fetchedMs;
          if (fetchedMs > newestMs) newestMs = fetchedMs;
        } else {
          stale++;
        }

        if (barCount >= MIN_BARS_SUFFICIENT) sufficient++;
        else insufficient++;

        // Collect up to 5 samples
        if (sample.length < 5 && entry.expiresAt > now) {
          const ageMs = now - (entry.fetchedAt
            ? new Date(entry.fetchedAt).getTime()
            : entry.expiresAt - 24 * 60 * 60_000);
          sample.push({
            ticker:    file.replace(".json", ""),
            bars:      barCount,
            source:    entry.source ?? "unknown",
            ageHours:  Math.round(ageMs / 36_000) / 100,
            sufficient:barCount >= MIN_BARS_SUFFICIENT,
          });
        }
      } catch { /* corrupt file — skip */ }
    }

    const nextExpiry = stale > 0
      ? "Run POST /api/scanner/prefetch to refresh stale files"
      : "All files valid — next expiry in up to 24h";

    return NextResponse.json({
      totalFiles:      files.length,
      valid,
      stale,
      sufficient,
      insufficient,
      oldFormat,
      minBarsSufficient: MIN_BARS_SUFFICIENT,
      oldestFetchedAt:   oldestMs === Infinity ? null : new Date(oldestMs).toISOString(),
      newestFetchedAt:   newestMs === -Infinity ? null : new Date(newestMs).toISOString(),
      sampleTickers:     sample,
      message:           nextExpiry,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
