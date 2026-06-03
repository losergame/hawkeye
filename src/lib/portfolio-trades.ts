export const PORTFOLIO_TRADE_HEADERS = [
  "tradeId",
  "ticker",
  "companyName",
  "entryPrice",
  "exitPrice",
  "shares",
  "positionSize",
  "profitLoss",
  "profitLossPercent",
  "result",
  "reasonOpened",
  "reasonClosed",
  "openedAt",
  "closedAt",
] as const;

export type PortfolioTradeResult = "win" | "loss" | "breakeven";

export interface PortfolioTrade {
  tradeId: string;
  ticker: string;
  companyName: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  positionSize: number;
  profitLoss: number;
  profitLossPercent: number;
  result: PortfolioTradeResult;
  reasonOpened: string;
  reasonClosed: string;
  openedAt: string;
  closedAt: string;
}

export interface PortfolioCloseInput {
  holdingId: string;
  ticker: string;
  companyName: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  reasonOpened: string;
  reasonClosed: string;
  updatedAt?: string;
  closedAt?: string;
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function classifyResult(profitLoss: number): PortfolioTradeResult {
  if (profitLoss > 0) return "win";
  if (profitLoss < 0) return "loss";
  return "breakeven";
}

export function buildPortfolioTrade(input: PortfolioCloseInput): PortfolioTrade {
  const ticker = input.ticker.trim().toUpperCase();
  const closedAt = input.closedAt ?? new Date().toISOString();
  const openedAt = input.updatedAt?.trim() || closedAt;
  const positionSize = round(input.entryPrice * input.shares);
  const profitLoss = round((input.exitPrice - input.entryPrice) * input.shares);
  const profitLossPercent = positionSize > 0 ? round((profitLoss / positionSize) * 100) : 0;

  return {
    tradeId: `pt_${input.holdingId}_${closedAt}`,
    ticker,
    companyName: input.companyName || ticker,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    shares: input.shares,
    positionSize,
    profitLoss,
    profitLossPercent,
    result: classifyResult(profitLoss),
    reasonOpened: input.reasonOpened,
    reasonClosed: input.reasonClosed,
    openedAt,
    closedAt,
  };
}

export function portfolioTradeToRow(trade: PortfolioTrade): (string | number)[] {
  return PORTFOLIO_TRADE_HEADERS.map((col) => trade[col]);
}
