import { NextResponse } from "next/server";
import {
  getSheetRows, appendRows, replaceAllRows, isSheetsConfigured,
  invalidateSheetCache, SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import {
  makeDefaultAccount, runCycle,
  type PaperAccount, type PaperPosition, type PaperTrade,
  type EquityCurvePoint,
} from "@/lib/paper-trading";
import { notifyPaperBuy, notifyPaperSell, notifyStopLossHit } from "@/lib/discord-notify";
import { isMarketOpen } from "@/lib/market-hours";
import {
  initializePaperTradingSheets,
  arePaperSheetsReady,
  readSetting,
} from "@/lib/google-sheets";
import type { StockSetup } from "@/lib/types";
import type { MarketRegime } from "@/lib/scanner-scoring";

const HA = HEADERS[SHEETS.PAPER_ACCOUNT];
const HP = HEADERS[SHEETS.PAPER_POSITIONS];
const HT = HEADERS[SHEETS.PAPER_TRADES];
const HE = HEADERS[SHEETS.PAPER_EQUITY];

// ── Layer 1: FIFO process-level lock ─────────────────────────────────────────
//
// POST /api/paper/run is a read-modify-write transaction on Google Sheets.
// Two concurrent calls (30-sec price check + auto-trade, or price check +
// executeTopPick) would both read stale cached state, both open the same
// position, then interleave replaceAllRows(clear → append → clear → append)
// producing duplicate rows.  This FIFO lock serialises all run calls so only
// one is in the critical section at a time.

const LOCK_TIMEOUT_MS = 25_000;
let   _runBusy   = false;
const _runWaiters: Array<() => void> = [];

function acquireRunLock(): Promise<boolean> {
  if (!_runBusy) { _runBusy = true; return Promise.resolve(true); }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const idx = _runWaiters.indexOf(releaser);
      if (idx !== -1) _runWaiters.splice(idx, 1);
      resolve(false);
    }, LOCK_TIMEOUT_MS);
    const releaser = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    };
    _runWaiters.push(releaser);
  });
}

function releaseRunLock(): void {
  const next = _runWaiters.shift();
  if (next) next(); else _runBusy = false;
}

// ── Layer 4: Duplicate position block log ─────────────────────────────────────
// Ring-buffer, newest first, capped at 50 entries.

export interface DupBlockEntry {
  ticker:    string;
  reason:    string;
  fingerprint: string;
  at:        string;
}

const _dupBlockLog: DupBlockEntry[] = [];

function logDupBlock(ticker: string, reason: string, fp: string): void {
  const entry: DupBlockEntry = { ticker, reason, fingerprint: fp, at: new Date().toISOString() };
  _dupBlockLog.unshift(entry);
  if (_dupBlockLog.length > 50) _dupBlockLog.pop();
  console.warn(`[DUPLICATE POSITION BLOCKED] ${ticker} | ${reason} | fp=${fp} | ${entry.at}`);
}

function getDupBlockLog(): DupBlockEntry[] { return _dupBlockLog; }

// ── Layer 3: Position fingerprint ─────────────────────────────────────────────
// ticker|entryPrice|shares|openedAt(minute)

function positionFingerprint(p: PaperPosition): string {
  const openedMin = p.openedAt ? p.openedAt.slice(0, 16) : "";
  return `${p.ticker}|${p.entryPrice.toFixed(2)}|${p.shares}|${openedMin}`;
}

// ── Row converters ────────────────────────────────────────────────────────────

function rowToAccount(row: string[]): PaperAccount {
  const o = rowToObject(HA, row);
  return {
    accountId: o.accountId || "default",
    startingBalance:   Number(o.startingBalance)   || 1000,
    cashBalance:       Number(o.cashBalance)        || 1000,
    equityValue:       Number(o.equityValue)        || 0,
    totalAccountValue: Number(o.totalAccountValue)  || 1000,
    totalPnL:          Number(o.totalPnL)           || 0,
    totalPnLPercent:   Number(o.totalPnLPercent)    || 0,
    totalTrades:       Number(o.totalTrades)        || 0,
    wins:              Number(o.wins)               || 0,
    losses:            Number(o.losses)             || 0,
    winRate:           Number(o.winRate)            || 0,
    updatedAt:         o.updatedAt || new Date().toISOString(),
  };
}

