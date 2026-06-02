/**
 * POST /api/paper/account/reset
 *
 * Full reset — "Clear Test Data":
 *   - Resets PaperAccount to startingBalance
 *   - Clears PaperPositions (all open positions gone)
 *   - Clears PaperTrades  (all trade history gone)
 *   - Clears PaperEquityCurve
 *   - Keeps all sheet tabs and headers intact
 *
 * Body: { startingBalance?: number }
 */

import { NextResponse } from "next/server";
import {
  replaceAllRows, isSheetsConfigured, SHEETS,
  initializePaperTradingSheets, arePaperSheetsReady, resetPaperSheetsFlag,
} from "@/lib/google-sheets";
import { makeDefaultAccount } from "@/lib/paper-trading";
import { accountToRow } from "@/app/api/paper/run/route";

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { startingBalance?: number };
  const startingBalance = Math.max(100, Number(body.startingBalance) || 1000);
  const freshAccount    = makeDefaultAccount(startingBalance);

  // Ensure sheets exist before writing
  if (!arePaperSheetsReady()) {
    const init = await initializePaperTradingSheets();
    if (!init.ok) {
      return NextResponse.json({ error: `Sheet init failed: ${init.error}` }, { status: 503 });
    }
  }
  resetPaperSheetsFlag(); // force re-check after reset

  try {
    // Clear all paper trading data — keeps tabs + headers, removes all data rows
    await Promise.all([
      replaceAllRows(SHEETS.PAPER_ACCOUNT,   [accountToRow(freshAccount)]),
      replaceAllRows(SHEETS.PAPER_POSITIONS, []),
      replaceAllRows(SHEETS.PAPER_TRADES,    []),  // full wipe for "Clear Test Data"
      replaceAllRows(SHEETS.PAPER_EQUITY,    []),
    ]);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reset Google Sheets", detail: String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok:      true,
    account: freshAccount,
    message: `Account reset to $${startingBalance}. All positions, trades, and equity curve cleared. Sheet tabs preserved.`,
  });
}
