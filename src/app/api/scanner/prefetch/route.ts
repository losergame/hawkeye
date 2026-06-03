/**
 * POST /api/scanner/prefetch
 *
 * Warms the real-candle cache for a universe in the background.
 * Returns immediately with { started, tickers } then fetches async.
 *
 * Rate-limited to 8 parallel / 1.2s between batches ≈ 40 req/min,
 * safely under Finnhub free tier (60 req/min).
 *
 * Body: { universe?: "sp500" | "nasdaq100" | "russell2000" | "all" }
 * Default universe: "sp500"
 */

import { NextResponse } from "next/server";
import { getTickerList, isDeadTicker } from "@/lib/scanner-engine";
import { prefetchTickers, getCandleCoverage, invalidateInsufficientCaches } from "@/lib/real-candles";
import { writeSetting } from "@/lib/google-sheets";

export async function POST(req: Request) {
  try {
    const body        = await req.json().catch(() => ({})) as { universe?: string; invalidateInsufficient?: boolean };
    const universeArg = (body.universe ?? "sp500").toLowerCase();

    // Optional: flush in-memory entries with barCount < 200 so they re-fetch
    // with the new FETCH_DAYS=290 value. Safe to run anytime.
    let invalidatedCount = 0;
    if (body.invalidateInsufficient) {
      invalidatedCount = invalidateInsufficientCaches();
    }

    // Collect tickers for the requested universe(s)
    const universes = universeArg === "all"
      ? ["sp500", "nasdaq100", "russell2000"]
      : [universeArg];

    const tickerSet = new Set<string>();
    for (const u of universes) {
      for (const t of getTickerList(u)) {
        if (!isDeadTicker(t.ticker)) tickerSet.add(t.ticker);
      }
    }
    const tickers = [...tickerSet];

    // Snapshot coverage BEFORE prefetch
    const before = getCandleCoverage(tickers);

    // Run prefetch in background — don't await
    void prefetchTickers(tickers, 8, 1200).then(async (stats) => {
      // Persist last prefetch timestamp to AppSettings so Diagnostics can display it
      try {
        await writeSetting("lastCandlePrefetch", new Date().toISOString());
        await writeSetting("lastPrefetchResult",
          JSON.stringify({ ...stats, universe: universeArg, ts: Date.now() }));
      } catch { /* non-fatal */ }
    });

    return NextResponse.json({
      started:          true,
      universe:         universeArg,
      tickers:          tickers.length,
      alreadyCached:    before.real,
      missing:          before.uncached + before.synthetic,
      invalidatedCount,
      message: [
        invalidatedCount > 0 ? `Cleared ${invalidatedCount} insufficient-bar cache entries.` : "",
        `Prefetching ${tickers.length} tickers in background (FETCH_DAYS=290 → ~200 trading days).`,
        `Check /api/scanner/diagnose for updated signal breakdown.`,
      ].filter(Boolean).join(" "),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  // Convenience: GET returns current coverage for all universes
  const sp500    = getTickerList("sp500").filter((t) => !isDeadTicker(t.ticker));
  const nasdaq   = getTickerList("nasdaq100").filter((t) => !isDeadTicker(t.ticker));
  const russell  = getTickerList("russell2000").filter((t) => !isDeadTicker(t.ticker));

  return NextResponse.json({
    sp500:     getCandleCoverage(sp500.map((t) => t.ticker)),
    nasdaq100: getCandleCoverage(nasdaq.map((t) => t.ticker)),
    russell2000: getCandleCoverage(russell.map((t) => t.ticker)),
  });
}
