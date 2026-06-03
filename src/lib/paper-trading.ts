/**
 * Paper Trading Engine — pure logic, no I/O.
 *
 * DISCLAIMER: Paper trading only. Not financial advice.
 * No real trades, no brokerage connection, no real money.
 */

import type { StockSetup } from "@/lib/types";
import type { MarketRegime } from "@/lib/scanner-scoring";

// ── Types ─────────────────────────────────────────────────────────────────────

export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_STARTING_BALANCE = 1_000;

export interface PaperAccount {
  accountId: string;
  startingBalance: number;
  cashBalance: number;
  equityValue: number;          // sum of all open position market values
  totalAccountValue: number;    // startingBalance + realizedPnL + unrealizedPnL
  totalPnL: number;
  totalPnLPercent: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  updatedAt: string;
}

/** Metadata captured at buy time for "Why This Trade" and audit purposes. */
export interface TradeNotes {
  scannerScore?:    number;
  confidence?:      number;
  scannerRank?:     number;
  scoreBreakdown?:  { trend: number; momentum: number; volume: number; relativeStrength: number; riskReward: number; marketRegime: number };
  dataSource?:      "real" | "delayed" | "mock";
  candleSource?:    "real" | "delayed" | "mock";
  executionTime?:   string; // ISO timestamp of when the buy order ran
  priceSource?:     string; // "finnhub" | "polygon" | "mock"
  marketRegime?:    string; // regime at time of entry: "risk-on" | "neutral" | "defensive" | "high-volatility"
}

export interface PaperPosition {
  positionId: string;
  ticker: string;
  companyName: string;
  setupType: string;
  entryPrice: number;
  currentPrice: number;
  shares: number;
  positionValue: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  status: "open";
  openedAt: string;
  updatedAt: string;
  notes?: TradeNotes;
}

export type TradeResult = "win" | "loss" | "breakeven" | "DATA_ERROR";

/** Flagged when a trade was closed using bad/stale price data (e.g. Finnhub glitch).
 *  DATA_ERROR trades are excluded from all analytics calculations. */
export type DataQuality = "ok" | "DATA_ERROR";

export type GapType = "adverse" | "favorable" | "none";

export interface PaperTrade {
  tradeId: string;
  ticker: string;
  companyName: string;
  setupType: string;
  buyPrice: number;            // order price (entry level)
  sellPrice: number;           // order price (exit level — TP1, SL, or mktPrice for gaps)
  effectiveEntryPrice: number; // buyPrice + buy slippage
  effectiveExitPrice:  number; // sellPrice − sell slippage
  shares: number;
  positionSize: number;
  profitLoss: number;          // computed from effective prices
  profitLossPercent: number;
  slippageCost: number;        // total drag in $ from both legs
  gapType: GapType;            // was the exit a gap through SL/TP?
  gapAmount: number;           // $ amount price gapped beyond the level
  result: TradeResult;
  reasonOpened: string;
  reasonClosed: string;
  openedAt: string;
  closedAt: string;
  holdTimeHours?: number;
  suspicious?: boolean;
  tp1AtEntry?: number;
  slAtEntry?:  number;
  notes?: TradeNotes;
  /** "DATA_ERROR" when closed using bad/stale price data — excluded from analytics. */
  dataQuality?: DataQuality;
}

export interface TradeAuditEntry {
  ticker:       string;
  entryPrice:   number;
  tp1:          number;
  slPrice:      number;
  exitPrice:    number;
  profitPct:    number;
  reasonClosed: string;
  suspicious:   boolean;
  flag:         string;   // human-readable warning
  timestamp:    string;
}

export interface EquityCurvePoint {
  date: string;
  accountValue: number;
  cashBalance: number;
  investedValue: number;
  dailyPnL: number;
  totalPnLPercent: number;
}

