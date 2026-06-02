/**
 * Paper Trading Analytics Engine — comprehensive metrics
 * Pure functions, no I/O.
 */

import type { PaperTrade, EquityCurvePoint } from "@/lib/paper-trading";
// Import dead ticker set for integrity checks — no I/O, just a Set<string>
import { DEAD_TICKERS } from "@/lib/scanner-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SetupTypeStats {
  setupType:    string;
  total:        number;
  wins:         number;
  losses:       number;
  winRate:      number;
  avgReturnPct: number;
  avgWinnerPct: number;
  avgLoserPct:  number;
  avgWinnerDollar: number;
  avgLoserDollar:  number;
  profitFactor:    number;
  totalPnL:        number;
  expectancy:      number;  // (winRate × avgWin$) - (lossRate × avgLoss$)
}

export interface ScoreBucket {
  label:     string;       // "90–100", "80–89", etc.
  minScore:  number;
  maxScore:  number;
  trades:    number;
  wins:      number;
  winRate:   number;
  avgReturn: number;
  totalPnL:  number;
}

export interface MonthlyReturn {
  month:     string;       // "2025-01"
  trades:    number;
  pnl:       number;
  returnPct: number;
}

export interface DrawdownPoint {
  date:        string;
  accountValue:number;
  drawdownPct: number;     // % below peak
}

export interface TradeAnalytics {
  // ── Overview ──────────────────────────────────────────────────────────────
  totalTrades:      number;
  openTrades:       number;   // set externally
  wins:             number;
  losses:           number;
  breakeven:        number;

  // ── Trade statistics ──────────────────────────────────────────────────────
  winRate:          number;
  lossRate:         number;
  avgReturnPct:     number;
  avgWinnerPct:     number;
  avgLoserPct:      number;
  avgWinnerDollar:  number;
  avgLoserDollar:   number;
  largestWinnerPct: number;
  largestLoserPct:  number;
  largestWinner:    PaperTrade | null;
  largestLoser:     PaperTrade | null;
  avgHoldTimeHours: number;

  // ── Risk metrics ──────────────────────────────────────────────────────────
  profitFactor:     number;
  expectancy:       number;   // expected $ per trade
  avgRiskReward:    number;   // avg (tp1-entry)/(entry-sl)
  maxDrawdownPct:   number;
  currentDrawdownPct: number;
  totalPnL:         number;

