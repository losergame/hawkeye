import assert from "node:assert/strict";
import {
  PortfolioCloseError,
  closePortfolioHolding,
  type PortfolioCloseDeps,
} from "./portfolio-close.ts";

const holding = {
  id: "row_123",
  symbol: "nvda",
  shares: 2,
  averageCost: 100,
  companyName: "NVIDIA Corporation",
  updatedAt: "2026-06-01T12:00:00.000Z",
};

const calls: string[] = [];
let appendedTradeId = "";

const deps: PortfolioCloseDeps = {
  loadHolding: async (id) => {
    calls.push(`load:${id}`);
    return holding;
  },
  portfolioTradeExists: async (holdingId) => {
    calls.push(`exists:${holdingId}`);
    return false;
  },
  fetchLatestQuote: async (ticker) => {
    calls.push(`quote:${ticker}`);
    return { price: 125 };
  },
  appendTrade: async (trade) => {
    calls.push(`append:${trade.ticker}`);
    appendedTradeId = trade.tradeId;
  },
  deleteHolding: async (id) => {
    calls.push(`delete:${id}`);
  },
  notifyClose: async (trade) => {
    calls.push(`notify:${trade.ticker}`);
  },
  now: () => "2026-06-02T17:15:00.000Z",
};

const result = await closePortfolioHolding("row_123", deps);

assert.equal(result.trade.ticker, "NVDA");
assert.equal(result.trade.entryPrice, 100);
assert.equal(result.trade.exitPrice, 125);
assert.equal(result.trade.profitLoss, 50);
assert.equal(result.trade.profitLossPercent, 25);
assert.equal(appendedTradeId, "pt_row_123_2026-06-02T17:15:00.000Z");
assert.deepEqual(calls, [
  "load:row_123",
  "exists:row_123",
  "quote:NVDA",
  "append:NVDA",
  "delete:row_123",
  "notify:NVDA",
]);

const duplicateCalls: string[] = [];
await assert.rejects(
  () => closePortfolioHolding("row_123", {
    ...deps,
    loadHolding: async () => {
      duplicateCalls.push("load");
      return holding;
    },
    portfolioTradeExists: async () => {
      duplicateCalls.push("exists");
      return true;
    },
    fetchLatestQuote: async () => {
      duplicateCalls.push("quote");
      return { price: 125 };
    },
    appendTrade: async () => {
      duplicateCalls.push("append");
    },
    deleteHolding: async () => {
      duplicateCalls.push("delete");
    },
  }),
  (error) => error instanceof PortfolioCloseError && error.status === 409,
);
assert.deepEqual(duplicateCalls, ["load", "exists"]);

const quoteFailCalls: string[] = [];
await assert.rejects(
  () => closePortfolioHolding("row_123", {
    ...deps,
    loadHolding: async () => {
      quoteFailCalls.push("load");
      return holding;
    },
    portfolioTradeExists: async () => {
      quoteFailCalls.push("exists");
      return false;
    },
    fetchLatestQuote: async () => {
      quoteFailCalls.push("quote");
      return null;
    },
    appendTrade: async () => {
      quoteFailCalls.push("append");
    },
    deleteHolding: async () => {
      quoteFailCalls.push("delete");
    },
  }),
  (error) => error instanceof PortfolioCloseError && error.status === 502,
);
assert.deepEqual(quoteFailCalls, ["load", "exists", "quote"]);
