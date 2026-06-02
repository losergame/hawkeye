/**
 * POST /api/sheets/format
 *
 * Applies (or refreshes) all conditional format rules on paper trading sheets.
 * Safe to run multiple times — existing rules are cleared before new ones are added.
 *
 * Call this:
 *  - After first setup to colour-code all historical data
 *  - After a Rebuild Account to re-apply formatting
 *  - Any time colours appear missing
 *
 * Query params:
 *   startingBalance={number}  — used for the "above/below starting balance" rule
 *                               on totalAccountValue.  Defaults to 1000.
 */

import { NextResponse } from "next/server";
import { isSheetsConfigured } from "@/lib/google-sheets";
import { applyPaperTradingFormatting } from "@/lib/sheets-formatting";

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json(
      { error: "Google Sheets not configured" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const startingBalance = Number(url.searchParams.get("startingBalance") || "1000");

  const result = await applyPaperTradingFormatting(startingBalance);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok:              true,
    rulesApplied:    result.rulesApplied,
    sheetsFormatted: result.sheetsFormatted,
    message:         `Applied ${result.rulesApplied} conditional format rules across ${result.sheetsFormatted.join(", ")}. All current and future rows will be colour-coded automatically.`,
  });
}

export async function GET() {
  return NextResponse.json({
    info: "POST to this endpoint to apply/refresh conditional formatting on PaperTrades, PaperPositions, PaperAccount, PaperEquityCurve.",
    query: { startingBalance: "number (default: 1000)" },
  });
}
