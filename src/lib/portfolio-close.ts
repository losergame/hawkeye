import {
  buildPortfolioTrade,
  type PortfolioTrade,
} from "./portfolio-trades.ts";

export interface PortfolioHoldingForClose {
  id: string;
  symbol: string;
  shares: number;
  averageCost: number;
  companyName: string;
  updatedAt?: string;
}

export interface PortfolioQuoteForClose {
  price: number;
}

export interface PortfolioCloseDeps {
  loadHolding: (id: string) => Promise<PortfolioHoldingForClose | null>;
  portfolioTradeExists: (holdingId: string) => Promise<boolean>;
  fetchLatestQuote: (ticker: string) => Promise<PortfolioQuoteForClose | null>;
  appendTrade: (trade: PortfolioTrade) => Promise<void>;
  deleteHolding: (id: string) => Promise<void>;
  notifyClose?: (trade: PortfolioTrade) => Promise<void> | void;
  now?: () => string;
}

export class PortfolioCloseError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PortfolioCloseError";
    this.status = status;
  }
}

function assertPositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PortfolioCloseError(`${label} must be greater than 0`, 400);
  }
}

export async function closePortfolioHolding(
  holdingId: string,
  deps: PortfolioCloseDeps,
): Promise<{ trade: PortfolioTrade }> {
  const holding = await deps.loadHolding(holdingId);
  if (!holding) {
    throw new PortfolioCloseError("Portfolio holding not found", 404);
  }

  const alreadyClosed = await deps.portfolioTradeExists(holdingId);
  if (alreadyClosed) {
    throw new PortfolioCloseError("Portfolio holding was already closed", 409);
  }

  const ticker = holding.symbol.trim().toUpperCase();
  assertPositiveNumber(holding.shares, "shares");
  assertPositiveNumber(holding.averageCost, "entryPrice");

  const quote = await deps.fetchLatestQuote(ticker);
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    throw new PortfolioCloseError("Latest quote unavailable; position was not closed", 502);
  }

  const trade = buildPortfolioTrade({
    holdingId,
    ticker,
    companyName: holding.companyName,
    entryPrice: holding.averageCost,
    exitPrice: quote.price,
    shares: holding.shares,
    reasonOpened: "Manual Portfolio Entry",
    reasonClosed: "Manual Portfolio Close",
    updatedAt: holding.updatedAt,
    closedAt: deps.now?.() ?? new Date().toISOString(),
  });

  await deps.appendTrade(trade);
  await deps.deleteHolding(holdingId);

  try {
    await deps.notifyClose?.(trade);
  } catch {
    // Alerts are best-effort; the close has already been persisted.
  }

  return { trade };
}
