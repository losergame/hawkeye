import { NextResponse } from "next/server";
import {
  appendRows,
  deleteRow,
  ensureSheet,
  findRowIndexById,
  getSheetRows,
  HEADERS,
  invalidateSheetCache,
  isSheetsConfigured,
  readSetting,
  rowToObject,
  SHEETS,
} from "@/lib/google-sheets";
import {
  closePortfolioHolding,
  PortfolioCloseError,
  type PortfolioHoldingForClose,
} from "@/lib/portfolio-close";
import { portfolioTradeToRow, type PortfolioTrade } from "@/lib/portfolio-trades";
import { findStock } from "@/lib/mock-data";
import { notifyPortfolioClose } from "@/lib/discord-notify";

interface FinnhubQuote {
  c?: number;
}

const closingIds = new Set<string>();
const PORTFOLIO_HEADERS = HEADERS[SHEETS.PORTFOLIO];

function portfolioTradeIdPrefix(holdingId: string): string {
  return `pt_${holdingId}_`;
}

function rowToHolding(row: string[]): PortfolioHoldingForClose {
  const o = rowToObject(PORTFOLIO_HEADERS, row);
  const symbol = (o.ticker ?? "").trim().toUpperCase();
  const fallback = findStock(symbol);

  return {
    id: o.id,
    symbol,
    shares: Number(o.shares) || 0,
    averageCost: Number(o.averageCost) || 0,
    companyName: fallback.name ?? symbol,
    updatedAt: o.updatedAt || undefined,
  };
}

async function loadHolding(holdingId: string): Promise<PortfolioHoldingForClose | null> {
  invalidateSheetCache(SHEETS.PORTFOLIO);
  const rowIndex = await findRowIndexById(SHEETS.PORTFOLIO, holdingId);
  if (!rowIndex) return null;

  const rows = await getSheetRows(SHEETS.PORTFOLIO);
  const row = rows[rowIndex - 1];
  if (!row?.[0]) return null;

  return rowToHolding(row);
}

async function portfolioTradeExists(holdingId: string): Promise<boolean> {
  await ensureSheet(SHEETS.PORTFOLIO_TRADES);
  invalidateSheetCache(SHEETS.PORTFOLIO_TRADES);
  const rows = await getSheetRows(SHEETS.PORTFOLIO_TRADES);
  const prefix = portfolioTradeIdPrefix(holdingId);
  return rows.slice(1).some((row) => (row[0] ?? "").startsWith(prefix));
}

async function fetchLatestPortfolioQuote(ticker: string): Promise<{ price: number } | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  try {
    const url = new URL("https://finnhub.io/api/v1/quote");
    url.searchParams.set("symbol", ticker);
    url.searchParams.set("token", key);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;

    const quote = (await res.json()) as FinnhubQuote;
    if (!quote.c || quote.c <= 0) return null;

    return { price: quote.c };
  } catch {
    return null;
  }
}

async function appendPortfolioTrade(trade: PortfolioTrade): Promise<void> {
  await ensureSheet(SHEETS.PORTFOLIO_TRADES);
  await appendRows(SHEETS.PORTFOLIO_TRADES, [portfolioTradeToRow(trade)]);
}

async function deletePortfolioHolding(holdingId: string): Promise<void> {
  invalidateSheetCache(SHEETS.PORTFOLIO);
  const rowIndex = await findRowIndexById(SHEETS.PORTFOLIO, holdingId);
  if (!rowIndex) return;
  await deleteRow(SHEETS.PORTFOLIO, rowIndex);
}

async function notifyIfPortfolioAlertsEnabled(trade: PortfolioTrade): Promise<void> {
  const enabled = await readSetting("portfolioDiscordAlertsEnabled").catch(() => null);
  if (enabled === "false") return;
  await notifyPortfolioClose(trade);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 503 });
  }

  const { id } = await params;
  const holdingId = decodeURIComponent(id);
  if (!holdingId) {
    return NextResponse.json({ error: "Portfolio holding id required" }, { status: 400 });
  }

  if (closingIds.has(holdingId)) {
    return NextResponse.json({ error: "Close already in progress for this holding" }, { status: 409 });
  }

  closingIds.add(holdingId);
  try {
    const { trade } = await closePortfolioHolding(holdingId, {
      loadHolding,
      portfolioTradeExists,
      fetchLatestQuote: fetchLatestPortfolioQuote,
      appendTrade: appendPortfolioTrade,
      deleteHolding: deletePortfolioHolding,
      notifyClose: notifyIfPortfolioAlertsEnabled,
    });

    return NextResponse.json({ ok: true, trade });
  } catch (err) {
    if (err instanceof PortfolioCloseError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    return NextResponse.json(
      { error: "Failed to close portfolio holding", detail: String(err) },
      { status: 500 },
    );
  } finally {
    closingIds.delete(holdingId);
  }
}
