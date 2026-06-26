/**
 * GET /api/cron/auto-trade
 *
 * Vercel Cron endpoint — runs the full paper trading cycle server-side,
 * no browser tab required. Vercel calls this on the schedule in vercel.json.
 *
 * Authentication: Bearer CRON_SECRET header (checked by middleware AND
 * double-checked here for belt-and-suspenders).
 *
 * What it does (same as the client-side auto-trade loop):
 *   1. Skip if market is closed
 *   2. Build signals from cached real candles across all 3 universes
 *   3. Compute market regime
 *   4. Load paper trading state from Google Sheets
 *   5. Run runCycle() — evaluates TP/SL on open positions, opens new trades
 *   6. Save results to Google Sheets
 *   7. Fire Discord alerts for any new buys/sells
 */

import { NextResponse } from "next/server";
import {
  getTickerList, isDeadTicker, scanTicker,
} from "@/lib/scanner-engine";
import { getCachedReal } from "@/lib/real-candles";
import { computeMarketRegime } from "@/lib/scanner-scoring";
import { isMarketOpen } from "@/lib/market-hours";
import { readSetting, isSheetsConfigured } from "@/lib/google-sheets";
import { runCycle } from "@/lib/paper-trading";
import {
  loadPaperState, savePaperState,
} from "@/app/api/paper/run/route";
import { notifyPaperBuy, notifyPaperSell, notifyStopLossHit } from "@/lib/discord-notify";
import type { StockSetup } from "@/lib/types";

export const runtime = "nodejs"; // Google Sheets + fs require Node.js runtime

export async function GET(req: Request) {
  // Belt-and-suspenders: middleware already checked, but double-verify
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Skip outside market hours (saves API quota)
  const marketOpen = isMarketOpen();
  if (!marketOpen) {
    return NextResponse.json({ skipped: true, reason: "market_closed" });
  }

  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 503 });
  }

  try {
    // ── 1. Read settings ────────────────────────────────────────────────────
    let allowSynthetic = false;
    try { allowSynthetic = (await readSetting("allowSyntheticData")) === "true"; } catch { /* default */ }

    // ── 2. Build signals from cached candles across all 3 universes ─────────
    const universes = ["sp500", "nasdaq100", "russell2000"] as const;
    const allSignals: StockSetup[] = [];

    for (const universe of universes) {
      const tickers = getTickerList(universe).filter((t) => !isDeadTicker(t.ticker));
      for (const info of tickers) {
        const cached = getCachedReal(info.ticker);
        if (!cached) continue; // no real candles → skip (allowSynthetic=false behaviour)
        const setups = scanTicker(info, undefined, cached.bars, cached.quality);
        allSignals.push(...setups);
      }
    }

    if (allSignals.length === 0) {
      return NextResponse.json({
        skipped: true,
        reason:  "no_signals_with_real_candles — run prefetch from /diagnostics",
      });
    }

    // Deduplicate by ticker, keep highest confidence
    const byTicker = new Map<string, StockSetup>();
    for (const s of allSignals) {
      const ex = byTicker.get(s.ticker);
      if (!ex || s.confidenceScore > ex.confidenceScore) byTicker.set(s.ticker, s);
    }
    const signals = [...byTicker.values()];

    // Filter synthetic if setting requires it
    const filteredSignals = allowSynthetic
      ? signals
      : signals.filter((s) => (s.candleSource === "real" || s.candleSource === "delayed") && !s.insufficientData);

    const regime = computeMarketRegime(filteredSignals);

    // ── 3. Load paper state from Sheets ────────────────────────────────────
    const { account, openPositions, recentTrades } = await loadPaperState();

    // ── 3b. Build session highs for open positions (candle-high gate) ───────
    // Use the most recent cached daily bar's high as a proxy for today's
    // session high. Passed to runCycle so the candle-high gate can catch
    // corrupt Finnhub quotes where the quoted price exceeds the real range.
    const candleHighs: Record<string, number> = {};
    for (const pos of openPositions) {
      const cached = getCachedReal(pos.ticker);
      if (cached?.bars?.length) {
        const latestBar = cached.bars[cached.bars.length - 1];
        if (latestBar?.high > 0) candleHighs[pos.ticker] = latestBar.high;
      }
    }

    // ── 4. Run trading cycle ────────────────────────────────────────────────
    const result = runCycle({
      account,
      openPositions,
      signals:      filteredSignals,
      prices:       {},            // no live prices in cron — scanner candle close is used
      candleHighs,
      regime,
      isRunning:    true,
      recentTrades,
    });

    // ── 5. Persist to Sheets ────────────────────────────────────────────────
    const equityPoint =
      result.closedTrades.length > 0 || result.newPositions.length > 0
        ? result.equityPoint
        : undefined;

    await savePaperState(result.account, result.openPositions, result.closedTrades, equityPoint);

    // ── 6. Discord notifications ────────────────────────────────────────────
    for (const pos of result.newPositions) {
      void notifyPaperBuy(
        pos,
        result.account.cashBalance,
        pos.notes?.confidence ?? 0,
        `${pos.setupType} · cron auto-trade`,
      );
    }
    for (const trade of result.closedTrades) {
      if (trade.reasonClosed.toLowerCase().includes("stop")) {
        void notifyStopLossHit(trade, result.account.totalAccountValue);
      } else {
        void notifyPaperSell(trade, result.account.totalAccountValue);
      }
    }

    return NextResponse.json({
      ok:               true,
      regime,
      signalsEvaluated: filteredSignals.length,
      positionsOpened:  result.newPositions.map((p) => p.ticker),
      positionsClosed:  result.closedTrades.map((t) => t.ticker),
      rejections:       result.rejections.length,
      account: {
        cashBalance:       result.account.cashBalance,
        totalAccountValue: result.account.totalAccountValue,
        totalPnL:          result.account.totalPnL,
      },
    });
  } catch (err) {
    console.error("[cron/auto-trade] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
