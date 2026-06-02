import { NextResponse } from "next/server";
import {
  appendRows, getSheetRows, isSheetsConfigured,
  HEADERS, SHEETS, rowToObject,
} from "@/lib/google-sheets";
import type { ScoredSetup } from "@/lib/scanner-scoring";

const H = HEADERS[SHEETS.TOP_PICKS];

// ── GET /api/sheets/top-picks ─────────────────────────────────────────────────
// Returns today's top picks (or all if no date filter).

export async function GET(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ picks: [], source: "unconfigured" });
  }
  try {
    const url   = new URL(req.url);
    const date  = url.searchParams.get("date"); // YYYY-MM-DD
    const data  = await getSheetRows(SHEETS.TOP_PICKS);
    const picks = data.slice(1)
      .filter((r) => r[0] && (!date || r[0] === date))
      .map((r) => rowToObject(H, r));
    return NextResponse.json({ picks, source: "sheets" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/sheets/top-picks ────────────────────────────────────────────────
// Saves today's top 5 scored setups. One batch append per scan.

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: false, source: "unconfigured" });
  }
  try {
    const { picks, date } = (await req.json()) as {
      picks: ScoredSetup[];
      date: string; // YYYY-MM-DD
    };
    if (!picks?.length) return NextResponse.json({ ok: true, saved: 0 });

    const rows = picks.map((p) =>
      H.map((col) => {
        switch (col) {
          case "date":        return date;
          case "rank":        return p.rank;
          case "ticker":      return p.setup.ticker;
          case "scannerScore":return p.score;
          case "confidence":  return p.setup.confidenceScore;
          case "setupType":   return p.setup.setupType;
          case "entryPrice":  return p.setup.entryPrice;
          case "stopLoss":    return p.setup.stopLoss;
          case "takeProfit":  return p.setup.takeProfit1;
          case "reason":      return p.reasoning;
          default:            return "";
        }
      }),
    );

    await appendRows(SHEETS.TOP_PICKS, rows);
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
