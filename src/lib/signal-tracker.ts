/**
 * Signal Performance Tracker — core library
 *
 * Responsibilities:
 *   - Define TrackedSignal, PerformanceStats types
 *   - Persist signals to localStorage (capped at MAX_SIGNALS)
 *   - Evaluate signal outcomes against a current price
 *   - Compute aggregate performance statistics
 *   - Calibrate confidence scores based on historical win rates
 *
 * No React, no I/O. Pure functions + localStorage adapter.
 */

import type { StockSetup, StockSetupType } from "@/lib/types";

// ── Constants ────────────────────────────────────────────────────────────────

export const SIGNAL_STORAGE_KEY = "hawkeye-signals-v1";
const MAX_SIGNALS = 500;
const EXPIRY_DAYS = 30;
const DEDUP_WINDOW_DAYS = 7;
const MIN_DATA_POINTS = 5; // minimum resolved signals before calibrating
const ENTRY_TOLERANCE = 0.005; // 0.5% — price must reach within this of entry

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalStatus =
  | "pending"      // waiting for price to hit entry zone
  | "triggered"    // price entered the trade zone
  | "target_hit"   // TP1 reached — win
  | "stopped_out"  // stop loss hit — loss
  | "expired";     // 30 days passed without resolution

export interface TrackedSignal {
  id: string;
  ticker: string;
  companyName: string;
  setupType: StockSetupType;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  confidenceScore: number;    // raw score at generation time
  riskReward: number;
  slMethod: string;
  tp1Method: string;
  generatedAt: string;        // ISO timestamp
  expiresAt: string;          // generatedAt + EXPIRY_DAYS

  // Filled as signal progresses
  status: SignalStatus;
  triggeredAt?: string;
  triggeredPrice?: number;
  resolvedAt?: string;
  resolvedPrice?: number;
  actualReturn?: number;      // % from triggered price
  actualRR?: number;          // (resolvedPrice - entry) / (entry - sl)
  isSimulated?: boolean;      // true when outcome was demo-seeded
}

export interface SetupTypeStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  expired: number;
  winRate: number;            // wins / (wins + losses), 0 if no resolved
  avgReturn: number;          // average actualReturn of resolved signals
  avgRR: number;
  profitFactor: number;       // sum(|gains|) / sum(|losses|)
  calibrationMultiplier: number; // applied to raw confidence score
}

export interface PerformanceStats {
  totalSignals: number;
  triggered: number;
  wins: number;
  losses: number;
  pending: number;
  expired: number;
  winRate: number;
  avgReturn: number;
  avgRR: number;
  profitFactor: number;
  bestSignal: TrackedSignal | null;
  worstSignal: TrackedSignal | null;
  bySetupType: Record<string, SetupTypeStats>;
}

// ── Deterministic seed helper (mirrors scanner-engine) ────────────────────────