export interface TradeAction {
  type: "buy" | "sell";
  ticker: string;
  reason: string;
  shares: number;
  price: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_POSITIONS    = 3;
const RISK_PCT         = 0.02;
const MAX_POSITION_PCT = 0.25;
const MIN_SCORE        = 75;
const MIN_CONFIDENCE   = 70;
const MIN_RR           = 2.0;

// ── Pullback Buy selective filters ────────────────────────────────────────────
// Pullback Buy has a lower historical win rate than Momentum Breakout and Trend
// Continuation. Until it proves itself on live data, it runs under tighter rules:
//   1. Higher confidence gate  — 80% vs 70% for other setups
//   2. Half position size      — reduces risk while still collecting data points
const PULLBACK_BUY_MIN_CONFIDENCE = 80;    // vs MIN_CONFIDENCE = 70
const PULLBACK_BUY_SIZE_MULTIPLIER = 0.5;  // 50% of normal position size

// ── Realism constants ─────────────────────────────────────────────────────────

/** Slippage applied to buy fills (price paid = entry × (1 + BUY_SLIPPAGE)). */
export const BUY_SLIPPAGE_PCT   = 0.001;   // 0.10%
/** Slippage applied to sell fills (price received = exit × (1 − SELL_SLIPPAGE)). */
export const SELL_SLIPPAGE_PCT  = 0.001;   // 0.10%

/** Minimum price for a ticker to be traded by the paper trader. */
export const MIN_PRICE_FOR_PAPER_TRADE = 5.00;

/** Minimum average daily volume (shares) for the paper trader. */
export const MIN_DAILY_VOLUME   = 500_000;

// ── Validation ────────────────────────────────────────────────────────────────

export function isValidForPaperTrade(setup: StockSetup): boolean {
  if (setup.status === "Failed" || setup.status === "Completed") return false;
  if (setup.entryPrice <= setup.stopLoss)   return false;
  if (setup.takeProfit1 <= setup.entryPrice) return false;
  if (!Number.isFinite(setup.riskReward) || setup.riskReward < MIN_RR) return false;
  if (setup.confidenceScore < MIN_CONFIDENCE) return false;
  return true;
}

// ── Position sizing ───────────────────────────────────────────────────────────

export function calculatePositionSize(
  accountValue: number,
  entryPrice: number,
  stopLoss: number,
  regime: MarketRegime = "neutral",
): number {
  if (entryPrice <= stopLoss || entryPrice <= 0) return 0;

  let riskPct = RISK_PCT;
  if (regime === "defensive") riskPct *= 0.5; // halve risk in defensive regime

  const riskAmount    = accountValue * riskPct;
  const riskPerShare  = entryPrice - stopLoss;
  const sharesByRisk  = Math.floor(riskAmount / riskPerShare);

  const maxPosValue   = accountValue * MAX_POSITION_PCT;
  const sharesByCap   = Math.floor(maxPosValue / entryPrice);

  return Math.max(0, Math.min(sharesByRisk, sharesByCap));
}

// ── Account helpers ───────────────────────────────────────────────────────────

export function makeDefaultAccount(startingBalance = DEFAULT_STARTING_BALANCE): PaperAccount {
  return {
    accountId:        DEFAULT_ACCOUNT_ID,
    startingBalance,
    cashBalance:      startingBalance,
    equityValue:      0,
    totalAccountValue:startingBalance,
    totalPnL:         0,
    totalPnLPercent:  0,
    totalTrades:      0,
    wins:             0,
    losses:           0,
    winRate:          0,
    updatedAt:        new Date().toISOString(),
  };
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function positionCostBasis(position: PaperPosition): number {
  return finite(position.entryPrice * position.shares);
}

function positionMarketValue(position: PaperPosition): number {
  const fallback = finite(position.currentPrice * position.shares, positionCostBasis(position));
  return finite(position.positionValue, fallback);
}

function positionOpenPnL(position: PaperPosition): number {
  return finite(position.unrealizedPnL, positionMarketValue(position) - positionCostBasis(position));
}

export function rebuildAccountFromLedger(
  account: PaperAccount,
  openPositions: PaperPosition[],
  closedTrades: PaperTrade[],
): PaperAccount {
  const startingBalance  = account.startingBalance > 0 ? account.startingBalance : DEFAULT_STARTING_BALANCE;
  const realizedPnL      = closedTrades.reduce((s, t) => s + finite(t.profitLoss), 0);
  const unrealizedPnL    = openPositions.reduce((s, p) => s + positionOpenPnL(p), 0);
  const equityValue      = openPositions.reduce((s, p) => s + positionMarketValue(p), 0);
  const totalPnL         = realizedPnL + unrealizedPnL;
  const totalAccountValue= startingBalance + totalPnL;
  const totalPnLPercent  = startingBalance > 0
    ? (totalPnL / startingBalance) * 100
    : 0;
  const winRate = (account.wins + account.losses) > 0
    ? account.wins / (account.wins + account.losses)
    : 0;

  return {
    ...account,
    startingBalance,
    equityValue,
    totalAccountValue,
    totalPnL,
    totalPnLPercent,
    winRate,
    updatedAt: new Date().toISOString(),
  };
}

export function recalculateAccount(
  account: PaperAccount,
  openPositions: PaperPosition[],
  closedTrades?: PaperTrade[],
): PaperAccount {
  if (closedTrades) {
    return rebuildAccountFromLedger(account, openPositions, closedTrades);
  }

  const startingBalance  = account.startingBalance > 0 ? account.startingBalance : DEFAULT_STARTING_BALANCE;
  const investedCost     = openPositions.reduce((s, p) => s + positionCostBasis(p), 0);
  const equityValue      = openPositions.reduce((s, p) => s + positionMarketValue(p), 0);
  const unrealizedPnL    = openPositions.reduce((s, p) => s + positionOpenPnL(p), 0);
  const realizedPnL      = account.cashBalance - startingBalance + investedCost;
  const totalPnL         = realizedPnL + unrealizedPnL;
  const totalAccountValue= startingBalance + totalPnL;
  const totalPnLPercent  = startingBalance > 0
    ? (totalPnL / startingBalance) * 100
    : 0;
  const winRate = (account.wins + account.losses) > 0
    ? account.wins / (account.wins + account.losses)
    : 0;

  return {
    ...account,
    startingBalance,
    equityValue,
    totalAccountValue,
    totalPnL,
    totalPnLPercent,
    winRate,
    updatedAt: new Date().toISOString(),
  };
}

// ── Position helpers ──────────────────────────────────────────────────────────

export function updatePositionPrice(
  position: PaperPosition,
  currentPrice: number,
): PaperPosition {
  const positionValue       = currentPrice * position.shares;
  const costBasis           = position.entryPrice * position.shares;
  const unrealizedPnL       = positionValue - costBasis;
  const unrealizedPnLPercent= costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;
  return {
    ...position,
    currentPrice,
    positionValue,
    unrealizedPnL,
    unrealizedPnLPercent,
    updatedAt: new Date().toISOString(),
  };
}

export function buildClosedTrade(
  position:     PaperPosition,
  sellPrice:    number,
  reasonClosed: string,
  gapType:      GapType = "none",
  gapAmount:    number  = 0,
): PaperTrade {
  // Apply slippage to both legs:
  //   Buy: paid MORE than the entry level (slippage is a cost)
  //   Sell: received LESS than the exit level (slippage is a cost)
  const effectiveEntryPrice = position.entryPrice * (1 + BUY_SLIPPAGE_PCT);
  const effectiveExitPrice  = sellPrice           * (1 - SELL_SLIPPAGE_PCT);
  const slippageCost = (effectiveEntryPrice - position.entryPrice) * position.shares
                     + (sellPrice - effectiveExitPrice)             * position.shares;

  const profitLoss        = (effectiveExitPrice - effectiveEntryPrice) * position.shares;
  const profitLossPercent = effectiveEntryPrice > 0
    ? ((effectiveExitPrice - effectiveEntryPrice) / effectiveEntryPrice) * 100
    : 0;
  const result: TradeResult =
    profitLoss > 0 ? "win" : profitLoss < 0 ? "loss" : "breakeven";

  const closedAt      = new Date().toISOString();
  const holdTimeHours = position.openedAt
    ? (new Date(closedAt).getTime() - new Date(position.openedAt).getTime()) / 3_600_000
    : undefined;

  return {
    tradeId:              `pt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ticker:               position.ticker,
    companyName:          position.companyName,
    setupType:            position.setupType,
    buyPrice:             position.entryPrice,
    sellPrice,
    effectiveEntryPrice,
    effectiveExitPrice,
    shares:               position.shares,
    positionSize:         position.entryPrice * position.shares,
    profitLoss,
    profitLossPercent,
    slippageCost,
    gapType,
    gapAmount,
    result,
    reasonOpened:     position.notes?.scannerScore
      ? `Scanner signal: ${position.setupType} (score ${position.notes.scannerScore}, conf ${position.notes.confidence}%)`
      : `Scanner signal: ${position.setupType}`,
    reasonClosed,
    openedAt:         position.openedAt,
    closedAt,
    holdTimeHours:    holdTimeHours !== undefined ? Math.round(holdTimeHours * 10) / 10 : undefined,
    notes:            position.notes,
  };
}

// ── Core run cycle ────────────────────────────────────────────────────────────

/**
 * Minutes after ANY exit (TP hit, stop-loss, or manual close) during which
 * the same ticker cannot be re-entered.
 *
 * Previously this was 24 HOURS and only applied to stop-loss exits.
 * That allowed DXPE/MAR to reopen immediately after TP hits, producing
 * duplicate trades when two concurrent run cycles both closed and reopened
 * the same position.
 *
 * Now: 30 minutes after any exit type.
 */
export const TICKER_COOLDOWN_MINUTES = 30;
/** @deprecated use TICKER_COOLDOWN_MINUTES */
export const TICKER_COOLDOWN_HOURS   = TICKER_COOLDOWN_MINUTES / 60;

export interface PresetOverrides {
  minScannerScore?:   number;
  minConfidence?:     number;
  minRiskReward?:     number;
  allowedSetupTypes?: string[];  // empty = all
}

export interface RunCycleInput {
  account:          PaperAccount;
  openPositions:    PaperPosition[];
  signals:          StockSetup[];
  prices:           Record<string, number>;
  regime:           MarketRegime;
  isRunning:        boolean;
  recentTrades?:    PaperTrade[];
  closedTrades?:    PaperTrade[];
  /** Runtime overrides from active preset — supersede hardcoded MIN_* constants. */
  presetOverrides?: PresetOverrides;
}

export type RejectionReason =
  | "market_closed"
  | "not_running"
  | "no_signals"
  | "invalid_setup"
  | "cooldown"
  | "confidence_too_low"
  | "rr_too_low"
  | "score_too_low"
  | "regime_defensive"
  | "position_limit"
  | "duplicate_ticker"
  | "shares_zero"
  | "insufficient_cash"
  | "price_too_low"               // below MIN_PRICE_FOR_PAPER_TRADE
  | "low_liquidity"               // below MIN_DAILY_VOLUME
  | "zero_quote"                  // Finnhub returned price = 0
  | "setup_type_concentration";   // max 40% same setup type in open positions

export interface SignalRejection {
  ticker:  string;
  reason:  RejectionReason;
  detail?: string;
}

export interface BadPriceEntry {
  ticker:   string;
  badPrice: number;
  entry:    number;
  pct:      number; // negative = drop, positive = spike
  at:       string;
}

export interface RunCycleResult {
  account:         PaperAccount;
  openPositions:   PaperPosition[];
  newPositions:    PaperPosition[];
  closedTrades:    PaperTrade[];
  actions:         TradeAction[];
  equityPoint:     EquityCurvePoint;
  rejections:      SignalRejection[];
  signalsChecked:  number;
  auditLog:        TradeAuditEntry[];
  badPrices:       BadPriceEntry[];   // prices rejected for being unrealistic
}

// Gain % threshold above which a trade is flagged as suspicious
const SUSPICIOUS_GAIN_PCT = 100;

export function runCycle(input: RunCycleInput): RunCycleResult {
  const { signals, prices, regime, isRunning, presetOverrides } = input;

  // Effective thresholds — preset overrides supersede hardcoded defaults
  const effectiveMinScore = presetOverrides?.minScannerScore ?? MIN_SCORE;
  const effectiveMinConf  = presetOverrides?.minConfidence   ?? MIN_CONFIDENCE;
  const effectiveMinRR    = presetOverrides?.minRiskReward   ?? MIN_RR;
  const allowedSetups     = presetOverrides?.allowedSetupTypes ?? [];
  let account = { ...input.account };

  // ── Price sanity gate ─────────────────────────────────────────────────────
  // Finnhub free tier occasionally returns stale historical prices (e.g., GRMN
  // at $83 when current is $238). Without this guard a single bad tick triggers
  // an immediate stop-out at an unrealistic exit price.
  //
  // Rules — price is REJECTED (keep last known good price) if:
  //   • price > 30% below entry in a single cycle (impossible in normal markets)
  //   • price > 200% above entry              (pure safety net)
  //
  // Rejected prices are logged to _badPriceLog for diagnostics.
  const badPriceLog: Array<{ ticker: string; badPrice: number; entry: number; pct: number; at: string }> = [];

  let openPositions = input.openPositions.map((p) => {
    const price = prices[p.ticker];
    if (!price || price <= 0) return p;

    const dropPct   = (p.entryPrice - price) / p.entryPrice;
    const gainPct   = (price - p.entryPrice) / p.entryPrice;
    const tooLow    = dropPct > 0.30;   // >30% drop in one 30-second tick = stale data
    const tooHigh   = gainPct > 2.00;   // >200% gain         = stale data

    if (tooLow || tooHigh) {
      badPriceLog.push({
        ticker:   p.ticker,
        badPrice: price,
        entry:    p.entryPrice,
        pct:      tooLow ? -dropPct * 100 : gainPct * 100,
        at:       new Date().toISOString(),
      });
      const pctLabel = tooLow
        ? `-${(dropPct * 100).toFixed(1)}%`
        : `+${(gainPct * 100).toFixed(1)}%`;
      console.warn(
        `[paper-trading] BAD PRICE REJECTED — ${p.ticker}: ` +
        `entry $${p.entryPrice.toFixed(2)}, quote $${price.toFixed(2)} ` +
        `(${pctLabel} in one tick). ` +
        `Keeping last known price $${p.currentPrice.toFixed(2)}.`
      );
      return p; // keep last known good currentPrice, skip update
    }

    return updatePositionPrice(p, price);
  });

  const closedTrades: PaperTrade[]     = [];
  const newPositions: PaperPosition[]  = [];
  const rejections:   SignalRejection[] = [];
  const actions:      TradeAction[]    = [];
  const auditLog:     TradeAuditEntry[] = [];

  // ── Step 1: Check TP / SL on all open positions ───────────────────────────
  //
  // GAP RISK MODEL:
  //   TP exits use a limit order → fills at TP1 (best realistic case).
  //   If market gapped ABOVE TP1, record a favorable gap (got better price
  //   than expected) but still fill at TP1 (limit order wouldn't be held open).
  //
  //   SL exits use a stop-market order → fills at MARKET price, which can
  //   gap BELOW the stop (adverse gap / slippage-through).
  //   Previously we always filled at exact SL — this was too optimistic.
  //
  // SLIPPAGE is applied by buildClosedTrade to both legs.

  const stillOpen: PaperPosition[] = [];

  for (const pos of openPositions) {
    const mktPrice = pos.currentPrice;
    let closed     = false;
    let exitPrice  = mktPrice;
    let reason     = "";
    let gapType:   GapType = "none";
    let gapAmount  = 0;

    if (mktPrice >= pos.takeProfit1) {
      // TP limit order: fills at TP1.  Record favorable gap if mkt > TP1.
      exitPrice = pos.takeProfit1;
      if (mktPrice > pos.takeProfit1) {
        gapType   = "favorable";
        gapAmount = mktPrice - pos.takeProfit1;
      }
      reason    = `Take profit hit — market $${mktPrice.toFixed(2)}, filled at TP1 $${pos.takeProfit1.toFixed(2)}${gapType === "favorable" ? ` (gap +$${gapAmount.toFixed(2)})` : ""}`;
      closed    = true;
    } else if (mktPrice <= pos.stopLoss) {
      // SL stop-market: fills at MARKET PRICE (gap risk — may be worse than SL).
      exitPrice = mktPrice;
      if (mktPrice < pos.stopLoss) {
        gapType   = "adverse";
        gapAmount = pos.stopLoss - mktPrice;
      }
      reason    = `Stop loss hit — market $${mktPrice.toFixed(2)}${gapType === "adverse" ? ` (gap through SL by $${gapAmount.toFixed(2)})` : ""}`;
      closed    = true;
    }

    if (closed) {
      const trade = buildClosedTrade(pos, exitPrice, reason, gapType, gapAmount);

      // ── Suspicious trade detection ──────────────────────────────────────
      const gainPct = trade.profitLossPercent;
      const suspicious = gainPct > SUSPICIOUS_GAIN_PCT || gainPct < -80;
      const flag = suspicious
        ? `SUSPICIOUS: ${gainPct.toFixed(1)}% gain on entry $${pos.entryPrice.toFixed(2)} — verify TP1 $${pos.takeProfit1.toFixed(2)}`
        : "";

      if (suspicious) {
        trade.suspicious = true;
        trade.tp1AtEntry  = pos.takeProfit1;
        trade.slAtEntry   = pos.stopLoss;
      }

      auditLog.push({
        ticker:       pos.ticker,
        entryPrice:   pos.entryPrice,
        tp1:          pos.takeProfit1,
        slPrice:      pos.stopLoss,
        exitPrice,
        profitPct:    gainPct,
        reasonClosed: reason,
        suspicious,
        flag,
        timestamp:    new Date().toISOString(),
      });

      closedTrades.push(trade);
      account.cashBalance += exitPrice * pos.shares;
      account.totalTrades++;
      if (trade.result === "win")  account.wins++;
      if (trade.result === "loss") account.losses++;
      actions.push({ type: "sell", ticker: pos.ticker, reason, shares: pos.shares, price: exitPrice });
    } else {
      stillOpen.push(pos);
    }
  }

  openPositions = stillOpen;

  // ── Step 2: Buy qualifying signals (only when running) ────────────────────

  if (isRunning) {
    const heldTickers = new Set(openPositions.map((p) => p.ticker));

    // Cooldown: ANY exit (TP hit, stop-loss, or manual close) blocks re-entry
    // for TICKER_COOLDOWN_MINUTES. Previously only stop-loss exits were covered,
    // which allowed the same ticker to reopen immediately after a TP hit —
    // the root cause of duplicate DXPE/MAR trades.
    const cooldownCutoffMs = Date.now() - TICKER_COOLDOWN_MINUTES * 60_000;
    const cooledDown = new Set(
      (input.recentTrades ?? [])
        .filter((t) => new Date(t.closedAt).getTime() > cooldownCutoffMs)
        .map((t) => t.ticker),
    );

    // Pre-filter with rejection tracking
    const qualifying: StockSetup[] = [];
    for (const s of signals) {
      if (s.entryPrice <= s.stopLoss || s.takeProfit1 <= s.entryPrice) {
        rejections.push({ ticker: s.ticker, reason: "invalid_setup",
          detail: `entry ${s.entryPrice} SL ${s.stopLoss} TP1 ${s.takeProfit1}` });
        continue;
      }
      if (s.confidenceScore < effectiveMinConf) {
        rejections.push({ ticker: s.ticker, reason: "confidence_too_low",
          detail: `${s.confidenceScore}% < ${effectiveMinConf}%` });
        continue;
      }
      // Pullback Buy has a higher confidence requirement until it proves itself
      if (s.setupType === "Pullback Buy" && s.confidenceScore < PULLBACK_BUY_MIN_CONFIDENCE) {
        rejections.push({ ticker: s.ticker, reason: "confidence_too_low",
          detail: `Pullback Buy: ${s.confidenceScore}% < ${PULLBACK_BUY_MIN_CONFIDENCE}% (elevated gate)` });
        continue;
      }
      if (!Number.isFinite(s.riskReward) || s.riskReward < effectiveMinRR) {
        rejections.push({ ticker: s.ticker, reason: "rr_too_low",
          detail: `${s.riskReward?.toFixed(2)} < ${effectiveMinRR}` });
        continue;
      }
      if (s.scannerScore !== undefined && s.scannerScore < effectiveMinScore) {
        rejections.push({ ticker: s.ticker, reason: "score_too_low",
          detail: `${s.scannerScore} < ${effectiveMinScore}` });
        continue;
      }
      // ── Realism filters ───────────────────────────────────────────────────
      // Price filter: reject sub-$5 stocks (hard to trade realistically)
      if (s.currentPrice < MIN_PRICE_FOR_PAPER_TRADE) {
        rejections.push({ ticker: s.ticker, reason: "price_too_low",
          detail: `$${s.currentPrice.toFixed(2)} < $${MIN_PRICE_FOR_PAPER_TRADE} minimum` });
        continue;
      }
      // Volume/liquidity filter: reject illiquid stocks
      const adv = s.indicators.avgVolume ?? 0;
      if (adv < MIN_DAILY_VOLUME) {
        rejections.push({ ticker: s.ticker, reason: "low_liquidity",
          detail: `ADV ${adv.toLocaleString()} < ${MIN_DAILY_VOLUME.toLocaleString()} minimum` });
        continue;
      }
      // Zero-quote guard: if scanner has a live price of 0, skip
      if (s.dataQuality === "live" && s.currentPrice === 0) {
        rejections.push({ ticker: s.ticker, reason: "zero_quote",
          detail: "Finnhub returned price = 0 — likely delisted or halted" });
        continue;
      }

      if (allowedSetups.length > 0 && !allowedSetups.includes(s.setupType)) {
        rejections.push({ ticker: s.ticker, reason: "regime_defensive",
          detail: `${s.setupType} not in allowed setups: [${allowedSetups.join(", ")}]` });
        continue;
      }
      // Regime-based setup type gating
      if (regime === "defensive") {
        if (s.setupType === "Momentum Breakout" || s.setupType === "Trend Continuation") {
          // Allow high-conviction signals (score ≥ 75) even in defensive —
          // a breakout strong enough to score that high has enough momentum
          // to go against a soft tape. Weaker signals are blocked.
          const score = s.scannerScore ?? 0;
          if (score < 75) {
            rejections.push({ ticker: s.ticker, reason: "regime_defensive",
              detail: `${s.setupType} blocked in defensive (score ${score} < 75 minimum)` });
            continue;
          }
        }
        if (s.setupType === "Pullback Buy") {
          rejections.push({ ticker: s.ticker, reason: "regime_defensive",
            detail: "Pullback Buy disabled in defensive regime — stocks pulling back may continue falling" });
          continue;
        }
      }
      qualifying.push(s);
    }
    qualifying.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // Pre-compute setup type counts for diversification check
    const openSetupTypeCounts = openPositions.reduce<Record<string, number>>((acc, p) => {
      acc[p.setupType] = (acc[p.setupType] ?? 0) + 1;
      return acc;
    }, {});

    for (const setup of qualifying) {
      if (openPositions.length >= MAX_POSITIONS) {
        rejections.push({ ticker: setup.ticker, reason: "position_limit",
          detail: `${openPositions.length}/${MAX_POSITIONS} slots used` });
        continue;
      }
      if (heldTickers.has(setup.ticker)) {
        rejections.push({ ticker: setup.ticker, reason: "duplicate_ticker" });
        continue;
      }
      // Setup-type diversification: max 40% of open positions can be the same type.
      // With MAX_POSITIONS = 3, this allows at most 1 position per type (40% of 3 = 1.2 → floor = 1).
      const maxSameType = Math.max(1, Math.floor(MAX_POSITIONS * 0.4));
      if ((openSetupTypeCounts[setup.setupType] ?? 0) >= maxSameType) {
        rejections.push({ ticker: setup.ticker, reason: "setup_type_concentration",
          detail: `Already have ${openSetupTypeCounts[setup.setupType]} ${setup.setupType} position(s) — max ${maxSameType} per type` });
        continue;
      }
      if (cooledDown.has(setup.ticker)) {
        rejections.push({ ticker: setup.ticker, reason: "cooldown",
          detail: `stopped out within last ${TICKER_COOLDOWN_HOURS}h — cooldown active` });
        continue;
      }

      const rawShares = calculatePositionSize(
        account.totalAccountValue,
        setup.entryPrice,
        setup.stopLoss,
        regime,
      );
      // Pullback Buy runs at half size until its win rate justifies full allocation
      const shares = setup.setupType === "Pullback Buy"
        ? Math.max(1, Math.floor(rawShares * PULLBACK_BUY_SIZE_MULTIPLIER))
        : rawShares;
      if (shares <= 0) {
        rejections.push({ ticker: setup.ticker, reason: "shares_zero",
          detail: `entry ${setup.entryPrice} SL ${setup.stopLoss} acct ${account.totalAccountValue}` });
        continue;
      }

      const positionValue = shares * setup.entryPrice;
      if (account.cashBalance < positionValue) {
        rejections.push({ ticker: setup.ticker, reason: "insufficient_cash",
          detail: `need ${positionValue.toFixed(2)}, have ${account.cashBalance.toFixed(2)}` });
        continue;
      }

      const pos: PaperPosition = {
        positionId:          `pp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ticker:              setup.ticker,
        companyName:         setup.companyName,
        setupType:           setup.setupType,
        entryPrice:          setup.entryPrice,
        currentPrice:        setup.entryPrice,
        shares,
        positionValue,
        stopLoss:            setup.stopLoss,
        takeProfit1:         setup.takeProfit1,
        takeProfit2:         setup.takeProfit2,
        unrealizedPnL:       0,
        unrealizedPnLPercent:0,
        status:              "open",
        openedAt:            new Date().toISOString(),
        updatedAt:           new Date().toISOString(),
        // Capture full scanner reasoning at entry time so analytics can
        // correlate score/confidence/regime with actual trade outcomes.
        notes: {
          scannerScore:    setup.scannerScore,
          confidence:      setup.confidenceScore,
          scannerRank:     setup.scannerRank,
          scoreBreakdown:  setup.scoreBreakdown,
          dataSource:      setup.dataQuality === "live" ? "real" : "mock",
          candleSource:    setup.candleSource,
          executionTime:   new Date().toISOString(),
          marketRegime:    setup.marketRegime ?? String(regime),
        },
      };

      account.cashBalance -= positionValue;
      openPositions.push(pos);
      newPositions.push(pos);
      heldTickers.add(setup.ticker);
      openSetupTypeCounts[setup.setupType] = (openSetupTypeCounts[setup.setupType] ?? 0) + 1;
      actions.push({
        type: "buy", ticker: setup.ticker,
        reason: `Score ${setup.confidenceScore}% conf, ${setup.riskReward.toFixed(1)}:1 R/R`,
        shares, price: setup.entryPrice,
      });
    }
  }

  // ── Step 3: Recalculate account ───────────────────────────────────────────

  account = recalculateAccount(account, openPositions, [...(input.closedTrades ?? []), ...closedTrades]);

  // ── Step 4: Build equity curve point ─────────────────────────────────────

  const investedValue = openPositions.reduce((s, p) => s + p.positionValue, 0);
  const equityPoint: EquityCurvePoint = {
    date:            new Date().toISOString().slice(0, 10),
    accountValue:    account.totalAccountValue,
    cashBalance:     account.cashBalance,
    investedValue,
    dailyPnL:        account.totalPnL,
    totalPnLPercent: account.totalPnLPercent,
  };

  return {
    account, openPositions, newPositions, closedTrades, actions, equityPoint,
    rejections, signalsChecked: signals.length, auditLog,
    badPrices: badPriceLog,
  };
}
