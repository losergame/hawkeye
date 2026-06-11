/**
 * POST /api/paper/rebuild
 *
 * Rebuilds PaperAccount from the actual content of PaperPositions and
 * PaperTrades.  Removes corrupted/suspicious trade rows, then recalculates
 * all account stats from first principles.
 *
 * Does NOT delete PaperPositions — existing open trades are kept.
 * Does NOT delete the PaperTrades sheet — only the suspicious rows are removed.
 * Clears PaperEquityCurve (curve is rebuilt from scratch on next scan run).
 *
 * Suspicious trades are defined as:
 *   • profitLossPercent > 100  (unrealistic single-trade gain)
 *   • profitLossPercent < -80  (full wipe-out — suspect in paper trading)
 */

import { NextResponse } from "next/server";
import {
  getSheetRows, replaceAllRows, isSheetsConfigured,
  backupSheetRows,
  SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import {
  makeDefaultAccount, rebuildAccountFromLedger,
  type PaperAccount, type PaperPosition, type PaperTrade,
} from "@/lib/paper-trading";
import {
  accountToRow, positionToRow, tradeToRow,
} from "@/app/api/paper/run/route";

const HA = HEADERS[SHEETS.PAPER_ACCOUNT];
const HP = HEADERS[SHEETS.PAPER_POSITIONS];
const HT = HEADERS[SHEETS.PAPER_TRADES];

const SUSPICIOUS_GAIN  =  100;  // % above this is flagged
const SUSPICIOUS_LOSS  = -80;   // % below this is flagged

function rowToAccount(row: string[]): PaperAccount {
  const o = rowToObject(HA, row);
  return {
    accountId:         o.accountId || "default",
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

function rowToPosition(row: string[]): PaperPosition {
  const o = rowToObject(HP, row);
  return {
    positionId:           o.positionId,
    ticker:               o.ticker,
    companyName:          o.companyName,
    setupType:            o.setupType,
    entryPrice:           Number(o.entryPrice),
    currentPrice:         Number(o.currentPrice) || Number(o.entryPrice),
    shares:               Number(o.shares),
    positionValue:        Number(o.positionValue) || Number(o.entryPrice) * Number(o.shares),
    stopLoss:             Number(o.stopLoss),
    takeProfit1:          Number(o.takeProfit1),
    takeProfit2:          Number(o.takeProfit2),
    unrealizedPnL:        Number(o.unrealizedPnL) || 0,
    unrealizedPnLPercent: Number(o.unrealizedPnLPercent) || 0,
    status:               "open",
    openedAt:             o.openedAt,
    updatedAt:            o.updatedAt || o.openedAt,
  };
}

function rowToTrade(row: string[]): PaperTrade {
  const o = rowToObject(HT, row);
  const pct = Number(o.profitLossPercent);
  return {
    tradeId:           o.tradeId,
    ticker:            o.ticker,
    companyName:       o.companyName,
    setupType:         o.setupType,
    buyPrice:          Number(o.buyPrice),
    sellPrice:         Number(o.sellPrice),
    shares:            Number(o.shares),
    positionSize:      Number(o.positionSize),
    profitLoss:        Number(o.profitLoss),
    profitLossPercent: pct,
    result:            o.result as PaperTrade["result"],
    reasonOpened:      o.reasonOpened,
    reasonClosed:      o.reasonClosed,
    openedAt:            o.openedAt,
    closedAt:            o.closedAt,
    effectiveEntryPrice: Number(o.effectiveEntryPrice) || Number(o.buyPrice),
    effectiveExitPrice:  Number(o.effectiveExitPrice)  || Number(o.sellPrice),
    slippageCost:        Number(o.slippageCost) || 0,
    gapType:             (o.gapType as PaperTrade["gapType"]) || "none",
    gapAmount:           Number(o.gapAmount) || 0,
    suspicious:          pct > SUSPICIOUS_GAIN || pct < SUSPICIOUS_LOSS,
    dataQuality:         (o.dataQuality as PaperTrade["dataQuality"]) || undefined,
  };
}

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 503 });
  }

  // Optional: startDate (ISO date string, e.g. "2026-06-02") and startingBalance.
  // When startDate is supplied, only trades closed on or after that date contribute
  // to P/L — pre-date trades stay in the sheet for historical reference but are
  // excluded from the account balance calculation.
  const body = await req.json().catch(() => ({})) as {
    startDate?:       string;   // e.g. "2026-06-02" — exclude older closed trades
    startingBalance?: number;   // override starting balance (default: existing or 1000)
  };
  const cutoffDate     = body.startDate ? new Date(body.startDate) : null;
  const forceBalance   = typeof body.startingBalance === "number" ? body.startingBalance : null;

  try {
    // ── 1. Load all current data ────────────────────────────────────────────

    const [accRows, posRows, tradeRows] = await Promise.all([
      getSheetRows(SHEETS.PAPER_ACCOUNT),
      getSheetRows(SHEETS.PAPER_POSITIONS),
      getSheetRows(SHEETS.PAPER_TRADES),
    ]);

    const existingAccount = accRows.slice(1).filter((r) => r[0]).map(rowToAccount)[0]
      ?? makeDefaultAccount();

    const rawPositions = posRows.slice(1).filter((r) => r[0]).map(rowToPosition);

    // ── Dedup open positions (defensive — should not happen after lock fix) ──
    // Keeps one position per ticker (earliest openedAt wins) and reports count.
    const seenPosTickers = new Map<string, PaperPosition>();
    for (const p of rawPositions) {
      const existing = seenPosTickers.get(p.ticker);
      if (!existing || p.openedAt < existing.openedAt) {
        seenPosTickers.set(p.ticker, p);
      }
    }
    const openPositions    = [...seenPosTickers.values()];
    const dupPositionCount = rawPositions.length - openPositions.length;

    const allTrades = tradeRows.slice(1).filter((r) => r[0]).map(rowToTrade);

    // Remove suspicious trades and DATA_ERROR trades from all calculations
    const cleanTrades = allTrades.filter(
      (t) => !t.suspicious && t.dataQuality !== "DATA_ERROR" && t.result !== "DATA_ERROR",
    );

    // When startDate is supplied, only trades closed on or after that date count
    // toward P/L — older trades stay in the sheet but don't affect the balance.
    const validTrades = cutoffDate
      ? cleanTrades.filter((t) => t.closedAt && new Date(t.closedAt) >= cutoffDate)
      : cleanTrades;

    const excludedByDate = cleanTrades.length - validTrades.length;
    const removedCount   = allTrades.length - cleanTrades.length;

    // ── 2. Recalculate account from first principles ────────────────────────
    //
    // Formula:
    //   realizedPnL       = sum(PaperTrades.profitLoss for trades in window)
    //   unrealizedPnL     = sum(PaperPositions.unrealizedPnL)
    //   equityValue       = sum(PaperPositions.positionValue)
    //   totalPnL          = realizedPnL + unrealizedPnL
    //   totalAccountValue = startingBalance + totalPnL

    // Use forced balance when rebuilding from a date cutoff, or existing balance
    const startingBalance = forceBalance ?? existingAccount.startingBalance ?? 1000;
    const investedCost    = openPositions.reduce((s, p) => s + p.entryPrice * p.shares, 0);
    const realizedPnL     = validTrades.reduce((s, t) => s + t.profitLoss, 0);
    const cashBalance     = startingBalance - investedCost + realizedPnL;

    const wins   = validTrades.filter((t) => t.result === "win").length;
    const losses = validTrades.filter((t) => t.result === "loss").length;
    const total   = wins + losses;
    const winRate = total > 0 ? wins / total : 0;

    // Recalculate unrealized P&L on open positions using entry price as proxy
    const rebuiltPositions = openPositions.map((p) => ({
      ...p,
      positionValue:        p.currentPrice * p.shares,
      unrealizedPnL:        (p.currentPrice - p.entryPrice) * p.shares,
      unrealizedPnLPercent: p.entryPrice > 0
        ? ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100
        : 0,
    }));

    const rebuiltAccount: PaperAccount = rebuildAccountFromLedger({
      ...existingAccount,
      startingBalance,
      cashBalance,
      wins,
      losses,
      totalTrades: total,
      winRate,
    }, rebuiltPositions, validTrades);

    // ── 3. Backup then write ────────────────────────────────────────────────
    // Both backups MUST succeed before any writes — abort if either fails.

    const [tradesBackup, positionsBackup] = await Promise.all([
      backupSheetRows("PaperTrades_Backup",    tradeRows),
      backupSheetRows("PaperPositions_Backup", posRows),
    ]);

    await Promise.all([
      // Save rebuilt account (single row)
      replaceAllRows(SHEETS.PAPER_ACCOUNT, [accountToRow(rebuiltAccount)]),
      // Save cleaned trades (suspicious removed)
      replaceAllRows(SHEETS.PAPER_TRADES, validTrades.map(tradeToRow)),
      // Clear equity curve (will be rebuilt from next scan run)
      replaceAllRows(SHEETS.PAPER_EQUITY, []),
      // Keep positions as-is (they're valid)
      rebuiltPositions.length > 0
        ? replaceAllRows(SHEETS.PAPER_POSITIONS, rebuiltPositions.map(positionToRow))
        : Promise.resolve(),
    ]);

    // Re-apply conditional formatting after rebuild (fire-and-forget)
    void (async () => {
      try {
        const { applyPaperTradingFormatting } = await import("@/lib/sheets-formatting");
        await applyPaperTradingFormatting(rebuiltAccount.startingBalance);
      } catch { /* non-fatal */ }
    })();

    const parts: string[] = [];
    parts.push(`Backed up: PaperTrades (${tradesBackup.rowCount} rows), PaperPositions (${positionsBackup.rowCount} rows).`);
    if (removedCount > 0)     parts.push(`Removed ${removedCount} suspicious/error trade(s).`);
    if (dupPositionCount > 0) parts.push(`Removed ${dupPositionCount} duplicate open position(s).`);
    if (excludedByDate > 0)   parts.push(`Excluded ${excludedByDate} pre-${body.startDate} trade(s) from P/L.`);
    parts.push(`Account rebuilt from ${openPositions.length} open position(s) and ${validTrades.length} closed trade(s).`);
    if (cutoffDate) parts.push(`Starting balance reset to $${startingBalance.toFixed(2)}.`);

    return NextResponse.json({
      ok:                true,
      account:           rebuiltAccount,
      openPositions:     rebuiltPositions,
      validTrades:       validTrades.length,
      removedTrades:     removedCount,
      excludedByDate,
      dupPositionCount,
      startDate:         body.startDate ?? null,
      backedUpAt:        tradesBackup.backedUpAt,
      message:           parts.join(" "),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Rebuild failed: ${String(err)}` },
      { status: 500 },
    );
  }
}
