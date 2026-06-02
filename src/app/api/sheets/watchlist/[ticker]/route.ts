import { NextResponse } from "next/server";
import {
  deleteRow, findRowIndexByColumn,
  isSheetsConfigured, SHEETS,
} from "@/lib/google-sheets";

// ── DELETE /api/sheets/watchlist/[ticker] ─────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: false, source: "unconfigured" });
  }
  const { ticker } = await params;
  try {
    const rowIndex = await findRowIndexByColumn(SHEETS.WATCHLIST, 1, ticker.toUpperCase());
    if (!rowIndex) return NextResponse.json({ ok: true, found: false });
    await deleteRow(SHEETS.WATCHLIST, rowIndex);
    return NextResponse.json({ ok: true, deleted: ticker });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
