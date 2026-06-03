/**
 * GET /api/scanner/diagnose
 *
 * Read-only diagnostic endpoint. Returns the top 10 scanner signals
 * (from whichever universe has the most results) with:
 *   - Full 6-component score breakdown
 *   - Whether each signal passes the paper trader's pre-trade filters
 *   - Exact rejection reason if it fails
 *   - Current market regime
 *
 * Does NOT execute any trades. Pure diagnosis.
 */

import { NextResponse } from "next/server";
import { getTickerList, isDeadTicker, scanTicker, MIN_TRADEABLE_PRICE, isValidQuote } from "@/lib/scanner-engine";
import { MIN_BARS_SUFFICIENT } from "@/lib/candle-constants";
import { getCachedReal } from "@/lib/real-candles";
import {
  computeMarketRegime, calculateScannerScore,
  type ScannerScoreBreakdown,
} from "@/lib/scanner-scoring";
import { isMarketOpen } from "@/lib/market-hours";
import {
  MIN_PRICE_FOR_PAPER_TRADE, MIN_DAILY_VOLUME,
  BUY_SLIPPAGE_PCT,
} from "@/lib/paper-trading";
import type { StockSetup } from "@/lib/types";

const MIN_RR_PAPER   = 1.5;
const MIN_CONF_PAPER = 60;

interface SignalDiagnosis {
  ticker:          string;
  companyName:     string;
  setupType:       string;
  currentPrice:    number;
  candleSource:    string;
  barCount:        number;
  barCountNote:    string;
  riskReward:      number;
  confidenceScore: number;
  avgVolume:       number;
  score:           number;
  breakdown:       ScannerScoreBreakdown;
  passesFilters:   boolean;
  rejectedBy:      string | null;
  rejectionDetail: string | null;
  gapToQualify:    number | null; // how many score points short of threshold
}

function diagnoseSignal(
  s: StockSetup,
  regime: ReturnType<typeof computeMarketRegime>,
  realBarCount?: number,    // authoritative count from CandleResult
): SignalDiagnosis {
  const breakdown = calculateScannerScore(s, regime);

  // Paper trader pre-trade filter simulation (no position sizing — just filters)
  let rejectedBy: string | null = null;
  let rejectionDetail: string | null = null;

  if (!Number.isFinite(s.riskReward) || s.riskReward < MIN_RR_PAPER) {
    rejectedBy = "rr_too_low";
    rejectionDetail = `R/R ${s.riskReward?.toFixed(2) ?? "N/A"} < ${MIN_RR_PAPER} minimum`;
  } else if (s.confidenceScore < MIN_CONF_PAPER) {
    rejectedBy = "confidence_too_low";
    rejectionDetail = `${s.confidenceScore}% < ${MIN_CONF_PAPER}% minimum`;
  } else if (s.currentPrice < MIN_PRICE_FOR_PAPER_TRADE) {
    rejectedBy = "price_too_low";
    rejectionDetail = `$${s.currentPrice.toFixed(2)} < $${MIN_PRICE_FOR_PAPER_TRADE} minimum`;
  } else if ((s.indicators.avgVolume ?? 0) < MIN_DAILY_VOLUME) {
    rejectedBy = "low_liquidity";
    rejectionDetail = `ADV ${(s.indicators.avgVolume ?? 0).toLocaleString()} < ${MIN_DAILY_VOLUME.toLocaleString()}`;
  } else if (s.candleSource !== "real" && s.candleSource !== "delayed") {
    // Catches "mock", undefined, and any future non-real source.
    // Note: barCount is stored as `barCount || undefined` in scanner-engine, so
    // a barCount of 0 (synthetic) shows as undefined → the ?? 0 below displays 0.
    rejectedBy = "synthetic_or_insufficient_candles";
    rejectionDetail = `candleSource="${s.candleSource ?? "undefined"}" — real candles required`;
  } else if (s.insufficientData) {
    rejectedBy = "insufficient_bars";
    rejectionDetail = `${s.barCount ?? "?"} bars < ${MIN_BARS_SUFFICIENT} minimum for EMA 200`;
  } else if (regime === "defensive") {
    if (s.setupType === "Pullback Buy") {
      rejectedBy = "regime_defensive";
      rejectionDetail = "Pullback Buy blocked in defensive";
    } else if (
      (s.setupType === "Momentum Breakout" || s.setupType === "Trend Continuation") &&
      (s.scannerScore ?? breakdown.total) < 75
    ) {
      rejectedBy = "regime_defensive";
      rejectionDetail = `${s.setupType} score ${breakdown.total} < 75 required in defensive`;
    }
  }

  // Score minimum check
  const effectiveMin = regime === "defensive" && s.setupType === "Oversold Bounce" ? 58 : 65;
  if (!rejectedBy && breakdown.total < effectiveMin) {
    rejectedBy = "score_too_low";
    rejectionDetail = `Score ${breakdown.total} < ${effectiveMin} minimum`;
  }

  // barCount is stored as `barCount || undefined` in scanner-engine (0 → undefined).
  // For synthetic signals: barCount=0 shows as undefined → we display "0 (synthetic)".
  // For real signals: barCount=173/200/etc shows as-is.
  const isRealSource = s.candleSource === "real" || s.candleSource === "delayed";
  // Use the authoritative CandleResult.barCount when available (passed as realBarCount).
  // StockSetup.barCount can be undefined when scanner-engine stores `0 → undefined`.
  const displayBarCount = realBarCount ?? s.barCount ?? 0;

  return {
    ticker:          s.ticker,
    companyName:     s.companyName,
    setupType:       s.setupType,
    currentPrice:    s.currentPrice,
    candleSource:    s.candleSource ?? "none/synthetic",
    barCount:        displayBarCount,
    barCountNote:    displayBarCount === 0 && isRealSource
      ? "WARNING: real source but 0 bars — cache may be corrupt"
      : displayBarCount === 0
      ? "synthetic (no real candles used)"
      : displayBarCount < MIN_BARS_SUFFICIENT
      ? `${displayBarCount} bars — insufficient (need ${MIN_BARS_SUFFICIENT})`
      : `${displayBarCount} bars — OK`,
    riskReward:     s.riskReward,
    confidenceScore:s.confidenceScore,
    avgVolume:      s.indicators.avgVolume ?? 0,
    score:          breakdown.total,
    breakdown,
    passesFilters:  !rejectedBy,
    rejectedBy,
    rejectionDetail,
    gapToQualify:   rejectedBy === "score_too_low"
      ? effectiveMin - breakdown.total
      : null,
  };
}

