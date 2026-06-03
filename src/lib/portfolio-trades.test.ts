import assert from "node:assert/strict";
import {
  PORTFOLIO_TRADE_HEADERS,
  buildPortfolioTrade,
  portfolioTradeToRow,
} from "./portfolio-trades.ts";

const closedAt = "2026-06-02T17:15:00.000Z";

const trade = buildPortfolioTrade({
  holdingId: "row_123",
  ticker: "NVDA",
  companyName: "NVIDIA Corporation",
  entryPrice: 100,
  exitPrice: 125,
  shares: 2,
  reasonOpened: "Manual Portfolio Entry",
  reasonClosed: "Manual Portfolio Close",
  updatedAt: "2026-06-01T12:00:00.000Z",
  closedAt,
});

assert.equal(trade.tradeId, "pt_row_123_2026-06-02T17:15:00.000Z");
assert.equal(trade.ticker, "NVDA");
assert.equal(trade.companyName, "NVIDIA Corporation");
assert.equal(trade.entryPrice, 100);
assert.equal(trade.exitPrice, 125);
assert.equal(trade.shares, 2);
assert.equal(trade.positionSize, 200);
assert.equal(trade.profitLoss, 50);
assert.equal(trade.profitLossPercent, 25);
assert.equal(trade.result, "win");
assert.equal(trade.reasonOpened, "Manual Portfolio Entry");
assert.equal(trade.reasonClosed, "Manual Portfolio Close");
assert.equal(trade.openedAt, "2026-06-01T12:00:00.000Z");
assert.equal(trade.closedAt, closedAt);

const loss = buildPortfolioTrade({
  holdingId: "row_loss",
  ticker: "AMD",
  companyName: "Advanced Micro Devices, Inc.",
  entryPrice: 80,
  exitPrice: 70,
  shares: 3,
  reasonOpened: "Manual Portfolio Entry",
  reasonClosed: "Manual Portfolio Close",
  closedAt,
});

assert.equal(loss.positionSize, 240);
assert.equal(loss.profitLoss, -30);
assert.equal(loss.profitLossPercent, -12.5);
assert.equal(loss.result, "loss");
assert.equal(loss.openedAt, closedAt);

const breakeven = buildPortfolioTrade({
  holdingId: "row_flat",
  ticker: "MSFT",
  companyName: "Microsoft Corporation",
  entryPrice: 50,
  exitPrice: 50,
  shares: 4,
  reasonOpened: "Manual Portfolio Entry",
  reasonClosed: "Manual Portfolio Close",
  closedAt,
});

assert.equal(breakeven.profitLoss, 0);
assert.equal(breakeven.profitLossPercent, 0);
assert.equal(breakeven.result, "breakeven");

assert.deepEqual(PORTFOLIO_TRADE_HEADERS, [
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
]);

assert.deepEqual(portfolioTradeToRow(trade), [
  "pt_row_123_2026-06-02T17:15:00.000Z",
  "NVDA",
  "NVIDIA Corporation",
  100,
  125,
  2,
  200,
  50,
  25,
  "win",
  "Manual Portfolio Entry",
  "Manual Portfolio Close",
  "2026-06-01T12:00:00.000Z",
  closedAt,
]);
