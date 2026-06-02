import { NextResponse } from "next/server";
import {
  getSheetRows, appendRows, isSheetsConfigured,
  SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import type { EquityCurvePoint } from "@/lib/paper-trading";

const H = HEADERS[SHEETS.PAPER_EQUITY];

function rowToPoint(row: string[]): EquityCurvePoint {
  const o = rowToObject(H, row);
  return {
    date:            o.date,
    accountValue:    Number(o.accountValue),
    cashBalance:     Number(o.cashBalance),
    investedValue:   Number(o.investedValue),
    dailyPnL:        Number(o.dailyPnL),
    totalPnLPercent: Number(o.totalPnLPercent),
  };
}

function pointToRow(p: EquityCurvePoint): (string | number)[] {
  return H.map((col) => {
    switch (col) {
      case "date":            return p.date;
      case "accountValue":    return p.accountValue;
      case "cashBalance":     return p.cashBalance;
      case "investedValue":   return p.investedValue;
      case "dailyPnL":        return p.dailyPnL;
      case "totalPnLPercent": return p.totalPnLPercent;
      default:                return "";
    }
  });
}

// ── GET /api/paper/equity ─────────────────────────────────────────────────────

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ points: [], source: "unconfigured" });
  }
  try {
    const rows   = await getSheetRows(SHEETS.PAPER_EQUITY);
    const points = rows.slice(1).filter((r) => r[0]).map(rowToPoint);
    return NextResponse.json({ points, source: "sheets" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/paper/equity — append a point ───────────────────────────────────

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: true, source: "unconfigured" });
  }
  try {
    const { point } = (await req.json()) as { point: EquityCurvePoint };
    await appendRows(SHEETS.PAPER_EQUITY, [pointToRow(point)]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
