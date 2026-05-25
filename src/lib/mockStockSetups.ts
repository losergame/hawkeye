import type { StockSetup, StockSetupStatus, StockSetupType } from "@/lib/types";

type SetupSeed = {
  ticker: string;
  companyName: string;
  currentPrice: number;
  setupType: StockSetupType;
  status: StockSetupStatus;
  confidenceScore: number;
  entryOffset: number;
  stopOffset: number;
  reason: string;
  bullishFactors: string[];
  riskFactors: string[];
  indicators: StockSetup["indicators"];
};

function roundPrice(value: number) {
  return Number(value.toFixed(2));
}

function buildSetup(seed: SetupSeed): StockSetup {
  const entryPrice = roundPrice(seed.currentPrice * (1 + seed.entryOffset));
  const stopLoss = roundPrice(seed.currentPrice * (1 - seed.stopOffset));
  const risk = Math.max(entryPrice - stopLoss, seed.currentPrice * 0.005);
  const takeProfit1 = roundPrice(entryPrice + risk * 2);
  const takeProfit2 = roundPrice(entryPrice + risk * 3);
  const riskReward = Number(((takeProfit1 - entryPrice) / risk).toFixed(1));

  return {
    ...seed,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    riskReward
  };
}

export const scannerConditions: Record<StockSetupType, string[]> = {
  "Momentum Breakout": [
    "Price above 50 EMA and 200 EMA",
    "RSI between 50 and 70",
    "Volume above average",
    "Price near resistance breakout"
  ],
  "Pullback Buy": [
    "Price above 200 EMA",
    "Pullback near 20 EMA or 50 EMA",
    "RSI between 40 and 55",
    "Bullish confirmation candle"
  ],
  "Oversold Bounce": ["RSI below 35", "Price near support", "Volume spike", "Possible reversal candle"],
  "Trend Continuation": ["Price above VWAP", "Higher highs and higher lows", "MACD bullish", "RSI above 50"]
};

