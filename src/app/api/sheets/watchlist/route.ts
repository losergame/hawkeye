import { NextResponse } from "next/server";
import {
  appendRows, getSheetRows, isSheetsConfigured,
  HEADERS, SHEETS, rowToObject,
} from "@/lib/google-sheets";

const H = HEADERS[SHEETS.WATCHLIST];

function newId() {
  return `wl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── GET /api/sheets/watchlist ─────────────────────────────────────────────────

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ tickers: [], source: "unconfigured" });
  }
  try {
    const data = await getSheetRows(SHEETS.WATCHLIST);
    const tickers = data.slice(1).filter((r) => r[1]).map((r) => {
      const o = rowToObject(H, r);
      return { id: o.id, ticker: o.ticker, companyName: o.companyName, addedAt: o.addedAt };
    });
    return NextResponse.json({ tickers, source: "sheets" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/sheets/watchlist ────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: false, source: "unconfigured" });
  }
  try {
    const { ticker, companyName } = (await req.json()) as { ticker: string; companyName?: string };
    if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

    // Dedup check
    const existing = await getSheetRows(SHEETS.WATCHLIST);
    if (existing.slice(1).some((r) => r[1] === ticker.toUpperCase())) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    await appendRows(SHEETS.WATCHLIST, [[
      newId(),
      ticker.toUpperCase(),
      companyName ?? "",
      new Date().toISOString(),
    ]]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
