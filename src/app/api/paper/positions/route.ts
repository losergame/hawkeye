import { NextResponse } from "next/server";
import {
  getSheetRows, appendRows, isSheetsConfigured,
  SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import { positionToRow } from "@/app/api/paper/_helpers";
import type { PaperPosition } from "@/lib/paper-trading";

const H = HEADERS[SHEETS.PAPER_POSITIONS];

function rowToPosition(row: string[]): PaperPosition {
  const o = rowToObject(H, row);
  return {
    positionId:           o.positionId,
    ticker:               o.ticker,
    companyName:          o.companyName,
    setupType:            o.setupType,
    entryPrice:           Number(o.entryPrice),
    currentPrice:         Number(o.currentPrice),
    shares:               Number(o.shares),
    positionValue:        Number(o.positionValue),
    stopLoss:             Number(o.stopLoss),
    takeProfit1:          Number(o.takeProfit1),
    takeProfit2:          Number(o.takeProfit2),
    unrealizedPnL:        Number(o.unrealizedPnL),
    unrealizedPnLPercent: Number(o.unrealizedPnLPercent),
    status:               "open",
    openedAt:             o.openedAt,
    updatedAt:            o.updatedAt,
  };
}

// ── GET /api/paper/positions ──────────────────────────────────────────────────

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ positions: [], source: "unconfigured" });
  }
  try {
    const rows = await getSheetRows(SHEETS.PAPER_POSITIONS);
    const positions = rows.slice(1).filter((r) => r[0]).map(rowToPosition);
    return NextResponse.json({ positions, source: "sheets" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/paper/positions — batch create ──────────────────────────────────

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: true, source: "unconfigured" });
  }
  try {
    const { positions } = (await req.json()) as { positions: PaperPosition[] };
    if (!positions?.length) return NextResponse.json({ ok: true, created: 0 });

    // Dedup: skip if ticker already exists in open positions
    const existing = await getSheetRows(SHEETS.PAPER_POSITIONS);
    const heldTickers = new Set(existing.slice(1).filter((r) => r[0]).map((r) => r[1]));

    const toInsert = positions.filter((p) => !heldTickers.has(p.ticker));
    if (toInsert.length === 0) return NextResponse.json({ ok: true, created: 0 });

    await appendRows(SHEETS.PAPER_POSITIONS, toInsert.map(positionToRow));
    return NextResponse.json({ ok: true, created: toInsert.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
