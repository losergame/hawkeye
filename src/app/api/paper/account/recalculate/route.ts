/**
 * POST /api/paper/account/recalculate
 *
 * Non-destructive account balance fix.  Reads PaperTrades + PaperPositions,
 * recomputes all account stats from first principles, and writes only
 * PaperAccount.  Does NOT modify, remove, or rewrite any trades or positions.
 *
 * Use this to restore the correct account balance after data loss without
 * going through the full destructive Rebuild flow.
 */

import { NextResponse } from "next/server";
import {
  getSheetRows, replaceAllRows, isSheetsConfigured,
  SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import { makeDefaultAccount } from "@/lib/paper-trading";
import { accountToRow } from "@/app/api/paper/run/route";

const HA = HEADERS[SHEETS.PAPER_ACCOUNT];
const HP = HEADERS[SHEETS.PAPER_POSITIONS];
const HT = HEADERS[SHEETS.PAPER_TRADES];

const SUSPICIOUS_GAIN =  100;
const SUSPICIOUS_LOSS = -80;

export async function POST() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 503 });
  }

  try {
    const [accRows, posRows, tradeRows] = await Promise.all([
      getSheetRows(SHEETS.PAPER_ACCOUNT),
      getSheetRows(SHEETS.PAPER_POSITIONS),
      getSheetRows(SHEETS.PAPER_TRADES),
    ]);

    // Parse existing account — preserve startingBalance and accountId
    const accDataRow = accRows.slice(1).find((r) => r[0]);
    const accObj     = accDataRow ? rowToObject(HA, accDataRow) : {};
    const startingBalance = Number(accObj.startingBalance) || 1000;
    const accountId       = accObj.accountId || "default";

    // Parse open positions → invested cost and equity
    const positions = posRows.slice(1).filter((r) => r[0]).map((row) => {
      const o = rowToObject(HP, row);
      return {
        entryPrice:    Number(o.entryPrice)    || 0,
        shares:        Number(o.shares)        || 0,
        positionValue: Number(o.positionValue) || 0,
        unrealizedPnL: Number(o.unrealizedPnL) || 0,
      };
    });

    const investedCost  = positions.reduce((s, p) => s + p.entryPrice * p.shares, 0);
    const equityValue   = positions.reduce((s, p) => s + p.positionValue,          0);
    const unrealizedPnL = positions.reduce((s, p) => s + p.unrealizedPnL,         0);

    // Parse closed trades — exclude DATA_ERROR and suspicious (same rules as rebuild)
    const cleanTrades = tradeRows.slice(1).filter((r) => r[0]).map((row) => {
      const o   = rowToObject(HT, row);
      const pct = Number(o.profitLossPercent);
      return {
        result:      o.result,
        profitLoss:  Number(o.profitLoss) || 0,
        dataQuality: o.dataQuality,
        suspicious:  pct > SUSPICIOUS_GAIN || pct < SUSPICIOUS_LOSS,
      };
    }).filter((t) =>
      t.dataQuality !== "DATA_ERROR" &&
      t.result      !== "DATA_ERROR" &&
      !t.suspicious,
    );

    const wins        = cleanTrades.filter((t) => t.result === "win").length;
    const losses      = cleanTrades.filter((t) => t.result === "loss").length;
    const total       = wins + losses;
    const winRate     = total > 0 ? wins / total : 0;
    const realizedPnL = cleanTrades.reduce((s, t) => s + t.profitLoss, 0);

    const cashBalance       = startingBalance - investedCost + realizedPnL;
    const totalPnL          = realizedPnL + unrealizedPnL;
    const totalAccountValue = cashBalance + equityValue;
    const totalPnLPercent   = startingBalance > 0 ? (totalPnL / startingBalance) * 100 : 0;

    const updatedAccount = {
      ...makeDefaultAccount(startingBalance),
      accountId,
      startingBalance,
      cashBalance,
      equityValue,
      totalAccountValue,
      totalPnL,
      totalPnLPercent,
      totalTrades:  total,
      wins,
      losses,
      winRate,
      updatedAt: new Date().toISOString(),
    };

    await replaceAllRows(SHEETS.PAPER_ACCOUNT, [accountToRow(updatedAccount)]);

    return NextResponse.json({
      ok:      true,
      account: updatedAccount,
      message: `Balance recalculated from ${total} closed trade(s) and ${positions.length} open position(s). ` +
               `Cash: $${cashBalance.toFixed(2)}, Account value: $${totalAccountValue.toFixed(2)}.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Recalculate failed: ${String(err)}` },
      { status: 500 },
    );
  }
}