export function accountToRow(a: PaperAccount): (string | number)[] {
  return HA.map((col) => {
    switch (col) {
      case "accountId":         return a.accountId;
      case "startingBalance":   return a.startingBalance;
      case "cashBalance":       return a.cashBalance;
      case "equityValue":       return a.equityValue;
      case "totalAccountValue": return a.totalAccountValue;
      case "totalPnL":          return a.totalPnL;
      case "totalPnLPercent":   return a.totalPnLPercent;
      case "totalTrades":       return a.totalTrades;
      case "wins":              return a.wins;
      case "losses":            return a.losses;
      case "winRate":           return a.winRate;
      case "updatedAt":         return new Date().toISOString();
      default:                  return "";
    }
  });
}

function rowToPosition(row: string[]): PaperPosition {
  const o = rowToObject(HP, row);
  return {
    positionId:           o.positionId,
    ticker:               o.ticker,
    companyName:          o.companyName,
    setupType:            o.setupType,
    entryPrice:           Number(o.entryPrice),
    currentPrice:         Number(o.currentPrice),
    shares:               Number(o.shares),
    positionValue:        Number(o.positionValue),
    stopLoss:             Number(o.stopLoss),
    takeProfit1:          Number(o.takeProfit1),
    takeProfit2:          Number(o.takeProfit2),
    unrealizedPnL:        Number(o.unrealizedPnL),
    unrealizedPnLPercent: Number(o.unrealizedPnLPercent),
    status:               "open",
    openedAt:             o.openedAt,
    updatedAt:            o.updatedAt,
    notes:                o.notes ? (() => { try { return JSON.parse(o.notes); } catch { return undefined; } })() : undefined,
  };
}

export function positionToRow(p: PaperPosition): (string | number)[] {
  return HP.map((col) => {
    switch (col) {
      case "positionId":           return p.positionId;
      case "ticker":               return p.ticker;
      case "companyName":          return p.companyName;
      case "setupType":            return p.setupType;
      case "entryPrice":           return p.entryPrice;
      case "currentPrice":         return p.currentPrice;
      case "shares":               return p.shares;
      case "positionValue":        return p.positionValue;
      case "stopLoss":             return p.stopLoss;
      case "takeProfit1":          return p.takeProfit1;
      case "takeProfit2":          return p.takeProfit2;
      case "unrealizedPnL":        return p.unrealizedPnL;
      case "unrealizedPnLPercent": return p.unrealizedPnLPercent;
      case "status":               return p.status;
      case "openedAt":             return p.openedAt;
      case "updatedAt":            return new Date().toISOString();
      case "notes":                return p.notes ? JSON.stringify(p.notes) : "";
      default:                     return "";
    }
  });
}

export function tradeToRow(t: PaperTrade): (string | number)[] {
  return HT.map((col) => {
    switch (col) {
      case "tradeId":           return t.tradeId;
      case "ticker":            return t.ticker;
      case "companyName":       return t.companyName;
      case "setupType":         return t.setupType;
      case "buyPrice":              return t.buyPrice;
      case "sellPrice":             return t.sellPrice;
      case "effectiveEntryPrice":   return t.effectiveEntryPrice ?? t.buyPrice;
      case "effectiveExitPrice":    return t.effectiveExitPrice  ?? t.sellPrice;
      case "shares":                return t.shares;
      case "positionSize":          return t.positionSize;
      case "profitLoss":            return t.profitLoss;
      case "profitLossPercent":     return t.profitLossPercent;
      case "slippageCost":          return t.slippageCost ?? 0;
      case "gapType":               return t.gapType ?? "none";
      case "gapAmount":             return t.gapAmount ?? 0;
      case "result":                return t.result;
      case "reasonOpened":          return t.reasonOpened;
      case "reasonClosed":          return t.reasonClosed;
      case "openedAt":              return t.openedAt;
      case "closedAt":              return t.closedAt;
      case "holdTimeHours":         return t.holdTimeHours ?? "";
      case "notes":                 return t.notes ? JSON.stringify(t.notes) : "";
      case "dataQuality":           return t.dataQuality ?? "";
      default:                      return "";
    }
  });
}