  // ── Breakdowns ────────────────────────────────────────────────────────────
  bySetupType:      SetupTypeStats[];
  scoreBuckets:     ScoreBucket[];
  monthlyReturns:   MonthlyReturn[];
  drawdownSeries:   DrawdownPoint[];
  bestDay:          { date: string; pnl: number } | null;
  worstDay:         { date: string; pnl: number } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function holdHours(t: PaperTrade): number {
  if (t.holdTimeHours !== undefined) return t.holdTimeHours;
  if (!t.openedAt || !t.closedAt) return 0;
  return (new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()) / 3_600_000;
}

function tradeRR(t: PaperTrade): number | null {
  const sl = t.slAtEntry ?? (t.notes as {slAtEntry?: number} | undefined)?.slAtEntry;
  const tp = t.tp1AtEntry ?? (t.notes as {tp1AtEntry?: number} | undefined)?.tp1AtEntry;
  if (!sl || !tp || sl >= t.buyPrice || tp <= t.buyPrice) return null;
  return (tp - t.buyPrice) / (t.buyPrice - sl);
}

function setupStats(trades: PaperTrade[], setupType: string): SetupTypeStats {
  const g   = trades.filter((t) => t.setupType === setupType);
  const w   = g.filter((t) => t.result === "win");
  const l   = g.filter((t) => t.result === "loss");
  const gains  = w.reduce((s, t) => s + Math.abs(t.profitLoss), 0);
  const losses = l.reduce((s, t) => s + Math.abs(t.profitLoss), 0);
  const wr   = g.length > 0 ? w.length / g.length : 0;
  const lr   = 1 - wr;
  const aW   = avg(w.map((t) => t.profitLoss));
  const aL   = avg(l.map((t) => Math.abs(t.profitLoss)));
  return {
    setupType,
    total:           g.length,
    wins:            w.length,
    losses:          l.length,
    winRate:         wr,
    avgReturnPct:    avg(g.map((t) => t.profitLossPercent)),
    avgWinnerPct:    avg(w.map((t) => t.profitLossPercent)),
    avgLoserPct:     avg(l.map((t) => t.profitLossPercent)),
    avgWinnerDollar: aW,
    avgLoserDollar:  aL,
    profitFactor:    losses > 0 ? gains / losses : gains > 0 ? Infinity : 0,
    totalPnL:        g.reduce((s, t) => s + t.profitLoss, 0),
    expectancy:      (wr * aW) - (lr * aL),
  };
}

// ── Drawdown computation ──────────────────────────────────────────────────────

function computeDrawdown(equity: EquityCurvePoint[]): {
  series:        DrawdownPoint[];
  maxDrawdownPct:number;
  currentDrawdownPct: number;
  bestDay:       { date: string; pnl: number } | null;
  worstDay:      { date: string; pnl: number } | null;
} {
  if (equity.length === 0) {
    return { series: [], maxDrawdownPct: 0, currentDrawdownPct: 0, bestDay: null, worstDay: null };
  }

  let peak = equity[0].accountValue;
  let maxDD = 0;
  let bestDay:  { date: string; pnl: number } | null = null;
  let worstDay: { date: string; pnl: number } | null = null;

  const series: DrawdownPoint[] = equity.map((p, i) => {
    if (p.accountValue > peak) peak = p.accountValue;
    const dd = peak > 0 ? ((peak - p.accountValue) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;

    // Daily P/L
    if (i > 0) {
      const dailyPnl = p.accountValue - equity[i - 1].accountValue;
      if (!bestDay  || dailyPnl > bestDay.pnl)  bestDay  = { date: p.date, pnl: dailyPnl };
      if (!worstDay || dailyPnl < worstDay.pnl) worstDay = { date: p.date, pnl: dailyPnl };
    }

    return { date: p.date, accountValue: p.accountValue, drawdownPct: dd };
  });

  const last = equity[equity.length - 1];
  const currentDD = peak > 0 ? ((peak - last.accountValue) / peak) * 100 : 0;

  return { series, maxDrawdownPct: maxDD, currentDrawdownPct: currentDD, bestDay, worstDay };
}

// ── Score buckets ─────────────────────────────────────────────────────────────

const SCORE_RANGES = [
  { label: "90–100", min: 90, max: 100 },
  { label: "80–89",  min: 80, max: 89  },
  { label: "70–79",  min: 70, max: 79  },
  { label: "60–69",  min: 60, max: 69  },
  { label: "<60",    min: 0,  max: 59  },
];

function getScore(t: PaperTrade): number | undefined {
  return (t.notes as { scannerScore?: number } | undefined)?.scannerScore;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeAnalytics(
  trades:    PaperTrade[],
  equity:    EquityCurvePoint[],
  openCount  = 0,
): TradeAnalytics {
  const resolved = trades.filter(
    (t) => t.result === "win" || t.result === "loss" || t.result === "breakeven",
  );
  const wins    = resolved.filter((t) => t.result === "win");
  const losses  = resolved.filter((t) => t.result === "loss");

  const sumGains  = wins.reduce((s, t) => s + Math.abs(t.profitLoss), 0);
  const sumLosses = losses.reduce((s, t) => s + Math.abs(t.profitLoss), 0);
  const profitFactor = sumLosses > 0 ? sumGains / sumLosses
    : sumGains > 0 ? Infinity : 0;

  const winRate  = resolved.length > 0 ? wins.length / resolved.length : 0;
  const lossRate = 1 - winRate;
  const aW = avg(wins.map((t) => t.profitLoss));
  const aL = avg(losses.map((t) => Math.abs(t.profitLoss)));
  const expectancy = (winRate * aW) - (lossRate * aL);

  // Average Risk/Reward
  const rrValues = resolved.map(tradeRR).filter((v): v is number => v !== null);
  const avgRiskReward = avg(rrValues);

  const largestWinner = wins.reduce<PaperTrade | null>(
    (b, t) => b === null || t.profitLoss > b.profitLoss ? t : b, null,
  );
  const largestLoser = losses.reduce<PaperTrade | null>(
    (w, t) => w === null || t.profitLoss < w.profitLoss ? t : w, null,
  );

  // Setup breakdown
  const types = [...new Set(resolved.map((t) => t.setupType))].sort();
  const bySetupType = types.map((st) => setupStats(resolved, st));

  // Score buckets
  const scored = resolved.filter((t) => getScore(t) !== undefined);
  const scoreBuckets: ScoreBucket[] = SCORE_RANGES.map(({ label, min, max }) => {
    const g = scored.filter((t) => {
      const s = getScore(t)!;
      return s >= min && s <= max;
    });
    const w = g.filter((t) => t.result === "win");
    return {
      label,
      minScore:  min,
      maxScore:  max,
      trades:    g.length,
      wins:      w.length,
      winRate:   g.length > 0 ? w.length / g.length : 0,
      avgReturn: avg(g.map((t) => t.profitLossPercent)),
      totalPnL:  g.reduce((s, t) => s + t.profitLoss, 0),
    };
  }).filter((b) => b.trades > 0);

  // Monthly returns
  const byMonth = new Map<string, PaperTrade[]>();
  for (const t of resolved) {
    const m = t.closedAt?.slice(0, 7) ?? "unknown";
    byMonth.set(m, [...(byMonth.get(m) ?? []), t]);
  }
  const monthlyReturns: MonthlyReturn[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, mT]) => ({
      month,
      trades:    mT.length,
      pnl:       mT.reduce((s, t) => s + t.profitLoss, 0),
      returnPct: avg(mT.map((t) => t.profitLossPercent)),
    }));

  // Drawdown
  const dd = computeDrawdown(equity);

  return {
    totalTrades:       resolved.length,
    openTrades:        openCount,
    wins:              wins.length,
    losses:            losses.length,
    breakeven:         resolved.filter((t) => t.result === "breakeven").length,

    winRate,
    lossRate,
    avgReturnPct:      avg(resolved.map((t) => t.profitLossPercent)),
    avgWinnerPct:      avg(wins.map((t) => t.profitLossPercent)),
    avgLoserPct:       avg(losses.map((t) => t.profitLossPercent)),
    avgWinnerDollar:   aW,
    avgLoserDollar:    aL,
    largestWinnerPct:  largestWinner?.profitLossPercent ?? 0,
    largestLoserPct:   largestLoser?.profitLossPercent ?? 0,
    largestWinner,
    largestLoser,
    avgHoldTimeHours:  avg(resolved.map(holdHours)),

    profitFactor,
    expectancy,
    avgRiskReward,
    maxDrawdownPct:    dd.maxDrawdownPct,
    currentDrawdownPct:dd.currentDrawdownPct,
    totalPnL:          resolved.reduce((s, t) => s + t.profitLoss, 0),

    bySetupType,
    scoreBuckets,
    monthlyReturns,
    drawdownSeries:    dd.series,
    bestDay:           dd.bestDay,
    worstDay:          dd.worstDay,
  };
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function formatHoldTime(hours: number): string {
  if (hours < 1)  return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function positionAgeHours(openedAt: string): number {
  return (Date.now() - new Date(openedAt).getTime()) / 3_600_000;
}

export function positionAgeDays(openedAt: string): number {
  return positionAgeHours(openedAt) / 24;
}

/** Returns a colour class based on win rate and minimum sample size. */
export function winRateColor(wr: number, n: number): string {
  if (n < 3) return "text-muted-foreground";
  if (wr >= 0.60) return "text-positive";
  if (wr >= 0.45) return "text-foreground";
  return "text-destructive";
}

// ── Helper to read typed notes fields ────────────────────────────────────────

function noteNum(t: PaperTrade, key: string): number | undefined {
  const v = (t.notes as Record<string, unknown> | undefined)?.[key];
  return typeof v === "number" ? v : undefined;
}
function noteStr(t: PaperTrade, key: string): string | undefined {
  const v = (t.notes as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" ? v : undefined;
}

// ── Phase 3: Confidence buckets ───────────────────────────────────────────────

const CONF_RANGES = [
  { label: "90%+",   min: 90, max: 100 },
  { label: "80–89%", min: 80, max: 89  },
  { label: "70–79%", min: 70, max: 79  },
  { label: "60–69%", min: 60, max: 69  },
  { label: "<60%",   min: 0,  max: 59  },
];

export function computeConfidenceBuckets(trades: PaperTrade[]): ScoreBucket[] {
  const resolved = trades.filter((t) => t.result === "win" || t.result === "loss");
  const scored   = resolved.filter((t) => noteNum(t, "confidence") !== undefined);
  return CONF_RANGES.map(({ label, min, max }) => {
    const g  = scored.filter((t) => { const c = noteNum(t, "confidence")!; return c >= min && c <= max; });
    const w  = g.filter((t) => t.result === "win");
    const gains  = w.reduce((s, t) => s + Math.abs(t.profitLoss), 0);
    const losses = g.filter((t) => t.result === "loss").reduce((s, t) => s + Math.abs(t.profitLoss), 0);
    return {
      label, minScore: min, maxScore: max,
      trades: g.length, wins: w.length,
      winRate:   g.length > 0 ? w.length / g.length : 0,
      avgReturn: avg(g.map((t) => t.profitLossPercent)),
      totalPnL:  g.reduce((s, t) => s + t.profitLoss, 0),
    };
  }).filter((b) => b.trades > 0);
}

// ── Phase 4: Hold time analysis ───────────────────────────────────────────────

export interface HoldTimeAnalysis {
  avgWinnersHours:  number;
  avgLosersHours:   number;
  fastestWinner:    PaperTrade | null;
  longestWinner:    PaperTrade | null;
  fastestLoss:      PaperTrade | null;
  longestLoss:      PaperTrade | null;
}

export function computeHoldTimeAnalysis(trades: PaperTrade[]): HoldTimeAnalysis {
  const resolved = trades.filter((t) => t.result === "win" || t.result === "loss");
  const winners  = resolved.filter((t) => t.result === "win");
  const losers   = resolved.filter((t) => t.result === "loss");
  return {
    avgWinnersHours: avg(winners.map(holdHours)),
    avgLosersHours:  avg(losers.map(holdHours)),
    fastestWinner:   winners.reduce<PaperTrade | null>((b, t) => !b || holdHours(t) < holdHours(b) ? t : b, null),
    longestWinner:   winners.reduce<PaperTrade | null>((b, t) => !b || holdHours(t) > holdHours(b) ? t : b, null),
    fastestLoss:     losers.reduce<PaperTrade | null>((b, t) => !b || holdHours(t) < holdHours(b) ? t : b, null),
    longestLoss:     losers.reduce<PaperTrade | null>((b, t) => !b || holdHours(t) > holdHours(b) ? t : b, null),
  };
}

// ── Phase 5: Risk/Reward analysis ─────────────────────────────────────────────

export interface RRAnalysis {
  avgPlannedRR:    number;
  avgActualRR:     number;
  tradesWithData:  number;
  rrDeliveryRate:  number; // % of trades that hit TP (actual ≥ planned)
}

export function computeRRAnalysis(trades: PaperTrade[]): RRAnalysis {
  const resolved = trades.filter((t) => t.result === "win" || t.result === "loss");

  const withData = resolved.filter((t) => {
    const sl = t.slAtEntry; const tp = t.tp1AtEntry;
    return sl && tp && sl < t.buyPrice && tp > t.buyPrice;
  });

  const planned = withData.map((t) => (t.tp1AtEntry! - t.buyPrice) / (t.buyPrice - t.slAtEntry!));
  const actual  = withData.map((t) => (t.sellPrice - t.buyPrice) / Math.max(0.001, t.buyPrice - (t.slAtEntry ?? t.buyPrice * 0.98)));
  const delivered = withData.filter((t) => t.result === "win").length;

  return {
    avgPlannedRR:   avg(planned),
    avgActualRR:    avg(actual),
    tradesWithData: withData.length,
    rrDeliveryRate: withData.length > 0 ? delivered / withData.length : 0,
  };
}

// ── Phases 6 & 7: Ticker performance ─────────────────────────────────────────

export interface TickerStats {
  ticker:   string;
  trades:   number;
  wins:     number;
  losses:   number;
  winRate:  number;
  totalPnL: number;
  avgReturn:number;
}

export function computeTickerPerformance(trades: PaperTrade[]): {
  best:  TickerStats[];
  worst: TickerStats[];
} {
  const resolved = trades.filter((t) => t.result === "win" || t.result === "loss");
  const grouped  = new Map<string, PaperTrade[]>();
  for (const t of resolved) {
    grouped.set(t.ticker, [...(grouped.get(t.ticker) ?? []), t]);
  }
  const stats: TickerStats[] = [...grouped.entries()].map(([ticker, g]) => {
    const w = g.filter((t) => t.result === "win");
    return {
      ticker,
      trades:    g.length,
      wins:      w.length,
      losses:    g.filter((t) => t.result === "loss").length,
      winRate:   g.length > 0 ? w.length / g.length : 0,
      totalPnL:  g.reduce((s, t) => s + t.profitLoss, 0),
      avgReturn: avg(g.map((t) => t.profitLossPercent)),
    };
  });
  const sorted = [...stats].sort((a, b) => b.totalPnL - a.totalPnL);
  return { best: sorted.slice(0, 10), worst: [...sorted].reverse().slice(0, 10) };
}

// ── Phase 8: Market regime analysis ──────────────────────────────────────────

export interface RegimeStats {
  regime:       string;
  trades:       number;
  wins:         number;
  winRate:      number;
  profitFactor: number;
  totalPnL:     number;
}

export function computeRegimeAnalysis(trades: PaperTrade[]): RegimeStats[] {
  const resolved = trades.filter((t) => t.result === "win" || t.result === "loss");
  const withData = resolved.filter((t) => noteStr(t, "marketRegime"));
  const grouped  = new Map<string, PaperTrade[]>();
  for (const t of withData) {
    const r = noteStr(t, "marketRegime")!;
    grouped.set(r, [...(grouped.get(r) ?? []), t]);
  }
  return [...grouped.entries()].map(([regime, g]) => {
    const w     = g.filter((t) => t.result === "win");
    const gains = w.reduce((s, t) => s + Math.abs(t.profitLoss), 0);
    const ls    = g.filter((t) => t.result === "loss").reduce((s, t) => s + Math.abs(t.profitLoss), 0);
    return {
      regime,
      trades:       g.length,
      wins:         w.length,
      winRate:      g.length > 0 ? w.length / g.length : 0,
      profitFactor: ls > 0 ? gains / ls : gains > 0 ? Infinity : 0,
      totalPnL:     g.reduce((s, t) => s + t.profitLoss, 0),
    };
  }).sort((a, b) => b.totalPnL - a.totalPnL);
}

// ── Phase 9: Data integrity check ────────────────────────────────────────────

export interface DataIntegrityResult {
  total:          number;
  complete:       number;        // all key fields present
  missingScore:   number;
  missingConf:    number;
  missingBreakdown: number;
  missingHoldTime:number;
  completenessRate: number;      // 0–1
}

export function checkDataIntegrity(trades: PaperTrade[]): DataIntegrityResult {
  const resolved = trades.filter((t) => t.result === "win" || t.result === "loss");
  let missingScore = 0, missingConf = 0, missingBreakdown = 0, missingHoldTime = 0, complete = 0;
  for (const t of resolved) {
    const n   = t.notes as Record<string, unknown> | undefined;
    const hasScore   = n?.scannerScore != null;
    const hasConf    = n?.confidence   != null;
    const hasBreak   = n?.scoreBreakdown != null;
    const hasHold    = (t.holdTimeHours != null) || (t.openedAt && t.closedAt);
    if (!hasScore)   missingScore++;
    if (!hasConf)    missingConf++;
    if (!hasBreak)   missingBreakdown++;
    if (!hasHold)    missingHoldTime++;
    if (hasScore && hasConf && hasBreak && hasHold) complete++;
  }
  return {
    total: resolved.length,
    complete,
    missingScore,
    missingConf,
    missingBreakdown,
    missingHoldTime,
    completenessRate: resolved.length > 0 ? complete / resolved.length : 0,
  };
}

// ── Phase 10: Scanner health report ──────────────────────────────────────────

export interface HealthReport {
  bestSetup:        string;
  worstSetup:       string;
  bestScoreRange:   string;
  worstScoreRange:  string;
  bestTicker:       string;
  worstTicker:      string;
  profitFactor:     number;
  expectancy:       number;
  recommendation:   string;
  isStatistical:    boolean;  // true when ≥30 trades
  insights:         string[];
}

export function generateHealthReport(
  analytics: TradeAnalytics,
  scoreBuckets: ScoreBucket[],
  confBuckets: ScoreBucket[],
  ticker: { best: TickerStats[]; worst: TickerStats[] },
): HealthReport {
  const n         = analytics.totalTrades;
  const isStatistical = n >= 30;

  // Best/worst setup by expectancy (need ≥3 trades)
  const setups    = analytics.bySetupType.filter((s) => s.total >= 3).sort((a, b) => b.expectancy - a.expectancy);
  const bestSetup = setups[0]?.setupType ?? "Insufficient data";
  const worstSetup= setups[setups.length - 1]?.setupType ?? "Insufficient data";

  // Best/worst score range
  const sBuckets  = scoreBuckets.filter((b) => b.trades >= 3).sort((a, b) => b.winRate - a.winRate);
  const bestScore = sBuckets[0]?.label ?? "—";
  const worstScore= sBuckets[sBuckets.length - 1]?.label ?? "—";

  // Best/worst ticker
  const bestTick  = ticker.best[0]?.ticker ?? "—";
  const worstTick = ticker.worst[0]?.ticker ?? "—";

  // Auto-generated insights
  const insights: string[] = [];
  if (n < 10) {
    insights.push(`Only ${n} closed trade${n !== 1 ? "s" : ""} — need ≥30 for statistical conclusions.`);
  }
  if (setups.length >= 2) {
    insights.push(`${bestSetup} outperforms ${worstSetup} (by expectancy).`);
  }
  if (sBuckets.length >= 2) {
    insights.push(`Score range ${bestScore} has ${(sBuckets[0].winRate * 100).toFixed(0)}% win rate vs ${(sBuckets[sBuckets.length - 1].winRate * 100).toFixed(0)}% for ${worstScore}.`);
  }
  if (analytics.profitFactor < 1 && n >= 5) {
    insights.push(`Profit factor ${analytics.profitFactor.toFixed(2)} < 1.0 — the system is currently unprofitable. Tighten setup filters.`);
  } else if (analytics.profitFactor >= 1.5 && n >= 5) {
    insights.push(`Profit factor ${analytics.profitFactor.toFixed(2)} is healthy — system has a positive edge.`);
  }
  if (analytics.winRate < 0.45 && n >= 10) {
    insights.push(`Win rate ${(analytics.winRate * 100).toFixed(0)}% is below 45%. Consider raising minimum confidence threshold.`);
  }
  if (scoreBuckets.length > 1) {
    const highScoreBucket = scoreBuckets.find((b) => b.minScore >= 80 && b.trades >= 3);
    if (highScoreBucket && highScoreBucket.winRate > analytics.winRate + 0.1) {
      insights.push(`Trades with score 80+ have ${(highScoreBucket.winRate * 100).toFixed(0)}% win rate vs ${(analytics.winRate * 100).toFixed(0)}% overall — consider filtering below 80.`);
    }
  }

  // Recommendation
  let recommendation = "Continue collecting data.";
  if (n >= 10) {
    if (analytics.profitFactor >= 1.5 && analytics.winRate >= 0.55) {
      recommendation = "Scanner is performing well. Continue current settings and scale up gradually.";
    } else if (analytics.profitFactor < 1) {
      recommendation = `System is unprofitable (PF ${analytics.profitFactor.toFixed(2)}). Consider raising minimum score to 80+ and minimum confidence to 75%.`;
    } else {
      recommendation = `Marginal edge (PF ${analytics.profitFactor.toFixed(2)}). Try focusing exclusively on ${bestSetup} setups scoring 80+.`;
    }
  }

  return {
    bestSetup, worstSetup, bestScoreRange: bestScore, worstScoreRange: worstScore,
    bestTicker: bestTick, worstTicker: worstTick,
    profitFactor: analytics.profitFactor,
    expectancy:   analytics.expectancy,
    recommendation,
    isStatistical,
    insights,
  };
}

// ── Strategy Rule Simulator ───────────────────────────────────────────────────

export const SETUP_TYPES = [
  "Momentum Breakout",
  "Pullback Buy",
  "Oversold Bounce",
  "Trend Continuation",
] as const;

export interface SimulatorFilters {
  minScore:       number;     // 0–100, trades below this are excluded
  minConfidence:  number;     // 0–100
  allowedSetups:  string[];   // empty = all setups allowed
  excludeTickers: string[];   // uppercase tickers to exclude
  allowedRegimes: string[];   // empty = all regimes
  minRR:          number;     // 0 = no filter; trades with planned RR below this excluded
}

export const DEFAULT_SIMULATOR_FILTERS: SimulatorFilters = {
  minScore:       0,
  minConfidence:  0,
  allowedSetups:  [],
  excludeTickers: [],
  allowedRegimes: [],
  minRR:          0,
};

export interface SimulationResult {
  includedTrades: number;
  excludedTrades: number;
  wins:           number;
  losses:         number;
  winRate:        number;
  totalPnL:       number;
  profitFactor:   number;
  expectancy:     number;     // (winRate × avgWin$) - (lossRate × avgLoss$)
  avgWinnerDollar:number;
  avgLoserDollar: number;
  maxDrawdownPct: number;
  avgReturnPct:   number;
}

function simulatedDrawdown(sorted: PaperTrade[], startBalance = 1000): number {
  let balance = startBalance;
  let peak    = startBalance;
  let maxDD   = 0;
  for (const t of sorted) {
    balance += t.profitLoss;
    if (balance > peak) peak = balance;
    const dd = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

export function simulateRules(
  trades:  PaperTrade[],
  filters: SimulatorFilters,
): SimulationResult {
  const resolved = trades.filter((t) => t.result === "win" || t.result === "loss");

  const passing = resolved.filter((t) => {
    const n = (t.notes ?? {}) as Record<string, unknown>;

    // Score filter
    const score = typeof n.scannerScore === "number" ? n.scannerScore : null;
    if (filters.minScore > 0 && (score === null || score < filters.minScore)) return false;

    // Confidence filter
    const conf = typeof n.confidence === "number" ? n.confidence : null;
    if (filters.minConfidence > 0 && (conf === null || conf < filters.minConfidence)) return false;

    // Setup type filter
    if (filters.allowedSetups.length > 0 && !filters.allowedSetups.includes(t.setupType)) return false;

    // Ticker exclusion
    if (filters.excludeTickers.length > 0 && filters.excludeTickers.includes(t.ticker.toUpperCase())) return false;

    // Regime filter
    const regime = typeof n.marketRegime === "string" ? n.marketRegime : null;
    if (filters.allowedRegimes.length > 0) {
      if (!regime || !filters.allowedRegimes.includes(regime)) return false;
    }

    // R/R filter
    if (filters.minRR > 0 && t.slAtEntry && t.tp1AtEntry && t.slAtEntry < t.buyPrice) {
      const rr = (t.tp1AtEntry - t.buyPrice) / (t.buyPrice - t.slAtEntry);
      if (rr < filters.minRR) return false;
    }

    return true;
  });

  const wins    = passing.filter((t) => t.result === "win");
  const losses  = passing.filter((t) => t.result === "loss");
  const sumGains= wins.reduce((s, t) => s + Math.abs(t.profitLoss), 0);
  const sumLoss = losses.reduce((s, t) => s + Math.abs(t.profitLoss), 0);
  const aW      = wins.length   > 0 ? sumGains / wins.length   : 0;
  const aL      = losses.length > 0 ? sumLoss  / losses.length : 0;
  const wr      = passing.length > 0 ? wins.length / passing.length : 0;
  const pf      = sumLoss > 0 ? sumGains / sumLoss : sumGains > 0 ? Infinity : 0;
  const exp     = (wr * aW) - ((1 - wr) * aL);

  const sorted  = [...passing].sort((a, b) => a.closedAt.localeCompare(b.closedAt));

  return {
    includedTrades:  passing.length,
    excludedTrades:  resolved.length - passing.length,
    wins:            wins.length,
    losses:          losses.length,
    winRate:         wr,
    totalPnL:        passing.reduce((s, t) => s + t.profitLoss, 0),
    profitFactor:    pf,
    expectancy:      exp,
    avgWinnerDollar: aW,
    avgLoserDollar:  aL,
    maxDrawdownPct:  simulatedDrawdown(sorted),
    avgReturnPct:    avg(passing.map((t) => t.profitLossPercent)),
  };
}

// ── Optimization Suggestions ──────────────────────────────────────────────────

export type SuggestionSeverity = "critical" | "warning" | "info" | "positive";

export interface OptimizationSuggestion {
  id:         string;
  severity:   SuggestionSeverity;
  category:   string;
  title:      string;
  detail:     string;
  action?:    string;   // concrete parameter change e.g. "Raise minimum score from 75 → 82"
  dataPoints: number;  // trades backing this suggestion
}

export interface OptimizationReport {
  suggestions:             OptimizationSuggestion[];
  suggestedMinScore:       number | null;
  suggestedMinConfidence:  number | null;
  bestSetupType:           string | null;
  worstSetupType:          string | null;
  bestTicker:              string | null;
  worstTicker:             string | null;
  insufficientData:        boolean;
  tradesAnalyzed:          number;
}

const MIN_BUCKET_SIZE = 3;  // minimum trades in a bucket before suggesting changes
const MIN_TOTAL       = 10; // minimum total trades before showing concrete suggestions

export function generateOptimizationSuggestions(
  trades:       PaperTrade[],
  scoreBuckets: ScoreBucket[],
  confBuckets:  ScoreBucket[],
  setupStats:   SetupTypeStats[],
  tickerBest:   TickerStats[],
  tickerWorst:  TickerStats[],
  regimeStats:  RegimeStats[],
): OptimizationReport {
  const resolved = trades.filter((t) => t.result === "win" || t.result === "loss");
  const n        = resolved.length;
  const sug: OptimizationSuggestion[] = [];

  // ── Insufficient data warning ─────────────────────────────────────────────
  if (n < MIN_TOTAL) {
    return {
      suggestions: [{
        id: "insufficient-data", severity: "info", category: "Data",
        title: `Only ${n} closed trade${n !== 1 ? "s" : ""} — need ≥${MIN_TOTAL} for suggestions`,
        detail: `Optimization suggestions become meaningful at ≥10 trades and statistically reliable at ≥30. Keep running the paper trader.`,
        dataPoints: n,
      }],
      suggestedMinScore: null, suggestedMinConfidence: null,
      bestSetupType: null, worstSetupType: null,
      bestTicker: null, worstTicker: null,
      insufficientData: true, tradesAnalyzed: n,
    };
  }

  // ── Overall system health ─────────────────────────────────────────────────
  const sumGains  = resolved.filter((t) => t.result === "win").reduce((s, t) => s + Math.abs(t.profitLoss), 0);
  const sumLosses = resolved.filter((t) => t.result === "loss").reduce((s, t) => s + Math.abs(t.profitLoss), 0);
  const pf        = sumLosses > 0 ? sumGains / sumLosses : sumGains > 0 ? Infinity : 0;
  const wr        = n > 0 ? resolved.filter((t) => t.result === "win").length / n : 0;

  if (pf < 1 && n >= MIN_TOTAL) {
    sug.push({ id: "pf-below-1", severity: "critical", category: "System",
      title: "Profit factor below 1.0 — system is losing money",
      detail: `Current profit factor ${pf.toFixed(2)} means every $1 of gains is offset by more than $1 of losses. Action required before scaling up.`,
      action: "Tighten minimum score and confidence thresholds until profit factor exceeds 1.5.",
      dataPoints: n });
  } else if (pf >= 2 && n >= MIN_TOTAL) {
    sug.push({ id: "pf-excellent", severity: "positive", category: "System",
      title: `Strong profit factor: ${pf.toFixed(2)}`,
      detail: `The scanner is generating a meaningful edge. Consider increasing position sizing gradually.`,
      dataPoints: n });
  }

  // ── Scanner score analysis ────────────────────────────────────────────────
  let suggestedMinScore: number | null = null;
  const validScoreBuckets = scoreBuckets.filter((b) => b.trades >= MIN_BUCKET_SIZE);

  if (validScoreBuckets.length >= 2) {
    // Find the lowest score bucket that has acceptable win rate (≥50%)
    const sorted = [...validScoreBuckets].sort((a, b) => a.minScore - b.minScore);
    const passing = sorted.filter((b) => b.winRate >= 0.50);
    const failing = sorted.filter((b) => b.winRate < 0.50);

    if (failing.length > 0) {
      const worstBucket = failing[failing.length - 1];
      const bestFailing = passing.length > 0 ? passing[0] : null;
      suggestedMinScore = bestFailing ? bestFailing.minScore : worstBucket.maxScore + 1;

      sug.push({ id: "score-cutoff", severity: "warning", category: "Scanner Score",
        title: `Scores ${worstBucket.label} are underperforming (${(worstBucket.winRate * 100).toFixed(0)}% win rate)`,
        detail: `${worstBucket.trades} trades in the ${worstBucket.label} bucket: ${(worstBucket.winRate * 100).toFixed(0)}% win rate vs ${(wr * 100).toFixed(0)}% overall. These trades are dragging down performance.`,
        action: `Raise minimum scanner score from current threshold to ${suggestedMinScore}.`,
        dataPoints: worstBucket.trades });
    }

    // Compare top vs bottom bucket
    const topBucket = sorted[sorted.length - 1];
    const botBucket = sorted[0];
    if (topBucket !== botBucket && topBucket.trades >= MIN_BUCKET_SIZE && botBucket.trades >= MIN_BUCKET_SIZE) {
      const diff = (topBucket.winRate - botBucket.winRate) * 100;
      if (diff > 15) {
        sug.push({ id: "score-spread", severity: "info", category: "Scanner Score",
          title: `Score range ${topBucket.label} outperforms ${botBucket.label} by ${diff.toFixed(0)}pp`,
          detail: `${topBucket.label}: ${(topBucket.winRate * 100).toFixed(0)}% win rate, avg ${topBucket.avgReturn.toFixed(1)}%. ${botBucket.label}: ${(botBucket.winRate * 100).toFixed(0)}% win rate. Focus on higher-scored setups.`,
          dataPoints: topBucket.trades + botBucket.trades });
      }
    }
  } else if (scoreBuckets.length > 0) {
    sug.push({ id: "score-small-n", severity: "info", category: "Scanner Score",
      title: "Score data available but buckets need more trades for conclusions",
      detail: `Need ≥${MIN_BUCKET_SIZE} trades per score range to compare performance. Keep running the paper trader.`,
      dataPoints: scoreBuckets.reduce((s, b) => s + b.trades, 0) });
  } else {
    sug.push({ id: "score-missing", severity: "warning", category: "Scanner Score",
      title: "No scanner scores recorded in trade history",
      detail: "Execute trades via Execute Top Pick to automatically store scanner scores for analysis.",
      dataPoints: 0 });
  }

  // ── Confidence analysis ───────────────────────────────────────────────────
  let suggestedMinConfidence: number | null = null;
  const validConfBuckets = confBuckets.filter((b) => b.trades >= MIN_BUCKET_SIZE);

  if (validConfBuckets.length >= 2) {
    const sortedC  = [...validConfBuckets].sort((a, b) => a.minScore - b.minScore);
    const failingC = sortedC.filter((b) => b.winRate < 0.50);

    if (failingC.length > 0) {
      const worstC = failingC[failingC.length - 1];
      const passC  = sortedC.filter((b) => b.winRate >= 0.50);
      suggestedMinConfidence = passC.length > 0 ? passC[0].minScore : worstC.maxScore + 1;

      sug.push({ id: "conf-cutoff", severity: "warning", category: "Confidence",
        title: `Confidence ${worstC.label} is underperforming (${(worstC.winRate * 100).toFixed(0)}% win rate)`,
        detail: `${worstC.trades} trades at ${worstC.label} confidence: ${(worstC.winRate * 100).toFixed(0)}% win rate. Low-confidence signals are not converting.`,
        action: `Increase minimum confidence from current threshold to ${suggestedMinConfidence}%.`,
        dataPoints: worstC.trades });
    }
  } else if (confBuckets.length === 0) {
    sug.push({ id: "conf-missing", severity: "info", category: "Confidence",
      title: "No confidence data in trade history yet",
      detail: "Execute Top Pick stores confidence at entry. Accumulate more trades to see confidence analysis.",
      dataPoints: 0 });
  }

  // ── Setup type analysis ───────────────────────────────────────────────────
  const validSetups    = setupStats.filter((s) => s.total >= MIN_BUCKET_SIZE);
  const sortedSetups   = [...validSetups].sort((a, b) => b.expectancy - a.expectancy);
  const bestSetupType  = sortedSetups[0]?.setupType ?? null;
  const worstSetupType = sortedSetups[sortedSetups.length - 1]?.setupType ?? null;

  if (sortedSetups.length >= 2) {
    const best  = sortedSetups[0];
    const worst = sortedSetups[sortedSetups.length - 1];

    sug.push({ id: "setup-best", severity: "positive", category: "Setup Type",
      title: `${best.setupType} has the best expectancy ($${best.expectancy.toFixed(2)}/trade)`,
      detail: `${best.total} trades, ${(best.winRate * 100).toFixed(0)}% win rate, profit factor ${isFinite(best.profitFactor) ? best.profitFactor.toFixed(2) : "∞"}. Prioritise this setup type.`,
      dataPoints: best.total });

    if (worst.expectancy < 0) {
      sug.push({ id: "setup-worst", severity: "warning", category: "Setup Type",
        title: `${worst.setupType} is losing money ($${worst.expectancy.toFixed(2)}/trade)`,
        detail: `${worst.total} trades, ${(worst.winRate * 100).toFixed(0)}% win rate, total P/L ${worst.totalPnL >= 0 ? "+" : ""}$${worst.totalPnL.toFixed(2)}. Consider filtering out or raising thresholds for this setup.`,
        action: `Raise minimum score for ${worst.setupType} setups by 5–10 points, or disable this setup type temporarily.`,
        dataPoints: worst.total });
    }
  } else if (validSetups.length === 1) {
    const s = validSetups[0];
    sug.push({ id: "setup-single", severity: "info", category: "Setup Type",
      title: `Only ${s.setupType} has enough data (${s.total} trades)`,
      detail: "Accumulate more trades across setup types to compare performance.",
      dataPoints: s.total });
  }

  // ── Ticker analysis ───────────────────────────────────────────────────────
  const bestTicker  = tickerBest[0]?.ticker  ?? null;
  const worstTicker = tickerWorst[0]?.ticker ?? null;

  // Flag consistently losing tickers with ≥2 trades
  const losingTickers = [...tickerWorst].filter((t) => t.trades >= 2 && t.totalPnL < 0 && t.winRate < 0.35);
  for (const t of losingTickers.slice(0, 3)) {
    sug.push({ id: `ticker-${t.ticker}`, severity: "warning", category: "Ticker",
      title: `${t.ticker} consistently loses (${(t.winRate * 100).toFixed(0)}% win rate, ${t.trades} trades)`,
      detail: `Total P/L: $${t.totalPnL.toFixed(2)}, avg return ${t.avgReturn.toFixed(1)}%. This ticker is not responding well to the scanner's signals.`,
      action: `Add ${t.ticker} to a longer cooldown list or exclude from paper trading entirely.`,
      dataPoints: t.trades });
  }

  // Highlight best ticker
  if (tickerBest[0] && tickerBest[0].trades >= 2 && tickerBest[0].winRate >= 0.60) {
    const t = tickerBest[0];
    sug.push({ id: `ticker-best-${t.ticker}`, severity: "positive", category: "Ticker",
      title: `${t.ticker} is a top performer (${(t.winRate * 100).toFixed(0)}% win rate over ${t.trades} trades)`,
      detail: `Total P/L: +$${t.totalPnL.toFixed(2)}, avg return ${t.avgReturn.toFixed(1)}%. The scanner signals align well with this ticker's behaviour.`,
      dataPoints: t.trades });
  }

  // ── Regime analysis ───────────────────────────────────────────────────────
  if (regimeStats.length >= 2) {
    const bestRegime  = regimeStats[0];
    const worstRegime = regimeStats[regimeStats.length - 1];
    if (bestRegime.trades >= MIN_BUCKET_SIZE && worstRegime.trades >= MIN_BUCKET_SIZE
        && bestRegime.winRate - worstRegime.winRate > 0.15) {
      sug.push({ id: "regime-spread", severity: "info", category: "Market Regime",
        title: `Scanner performs ${((bestRegime.winRate - worstRegime.winRate) * 100).toFixed(0)}pp better in ${bestRegime.regime} vs ${worstRegime.regime}`,
        detail: `${bestRegime.regime}: ${(bestRegime.winRate * 100).toFixed(0)}% win rate. ${worstRegime.regime}: ${(worstRegime.winRate * 100).toFixed(0)}% win rate. Consider pausing auto-trade in ${worstRegime.regime} conditions.`,
        dataPoints: bestRegime.trades + worstRegime.trades });
    }
    const defensiveStats = regimeStats.find((r) => r.regime === "defensive");
    if (defensiveStats && defensiveStats.trades >= MIN_BUCKET_SIZE && defensiveStats.winRate < 0.45) {
      sug.push({ id: "regime-defensive", severity: "warning", category: "Market Regime",
        title: `Poor performance in Defensive regime (${(defensiveStats.winRate * 100).toFixed(0)}% win rate)`,
        detail: `${defensiveStats.trades} trades in Defensive regime: ${(defensiveStats.winRate * 100).toFixed(0)}% win rate. Aggressive breakout setups underperform when market is defensive.`,
        action: "Disable Momentum Breakout and Trend Continuation setups when regime is Defensive.",
        dataPoints: defensiveStats.trades });
    }
  }

  // ── R/R delivery ─────────────────────────────────────────────────────────
  const withTP = resolved.filter((t) => t.slAtEntry && t.tp1AtEntry && t.slAtEntry < t.buyPrice && t.tp1AtEntry > t.buyPrice);
  if (withTP.length >= MIN_BUCKET_SIZE) {
    const plannedRR = withTP.map((t) => (t.tp1AtEntry! - t.buyPrice) / (t.buyPrice - t.slAtEntry!));
    const avgPlan   = plannedRR.reduce((s, v) => s + v, 0) / plannedRR.length;
    const tpHits    = withTP.filter((t) => t.result === "win").length;
    const delivRate = withTP.length > 0 ? tpHits / withTP.length : 0;

    if (delivRate < 0.4 && avgPlan >= 2) {
      sug.push({ id: "rr-delivery", severity: "warning", category: "Risk/Reward",
        title: `TP targets rarely hit — only ${(delivRate * 100).toFixed(0)}% delivery rate`,
        detail: `Average planned R/R is ${avgPlan.toFixed(2)}:1 but take-profit is reached only ${(delivRate * 100).toFixed(0)}% of the time. Targets may be too aggressive.`,
        action: "Consider using a tighter TP1 (e.g. resistance instead of Fibonacci extension) to improve delivery rate.",
        dataPoints: withTP.length });
    } else if (delivRate >= 0.60) {
      sug.push({ id: "rr-delivery-good", severity: "positive", category: "Risk/Reward",
        title: `Good TP delivery rate: ${(delivRate * 100).toFixed(0)}%`,
        detail: `${tpHits} of ${withTP.length} trades with R/R data hit the take-profit target. Target levels are realistic.`,
        dataPoints: withTP.length });
    }
  }

  // Sort: critical → warning → info → positive
  const order: Record<SuggestionSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  sug.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    suggestions:            sug,
    suggestedMinScore,
    suggestedMinConfidence,
    bestSetupType,
    worstSetupType,
    bestTicker,
    worstTicker,
    insufficientData:       n < MIN_TOTAL,
    tradesAnalyzed:         n,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DATA INTEGRITY SYSTEM
// ════════════════════════════════════════════════════════════════════════════

/**
 * Trade fingerprint — mirrors the one in /api/paper/run/route.ts.
 * Same key means two rows in Sheets represent the same trade event.
 */
function fingerprintTrade(t: PaperTrade): string {
  const closedMin = t.closedAt?.slice(0, 16) ?? "";
  const openedMin = t.openedAt?.slice(0, 16) ?? "";
  return `${t.ticker}|${t.buyPrice.toFixed(2)}|${t.sellPrice.toFixed(2)}|${t.shares}|${openedMin}|${closedMin}`;
}

export type DatasetStatus = "clean" | "minor" | "contaminated";

export interface FullDataIntegrityReport {
  totalTrades:          number;
  // Dead ticker trades
  deadTickerCount:      number;
  deadTickerNames:      string[];
  // Duplicate trades (same fingerprint appears > 1 time)
  duplicateCount:       number;
  duplicateFingerprints:string[];
  // Missing metadata
  missingNotes:         number;
  missingScoreBreakdown:number;
  missingConfidence:    number;
  missingMarketRegime:  number;
  // Derived
  cleanTradeCount:      number;
  qualityScore:         number;  // 0–100
  status:               DatasetStatus;
  statusLabel:          string;
  statusDescription:    string;
}

export function computeFullDataIntegrity(trades: PaperTrade[]): FullDataIntegrityReport {
  const resolved = trades.filter(
    (t) => t.result === "win" || t.result === "loss" || t.result === "breakeven",
  );
  const n = resolved.length;

  // ── Dead ticker detection ───────────────────────────────────────────────
  const deadTrades    = resolved.filter((t) => DEAD_TICKERS.has(t.ticker.toUpperCase()));
  const deadNames     = [...new Set(deadTrades.map((t) => t.ticker))];
  const deadCount     = deadTrades.length;

  // ── Duplicate detection ─────────────────────────────────────────────────
  const fpCounts = new Map<string, number>();
  for (const t of resolved) fpCounts.set(fingerprintTrade(t), (fpCounts.get(fingerprintTrade(t)) ?? 0) + 1);
  const dupFPs    = [...fpCounts.entries()].filter(([, c]) => c > 1).map(([fp]) => fp);
  const dupCount  = dupFPs.reduce((s, fp) => s + (fpCounts.get(fp) ?? 1) - 1, 0);

  // ── Missing metadata ────────────────────────────────────────────────────
  const missingNotes    = resolved.filter((t) => !t.notes).length;
  const missingBreak    = resolved.filter((t) => !(t.notes as Record<string, unknown> | undefined)?.scoreBreakdown).length;
  const missingConf     = resolved.filter((t) => !(t.notes as Record<string, unknown> | undefined)?.confidence).length;
  const missingRegime   = resolved.filter((t) => !(t.notes as Record<string, unknown> | undefined)?.marketRegime).length;

  // ── Quality score (0–100, deductions for each problem) ─────────────────
  const deductDeadPct  = n > 0 ? (deadCount  / n) : 0;
  const deductDupPct   = n > 0 ? (dupCount   / n) : 0;
  const deductConfPct  = n > 0 ? (missingConf / n) : 0;
  const deductBreakPct = n > 0 ? (missingBreak / n) : 0;
  const score = Math.max(0, Math.round(
    100
    - deductDeadPct  * 40   // Dead tickers distort all stats
    - deductDupPct   * 30   // Duplicates inflate trade counts
    - deductConfPct  * 20   // Missing confidence limits Phase 3 analysis
    - deductBreakPct * 10,  // Missing breakdown limits Phase 2 analysis
  ));

  const status: DatasetStatus =
    deadCount > 0 || dupCount > 0 ? "contaminated" :
    score < 70                    ? "minor" :
    "clean";

  const statusLabel =
    status === "clean"        ? "Dataset Clean" :
    status === "minor"        ? "Minor Issues Detected" :
    "Dataset Contaminated — Statistics May Be Distorted";

  const statusDescription =
    status === "contaminated"
      ? `${deadCount > 0 ? `${deadCount} trade(s) from dead/delisted tickers (${deadNames.join(", ")}). ` : ""}${dupCount > 0 ? `${dupCount} duplicate trade record(s). ` : ""}Profit factor, win rate, and expectancy may be overstated.`
    : status === "minor"
      ? `${missingConf} trade(s) missing confidence scores limit Phase 3 confidence analysis.`
      : "All key fields populated. Statistics are reliable.";

  return {
    totalTrades:           n,
    deadTickerCount:       deadCount,
    deadTickerNames:       deadNames,
    duplicateCount:        dupCount,
    duplicateFingerprints: dupFPs,
    missingNotes,
    missingScoreBreakdown: missingBreak,
    missingConfidence:     missingConf,
    missingMarketRegime:   missingRegime,
    cleanTradeCount:       n - deadCount - dupCount,
    qualityScore:          score,
    status,
    statusLabel,
    statusDescription,
  };
}

// ── Analytics-only sanitization ───────────────────────────────────────────────
// Does NOT delete records. Returns a filtered view for calculation purposes.

export interface SanitizationOptions {
  excludeDeadTickers:  boolean;  // default true
  excludeDuplicates:   boolean;  // default true
}

export const DEFAULT_SANITIZATION: SanitizationOptions = {
  excludeDeadTickers: true,
  excludeDuplicates:  true,
};

export interface SanitizationResult {
  trades:            PaperTrade[];
  deadExcluded:      number;
  duplicatesExcluded:number;
  totalExcluded:     number;
}

export function sanitizeTrades(
  trades:  PaperTrade[],
  options: SanitizationOptions = DEFAULT_SANITIZATION,
): SanitizationResult {
  let clean          = [...trades];
  let deadExcluded   = 0;
  let dupExcluded    = 0;

  if (options.excludeDeadTickers) {
    const before   = clean.length;
    clean          = clean.filter((t) => !DEAD_TICKERS.has(t.ticker.toUpperCase()));
    deadExcluded   = before - clean.length;
  }

  if (options.excludeDuplicates) {
    const seen: Set<string> = new Set();
    const deduped: PaperTrade[] = [];
    for (const t of clean) {
      const fp = fingerprintTrade(t);
      if (!seen.has(fp)) { seen.add(fp); deduped.push(t); }
      else dupExcluded++;
    }
    clean = deduped;
  }

  return { trades: clean, deadExcluded, duplicatesExcluded: dupExcluded, totalExcluded: deadExcluded + dupExcluded };
}

// ── Universe audit helpers ────────────────────────────────────────────────────

export interface UniverseAuditResult {
  universe:       string;
  rawCount:       number;
  deadRemoved:    number;
  subPriceRemoved:number;
  duplicates:     number;
  validCount:     number;
  healthPct:      number;  // 0–100
  deadTickers:    string[];
  duplicateTickers:string[];
}

export function auditUniverse(
  tickers: string[],
  minPrice = 3,
  approxPrices: Record<string, number> = {},
): UniverseAuditResult {
  const raw           = tickers.length;
  const dead          = tickers.filter((t) => DEAD_TICKERS.has(t));
  const afterDead     = tickers.filter((t) => !DEAD_TICKERS.has(t));
  const subPrice      = afterDead.filter((t) => {
    const p = approxPrices[t];
    return p !== undefined && p < minPrice;
  });
  const afterPrice    = afterDead.filter((t) => {
    const p = approxPrices[t];
    return p === undefined || p >= minPrice;
  });
  const dupSet = new Set<string>();
  const dups: string[] = [];
  for (const t of afterPrice) {
    if (dupSet.has(t)) dups.push(t);
    else dupSet.add(t);
  }
  const valid   = afterPrice.filter((t, i, arr) => arr.indexOf(t) === i).length;
  const health  = raw > 0 ? Math.round((valid / raw) * 100) : 100;
  return {
    universe: "custom",
    rawCount: raw,
    deadRemoved: dead.length,
    subPriceRemoved: subPrice.length,
    duplicates: dups.length,
    validCount: valid,
    healthPct: health,
    deadTickers: dead,
    duplicateTickers: dups,
  };
}

// ── Fill Quality Metrics ──────────────────────────────────────────────────────

export interface FillQualityMetrics {
  totalSlippageCost:   number;  // total $ drag from slippage across all trades
  avgSlippagePctPerTrade: number; // average slippage as % of trade value
  adverseGapCount:     number;  // trades where SL gapped through
  adverseGapTotal:     number;  // total $ lost to adverse gaps
  favorableGapCount:   number;  // trades where TP was gapped beyond
  favorableGapTotal:   number;  // total $ gained from favorable gaps
  avgPlannedRR:        number;
  avgActualRR:         number;
  rrDeliveryRate:      number;  // % of trades that hit TP
  netGapEffect:        number;  // favorable - adverse (positive = net gap benefit)
  tradesWithSlippage:  number;
}

export function computeFillQualityMetrics(trades: PaperTrade[]): FillQualityMetrics {
  const resolved = trades.filter((t) => t.result === "win" || t.result === "loss");

  const totalSlippage = resolved.reduce((s, t) => s + (t.slippageCost ?? 0), 0);
  const avgSlippagePct = resolved.length > 0
    ? avg(resolved.map((t) => {
        const size = t.positionSize;
        return size > 0 ? ((t.slippageCost ?? 0) / size) * 100 : 0;
      }))
    : 0;

  const adverse   = resolved.filter((t) => t.gapType === "adverse");
  const favorable = resolved.filter((t) => t.gapType === "favorable");

  const plannedRRs = resolved.filter((t) => t.slAtEntry && t.tp1AtEntry && t.slAtEntry < t.buyPrice)
    .map((t) => (t.tp1AtEntry! - t.buyPrice) / (t.buyPrice - t.slAtEntry!));
  const actualRRs  = resolved.filter((t) => t.slAtEntry && t.slAtEntry < (t.effectiveEntryPrice ?? t.buyPrice))
    .map((t) => {
      const ref = t.effectiveEntryPrice ?? t.buyPrice;
      const sl  = t.slAtEntry!;
      return (t.effectiveExitPrice ?? t.sellPrice - ref) / (ref - sl);
    });

  return {
    totalSlippageCost:     totalSlippage,
    avgSlippagePctPerTrade:avgSlippagePct,
    adverseGapCount:       adverse.length,
    adverseGapTotal:       adverse.reduce((s, t) => s + t.gapAmount * t.shares, 0),
    favorableGapCount:     favorable.length,
    favorableGapTotal:     favorable.reduce((s, t) => s + t.gapAmount * t.shares, 0),
    avgPlannedRR:          avg(plannedRRs),
    avgActualRR:           avg(actualRRs),
    rrDeliveryRate:        resolved.length > 0 ? resolved.filter((t) => t.result === "win").length / resolved.length : 0,
    netGapEffect:          favorable.reduce((s, t) => s + t.gapAmount * t.shares, 0)
                         - adverse.reduce((s, t) => s + t.gapAmount * t.shares, 0),
    tradesWithSlippage:    resolved.filter((t) => (t.slippageCost ?? 0) > 0).length,
  };
}

// ── Performance Realism Score ─────────────────────────────────────────────────

export interface RealismFactor {
  name:        string;
  score:       number;  // 0–100 for this factor
  weight:      number;  // relative weight
  description: string;
  severity:    "good" | "minor" | "major";
}

export interface RealismReport {
  overallScore: number;   // 0–100
  factors:      RealismFactor[];
  summary:      string;
}

/**
 * Analysis of the current paper trading implementation.
 * Pass live candleCoverage % (0–100) to reflect the real-candle setting.
 */
export function computeRealismScore(realCandlePct = 0): RealismReport {
  // Candle quality score scales with real coverage:
  // 0% real → 15 (synthetic only), 50% → 55, 80% → 80, 100% → 95
  const candleScore = realCandlePct >= 100 ? 95
    : realCandlePct >= 80 ? 80
    : realCandlePct >= 50 ? 55
    : realCandlePct >= 20 ? 35
    : 15;
  const candleSeverity: RealismFactor["severity"] =
    realCandlePct >= 80 ? "good" : realCandlePct >= 40 ? "minor" : "major";
  const candleDesc = realCandlePct >= 80
    ? `${realCandlePct}% of scanned tickers use real Finnhub/Polygon OHLC candles. Indicators are derived from actual market data.`
    : realCandlePct >= 40
    ? `${realCandlePct}% real candle coverage. Remaining tickers are skipped (Allow Synthetic = OFF) or use synthetic data.`
    : realCandlePct > 0
    ? `Only ${realCandlePct}% real candle coverage. Run Prefetch Candles from Diagnostics to warm the cache.`
    : "No real candle coverage. All setups are derived from LCG-seeded synthetic data. Run Prefetch Candles to fetch real OHLC history.";

  const factors: RealismFactor[] = [
    {
      name:        "Fill Price — TP exits",
      score:       90,
      weight:      15,
      description: "Exits exactly at TP1 price, not market price. Realistic for limit orders. Slightly optimistic since real fills may be 1–2 cents worse.",
      severity:    "good",
    },
    {
      name:        "Fill Price — Stop exits",
      score:       75,
      weight:      15,
      description: "Exits exactly at SL price. Real stops can gap through the level during earnings/news, producing worse fills. No gap-risk modelling.",
      severity:    "minor",
    },
    {
      name:        "Candle data quality",
      score:       candleScore,
      weight:      20,
      description: candleDesc,
      severity:    candleSeverity,
    },
    {
      name:        "Live quote source",
      score:       80,
      weight:      15,
      description: "Exit prices come from Finnhub live quotes (10s cache). Accurate for current price but introduces up to 10s of staleness — negligible for daily-bar trades.",
      severity:    "good",
    },
    {
      name:        "Position sizing",
      score:       85,
      weight:      10,
      description: "2% risk per trade, 25% max per position. Widely accepted risk management. Fractional shares not used — rounds down, so small accounts may size to 0.",
      severity:    "good",
    },
    {
      name:        "Market hours enforcement",
      score:       90,
      weight:      5,
      description: "NYSE market hours gate is enforced. Test Mode can bypass, which is correct for simulation purposes.",
      severity:    "good",
    },
    {
      name:        "Slippage model",
      score:       75,
      weight:      10,
      description: "0.1% buy + 0.1% sell slippage applied to every fill. Total drag ~0.2% per round-trip. Commission not modelled (typically $0 on modern brokers). Realistic for retail swing trading.",
      severity:    "good",
    },
    {
      name:        "Gap risk — stop exits",
      score:       80,
      weight:      8,
      description: "SL exits now fill at the market price (may be below SL level). Adverse gaps recorded per trade. Realistic for stop-market orders during intraday moves.",
      severity:    "good",
    },
    {
      name:        "Gap risk — TP exits",
      score:       85,
      weight:      7,
      description: "TP exits fill at TP1 (limit order). Favorable gaps recorded when market price exceeds TP1 at check time. Accurate for daily-bar swing trading.",
      severity:    "good",
    },
    {
      name:        "Liquidity filter",
      score:       75,
      weight:      5,
      description: "Minimum $5 price and 500k average daily volume now enforced before a paper trade is opened. Eliminates thinly traded micro-caps from the paper portfolio.",
      severity:    "good",
    },
    {
      name:        "Cooldown / re-entry logic",
      score:       65,
      weight:      5,
      description: "30-minute cooldown after any exit type. Prevents obvious double-entries but 30 min is short; a trending ticker can still re-qualify the same session.",
      severity:    "minor",
    },
  ];

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const weightedScore = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;
  const overallScore = Math.round(weightedScore);

  const majorCount = factors.filter((f) => f.severity === "major").length;
  const summary = overallScore >= 80
    ? "High realism. Real OHLC candles, slippage, gap risk, and liquidity filters all active."
    : overallScore >= 65
    ? "Moderate–high realism. Run Prefetch Candles from Diagnostics to increase real candle coverage."
    : overallScore >= 50
    ? `Moderate realism. ${majorCount} major issue(s) affecting accuracy — increase real candle coverage.`
    : "Low realism. Synthetic candle data dominates. Use Diagnostics → Prefetch Candles to fetch real OHLC history.";

  return { overallScore, factors, summary };
}