export const mockStockSetups: StockSetup[] = [
  buildSetup({
    ticker: "AAPL",
    companyName: "Apple Inc.",
    currentPrice: 298.87,
    setupType: "Pullback Buy",
    status: "Waiting",
    confidenceScore: 74,
    entryOffset: 0.006,
    stopOffset: 0.022,
    reason:
      "AAPL is showing a possible pullback buy setup because price is still above the long-term trend, RSI is cooling down, and the stock is near a possible support area. Entry is only valid if price confirms strength above the entry level.",
    bullishFactors: ["Price remains above the 200 EMA", "RSI cooled into a constructive reset zone", "Pullback is holding near rising short-term averages"],
    riskFactors: ["Consumer tech breadth can fade quickly", "A failed reclaim of entry leaves room for a deeper pullback", "High market-cap names can lag during risk-off sessions"],
    indicators: { rsi: 48, ema20: 300.12, ema50: 292.4, ema200: 247.8, macd: "Neutral", volume: 43_100_000, avgVolume: 51_200_000 }
  }),
  buildSetup({
    ticker: "NVDA",
    companyName: "NVIDIA Corp.",
    currentPrice: 227.09,
    setupType: "Momentum Breakout",
    status: "Triggered",
    confidenceScore: 86,
    entryOffset: 0.008,
    stopOffset: 0.031,
    reason:
      "NVDA is showing a possible momentum breakout setup because price is trading above key moving averages with strong volume and bullish momentum. The setup is invalid if price falls below the stop loss.",
    bullishFactors: ["Price is above the 50 EMA and 200 EMA", "Volume is above its recent average", "Momentum remains constructive near resistance"],
    riskFactors: ["Semiconductor moves can reverse sharply after extended runs", "Breakout failure below entry can trap buyers", "Valuation leaves little room for weak guidance"],
    indicators: { rsi: 64, ema20: 224.3, ema50: 218.7, ema200: 186.5, macd: "Bullish", volume: 178_000_000, avgVolume: 151_000_000 }
  }),
  buildSetup({
    ticker: "TSLA",
    companyName: "Tesla Inc.",
    currentPrice: 186.24,
    setupType: "Oversold Bounce",
    status: "Waiting",
    confidenceScore: 61,
    entryOffset: 0.012,
    stopOffset: 0.04,
    reason:
      "TSLA is trying to build an oversold bounce after a heavy move lower. The setup needs a reversal candle and follow-through volume before the entry becomes useful.",
    bullishFactors: ["RSI is washed out below 35", "Price is near a prior support area", "Volume is elevated enough to mark capitulation risk"],
    riskFactors: ["Trend is still fragile below key moving averages", "Headline risk can overwhelm technical support", "Bounce setups fail fast without confirmation"],
    indicators: { rsi: 31, ema20: 194.7, ema50: 205.1, ema200: 221.4, macd: "Bearish", volume: 94_300_000, avgVolume: 82_000_000 }
  }),
  buildSetup({
    ticker: "AMD",
    companyName: "Advanced Micro Devices Inc.",
    currentPrice: 164.73,
    setupType: "Trend Continuation",
    status: "Triggered",
    confidenceScore: 79,
    entryOffset: 0.005,
    stopOffset: 0.026,
    reason:
      "AMD is showing trend continuation as price holds above VWAP with higher lows and improving semiconductor breadth. The cleanest setup is a controlled push through the entry level.",
    bullishFactors: ["Price is holding above VWAP", "Higher lows are forming after a pullback", "MACD remains bullish"],
    riskFactors: ["Relative volume needs to stay above average", "A break under VWAP weakens the setup", "Sector sympathy can pressure the trade"],
    indicators: { rsi: 58, ema20: 162.8, ema50: 156.4, ema200: 138.2, macd: "Bullish", volume: 60_000_000, avgVolume: 49_000_000 }
  }),
  buildSetup({
    ticker: "MSFT",
    companyName: "Microsoft Corp.",
    currentPrice: 409.43,
    setupType: "Pullback Buy",
    status: "Waiting",
    confidenceScore: 72,
    entryOffset: 0.004,
    stopOffset: 0.018,
    reason:
      "MSFT is a pullback buy candidate because the long-term trend is intact and price is resetting near short-term support. Confirmation above entry matters more than chasing the first green candle.",
    bullishFactors: ["Price remains above the 200 EMA", "RSI is cooling without becoming weak", "Large-cap software trend remains orderly"],
    riskFactors: ["Relative volume is moderate", "Cloud/software rotation can slow momentum", "Stop should be respected if support fails"],
    indicators: { rsi: 51, ema20: 407.2, ema50: 401.1, ema200: 362.6, macd: "Neutral", volume: 22_000_000, avgVolume: 36_000_000 }
  }),
  buildSetup({
    ticker: "META",
    companyName: "Meta Platforms",
    currentPrice: 612.18,
    setupType: "Trend Continuation",
    status: "Completed",
    confidenceScore: 81,
    entryOffset: 0.003,
    stopOffset: 0.021,
    reason:
      "META is showing trend continuation with price above VWAP, bullish MACD, and a clean series of higher lows. The first target has already been reached in this demo setup.",
    bullishFactors: ["Price is above VWAP", "MACD is bullish", "Trend structure shows higher highs and higher lows"],
    riskFactors: ["Completed setups can be late for fresh entries", "Ad-tech headlines may add volatility", "A failed retest can create a fast pullback"],
    indicators: { rsi: 62, ema20: 604.5, ema50: 586.9, ema200: 501.2, macd: "Bullish", volume: 12_800_000, avgVolume: 15_600_000 }
  }),
  buildSetup({
    ticker: "AMZN",
    companyName: "Amazon.com Inc.",
    currentPrice: 218.42,
    setupType: "Momentum Breakout",
    status: "Waiting",
    confidenceScore: 76,
    entryOffset: 0.009,
    stopOffset: 0.027,
    reason:
      "AMZN is compressing near resistance while holding above major moving averages. A breakout setup is only valid if volume expands through entry.",
    bullishFactors: ["Price is above 50 EMA and 200 EMA", "RSI is firm but not overbought", "Resistance is nearby and clearly defined"],
    riskFactors: ["Breakout needs volume confirmation", "Retail and cloud sentiment can diverge", "Failed breakouts can move back into the prior range"],
    indicators: { rsi: 59, ema20: 215.2, ema50: 208.4, ema200: 184.6, macd: "Bullish", volume: 34_600_000, avgVolume: 39_100_000 }
  }),
  buildSetup({
    ticker: "GOOGL",
    companyName: "Alphabet Inc.",
    currentPrice: 183.54,
    setupType: "Pullback Buy",
    status: "Failed",
    confidenceScore: 54,
    entryOffset: 0.006,
    stopOffset: 0.023,
    reason:
      "GOOGL had a pullback-buy look, but the setup is marked failed because price did not confirm above entry and momentum softened.",
    bullishFactors: ["Price is still above the 200 EMA", "Support is nearby", "Valuation is less stretched than some mega-cap peers"],
    riskFactors: ["Momentum has faded", "Setup failed to trigger cleanly", "News and regulatory headlines can pressure the tape"],
    indicators: { rsi: 42, ema20: 186.1, ema50: 181.7, ema200: 156.8, macd: "Bearish", volume: 31_200_000, avgVolume: 28_400_000 }
  }),
  buildSetup({
    ticker: "SPY",
    companyName: "SPDR S&P 500 ETF",
    currentPrice: 586.41,
    setupType: "Trend Continuation",
    status: "Triggered",
    confidenceScore: 78,
    entryOffset: 0.002,
    stopOffset: 0.014,
    reason:
      "SPY is showing trend continuation as broad market price stays above VWAP and key averages. This is a lower-beta index setup with cleaner risk control than single-name trades.",
    bullishFactors: ["Price is above VWAP", "Higher lows remain intact", "RSI is constructive above 50"],
    riskFactors: ["Index trades can stall near macro events", "Low volatility can reduce follow-through", "Break below VWAP would weaken the setup"],
    indicators: { rsi: 57, ema20: 583.2, ema50: 574.1, ema200: 531.5, macd: "Bullish", volume: 58_000_000, avgVolume: 64_000_000 }
  }),
  buildSetup({
    ticker: "QQQ",
    companyName: "Invesco QQQ Trust",
    currentPrice: 512.36,
    setupType: "Momentum Breakout",
    status: "Waiting",
    confidenceScore: 80,
    entryOffset: 0.005,
    stopOffset: 0.018,
    reason:
      "QQQ is near a technology-led breakout zone with price above key moving averages. A valid entry needs strength through resistance and continued volume participation.",
    bullishFactors: ["Price is above the 50 EMA and 200 EMA", "RSI is in the momentum zone", "Mega-cap tech leadership is supportive"],
    riskFactors: ["Crowded growth trades can unwind quickly", "Rate-sensitive names may react to macro data", "Volume confirmation is required"],
    indicators: { rsi: 63, ema20: 508.4, ema50: 496.8, ema200: 449.9, macd: "Bullish", volume: 41_700_000, avgVolume: 38_600_000 }
  })
];
