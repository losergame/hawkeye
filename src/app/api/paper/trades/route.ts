import { NextResponse } from "next/server";
import {
  getSheetRows, appendRows, isSheetsConfigured,
  SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import type { PaperTrade } from "@/lib/paper-trading";

const H = HEADERS[SHEETS.PAPER_TRADES];

function rowToTrade(row: string[]): PaperTrade {
  const o   = rowToObject(H, row);
  const buy = Number(o.buyPrice);
  const sell= Number(o.sellPrice);
  return {
    tradeId:            o.tradeId,
    ticker:             o.ticker,
    companyName:        o.companyName,
    setupType:          o.setupType,
    buyPrice:           buy,
    sellPrice:          sell,
    effectiveEntryPrice:Number(o.effectiveEntryPrice) || buy,
    effectiveExitPrice: Number(o.effectiveExitPrice)  || sell,
    shares:             Number(o.shares),
    positionSize:       Number(o.positionSize),
    profitLoss:         Number(o.profitLoss),
    profitLossPercent:  Number(o.profitLossPercent),
    slippageCost:       Number(o.slippageCost) || 0,
    gapType:            (o.gapType as PaperTrade["gapType"]) || "none",
    gapAmount:          Number(o.gapAmount) || 0,
    result:             o.result as PaperTrade["result"],
    reasonOpened:       o.reasonOpened,
    reasonClosed:       o.reasonClosed,
    openedAt:           o.openedAt,
    closedAt:           o.closedAt,
    dataQuality:        (o.dataQuality as PaperTrade["dataQuality"]) || undefined,
  };
}

function tradeToRow(t: PaperTrade): (string | number)[] {
  return H.map((col) => {
    switch (col) {
      case "tradeId":           return t.tradeId;
      case "ticker":            return t.ticker;
      case "companyName":       return t.companyName;
      case "setupType":         return t.setupType;
      case "buyPrice":          return t.buyPrice;
      case "sellPrice":         return t.sellPrice;
      case "shares":            return t.shares;
      case "positionSize":      return t.positionSize;
      case "profitLoss":        return t.profitLoss;
      case "profitLossPercent": return t.profitLossPercent;
      case "result":            return t.result;
      case "reasonOpened":      return t.reasonOpened;
      case "reasonClosed":      return t.reasonClosed;
      case "openedAt":          return t.openedAt;
      case "closedAt":          return t.closedAt;
      default:                  return "";
    }
  });
}

// ── GET /api/paper/trades ─────────────────────────────────────────────────────

const TRADES_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
};

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ trades: [], source: "unconfigured" });
  }
  try {
    const rows   = await getSheetRows(SHEETS.PAPER_TRADES);
    const trades = rows.slice(1).filter((r) => r[0]).map(rowToTrade)
      .sort((a, b) => b.closedAt.localeCompare(a.closedAt));
    return NextResponse.json({ trades, source: "sheets" }, { headers: TRADES_CACHE_HEADERS });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/paper/trades — record closed trades ─────────────────────────────

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: true, source: "unconfigured" });
  }
  try {
    const { trades } = (await req.json()) as { trades: PaperTrade[] };
    if (!trades?.length) return NextResponse.json({ ok: true });
    await appendRows(SHEETS.PAPER_TRADES, trades.map(tradeToRow));
    return NextResponse.json({ ok: true, saved: trades.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
