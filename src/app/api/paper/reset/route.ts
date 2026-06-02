/**
 * POST /api/paper/reset
 *
 * Wipes all paper trading data while preserving headers and all other sheets.
 *
 * Clears (data rows only, headers kept):
 *   PaperPositions, PaperTrades, PaperEquityCurve
 *
 * Resets PaperAccount to a fresh $1,000 default.
 *
 * Leaves untouched:
 *   Watchlist, Portfolio, RulePresets, AppSettings,
 *   ScannerHistory, DailyTopPicks, Signals, SignalPerformance
 */

import { NextResponse } from "next/server";
import {
  replaceAllRows, isSheetsConfigured,
  SHEETS,
} from "@/lib/google-sheets";
import { makeDefaultAccount } from "@/lib/paper-trading";
import { accountToRow } from "@/app/api/paper/run/route";

export async function POST() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 503 });
  }

  try {
    const freshAccount = makeDefaultAccount(1000);
    freshAccount.updatedAt = new Date().toISOString();

    // Clear data rows (keep header row) on all three sheets, reset account simultaneously
    await Promise.all([
      replaceAllRows(SHEETS.PAPER_POSITIONS, []),
      replaceAllRows(SHEETS.PAPER_TRADES,    []),
      replaceAllRows(SHEETS.PAPER_EQUITY,    []),
      replaceAllRows(SHEETS.PAPER_ACCOUNT,   [accountToRow(freshAccount)]),
    ]);

    // Re-apply conditional formatting so the clean sheets look right
    void (async () => {
      try {
        const { applyPaperTradingFormatting } = await import("@/lib/sheets-formatting");
        await applyPaperTradingFormatting(1000);
      } catch { /* non-fatal */ }
    })();

    return NextResponse.json({
      ok: true,
      account: freshAccount,
      message: "Paper trading data wiped. Account reset to $1,000. Watchlist, Portfolio, RulePresets, AppSettings, ScannerHistory, and DailyTopPicks are untouched.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Reset failed: ${String(err)}` },
      { status: 500 },
    );
  }
}