export function equityPointToRow(p: EquityCurvePoint): (string | number)[] {
  return HE.map((col) => {
    switch (col) {
      case "date":            return p.date;
      case "accountValue":    return p.accountValue;
      case "cashBalance":     return p.cashBalance;
      case "investedValue":   return p.investedValue;
      case "dailyPnL":        return p.dailyPnL;
      case "totalPnLPercent": return p.totalPnLPercent;
      default:                return "";
    }
  });
}

// ── Shared loader (used by run + close routes) ────────────────────────────────

function rowToTrade(row: string[]): PaperTrade {
  const o   = rowToObject(HT, row);
  const pct = Number(o.profitLossPercent);
  const buy = Number(o.buyPrice);
  const sell= Number(o.sellPrice);
  return {
    tradeId:            o.tradeId,
    ticker:             o.ticker,
    companyName:        o.companyName,
    setupType:          o.setupType,
    buyPrice:           buy,
    sellPrice:          sell,
    effectiveEntryPrice:Number(o.effectiveEntryPrice) || buy,
    effectiveExitPrice: Number(o.effectiveExitPrice)  || sell,
    shares:             Number(o.shares),
    positionSize:       Number(o.positionSize),
    profitLoss:         Number(o.profitLoss),
    profitLossPercent:  pct,
    slippageCost:       Number(o.slippageCost) || 0,
    gapType:            (o.gapType as PaperTrade["gapType"]) || "none",
    gapAmount:          Number(o.gapAmount) || 0,
    result:             o.result as PaperTrade["result"],
    reasonOpened:       o.reasonOpened,
    reasonClosed:       o.reasonClosed,
    openedAt:           o.openedAt,
    closedAt:           o.closedAt,
    holdTimeHours:      o.holdTimeHours ? Number(o.holdTimeHours) : undefined,
    suspicious:         pct > 100 || pct < -80,
    notes:              o.notes ? (() => { try { return JSON.parse(o.notes); } catch { return undefined; } })() : undefined,
    dataQuality:        (o.dataQuality as PaperTrade["dataQuality"]) || undefined,
  };
}

export async function loadPaperState(): Promise<{
  account:       PaperAccount;
  openPositions: PaperPosition[];
  recentTrades:  PaperTrade[];
  closedTrades:  PaperTrade[];
}> {
  // Always bypass the in-memory cache for positions — the FIFO lock ensures
  // only one run call is active, but we invalidate explicitly so the fresh
  // Sheets state is visible even if a previous run completed within the 30s
  // cache window.
  invalidateSheetCache(SHEETS.PAPER_POSITIONS);

  // Load trades closed within 60 min — covers the 30-min cooldown window.
  // ALL exit types (wins + stops + manual) to prevent immediate reopen after any close.
  const cooldownWindowMs = 60 * 60_000;
  const cooldownCutoff   = Date.now() - cooldownWindowMs;
  const [accRows, posRows, tradeRows] = await Promise.all([
    getSheetRows(SHEETS.PAPER_ACCOUNT),
    getSheetRows(SHEETS.PAPER_POSITIONS),
    getSheetRows(SHEETS.PAPER_TRADES),
  ]);
  const accData       = accRows.slice(1).filter((r) => r[0]);
  const account       = accData.length ? rowToAccount(accData[0]) : makeDefaultAccount();
  const openPositions = posRows.slice(1).filter((r) => r[0]).map(rowToPosition);
  const closedTrades  = tradeRows.slice(1).filter((r) => r[0]).map(rowToTrade);
  const recentTrades  = closedTrades
    .filter((t) => new Date(t.closedAt).getTime() > cooldownCutoff); // all exit types
  return { account, openPositions, recentTrades, closedTrades };
}