export async function GET() {
  // Build signals from cached candles only (no API calls — instant)
  const universes = ["sp500", "nasdaq100"] as const;
  const allSignals: StockSetup[] = [];

  // barCountOverride: CandleResult.barCount is authoritative — use it to patch
  // StockSetup.barCount which can be undefined due to `barCount > 0 ? barCount : undefined`
  const barCountOverrides = new Map<string, number>();

  for (const universe of universes) {
    const tickers = getTickerList(universe).filter((t) => !isDeadTicker(t.ticker));
    for (const info of tickers) {
      const cached = getCachedReal(info.ticker);
      if (!cached) continue;
      barCountOverrides.set(info.ticker, cached.barCount);
      const setups = scanTicker(info, undefined, cached.bars, cached.quality);
      allSignals.push(...setups);
    }
  }

  const cachedCount = allSignals.length;

  // Deduplicate by ticker (keep highest confidence)
  const byTicker = new Map<string, StockSetup>();
  for (const s of allSignals) {
    const ex = byTicker.get(s.ticker);
    if (!ex || s.confidenceScore > ex.confidenceScore) byTicker.set(s.ticker, s);
  }
  const signals = [...byTicker.values()];

  const regime = computeMarketRegime(signals);

  // Filter out dead prices, sort by score descending
  const scored = signals
    .filter((s) => isValidQuote(s.currentPrice) && s.currentPrice >= MIN_TRADEABLE_PRICE)
    .map((s) => ({ s, diag: diagnoseSignal(s, regime, barCountOverrides.get(s.ticker)) }))
    .sort((a, b) => b.diag.score - a.diag.score);

  const top10     = scored.slice(0, 10).map((x) => x.diag);
  const passing   = scored.filter((x) => x.diag.passesFilters).map((x) => x.diag);
  const rejReasons = scored.reduce<Record<string, number>>((acc, x) => {
    const r = x.diag.rejectedBy ?? "passes";
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    meta: {
      regime,
      marketOpen:    isMarketOpen(),
      totalSignals:  signals.length,
      cachedTickers: cachedCount,
      passingCount:  passing.length,
      rejectionBreakdown: rejReasons,
    },
    top10signals:   top10,
    passingSignals: passing.slice(0, 5),
  });
}
