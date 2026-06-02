import { NextResponse } from "next/server";
import {
  getSheetRows, replaceAllRows, isSheetsConfigured,
  HEADERS, SHEETS, rowToObject,
} from "@/lib/google-sheets";

const H = HEADERS[SHEETS.PORTFOLIO];

export interface SheetPortfolioRow {
  id: string;
  ticker: string;
  shares: number;
  averageCost: number;
  sector?: string;
}

function rowToPortfolio(row: string[]): SheetPortfolioRow {
  const o = rowToObject(H, row);
  return {
    id:          o.id,
    ticker:      o.ticker,
    shares:      Number(o.shares),
    averageCost: Number(o.averageCost),
    sector:      o.sector || undefined,
  };
}

// ── GET /api/sheets/portfolio ─────────────────────────────────────────────────

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ rows: [], source: "unconfigured" });
  }
  try {
    const data = await getSheetRows(SHEETS.PORTFOLIO);
    const rows = data.slice(1).filter((r) => r[0]).map(rowToPortfolio);
    return NextResponse.json({ rows, source: "sheets" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── PUT /api/sheets/portfolio ─────────────────────────────────────────────────
// Full replace — sends the complete portfolio state.

export async function PUT(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: false, source: "unconfigured" });
  }
  try {
    const { rows } = (await req.json()) as { rows: SheetPortfolioRow[] };
    const now = new Date().toISOString();

    const sheetRows = rows.map((r) =>
      H.map((col) => {
        switch (col) {
          case "id":          return r.id;
          case "ticker":      return r.ticker;
          case "shares":      return r.shares;
          case "averageCost": return r.averageCost;
          case "sector":      return r.sector ?? "";
          case "updatedAt":   return now;
          // derived fields — left blank, UI computes from live price
          default:            return "";
        }
      }),
    );

    await replaceAllRows(SHEETS.PORTFOLIO, sheetRows);
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
