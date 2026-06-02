import assert from "node:assert/strict";
import {
  makeDefaultAccount,
  rebuildAccountFromLedger,
  type PaperAccount,
  type PaperPosition,
  type PaperTrade,
} from "./paper-trading";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function makePosition(
  ticker: string,
  entryPrice: number,
  currentPrice: number,
  shares: number,
): PaperPosition {
  const positionValue = currentPrice * shares;
  const unrealizedPnL = (currentPrice - entryPrice) * shares;

  return {
    positionId: `pos_${ticker}`,
    ticker,
    companyName: ticker,
    setupType: "Test",
    entryPrice,
    currentPrice,
    shares,
    positionValue,
    stopLoss: 0,
    takeProfit1: 0,
    takeProfit2: 0,
    unrealizedPnL,
    unrealizedPnLPercent: (unrealizedPnL / (entryPrice * shares)) * 100,
    status: "open",
    openedAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

function makeTrade(ticker: string, profitLoss: number): PaperTrade {
  return {
    tradeId: `trade_${ticker}`,
    ticker,
    companyName: ticker,
    setupType: "Test",
    buyPrice: 0,
    sellPrice: 0,
    effectiveEntryPrice: 0,
    effectiveExitPrice: 0,
    shares: 0,
    positionSize: 0,
    profitLoss,
    profitLossPercent: 0,
    slippageCost: 0,
    gapType: "none",
    gapAmount: 0,
    result: profitLoss < 0 ? "loss" : profitLoss > 0 ? "win" : "breakeven",
    reasonOpened: "Test",
    reasonClosed: "Test",
    openedAt: "2026-06-01T00:00:00.000Z",
    closedAt: "2026-06-01T00:00:00.000Z",
  };
}

const staleAccount: PaperAccount = {
  ...makeDefaultAccount(1000),
  cashBalance: 779.19,
  equityValue: 0,
  totalAccountValue: 779.19,
  totalPnL: -220.81,
  totalPnLPercent: -22.081,
};

const positions = [
  makePosition("BMY", 73, 71.84, 1),
  makePosition("TFX", 72, 71.36, 1),
  makePosition("INCY", 72.82, 71.86, 1),
];

const trades = [
  makeTrade("NVDA", -1.48),
  makeTrade("LNT", -1.51),
];

const rebuilt = rebuildAccountFromLedger(staleAccount, positions, trades);

assert.equal(round2(trades.reduce((sum, trade) => sum + trade.profitLoss, 0)), -2.99);
assert.equal(round2(positions.reduce((sum, position) => sum + position.unrealizedPnL, 0)), -2.76);
assert.equal(round2(rebuilt.equityValue), 215.06);
assert.equal(round2(rebuilt.cashBalance), 779.19);
assert.equal(round2(rebuilt.totalPnL), -5.75);
assert.equal(round2(rebuilt.totalAccountValue), 994.25);
assert.equal(round2(rebuilt.totalPnLPercent), -0.57);
assert.notEqual(round2(rebuilt.totalAccountValue), 779.19);
assert.notEqual(round2(rebuilt.totalPnL), -220.81);
