/**
 * Scanner Scoring Engine
 *
 * Scores every StockSetup across 6 components (max 100), derives a market
 * regime from aggregate data, validates hard entry rules, and returns the
 * top 5 ranked setups.
 *
 * Pure functions only — no I/O, no React.
 *
 * DISCLAIMER: Scanner-generated trade ideas for educational analysis only,
 * not financial advice.
 */

import type { StockSetup, StockSetupType } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MarketRegime = "risk-on" | "neutral" | "defensive" | "high-volatility";

export interface ScannerScoreBreakdown {
  trend: number;          // 0–25: EMA alignment
  momentum: number;       // 0–20: RSI position + MACD
  volume: number;         // 0–15: relative volume ratio
  relativeStrength: number; // 0–15: confidence proxy
  riskReward: number;     // 0–15: R/R quality
  marketRegime: number;   // 0–10: regime fit
  total: number;          // 0–100
}

export interface ScoredSetup {
  setup: StockSetup;
  scoreBreakdown: ScannerScoreBreakdown;
  score: number;
  rank: number;
  reasoning: string;
}

// ── Validation ────────────────────────────────────────────────────────────────

const MIN_RR        = 1.5;
const MIN_CONF      = 60;
const MIN_SCORE     = 65;

export function validateForTopFive(setup: StockSetup): boolean {
  if (setup.status === "Failed" || setup.status === "Completed") return false;
  if (setup.entryPrice <= 0 || setup.stopLoss <= 0 || setup.takeProfit1 <= 0) return false;
  if (setup.stopLoss >= setup.entryPrice)  return false; // long rule
  if (setup.takeProfit1 <= setup.entryPrice) return false; // long rule
  if (!Number.isFinite(setup.riskReward) || setup.riskReward < MIN_RR) return false;
  if (setup.confidenceScore < MIN_CONF) return false;
  return true;
}

// ── Market regime ─────────────────────────────────────────────────────────────

export function computeMarketRegime(setups: StockSetup[]): MarketRegime {
  if (setups.length < 5) return "neutral";

  const avgRsi = setups.reduce((s, x) => s + x.indicators.rsi, 0) / setups.length;
  const avgVolRatio = setups.reduce((s, x) => s + (x.volRatio ?? 1), 0) / setups.length;

  const bullish = setups.filter(
    (s) => s.setupType === "Momentum Breakout" || s.setupType === "Trend Continuation",
  ).length;
  const bearish   = setups.filter((s) => s.setupType === "Oversold Bounce").length;
  const pullbacks = setups.filter((s) => s.setupType === "Pullback Buy").length;
  const bullishRatio  = bullish / setups.length;
  const bearishRatio  = bearish / setups.length;
  const pullbackRatio = pullbacks / setups.length;

  if (avgVolRatio > 1.8 && Math.abs(bullishRatio - 0.5) < 0.15) return "high-volatility";
  if (avgRsi > 58 && bullishRatio > 0.48 && avgVolRatio > 1.2)   return "risk-on";

  // Defensive: genuine RSI weakness OR Oversold Bounce dominance.
  // Pullback Buy dominance alone does NOT trigger defensive — normal mid-trend
  // consolidation produces high pullback ratios without being a true downtrend.
  // pullbackRatio only contributes when RSI is also soft (< 47), confirming
  // the pullbacks are happening in a weakening tape, not healthy rotation.
  if (avgRsi < 42) return "defensive";
  if (bearishRatio > 0.35) return "defensive";
  if (pullbackRatio > 0.55 && avgRsi < 47) return "defensive";
  return "neutral";
}

export const REGIME_LABEL: Record<MarketRegime, string> = {
  "risk-on":       "Risk-On",
  "neutral":       "Neutral",
  "defensive":     "Defensive",
  "high-volatility": "High Volatility",
};

export const REGIME_TONE: Record<MarketRegime, "positive" | "neutral" | "negative" | "warning"> = {
  "risk-on":         "positive",
  "neutral":         "neutral",
  "defensive":       "negative",
  "high-volatility": "warning",
};

// ── Individual component scorers ──────────────────────────────────────────────

export function calculateTrendScore(setup: StockSetup): number {
  const { currentPrice, indicators, setupType } = setup;
  let score = 0;
  if (currentPrice > indicators.ema200) score += 10;
  if (currentPrice > indicators.ema50)  score += 8;
  if (currentPrice > indicators.ema20)  score += 7;

  // Oversold Bounce structural support credit: the setup requires RSI ≤ 36
  // and elevated volume, which already confirms demand. When price is below all
  // EMAs (score === 0), grant 5 pts for structural demand signal — the stock
  // is oversold by definition and has some floor. Without this, Oversold Bounce
  // can never exceed ~55 pts in defensive and never qualifies at MIN_SCORE = 65.
  if (score === 0 && setupType === "Oversold Bounce") score = 5;

  return Math.min(25, score);
}