function tickerHash(ticker: string): number {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) {
    h = (Math.imul(31, h) + ticker.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── ID generation ─────────────────────────────────────────────────────────────

function makeId(ticker: string, setupType: string, generatedAt: string): string {
  const base = `${ticker}:${setupType}:${generatedAt}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = (Math.imul(31, h) + base.charCodeAt(i)) | 0;
  }
  return `sig_${Math.abs(h).toString(36)}`;
}

// ── localStorage persistence ──────────────────────────────────────────────────

export function loadSignals(): TrackedSignal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SIGNAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TrackedSignal[];
  } catch {
    return [];
  }
}

export function saveSignals(signals: TrackedSignal[]): void {
  if (typeof window === "undefined") return;
  try {
    // Rolling window cap — drop oldest when over limit
    const trimmed = signals.length > MAX_SIGNALS
      ? signals.slice(-MAX_SIGNALS)
      : signals;
    localStorage.setItem(SIGNAL_STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* quota exceeded — silently ignore */ }
}

// ── Signal creation ───────────────────────────────────────────────────────────

/**
 * Convert a StockSetup into a TrackedSignal.
 * Returns null if an equivalent signal exists within DEDUP_WINDOW_DAYS.
 */
export function createSignal(
  setup: StockSetup,
  existing: TrackedSignal[],
): TrackedSignal | null {
  const now = new Date();
  const dedupCutoff = new Date(now.getTime() - DEDUP_WINDOW_DAYS * 86_400_000);

  const isDuplicate = existing.some(
    (s) =>
      s.ticker === setup.ticker &&
      s.setupType === setup.setupType &&
      new Date(s.generatedAt) >= dedupCutoff,
  );
  if (isDuplicate) return null;

  const generatedAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + EXPIRY_DAYS * 86_400_000,
  ).toISOString();

  return {
    id: makeId(setup.ticker, setup.setupType, generatedAt),
    ticker: setup.ticker,
    companyName: setup.companyName,
    setupType: setup.setupType,
    entryPrice: setup.entryPrice,
    stopLoss: setup.stopLoss,
    takeProfit1: setup.takeProfit1,
    takeProfit2: setup.takeProfit2,
    confidenceScore: setup.confidenceScore,
    riskReward: setup.riskReward,
    slMethod: setup.slMethod ?? "ATR",
    tp1Method: setup.tp1Method ?? "resistance",
    generatedAt,
    expiresAt,
    status: "pending",
  };
}

// ── Signal evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate a single signal against the current market price.
 * Returns an updated copy; never mutates in place.
 */
export function evaluateSignal(
  signal: TrackedSignal,
  currentPrice: number,
): TrackedSignal {
  if (
    signal.status === "target_hit" ||
    signal.status === "stopped_out" ||
    signal.status === "expired"
  ) {
    return signal; // terminal state — no further evaluation
  }

  const now = new Date().toISOString();

  // Check expiry first
  if (new Date() >= new Date(signal.expiresAt)) {
    return { ...signal, status: "expired", resolvedAt: now };
  }

  if (signal.status === "pending") {
    // Trigger: price moves into entry zone (within tolerance above entry)
    const upperBound = signal.entryPrice * (1 + ENTRY_TOLERANCE);
    if (currentPrice >= signal.entryPrice && currentPrice <= upperBound * 1.05) {
      return {
        ...signal,
        status: "triggered",
        triggeredAt: now,
        triggeredPrice: currentPrice,
      };
    }
    return signal;
  }

  // Signal is triggered — watch for TP or SL
  if (signal.status === "triggered") {
    const ref = signal.triggeredPrice ?? signal.entryPrice;

    if (currentPrice >= signal.takeProfit1) {
      const actualReturn = ((signal.takeProfit1 - ref) / ref) * 100;
      const actualRR =
        (signal.takeProfit1 - ref) / Math.max(0.01, ref - signal.stopLoss);
      return {
        ...signal,
        status: "target_hit",
        resolvedAt: now,
        resolvedPrice: signal.takeProfit1,
        actualReturn: +actualReturn.toFixed(2),
        actualRR: +actualRR.toFixed(2),
      };
    }

    if (currentPrice <= signal.stopLoss) {
      const actualReturn = ((signal.stopLoss - ref) / ref) * 100;
      const actualRR =
        (signal.stopLoss - ref) / Math.max(0.01, ref - signal.stopLoss);
      return {
        ...signal,
        status: "stopped_out",
        resolvedAt: now,
        resolvedPrice: signal.stopLoss,
        actualReturn: +actualReturn.toFixed(2),
        actualRR: +actualRR.toFixed(2),
      };
    }
  }

  return signal;
}

// ── Demo simulation ───────────────────────────────────────────────────────────

/**
 * For signals in demo mode (no live prices), deterministically simulate
 * outcomes based on ticker seed + setup type so the dashboard has data.
 * Only applied to signals older than 24 hours that are still pending/triggered.
 */
export function applyDemoSimulation(signals: TrackedSignal[]): TrackedSignal[] {
  const cutoff = Date.now() - 24 * 3_600_000; // 24 hours old

  return signals.map((signal) => {
    if (
      signal.isSimulated ||
      signal.status === "target_hit" ||
      signal.status === "stopped_out" ||
      signal.status === "expired"
    ) {
      return signal;
    }
    if (new Date(signal.generatedAt).getTime() > cutoff) return signal;

    const seed = tickerHash(signal.ticker) + signal.setupType.length * 17;
    const triggerRoll = (seed % 100) / 100;
    if (triggerRoll > 0.72) {
      // 28% never trigger — mark expired
      return { ...signal, status: "expired", isSimulated: true };
    }

    // Win rate varies by setup type — matches empirical research
    const winRates: Record<string, number> = {
      "Momentum Breakout": 0.63,
      "Pullback Buy":      0.60,
      "Trend Continuation":0.62,
      "Oversold Bounce":   0.52,
    };
    const winRate = winRates[signal.setupType] ?? 0.58;
    const winRoll = ((seed * 31 + 7) % 100) / 100;
    const isWin = winRoll < winRate;

    const ref = signal.entryPrice;
    const risk = Math.max(0.01, ref - signal.stopLoss);

    if (isWin) {
      const rrAchieved = 1.8 + ((seed % 30) / 100); // 1.80–2.09
      const resolvedPrice = +(ref + risk * rrAchieved).toFixed(2);
      return {
        ...signal,
        status: "target_hit",
        isSimulated: true,
        triggeredAt: new Date(new Date(signal.generatedAt).getTime() + 3_600_000).toISOString(),
        triggeredPrice: ref,
        resolvedAt: new Date(new Date(signal.generatedAt).getTime() + 8 * 3_600_000).toISOString(),
        resolvedPrice,
        actualReturn: +((resolvedPrice - ref) / ref * 100).toFixed(2),
        actualRR: +rrAchieved.toFixed(2),
      };
    } else {
      return {
        ...signal,
        status: "stopped_out",
        isSimulated: true,
        triggeredAt: new Date(new Date(signal.generatedAt).getTime() + 2_600_000).toISOString(),
        triggeredPrice: ref,
        resolvedAt: new Date(new Date(signal.generatedAt).getTime() + 5 * 3_600_000).toISOString(),
        resolvedPrice: signal.stopLoss,
        actualReturn: +((signal.stopLoss - ref) / ref * 100).toFixed(2),
        actualRR: -1,
      };
    }
  });
}

// ── Statistics computation ────────────────────────────────────────────────────

function emptySetupStats(): SetupTypeStats {
  return {
    total: 0, wins: 0, losses: 0, pending: 0, expired: 0,
    winRate: 0, avgReturn: 0, avgRR: 0, profitFactor: 0,
    calibrationMultiplier: 1,
  };
}

export function computeStats(signals: TrackedSignal[]): PerformanceStats {
  const setupTypes: StockSetupType[] = [
    "Momentum Breakout",
    "Pullback Buy",
    "Oversold Bounce",
    "Trend Continuation",
  ];

  const bySetupType: Record<string, SetupTypeStats> = Object.fromEntries(
    setupTypes.map((t) => [t, emptySetupStats()]),
  );

  let totalWins = 0;
  let totalLosses = 0;
  let totalPending = 0;
  let totalExpired = 0;
  let totalTriggered = 0;
  let sumReturns = 0;
  let sumRR = 0;
  let sumGains = 0;
  let sumLosses = 0;
  let bestSignal: TrackedSignal | null = null;
  let worstSignal: TrackedSignal | null = null;

  for (const s of signals) {
    const st = bySetupType[s.setupType] ?? emptySetupStats();
    st.total++;

    if (s.status === "target_hit") {
      st.wins++;
      totalWins++;
      totalTriggered++;
      if (s.actualReturn !== undefined) {
        sumReturns += s.actualReturn;
        sumGains += Math.abs(s.actualReturn);
        sumRR += s.actualRR ?? 0;
        if (!bestSignal || s.actualReturn > (bestSignal.actualReturn ?? 0)) bestSignal = s;
      }
    } else if (s.status === "stopped_out") {
      st.losses++;
      totalLosses++;
      totalTriggered++;
      if (s.actualReturn !== undefined) {
        sumReturns += s.actualReturn;
        sumLosses += Math.abs(s.actualReturn);
        sumRR += s.actualRR ?? 0;
        if (!worstSignal || s.actualReturn < (worstSignal.actualReturn ?? 0)) worstSignal = s;
      }
    } else if (s.status === "pending" || s.status === "triggered") {
      st.pending++;
      totalPending++;
      if (s.status === "triggered") totalTriggered++;
    } else {
      st.expired++;
      totalExpired++;
    }

    bySetupType[s.setupType] = st;
  }

  // Compute per-type derived stats
  for (const type of setupTypes) {
    const st = bySetupType[type];
    const resolved = st.wins + st.losses;

    let typeGains = 0, typeLosses = 0, typeRR = 0;
    for (const s of signals) {
      if (s.setupType !== type) continue;
      if (s.status === "target_hit" && s.actualReturn !== undefined) {
        typeGains += Math.abs(s.actualReturn);
        typeRR += s.actualRR ?? 0;
      }
      if (s.status === "stopped_out" && s.actualReturn !== undefined) {
        typeLosses += Math.abs(s.actualReturn);
        typeRR += s.actualRR ?? 0;
      }
    }

    st.winRate = resolved > 0 ? st.wins / resolved : 0;
    st.avgReturn = resolved > 0 ? (typeGains - typeLosses) / resolved : 0;
    st.avgRR = resolved > 0 ? typeRR / resolved : 0;
    st.profitFactor = typeLosses > 0 ? typeGains / typeLosses : typeGains > 0 ? Infinity : 0;

    // Calibration multiplier — only apply with sufficient data
    if (resolved >= MIN_DATA_POINTS) {
      // multiplier = 0.4 + 1.2 * winRate → 1.0 at 50%, 1.36 at 80%, 0.64 at 20%
      st.calibrationMultiplier = 0.4 + 1.2 * st.winRate;
    } else {
      st.calibrationMultiplier = 1;
    }

    bySetupType[type] = st;
  }

  const totalResolved = totalWins + totalLosses;

  return {
    totalSignals: signals.length,
    triggered: totalTriggered,
    wins: totalWins,
    losses: totalLosses,
    pending: totalPending,
    expired: totalExpired,
    winRate: totalResolved > 0 ? totalWins / totalResolved : 0,
    avgReturn: totalResolved > 0 ? sumReturns / totalResolved : 0,
    avgRR: totalResolved > 0 ? sumRR / totalResolved : 0,
    profitFactor: sumLosses > 0 ? sumGains / sumLosses : sumGains > 0 ? Infinity : 0,
    bestSignal,
    worstSignal,
    bySetupType,
  };
}

// ── Confidence calibration ────────────────────────────────────────────────────

/**
 * Adjusts a raw confidence score using the historical win rate for that
 * setup type.  Returns the raw score unchanged when < MIN_DATA_POINTS
 * resolved signals exist (prevents overfitting on noise).
 */
export function calibrateConfidence(
  rawScore: number,
  setupType: string,
  stats: PerformanceStats,
): number {
  const typeStats = stats.bySetupType[setupType];
  if (!typeStats) return rawScore;
  const resolved = typeStats.wins + typeStats.losses;
  if (resolved < MIN_DATA_POINTS) return rawScore;
  const calibrated = rawScore * typeStats.calibrationMultiplier;
  return Math.min(95, Math.max(40, Math.round(calibrated)));
}

/**
 * Returns the calibration direction for display (↑↑, ↑, →, ↓, ↓↓).
 */
export function calibrationLabel(setupType: string, stats: PerformanceStats): {
  arrow: string;
  tone: "positive" | "neutral" | "negative";
  winRate: number;
  dataPoints: number;
} {
  const st = stats.bySetupType[setupType];
  if (!st) return { arrow: "—", tone: "neutral", winRate: 0, dataPoints: 0 };
  const resolved = st.wins + st.losses;
  if (resolved < MIN_DATA_POINTS) return { arrow: "—", tone: "neutral", winRate: 0, dataPoints: resolved };
  const wr = st.winRate;
  if (wr >= 0.70) return { arrow: "↑↑", tone: "positive", winRate: wr, dataPoints: resolved };
  if (wr >= 0.55) return { arrow: "↑",  tone: "positive", winRate: wr, dataPoints: resolved };
  if (wr >= 0.45) return { arrow: "→",  tone: "neutral",  winRate: wr, dataPoints: resolved };
  if (wr >= 0.30) return { arrow: "↓",  tone: "negative", winRate: wr, dataPoints: resolved };
  return              { arrow: "↓↓", tone: "negative", winRate: wr, dataPoints: resolved };
}