// ── Shared writer ─────────────────────────────────────────────────────────────

/**
 * Fingerprint for deduplication.
 * Uses ticker|buyPrice|sellPrice|shares|openedAt|closedAt so that:
 *  - Two runs of the same position at different times are never blocked
 *  - The same position closed twice in the same cycle IS blocked
 * closedAt is truncated to the minute to tolerate sub-second timing jitter.
 */
function tradeFingerprint(t: PaperTrade): string {
  const closedMin = t.closedAt ? t.closedAt.slice(0, 16) : ""; // "YYYY-MM-DDTHH:MM"
  const openedMin = t.openedAt ? t.openedAt.slice(0, 16) : "";
  return `${t.ticker}|${t.buyPrice.toFixed(2)}|${t.sellPrice.toFixed(2)}|${t.shares}|${openedMin}|${closedMin}`;
}

export async function savePaperState(
  account: PaperAccount,
  positions: PaperPosition[],
  newTrades: PaperTrade[],
  equityPoint?: EquityCurvePoint,
): Promise<void> {
  // Always write account (single row — replace everything after header)
  const accountWrite = replaceAllRows(SHEETS.PAPER_ACCOUNT, [accountToRow(account)]);

  // ── Layer 2: Pre-write fresh-read position guard ──────────────────────────
  // Even inside the FIFO lock, re-read PaperPositions from Sheets immediately
  // before writing to catch any edge case where two processes (e.g. cold
  // process restarts) race past the in-process lock.
  let finalPositions = positions;
  try {
    invalidateSheetCache(SHEETS.PAPER_POSITIONS);
    const freshRows     = await getSheetRows(SHEETS.PAPER_POSITIONS);
    const freshPositions= freshRows.slice(1).filter((r) => r[0]).map(rowToPosition);
    const freshTickers  = new Set(freshPositions.map((p) => p.ticker));
    const freshFPs      = new Set(freshPositions.map(positionFingerprint));

    // For positions in our list that are NOT already in Sheets (new buys),
    // check whether Sheets has already gained that ticker from a concurrent
    // writer.  If so, block it.
    finalPositions = positions.filter((p) => {
      // If this position already existed in Sheets (same fingerprint), keep it
      if (freshFPs.has(positionFingerprint(p))) return true;

      // If this is a new position but Sheets already has the ticker → block
      const existedBefore = freshPositions.some((f) => f.positionId === p.positionId);
      if (!existedBefore && freshTickers.has(p.ticker)) {
        logDupBlock(p.ticker, "pre-write-check: ticker already in Sheets", positionFingerprint(p));
        return false;
      }
      return true;
    });
  } catch { /* if fresh read fails, proceed with original list — better to write than lose positions */ }

  // ── Layer 3: Dedup by ticker (last line of defence) ──────────────────────
  // Should never trigger after layers 1+2, but prevents any edge case.
  const seenTickers = new Set<string>();
  const seenFPs     = new Set<string>();
  finalPositions = finalPositions.filter((p) => {
    const fp = positionFingerprint(p);
    if (seenFPs.has(fp)) {
      logDupBlock(p.ticker, "dedup-layer3: identical fingerprint", fp);
      return false;
    }
    if (seenTickers.has(p.ticker)) {
      logDupBlock(p.ticker, "dedup-layer3: same ticker twice in position list", fp);
      return false;
    }
    seenFPs.add(fp);
    seenTickers.add(p.ticker);
    return true;
  });

  // Write deduplicated positions
  const posWrite = replaceAllRows(SHEETS.PAPER_POSITIONS, finalPositions.map(positionToRow));

  // Dedup trades before appending — reject any trade whose fingerprint already
  // exists in the last 60 minutes of Sheets data. Prevents the concurrent-run
  // race condition that caused DXPE/MAR to appear twice.
  let tradesToWrite = newTrades;
  if (newTrades.length > 0) {
    try {
      const existing    = await getSheetRows(SHEETS.PAPER_TRADES);
      const cutoffMs    = Date.now() - 60 * 60_000;
      const recentFPs   = new Set(
        existing.slice(1).filter((r) => r[0]).map(rowToTrade)
          .filter((t) => new Date(t.closedAt).getTime() > cutoffMs)
          .map(tradeFingerprint),
      );
      tradesToWrite = newTrades.filter((t) => !recentFPs.has(tradeFingerprint(t)));
    } catch { /* if read fails, still write all — better than losing data */ }
  }

  // Append deduplicated closed trades
  const tradesWrite = tradesToWrite.length > 0
    ? appendRows(SHEETS.PAPER_TRADES, tradesToWrite.map(tradeToRow))
    : Promise.resolve();

  // Append equity point (one per day max — duplicate dates overwrite in chart but are fine)
  const equityWrite = equityPoint
    ? appendRows(SHEETS.PAPER_EQUITY, [equityPointToRow(equityPoint)])
    : Promise.resolve();

  // All writes in parallel — throw on any failure so caller can return 500
  await Promise.all([accountWrite, posWrite, tradesWrite, equityWrite]);
}

