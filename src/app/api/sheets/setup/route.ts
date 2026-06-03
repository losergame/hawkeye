import { NextResponse } from "next/server";
import { initialiseAllSheets, isSheetsConfigured } from "@/lib/google-sheets";
import { applyPaperTradingFormatting } from "@/lib/sheets-formatting";

/**
 * POST /api/sheets/setup
 * One-time initialiser — creates all sheet tabs and writes header rows.
 * Call this once after configuring credentials.
 */
export async function POST() {
  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEETS_SPREADSHEET_ID to .env.local" },
      { status: 503 },
    );
  }

  const result = await initialiseAllSheets();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Apply conditional formatting after sheet creation
  const fmt = await applyPaperTradingFormatting();

  return NextResponse.json({
    ok: true,
    message: "All sheets initialised: Signals, SignalPerformance, Portfolio, PortfolioTrades, Watchlist, ScannerHistory, DailyTopPicks, AppSettings",
    formatting: {
      applied:         fmt.ok,
      rulesApplied:    fmt.rulesApplied,
      sheetsFormatted: fmt.sheetsFormatted,
      error:           fmt.error,
    },
  });
}

export async function GET() {
  return NextResponse.json({ configured: isSheetsConfigured() });
}
