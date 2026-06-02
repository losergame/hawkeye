import { NextResponse } from "next/server";
import {
  getSheetRows, replaceAllRows, isSheetsConfigured,
  SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import { findStock } from "@/lib/mock-data";
import type { StoredPortfolioRow } from "@/lib/portfolio-storage";

const H = HEADERS[SHEETS.PORTFOLIO];

// ── Row converters ────────────────────────────────────────────────────────────
// Critical: Sheets stores "ticker" column; StoredPortfolioRow uses "symbol".

function rowToStored(row: string[]): StoredPortfolioRow {
  const o = rowToObject(H, row);
  return {
    id:          o.id,
    symbol:      o.ticker,   // ← ticker in sheet → symbol in code
    shares:      Number(o.shares)      || 0,
    averageCost: Number(o.averageCost) || 0,
  };
}

function storedToRow(r: StoredPortfolioRow): (string | number)[] {
  const now = new Date().toISOString();
  return H.map((col) => {
    switch (col) {
      case "id":          return r.id;
      case "ticker":      return r.symbol;   // ← symbol in code → ticker in sheet
      case "shares":      return r.shares;
      case "averageCost": return r.averageCost;
      // Derived / live fields — left empty, computed by the UI from live prices
      case "companyName": { const s = findStock(r.symbol); return s.name ?? r.symbol; }
      case "sector":      { const s = findStock(r.symbol); return s.sector ?? ""; }
      case "updatedAt":   return now;
      default:            return "";
    }
  });
}

// ── GET /api/portfolio ────────────────────────────────────────────────────────

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ rows: [], source: "unconfigured" });
  }
  try {
    const data = await getSheetRows(SHEETS.PORTFOLIO);
    const rows = data.slice(1).filter((r) => r[0] && r[1]).map(rowToStored);
    return NextResponse.json({ rows, source: "sheets" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/portfolio — replace entire portfolio (full state sync) ───────────

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: false, source: "unconfigured" });
  }
  try {
    const { rows } = (await req.json()) as { rows: StoredPortfolioRow[] };
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "rows array required" }, { status: 400 });
    }
    await replaceAllRows(SHEETS.PORTFOLIO, rows.map(storedToRow));
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