// ── GET /api/paper/run — duplicate block log for diagnostics ─────────────────

export async function GET() {
  return NextResponse.json({ dupBlockLog: _dupBlockLog });
}

// ── POST /api/paper/run ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Acquire the FIFO process lock before reading any state.
  // This prevents concurrent calls from both loading stale data and creating
  // duplicate positions (the race that caused MRNA/NFLX 2× duplication).
  const lockAcquired = await acquireRunLock();
  if (!lockAcquired) {
    return NextResponse.json(
      { error: "Paper trader busy — another cycle is running. Retry in a moment." },
      { status: 429 },
    );
  }

  try {
  const { signals, prices, regime, isRunning, allowOutsideHours } = (await req.json()) as {
    signals:            StockSetup[];
    prices:             Record<string, number>;
    regime:             MarketRegime;
    isRunning:          boolean;
    allowOutsideHours?: boolean;
  };

  const marketOpen     = isMarketOpen();
  const tradingAllowed = marketOpen || (allowOutsideHours === true);

  // Read allowSyntheticData — default OFF. Block mock-candle setups when false.
  let allowSynthetic = false;
  try {
    const setting = await readSetting("allowSyntheticData");
    allowSynthetic = setting === "true";
  } catch { /* default false */ }

  const syntheticBlocked = !allowSynthetic
    ? signals.filter((s) =>
        s.candleSource === "mock" || !s.candleSource || s.dataQuality !== "live",
      ).length
    : 0;

  const filteredSignals = allowSynthetic
    ? signals
    : signals.filter((s) =>
        // Gate 1: real OHLC candles (not LCG-synthetic, not insufficient bars)
        (s.candleSource === "real" || s.candleSource === "delayed") &&
        !s.insufficientData &&
        // Gate 2: live Finnhub price at entry — blocks trades where dataSource would
        // be "mock" (entry price is a stale candle close, not a real-time quote).
        // VZ was gated by candleSource:"delayed" but had dataQuality:"demo" →
        // dataSource:"mock" in trade notes — entry price was not a live market price.
        s.dataQuality === "live",
      );

  const gatedSignals = tradingAllowed ? filteredSignals : [];
  const persists     = isSheetsConfigured();

  // ── Auto-init paper trading sheets (runs once per process, idempotent) ───

  if (persists && !arePaperSheetsReady()) {
    const init = await initializePaperTradingSheets();
    if (!init.ok) {
      return NextResponse.json(
        { error: `Google Sheets init failed: ${init.error}`, detail: init.error },
        { status: 503 },
      );
    }
  }

  // ── Load current state ────────────────────────────────────────────────────

  let account:       PaperAccount;
  let openPositions: PaperPosition[];
  let recentTrades:  PaperTrade[] = [];
  let closedTrades:  PaperTrade[] = [];

  if (persists) {
    try {
      ({ account, openPositions, recentTrades, closedTrades } = await loadPaperState());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Failed to load from Google Sheets: ${msg}` }, { status: 503 });
    }
  } else {
    account       = makeDefaultAccount();
    openPositions = [];
  }

  // ── Run cycle ─────────────────────────────────────────────────────────────

  // Read active preset thresholds from AppSettings (overrides hardcoded defaults when set).
  // Scope must include "paper" to affect the paper trader.
  let activePresetOverrides: Partial<import("@/lib/paper-trading").RunCycleInput["presetOverrides"]> = {};
  if (persists) {
    try {
      const scope = await readSetting("activePresetScope");
      if (scope?.includes("paper")) {
        const [score, conf, rr, setups] = await Promise.all([
          readSetting("minScannerScore"),
          readSetting("minConfidence"),
          readSetting("minRiskReward"),
          readSetting("setupTypesAllowed"),
        ]);
        activePresetOverrides = {
          minScannerScore:  score ? Number(score)  : undefined,
          minConfidence:    conf  ? Number(conf)   : undefined,
          minRiskReward:    rr    ? Number(rr)     : undefined,
          allowedSetupTypes:setups ? setups.split("|").filter(Boolean) : undefined,
        };
      }
    } catch { /* non-fatal — use defaults */ }
  }

  const result = runCycle({ account, openPositions, signals: gatedSignals, prices, regime, isRunning, recentTrades, closedTrades, presetOverrides: activePresetOverrides });

  // ── Persist: always write when Sheets is configured ─────────────────────
  // Discord is only fired AFTER a confirmed successful write.
  // Previously Discord fired even when persists=false (Sheets not configured),
  // which sent alerts for positions that were never actually saved anywhere.

  let savedSuccessfully = false;
  if (persists) {
    try {
      const equityPoint = (result.closedTrades.length > 0 || result.newPositions.length > 0)
        ? result.equityPoint
        : undefined;
      await savePaperState(result.account, result.openPositions, result.closedTrades, equityPoint);
      savedSuccessfully = true;
    } catch (err) {
      return NextResponse.json(
        {
          error: "Failed to save to Google Sheets — no Discord alerts sent",
          detail: String(err),
          debug: {
            signalsChecked:  result.signalsChecked,
            positionsOpened: result.newPositions.length,
            rejections:      result.rejections,
            marketOpen, tradingAllowed,
          },
        },
        { status: 500 },
      );
    }
  }

  // ── Discord: only fire when positions were actually persisted ─────────────
  // If !persists (no Sheets configured), also allow Discord so demo mode still works.

  if (tradingAllowed && (savedSuccessfully || !persists) && result.newPositions.length > 0) {
    for (const pos of result.newPositions) {
      const signal = signals.find((s) => s.ticker === pos.ticker);
      void notifyPaperBuy(
        pos, result.account.cashBalance,
        signal?.confidenceScore ?? 0,
        `${pos.setupType} · ${signal?.reason?.slice(0, 120) ?? "Scanner signal"}`,
      );
    }
  }
  if (tradingAllowed && (savedSuccessfully || !persists) && result.closedTrades.length > 0) {
    for (const trade of result.closedTrades) {
      if (trade.reasonClosed.toLowerCase().includes("stop")) {
        void notifyStopLossHit(trade, result.account.totalAccountValue);
      } else {
        void notifyPaperSell(trade, result.account.totalAccountValue);
      }
    }
  }

  return NextResponse.json({
    account:        result.account,
    openPositions:  result.openPositions,
    closedTrades:   result.closedTrades,
    actions:        result.actions,
    equityPoint:    result.equityPoint,
    auditLog:       result.auditLog,
    marketOpen,
    tradingAllowed,
    sheetsConfigured: persists,
    debug: {
      signalsReceived:  signals.length,
      signalsChecked:   result.signalsChecked,
      gatedSignals:     gatedSignals.length,
      syntheticBlocked,
      positionsOpened:  result.newPositions.length,
      positionsClosed:  result.closedTrades.length,
      rejections:       result.rejections,
      dupBlocksThisSession: _dupBlockLog.length,
      badPricesRejected: result.badPrices,   // stale/wrong Finnhub quotes blocked
    },
  });
  } finally {
    releaseRunLock();
  }
}