export function calculateMomentumScore(setup: StockSetup): number {
  const rsi  = setup.indicators.rsi;
  const macd = setup.indicators.macd;
  let score = 0;

  // RSI sweet spot scoring
  if      (rsi >= 50 && rsi <= 65) score += 15;
  else if (rsi >= 65 && rsi <= 72) score += 12;
  else if (rsi >= 45 && rsi <  50) score += 10;
  else if (rsi >= 35 && rsi <  45) score +=  8;
  else if (rsi >= 25 && rsi <  35) score +=  6; // oversold bounce candidates
  else                              score +=  3;

  if (macd === "Bullish") score += 5;
  else if (macd === "Neutral") score += 2;

  return Math.min(20, score);
}

export function calculateVolumeScore(setup: StockSetup): number {
  const vr = setup.volRatio ?? 1;
  if (vr >= 2.5) return 15;
  if (vr >= 2.0) return 13;
  if (vr >= 1.5) return 11;
  if (vr >= 1.2) return  8;
  if (vr >= 1.0) return  5;
  return 2;
}

export function calculateRelativeStrengthScore(setup: StockSetup): number {
  // Proxy: confidence score maps to relative-strength quality
  const conf = setup.confidenceScore;
  if (conf >= 85) return 15;
  if (conf >= 78) return 13;
  if (conf >= 70) return 11;
  if (conf >= 62) return  9;
  if (conf >= 55) return  7;
  return 4;
}

export function calculateRiskRewardScore(setup: StockSetup): number {
  const rr = setup.riskReward;
  if (!Number.isFinite(rr) || rr <= 0) return 0;
  if (rr >= 4.0) return 15;
  if (rr >= 3.0) return 13;
  if (rr >= 2.5) return 11;
  if (rr >= 2.0) return  9;
  if (rr >= 1.5) return  6;
  return 2;
}

export function calculateMarketRegimeScore(
  setup: StockSetup,
  regime: MarketRegime,
): number {
  const { setupType } = setup;

  switch (regime) {
    case "risk-on":
      if (setupType === "Momentum Breakout" || setupType === "Trend Continuation") return 10;
      if (setupType === "Pullback Buy")   return 7;
      if (setupType === "Oversold Bounce") return 4; // weak fit in bull market
      return 7;

    case "neutral":
      return 7; // all types roughly equal

    case "defensive":
      // Oversold Bounce is the correct setup for falling markets
      if (setupType === "Oversold Bounce")   return 10;
      // Pullback Buy is risky in downtrends — stocks pull back and keep falling
      if (setupType === "Pullback Buy")      return 2;
      // Aggressive setups (breakout/trend) go against the tape
      return 2;

    case "high-volatility":
      if (setupType === "Oversold Bounce")  return 8;
      if (setupType === "Pullback Buy")     return 4;
      return 5;
  }
}

// ── Composite scorer ──────────────────────────────────────────────────────────

export function calculateScannerScore(
  setup: StockSetup,
  regime: MarketRegime,
): ScannerScoreBreakdown {
  const trend          = calculateTrendScore(setup);
  const momentum       = calculateMomentumScore(setup);
  const volume         = calculateVolumeScore(setup);
  const relativeStrength = calculateRelativeStrengthScore(setup);
  const riskReward     = calculateRiskRewardScore(setup);
  const marketRegime   = calculateMarketRegimeScore(setup, regime);
  const total          = trend + momentum + volume + relativeStrength + riskReward + marketRegime;

  return { trend, momentum, volume, relativeStrength, riskReward, marketRegime, total };
}

// ── Reasoning generator ───────────────────────────────────────────────────────

