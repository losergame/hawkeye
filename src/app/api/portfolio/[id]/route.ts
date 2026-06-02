import { NextResponse } from "next/server";
import {
  getSheetRows, updateRow, deleteRow, findRowIndexById,
  isSheetsConfigured, SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import type { StoredPortfolioRow } from "@/lib/portfolio-storage";

const H = HEADERS[SHEETS.PORTFOLIO];

// ── PATCH /api/portfolio/[id] — update shares + averageCost ──────────────────

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: false, source: "unconfigured" });
  }
  const { id }    = await params;
  const patch     = (await req.json()) as Partial<StoredPortfolioRow>;

  try {
    const rowIndex = await findRowIndexById(SHEETS.PORTFOLIO, id);
    if (!rowIndex) return NextResponse.json({ error: "Row not found" }, { status: 404 });

    const rows    = await getSheetRows(SHEETS.PORTFOLIO);
    const current = rows[rowIndex - 1] ?? [];
    const o       = rowToObject(H, current);

    const merged  = H.map((col) => {
      switch (col) {
        case "shares":      return patch.shares      ?? Number(o.shares)      ?? 0;
        case "averageCost": return patch.averageCost ?? Number(o.averageCost) ?? 0;
        case "updatedAt":   return new Date().toISOString();
        default:            return current[H.indexOf(col)] ?? "";
      }
    });

    await updateRow(SHEETS.PORTFOLIO, rowIndex, merged);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── DELETE /api/portfolio/[id] ────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: false, source: "unconfigured" });
  }
  const { id } = await params;
  try {
    const rowIndex = await findRowIndexById(SHEETS.PORTFOLIO, id);
    if (!rowIndex) return NextResponse.json({ ok: true, found: false });
    await deleteRow(SHEETS.PORTFOLIO, rowIndex);
    return NextResponse.json({ ok: true, deleted: id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
