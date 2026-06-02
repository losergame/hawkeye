import { NextResponse } from "next/server";
import {
  appendRows, getSheetRows, isSheetsConfigured,
  HEADERS, SHEETS, rowToObject,
} from "@/lib/google-sheets";
import type { TrackedSignal } from "@/lib/signal-tracker";

const H = HEADERS[SHEETS.SIGNALS];

function rowToSignal(row: string[]): TrackedSignal {
  const o = rowToObject(H, row);
  return {
    id:             o.id,
    ticker:         o.ticker,
    companyName:    o.companyName,
    setupType:      o.setupType as TrackedSignal["setupType"],
    entryPrice:     Number(o.entryPrice),
    stopLoss:       Number(o.stopLoss),
    takeProfit1:    Number(o.takeProfit1),
    takeProfit2:    Number(o.takeProfit2),
    riskReward:     Number(o.riskReward),
    confidenceScore:Number(o.confidence),
    slMethod:       o.slMethod || "",
    tp1Method:      o.tp1Method || "",
    status:         o.status as TrackedSignal["status"],
    generatedAt:    o.createdAt,
    expiresAt:      o.updatedAt, // updatedAt doubles as expiresAt placeholder
    isSimulated:    o.isSimulated === "true",
  };
}

function signalToRow(s: TrackedSignal): (string | number | null)[] {
  return H.map((col) => {
    switch (col) {
      case "id":            return s.id;
      case "ticker":        return s.ticker;
      case "companyName":   return s.companyName;
      case "setupType":     return s.setupType;
      case "entryPrice":    return s.entryPrice;
      case "stopLoss":      return s.stopLoss;
      case "takeProfit1":   return s.takeProfit1;
      case "takeProfit2":   return s.takeProfit2;
      case "riskReward":    return s.riskReward;
      case "confidence":    return s.confidenceScore;
      case "scannerScore":  return null;
      case "status":        return s.status;
      case "createdAt":     return s.generatedAt;
      case "updatedAt":     return s.expiresAt;
      default:              return null;
    }
  });
}

// ── GET /api/sheets/signals ───────────────────────────────────────────────────

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ signals: [], source: "unconfigured" });
  }
  try {
    const rows = await getSheetRows(SHEETS.SIGNALS);
    const dataRows = rows.slice(1).filter((r) => r[0]); // skip header + empty rows
    // Deduplicate by id — keeps the last occurrence (most recent state)
    const seen = new Set<string>();
    const signals = dataRows
      .map(rowToSignal)
      .reverse()
      .filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
      .reverse();
    return NextResponse.json({ signals, source: "sheets" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/sheets/signals ──────────────────────────────────────────────────
// Accepts an array of TrackedSignal. Deduplicates: skips any ticker+setupType
// already seen within the last 7 days.

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ created: 0, source: "unconfigured" });
  }
  try {
    const { signals } = (await req.json()) as { signals: TrackedSignal[] };
    if (!Array.isArray(signals) || signals.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    // Load existing to dedup
    const existing = await getSheetRows(SHEETS.SIGNALS);
    const cutoff   = Date.now() - 7 * 86_400_000;
    const seen = new Set(
      existing.slice(1)
        .filter((r) => r[0] && new Date(r[12] ?? 0).getTime() > cutoff)
        .map((r) => `${r[1]}::${r[3]}`), // ticker::setupType
    );

    const toInsert: TrackedSignal[] = [];
    for (const s of signals) {
      const key = `${s.ticker}::${s.setupType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      toInsert.push(s);
    }

    if (toInsert.length === 0) return NextResponse.json({ created: 0 });

    // Batch append in one API call
    await appendRows(SHEETS.SIGNALS, toInsert.map(signalToRow));
    return NextResponse.json({ created: toInsert.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
