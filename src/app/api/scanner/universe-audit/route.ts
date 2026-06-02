import { NextResponse } from "next/server";
import { getTickerList, DEAD_TICKERS, MIN_TRADEABLE_PRICE, APPROX_PRICES } from "@/lib/scanner-engine";

function auditList(universe: string) {
  const tickers = getTickerList(universe);
  const dead    = tickers.filter((t) => DEAD_TICKERS.has(t.ticker));
  const valid   = tickers.filter((t) => {
    if (DEAD_TICKERS.has(t.ticker)) return false;
    const p = (APPROX_PRICES as Record<string, number>)[t.ticker];
    return p === undefined || p >= MIN_TRADEABLE_PRICE;
  });
  return {
    raw:         tickers.length,
    dead:        dead.length,
    valid:       valid.length,
    deadTickers: dead.map((t) => t.ticker),
  };
}

export async function GET() {
  const sp500      = auditList("sp500");
  const nasdaq100  = auditList("nasdaq100");
  const russell2000= auditList("russell2000");

  // Cross-universe duplicates
  const all = [
    ...getTickerList("sp500"),
    ...getTickerList("nasdaq100"),
    ...getTickerList("russell2000"),
  ].map((t) => t.ticker);
  const seen = new Map<string, number>();
  for (const t of all) seen.set(t, (seen.get(t) ?? 0) + 1);
  const crossUniverse = [...seen.entries()].filter(([, c]) => c > 1).map(([t]) => t);
  const uniqueTickers = new Set(all.filter((t) => !DEAD_TICKERS.has(t))).size;

  const totalRaw   = sp500.raw + nasdaq100.raw + russell2000.raw;
  const totalValid = sp500.valid + nasdaq100.valid + russell2000.valid;
  const healthPct  = totalRaw > 0 ? Math.round((totalValid / totalRaw) * 100) : 100;

  return NextResponse.json({
    sp500,
    nasdaq100,
    russell2000,
    combined: {
      uniqueTickers,
      crossUniverse: crossUniverse.length,
      deadTickers: [...new Set([...sp500.deadTickers, ...nasdaq100.deadTickers, ...russell2000.deadTickers])],
    },
    blacklist:  [...DEAD_TICKERS],
    minPrice:   MIN_TRADEABLE_PRICE,
    healthPct,
    timestamp:  new Date().toISOString(),
  });
}
