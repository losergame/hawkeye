import { NextResponse } from "next/server";
import {
  getSheetRows, deleteRow, isSheetsConfigured, SHEETS,
} from "@/lib/google-sheets";

// ── DELETE /api/watchlist/[ticker] ────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: false, source: "unconfigured" });
  }
  const { ticker } = await params;
  const sym = ticker.trim().toUpperCase();

  try {
    const rows = await getSheetRows(SHEETS.WATCHLIST);
    // Find 1-based row index where column 1 (ticker) matches
    let rowIndex: number | null = null;
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][1] ?? "").toUpperCase() === sym) {
        rowIndex = i + 1; // 1-based
        break;
      }
    }
    if (!rowIndex) return NextResponse.json({ ok: true, found: false });
    await deleteRow(SHEETS.WATCHLIST, rowIndex);
    return NextResponse.json({ ok: true, deleted: sym });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