export function generateReasoning(
  setup: StockSetup,
  rank: number,
  bd: ScannerScoreBreakdown,
): string {
  const parts: string[] = [];
  const t = setup.ticker;

  if (bd.trend >= 22)       parts.push("price aligned above all key EMAs");
  else if (bd.trend >= 15)  parts.push("above major moving averages");

  if (bd.momentum >= 17)      parts.push("RSI in bullish momentum zone");
  else if (bd.momentum >= 13) parts.push("constructive momentum profile");
  else if (bd.momentum >= 9)  parts.push("oversold recovery signal");

  if (bd.volume >= 12)      parts.push(`elevated volume (${(setup.volRatio ?? 1).toFixed(1)}× avg)`);
  else if (bd.volume >= 8)  parts.push("above-average volume");

  if (bd.relativeStrength >= 12) parts.push("high confidence score");

  if (setup.riskReward >= 2.5)
    parts.push(`strong ${setup.riskReward.toFixed(1)}:1 risk/reward`);
  else if (setup.riskReward >= 1.5)
    parts.push(`valid ${setup.riskReward.toFixed(1)}:1 risk/reward`);

  if (parts.length === 0) {
    return `${t} qualifies as a ${setup.setupType.toLowerCase()} setup with a ${bd.total}/100 scanner score.`;
  }

  const joined =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];

  return `${t} ranked #${rank} due to ${joined}.`;
}

// ── Top 5 selector ────────────────────────────────────────────────────────────

export function getTopFiveSetups(
  setups: StockSetup[],
  setupTypeFilter: "All" | StockSetupType = "All",
  regime?: MarketRegime,
): ScoredSetup[] {
  const derivedRegime = regime ?? computeMarketRegime(setups);

  // High-conviction score threshold — MB/TC in defensive must clear this bar
  const MIN_SCORE_DEFENSIVE_AGGRESSIVE = 75;

  const valid = setups.filter((s) => {
    if (!validateForTopFive(s)) return false;
    if (setupTypeFilter !== "All" && s.setupType !== setupTypeFilter) return false;
    // Pullback Buy is blocked in defensive regardless of score (falling stocks keep falling)
    if (derivedRegime === "defensive" && s.setupType === "Pullback Buy") return false;
    return true;
  });

  const scored = valid
    .map((setup) => {
      const bd = calculateScannerScore(setup, derivedRegime);
      const rawTotal = bd.total;
      // Aggressive setups penalised 15% in defensive, 5% in high-volatility
      const multiplier =
        derivedRegime === "defensive" &&
        (setup.setupType === "Momentum Breakout" || setup.setupType === "Trend Continuation")
          ? 0.85
          : derivedRegime === "high-volatility" &&
            (setup.setupType === "Momentum Breakout" || setup.setupType === "Trend Continuation")
          ? 0.95
          : 1;
      const adjTotal = Math.round(rawTotal * multiplier);
      return { setup, bd: { ...bd, total: adjTotal }, adjTotal };
    })
    .filter(({ adjTotal, setup }) => {
      // MB/TC in defensive: require higher bar (post-penalty score ≥ 75)
      if (
        derivedRegime === "defensive" &&
        (setup.setupType === "Momentum Breakout" || setup.setupType === "Trend Continuation")
      ) {
        return adjTotal >= MIN_SCORE_DEFENSIVE_AGGRESSIVE;
      }
      // Oversold Bounce in defensive: lowered to 58 (structural scoring disadvantage)
      if (derivedRegime === "defensive" && setup.setupType === "Oversold Bounce") {
        return adjTotal >= 58;
      }
      return adjTotal >= MIN_SCORE;
    })
    .sort((a, b) => b.adjTotal - a.adjTotal)
    // One entry per ticker — keep only the highest-scored setup for each stock
    .filter((() => {
      const seen = new Set<string>();
      return ({ setup }: { setup: StockSetup }) => {
        if (seen.has(setup.ticker)) return false;
        seen.add(setup.ticker);
        return true;
      };
    })())
    .slice(0, 5);

  return scored.map(({ setup, bd }, i) => {
    // Enrich the setup itself so rank + breakdown travel with the signal
    // into runCycle → PaperPosition.notes without any extra plumbing.
    const enrichedSetup: typeof setup = {
      ...setup,
      scannerScore:   bd.total,
      scannerRank:    i + 1,
      scoreBreakdown: { trend: bd.trend, momentum: bd.momentum, volume: bd.volume,
                         relativeStrength: bd.relativeStrength, riskReward: bd.riskReward,
                         marketRegime: bd.marketRegime },
      marketRegime:   derivedRegime,
    };
    return {
      setup:         enrichedSetup,
      scoreBreakdown:bd,
      score:         bd.total,
      rank:          i + 1,
      reasoning:     generateReasoning(setup, i + 1, bd),
    };
  });
}

// ── Summary stats ─────────────────────────────────────────────────────────────

export function getScannerSummary(
  setups: StockSetup[],
  scored: ScoredSetup[],
  regime: MarketRegime,
) {
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length)
      : 0;
  return { avgScore, regime, regimeLabel: REGIME_LABEL[regime], scoredCount: scored.length };
}
