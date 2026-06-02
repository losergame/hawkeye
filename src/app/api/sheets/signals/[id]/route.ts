import { NextResponse } from "next/server";
import {
  findRowIndexById, getSheetRows, updateRow,
  isSheetsConfigured, HEADERS, SHEETS,
} from "@/lib/google-sheets";
import type { TrackedSignal } from "@/lib/signal-tracker";

const H = HEADERS[SHEETS.SIGNALS];

// ── PATCH /api/sheets/signals/[id] ────────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Sheets not configured" }, { status: 503 });
  }

  const { id } = await params;
  const patch = (await req.json()) as Partial<TrackedSignal>;

  try {
    const rowIndex = await findRowIndexById(SHEETS.SIGNALS, id);
    if (!rowIndex) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    // Read current row, merge patch
    const rows = await getSheetRows(SHEETS.SIGNALS);
    const current = rows[rowIndex - 1] ?? [];

    const merged = H.map((col, i) => {
      switch (col) {
        case "status":   return patch.status ?? current[i] ?? "";
        case "updatedAt":return new Date().toISOString();
        default:         return current[i] ?? "";
      }
    });

    await updateRow(SHEETS.SIGNALS, rowIndex, merged);
    return NextResponse.json({ id, updated: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
