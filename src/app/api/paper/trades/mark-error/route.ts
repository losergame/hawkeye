/**
 * POST /api/paper/trades/mark-error
 *
 * Marks specific trades as DATA_ERROR in Google Sheets.
 * Used to flag trades that were closed using bad/stale Finnhub price data.
 *
 * Body: { tickers: string[] }  — marks the most recent trade(s) for each ticker
 *   OR: { tradeIds: string[] } — marks specific trade IDs
 *
 * Updates two columns per matching row:
 *   result      → "DATA_ERROR"
 *   dataQuality → "DATA_ERROR"
 *
 * Does NOT reopen positions. Read-only to everything except the two flag columns.
 * Protected by session auth (middleware). Safe to call multiple times (idempotent).
 */

import { NextResponse } from "next/server";
import {
  getSheetRows, isSheetsConfigured, invalidateSheetCache,
  SHEETS, HEADERS, rowToObject, getSheetsClient, getSpreadsheetId,
} from "@/lib/google-sheets";

const HT = HEADERS[SHEETS.PAPER_TRADES];
const RESULT_COL        = HT.indexOf("result");
const DATA_QUALITY_COL  = HT.indexOf("dataQuality");
const REASON_CLOSED_COL = HT.indexOf("reasonClosed");

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as {
    tickers?:    string[];
    tradeIds?:   string[];
    /** Optional note appended to reasonClosed: "… | DATA_ERROR override: <note>" */
    reasonNote?: string;
  };

  if ((!body.tickers?.length) && (!body.tradeIds?.length)) {
    return NextResponse.json(
      { error: "Provide tickers or tradeIds to mark as DATA_ERROR" },
      { status: 400 },
    );
  }

  const tickerSet  = new Set((body.tickers ?? []).map((t) => t.toUpperCase()));
  const tradeIdSet = new Set(body.tradeIds ?? []);
  const reasonNote = body.reasonNote?.trim() ?? "";

  try {
    invalidateSheetCache(SHEETS.PAPER_TRADES);
    const rows = await getSheetRows(SHEETS.PAPER_TRADES);
    const sheets = getSheetsClient();
    const sid    = getSpreadsheetId();
    if (!sheets || !sid) {
      return NextResponse.json({ error: "Sheets client unavailable" }, { status: 503 });
    }

    // Row 1 is the header. Data starts at row 2 (index 1 in the array = sheet row 2).
    const updates: Array<{ range: string; value: string }> = [];
    const marked: string[] = [];

    const colLetter = (idx: number): string =>
      idx < 26
        ? String.fromCharCode(65 + idx)
        : `A${String.fromCharCode(65 + idx - 26)}`; // AA, AB, …

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue; // skip empty rows

      const o = rowToObject(HT, row);
      const ticker  = (o.ticker ?? "").toUpperCase();
      const tradeId = o.tradeId ?? "";

      const isTarget =
        (tickerSet.size > 0 && tickerSet.has(ticker)) ||
        (tradeIdSet.size > 0 && tradeIdSet.has(tradeId));

      if (!isTarget) continue;

      // Skip rows already marked DATA_ERROR (idempotent)
      if (o.dataQuality === "DATA_ERROR") {
        marked.push(`${ticker} (already marked)`);
        continue;
      }

      const sheetRow = i + 1; // 1-based sheet row index

      // Update result column
      if (RESULT_COL >= 0) {
        updates.push({ range: `${SHEETS.PAPER_TRADES}!${colLetter(RESULT_COL)}${sheetRow}`, value: "DATA_ERROR" });
      }

      // Update dataQuality column
      if (DATA_QUALITY_COL >= 0) {
        updates.push({ range: `${SHEETS.PAPER_TRADES}!${colLetter(DATA_QUALITY_COL)}${sheetRow}`, value: "DATA_ERROR" });
      }

      // Append reasonNote to reasonClosed if provided
      if (reasonNote && REASON_CLOSED_COL >= 0) {
        const existing = (o.reasonClosed ?? "").trim();
        const appended = existing
          ? `${existing} | DATA_ERROR override: ${reasonNote}`
          : `DATA_ERROR override: ${reasonNote}`;
        updates.push({ range: `${SHEETS.PAPER_TRADES}!${colLetter(REASON_CLOSED_COL)}${sheetRow}`, value: appended });
      }

      marked.push(ticker);
    }

    if (updates.length === 0) {
      return NextResponse.json({
        ok:      true,
        updated: 0,
        marked,
        message: marked.length > 0
          ? "All matching trades already flagged as DATA_ERROR."
          : "No matching trades found in PaperTrades sheet.",
      });
    }

    // Batch update all cells in one API call
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sid,
      requestBody: {
        valueInputOption: "RAW",
        data: updates.map(({ range, value }) => ({
          range,
          values: [[value]],
        })),
      },
    });

    invalidateSheetCache(SHEETS.PAPER_TRADES);

    const updatesPerTrade = reasonNote ? 3 : 2; // result + dataQuality [+ reasonClosed]
    const tradeCount = Math.floor(updates.length / updatesPerTrade);
    return NextResponse.json({
      ok:      true,
      updated: tradeCount,
      marked: [...new Set(marked)],
      message: `Marked ${tradeCount} trade(s) as DATA_ERROR. ` +
               `These trades are now excluded from all analytics calculations.`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
