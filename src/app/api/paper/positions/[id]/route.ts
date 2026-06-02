import { NextResponse } from "next/server";
import {
  getSheetRows, updateRow, deleteRow, findRowIndexById,
  isSheetsConfigured, SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import { positionToRow } from "@/app/api/paper/_helpers";
import type { PaperPosition } from "@/lib/paper-trading";

const H = HEADERS[SHEETS.PAPER_POSITIONS];

// ── PUT /api/paper/positions/[id] — update price ──────────────────────────────

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSheetsConfigured()) return NextResponse.json({ ok: true });
  const { id }  = await params;
  const patch   = (await req.json()) as Partial<PaperPosition>;

  try {
    const rowIndex = await findRowIndexById(SHEETS.PAPER_POSITIONS, id);
    if (!rowIndex) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rows    = await getSheetRows(SHEETS.PAPER_POSITIONS);
    const current = rows[rowIndex - 1] ?? [];
    const o       = rowToObject(H, current);

    const merged: PaperPosition = {
      positionId:           o.positionId,
      ticker:               o.ticker,
      companyName:          o.companyName,
      setupType:            o.setupType,
      entryPrice:           Number(o.entryPrice),
      currentPrice:         patch.currentPrice ?? Number(o.currentPrice),
      shares:               Number(o.shares),
      positionValue:        patch.positionValue ?? Number(o.positionValue),
      stopLoss:             Number(o.stopLoss),
      takeProfit1:          Number(o.takeProfit1),
      takeProfit2:          Number(o.takeProfit2),
      unrealizedPnL:        patch.unrealizedPnL ?? Number(o.unrealizedPnL),
      unrealizedPnLPercent: patch.unrealizedPnLPercent ?? Number(o.unrealizedPnLPercent),
      status:               "open",
      openedAt:             o.openedAt,
      updatedAt:            new Date().toISOString(),
    };
    await updateRow(SHEETS.PAPER_POSITIONS, rowIndex, positionToRow(merged));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── DELETE /api/paper/positions/[id] — close/remove position ─────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSheetsConfigured()) return NextResponse.json({ ok: true });
  const { id } = await params;
  try {
    const rowIndex = await findRowIndexById(SHEETS.PAPER_POSITIONS, id);
    if (!rowIndex) return NextResponse.json({ ok: true, found: false });
    await deleteRow(SHEETS.PAPER_POSITIONS, rowIndex);
    return NextResponse.json({ ok: true, deleted: id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
