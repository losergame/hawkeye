import { NextResponse } from "next/server";
import {
  getSheetRows, appendRows, isSheetsConfigured,
  SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import { findStock } from "@/lib/mock-data";

const H = HEADERS[SHEETS.WATCHLIST];

export interface WatchlistEntry {
  id:          string;
  ticker:      string;
  companyName: string;
  sector:      string;
  addedAt:     string;
  updatedAt:   string;
}

function rowToEntry(row: string[]): WatchlistEntry {
  const o = rowToObject(H, row);
  return {
    id:          o.id,
    ticker:      o.ticker,
    companyName: o.companyName,
    sector:      o.sector ?? "",
    addedAt:     o.addedAt,
    updatedAt:   o.updatedAt ?? o.addedAt,
  };
}

function newId() {
  return `wl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── GET /api/watchlist ────────────────────────────────────────────────────────

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ entries: [], source: "unconfigured" });
  }
  try {
    const rows    = await getSheetRows(SHEETS.WATCHLIST);
    const entries = rows.slice(1).filter((r) => r[0] && r[1]).map(rowToEntry);
    return NextResponse.json({ entries, source: "sheets" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/watchlist ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: false, source: "unconfigured" });
  }
  try {
    const { ticker } = (await req.json()) as { ticker: string };
    if (!ticker?.trim()) {
      return NextResponse.json({ error: "ticker required" }, { status: 400 });
    }
    const sym = ticker.trim().toUpperCase();

    // Dedup check
    const existing = await getSheetRows(SHEETS.WATCHLIST);
    const already  = existing.slice(1).some((r) => r[1]?.toUpperCase() === sym);
    if (already) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // Enrich from mock data (company name + sector)
    const stock   = findStock(sym);
    const now     = new Date().toISOString();
    const row     = H.map((col) => {
      switch (col) {
        case "id":          return newId();
        case "ticker":      return sym;
        case "companyName": return stock.name ?? sym;
        case "sector":      return stock.sector ?? "";
        case "addedAt":     return now;
        case "updatedAt":   return now;
        default:            return "";
      }
    });

    await appendRows(SHEETS.WATCHLIST, [row]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
