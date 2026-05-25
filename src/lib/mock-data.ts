import type {
  AiRecommendationResponse,
  CandlePoint,
  HeatmapTile,
  MacdPoint,
  NewsItem,
  PortfolioHolding,
  ReasoningSignal,
  SectorPerformance,
  StockMover,
  StockProfile,
  TimePoint
} from "@/lib/types";

const labels = ["9:30 AM", "10:15 AM", "11:00 AM", "11:45 AM", "12:30 PM", "1:15 PM", "2:00 PM", "2:45 PM", "3:30 PM", "4:00 PM"];
const monthLabels = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"];

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function wave(seed: number, index: number, amplitude: number) {
  return Math.sin(seed * 0.81 + index * 0.74) * amplitude + Math.cos(seed * 0.27 + index * 0.43) * amplitude * 0.5;
}

function makeSeries(base: number, seed: number, count: number, drift: number, amplitude: number, names = labels): TimePoint[] {
  return Array.from({ length: count }, (_, index) => ({
    label: names[index % names.length],
    value: round(base + index * drift + wave(seed, index, amplitude))
  }));
}

function makeCandles(base: number, seed: number): CandlePoint[] {
  const raw = Array.from({ length: 30 }, (_, index) => {
    const open = base + index * 0.55 + wave(seed, index, 2.9);
    const close = open + wave(seed + 7, index, 2.1);
    const high = Math.max(open, close) + 1.8 + Math.abs(wave(seed + 11, index, 1.3));
    const low = Math.min(open, close) - 1.8 - Math.abs(wave(seed + 15, index, 1.1));

    return {
      label: `${index + 1}`,
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(24_000_000 + Math.abs(wave(seed + 3, index, 18_000_000))),
      vwap: round((open + high + low + close) / 4)
    };
  });

  return raw.map((point, index) => {
    const window = raw.slice(Math.max(0, index - 19), index + 1);
    const average = window.reduce((sum, item) => sum + item.close, 0) / window.length;
    const variance = window.reduce((sum, item) => sum + (item.close - average) ** 2, 0) / window.length;
    const deviation = Math.sqrt(variance);

    return {
      ...point,
      ema20: round(base + index * 0.5 + wave(seed + 17, index, 1.5)),
      ema50: round(base + index * 0.44 + wave(seed + 19, index, 1.7)),
      ema200: round(base - 4 + index * 0.24 + wave(seed + 23, index, 1.2)),
      bollingerUpper: round(average + deviation * 2),
      bollingerLower: round(average - deviation * 2)
    };
  });
}

function makeRsi(seed: number): TimePoint[] {
  return Array.from({ length: 30 }, (_, index) => ({
    label: `${index + 1}`,
    value: round(50 + wave(seed, index, 10) + index * 0.18)
  }));
}

function makeMacd(seed: number): MacdPoint[] {
  return Array.from({ length: 30 }, (_, index) => {
    const macd = wave(seed, index, 1.5) + index * 0.03;
    const signal = wave(seed + 9, index, 1.1) + index * 0.025;

    return {
      label: `${index + 1}`,
      macd: round(macd),
      signal: round(signal),
      histogram: round(macd - signal)
    };
  });
}

function reasoning(
  valuation: ReasoningSignal["stance"],
  momentum: ReasoningSignal["stance"],
  news: ReasoningSignal["stance"],
  earnings: ReasoningSignal["stance"],
  technical: ReasoningSignal["stance"],
  analysts: ReasoningSignal["stance"]
): ReasoningSignal[] {
  const copy: Record<ReasoningSignal["label"], Record<ReasoningSignal["stance"], string>> = {
    Valuation: {
      bullish: "Growth-adjusted multiples remain defensible against forward revenue acceleration.",
      neutral: "The multiple is fair versus peers, leaving less margin for execution misses.",
      bearish: "Premium valuation needs strong earnings delivery to avoid compression."
    },
    Momentum: {
      bullish: "Relative strength is improving with higher lows and healthier breadth.",
      neutral: "Price action is constructive but still range-bound near resistance.",
      bearish: "Momentum is fading as rallies meet heavier supply."
    },
    "News sentiment": {
      bullish: "Recent coverage skews positive around demand, partnerships, and product cycles.",
      neutral: "News flow is mixed and unlikely to drive a clean directional break alone.",
      bearish: "Sentiment has cooled after regulatory and margin headlines."
    },
    "Earnings performance": {
      bullish: "Recent earnings showed solid beats and improved forward commentary.",
      neutral: "Earnings were in line, with guidance carrying the next catalyst load.",
      bearish: "Earnings quality weakened and estimates are drifting lower."
    },
    "Technical analysis": {
      bullish: "Price is above key moving averages with constructive volume confirmation.",
      neutral: "Indicators are balanced, with RSI neither stretched nor washed out.",
      bearish: "Price is below trend and MACD has not confirmed a reversal."
    },
    "Analyst sentiment": {
      bullish: "Street revisions are positive and target prices are moving higher.",
      neutral: "Analyst positioning is supportive but no longer fresh.",
      bearish: "Downgrades and estimate cuts have increased."
    }
  };

  const stances = [valuation, momentum, news, earnings, technical, analysts];
  const labelsForSignals: ReasoningSignal["label"][] = [
    "Valuation",
    "Momentum",
    "News sentiment",
    "Earnings performance",
    "Technical analysis",
    "Analyst sentiment"
  ];

  return labelsForSignals.map((label, index) => {
    const stance = stances[index];
    const score = stance === "bullish" ? 82 - index * 3 : stance === "neutral" ? 58 - index : 35 - index * 2;

    return {
      label,
      stance,
      score,
      summary: copy[label][stance]
    };
  });
}

function news(source: string, headline: string, sentiment: NewsItem["sentiment"], publishedAt: string, url?: string): NewsItem {
  return { source, headline, sentiment, publishedAt, url };
}

export const stocks: StockProfile[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    sector: "Technology",
    industry: "Semiconductors",
    price: 227.09,
    change: 6.31,
    changePercent: 2.86,
    volume: 112531656,
    averageVolume: 159000000,
    marketCap: "$5.50T",
    peRatio: 45.06,
    beta: 2.24,
    dividendYield: 0.02,
    analystRating: "Strong buy",
    recommendation: "Buy",
    riskScore: 6,
    bullishConfidence: 74,
    bearishConfidence: 26,
    shortTermTrend: "Upward bias while price holds above the 50 EMA.",
    swingTradeIdea: "Buy pullbacks near the 20 day VWAP with a stop below recent support.",
    earningsPlay: "Bull call spread into earnings if implied volatility stays below its 6 month rank.",
    unusualOptionsActivity: "Elevated call volume at the 135 strike with above-average premium.",
    whyThisStock: "AI infrastructure demand keeps estimate revisions positive while technical momentum remains clean.",
    nextEarningsDate: "May 20, 2026",
    reasoning: reasoning("neutral", "bullish", "bullish", "bullish", "bullish", "bullish"),
    intraday: makeSeries(222.2, 4, 10, 0.55, 1.8),
    performance: makeSeries(145, 8, 12, 7.4, 10.8, monthLabels),
    rsi: makeRsi(8),
    macd: makeMacd(9),
    candles: makeCandles(205, 11),
    news: [
      news("MarketWire", "AI server demand keeps semiconductor backlog above seasonal norms", "bullish", "2h ago"),
      news("Earnings Desk", "Analysts raise data center revenue estimates before next report", "bullish", "5h ago"),
      news("Macro Brief", "Chip names pause as yields move higher", "neutral", "Yesterday")
    ]
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    sector: "Technology",
    industry: "Software",
    price: 449.12,
    change: 3.88,
    changePercent: 0.87,
    volume: 21400000,
    averageVolume: 19600000,
    marketCap: "$3.34T",
    peRatio: 36.4,
    beta: 0.89,
    dividendYield: 0.68,
    analystRating: "Buy",
    recommendation: "Buy",
    riskScore: 4,
    bullishConfidence: 68,
    bearishConfidence: 32,
    shortTermTrend: "Steady grind higher with low volatility.",
    swingTradeIdea: "Use a breakout above the prior high with a tight trailing stop.",
    earningsPlay: "Favor post-earnings continuation if cloud growth beats consensus.",
    unusualOptionsActivity: "Moderate bullish put selling around the 430 level.",
    whyThisStock: "Cloud, AI copilots, and enterprise renewals provide durable compounding with lower beta.",
    nextEarningsDate: "July 29, 2026",
    reasoning: reasoning("neutral", "bullish", "neutral", "bullish", "bullish", "bullish"),
    intraday: makeSeries(444.9, 12, 10, 0.42, 1.9),
    performance: makeSeries(368, 6, 12, 6.4, 8.5, monthLabels),
    rsi: makeRsi(10),
    macd: makeMacd(12),
    candles: makeCandles(405, 13),
    news: [
      news("Cloud Weekly", "Enterprise AI adoption supports Azure growth expectations", "bullish", "1h ago"),
      news("Tech Ledger", "Productivity software renewals remain resilient", "bullish", "4h ago"),
      news("MarketWatchlist", "Software multiples consolidate after a strong quarter", "neutral", "Yesterday")
    ]
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    industry: "Consumer electronics",
    price: 298.87,
    change: 4.07,
    changePercent: 1.38,
    volume: 43100000,
    averageVolume: 43600000,
    marketCap: "$4.39T",
    peRatio: 39.71,
    beta: 1.12,
    dividendYield: 0.35,
    analystRating: "Hold",
    recommendation: "Hold",
    riskScore: 5,
    bullishConfidence: 52,
    bearishConfidence: 48,
    shortTermTrend: "Constructive after a high-volume close near all-time highs, but overextension risk is rising.",
    swingTradeIdea: "Wait for a pullback toward the breakout zone or a clean hold above 300 before adding risk.",
    earningsPlay: "Defined-risk bullish spreads fit better than outright calls while the stock is near highs.",
    unusualOptionsActivity: "Call interest is elevated around the 300 strike, but flow needs live options data to verify.",
    whyThisStock: "Apple is showing stronger price momentum and improving sentiment, but valuation keeps the AI model at Hold.",
    nextEarningsDate: "July 31, 2026",
    reasoning: reasoning("bearish", "bullish", "bullish", "neutral", "bullish", "neutral"),
    intraday: makeSeries(294.2, 15, 10, 0.42, 1.7),
    performance: makeSeries(218, 16, 12, 6.2, 9.4, monthLabels),
    rsi: makeRsi(15),
    macd: makeMacd(16),
    candles: makeCandles(266, 17),
    news: [
      news("Market Close", "Apple closes at a new high as momentum buyers return", "bullish", "1h ago"),
      news("Analyst Desk", "Services and AI device cycle remain key debates for the next leg", "neutral", "4h ago"),
      news("Options Flow", "Traders cluster around the 300 strike after the breakout", "bullish", "Yesterday")
    ]
  },
  {
    symbol: "ADBE",
    name: "Adobe Inc.",
    sector: "Technology",
    industry: "Software",
    price: 236.25,
    change: 0.18,
    changePercent: 0.08,
    volume: 4_030_000,
    averageVolume: 4_260_000,
    marketCap: "$95.4B",
    peRatio: 13.2,
    beta: 1.4,
    dividendYield: 0.4,
    analystRating: "Hold",
    recommendation: "Hold",
    riskScore: 5,
    bullishConfidence: 55,
    bearishConfidence: 45,
    shortTermTrend: "Mixed trend until buyers reclaim the prior breakdown zone.",
    swingTradeIdea: "Wait for a clean hold above VWAP or a pullback into support before sizing a swing trade.",
    earningsPlay: "Favor defined-risk structures around earnings because software sentiment can gap on guidance.",
    unusualOptionsActivity: "Options flow needs a connected feed; current read is based on quote and fundamentals.",
    whyThisStock: "Adobe has strong software margins and AI workflow catalysts, but momentum remains mixed after recent repricing.",
    nextEarningsDate: "TBD",
    reasoning: reasoning("bullish", "bearish", "neutral", "bullish", "neutral", "neutral"),
    intraday: makeSeries(235.9, 18, 10, 0.05, 0.9),
    performance: makeSeries(255, 18, 12, -1.6, 5.2, monthLabels),
    rsi: makeRsi(18),
    macd: makeMacd(18),
    candles: makeCandles(232, 18),
    news: [
      news("Software Desk", "Adobe AI workflow integrations remain the central investor debate", "neutral", "2h ago"),
      news("Earnings Desk", "Creative Cloud retention and guidance are key catalysts", "neutral", "Yesterday"),
      news("Market Pulse", "Software valuations stabilize as buyers rotate back into quality names", "bullish", "Yesterday")
    ]
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    sector: "Consumer cyclical",
    industry: "Auto manufacturers",
    price: 186.24,
    change: -4.72,
    changePercent: -2.47,
    volume: 94300000,
    averageVolume: 88400000,
    marketCap: "$594B",
    peRatio: 59.8,
    beta: 2.31,
    dividendYield: 0,
    analystRating: "Hold",
    recommendation: "Hold",
    riskScore: 8,
    bullishConfidence: 46,
    bearishConfidence: 54,
    shortTermTrend: "Volatile with downside risk unless delivery sentiment stabilizes.",
    swingTradeIdea: "Trade smaller size; favor mean reversion only after RSI stabilizes.",
    earningsPlay: "Avoid oversized premium buying unless implied volatility resets.",
    unusualOptionsActivity: "Heavy two-way weekly options volume, skew slightly bearish.",
    whyThisStock: "Optionality is high, but execution and margin uncertainty keep risk elevated.",
    nextEarningsDate: "July 22, 2026",
    reasoning: reasoning("bearish", "bearish", "neutral", "neutral", "bearish", "neutral"),
    intraday: makeSeries(191.8, 20, 10, -0.62, 2.9),
    performance: makeSeries(226, 19, 12, -2.8, 14, monthLabels),
    rsi: makeRsi(22),
    macd: makeMacd(22),
    candles: makeCandles(210, 23),
    news: [
      news("EV Monitor", "Pricing pressure remains the central debate for auto margins", "bearish", "1h ago"),
      news("Options Flow", "Weekly Tesla contracts lead single-stock options volume", "neutral", "3h ago"),
      news("Street Notes", "Robotaxi catalyst timing remains a split analyst view", "neutral", "Yesterday")
    ]
  },
  {
    symbol: "AMD",
    name: "Advanced Micro Devices",
    sector: "Technology",
    industry: "Semiconductors",
    price: 164.73,
    change: 5.33,
    changePercent: 3.34,
    volume: 71300000,
    averageVolume: 53200000,
    marketCap: "$266B",
    peRatio: 48.5,
    beta: 1.89,
    dividendYield: 0,
    analystRating: "Buy",
    recommendation: "Buy",
    riskScore: 7,
    bullishConfidence: 69,
    bearishConfidence: 31,
    shortTermTrend: "Momentum breakout with improving relative strength.",
    swingTradeIdea: "Buy a retest of the breakout level if volume holds above average.",
    earningsPlay: "Consider defined-risk bullish exposure ahead of AI accelerator updates.",
    unusualOptionsActivity: "Large call sweep detected in the front month 175 strike.",
    whyThisStock: "AI accelerator share gains and improving sentiment create a tradable catalyst stack.",
    nextEarningsDate: "August 4, 2026",
    reasoning: reasoning("neutral", "bullish", "bullish", "neutral", "bullish", "bullish"),
    intraday: makeSeries(158.5, 25, 10, 0.71, 2.2),
    performance: makeSeries(122, 24, 12, 4.2, 10.4, monthLabels),
    rsi: makeRsi(25),
    macd: makeMacd(24),
    candles: makeCandles(137, 24),
    news: [
      news("Chip Channel", "AI accelerator commentary lifts peer group appetite", "bullish", "2h ago"),
      news("Options Flow", "Call demand rises as traders position for a breakout", "bullish", "4h ago"),
      news("Tech Ledger", "Margins remain the key debate into the next print", "neutral", "Yesterday")
    ]
  },
  {
    symbol: "MU",
    name: "Micron Technology Inc.",
    sector: "Technology",
    industry: "Memory and storage semiconductors",
    price: 803.63,
    change: 37.05,
    changePercent: 4.83,
    volume: 53757433,
    averageVolume: 42755974,
    marketCap: "$906.28B",
    peRatio: 37.94,
    beta: 1.92,
    dividendYield: 0.08,
    analystRating: "Buy",
    recommendation: "Buy",
    riskScore: 8,
    bullishConfidence: 71,
    bearishConfidence: 29,
    shortTermTrend: "Strong upside momentum while memory pricing and AI server demand remain favorable.",
    swingTradeIdea: "Avoid chasing vertical candles; look for a controlled pullback toward VWAP or a tight consolidation above support.",
    earningsPlay: "Defined-risk bullish spreads fit better than naked calls because implied volatility can expand quickly in MU.",
    unusualOptionsActivity: "Memory names are seeing elevated call interest, but live options flow is required for confirmation.",
    whyThisStock: "Micron is benefiting from AI-driven memory demand and aggressive analyst repricing, but the move is extended and volatile.",
    nextEarningsDate: "June 26, 2026",
    reasoning: reasoning("neutral", "bullish", "bullish", "bullish", "bullish", "bullish"),
    intraday: makeSeries(787.6, 34, 10, 1.42, 7.4),
    performance: makeSeries(388, 35, 12, 38.8, 42.5, monthLabels),
    rsi: makeRsi(34),
    macd: makeMacd(35),
    candles: makeCandles(704, 36),
    news: [
      news("Memory Market", "Micron rallies as AI memory pricing expectations move higher", "bullish", "1h ago"),
      news("Analyst Desk", "Price target revisions accelerate across high-bandwidth memory suppliers", "bullish", "3h ago"),
      news("Risk Monitor", "Extended semiconductor rallies raise pullback risk for late entries", "neutral", "Yesterday")
    ]
  },
  {
    symbol: "META",
    name: "Meta Platforms",
    sector: "Communication services",
    industry: "Internet content",
    price: 517.96,
    change: 7.41,
    changePercent: 1.45,
    volume: 14600000,
    averageVolume: 13700000,
    marketCap: "$1.31T",
    peRatio: 27.9,
    beta: 1.19,
    dividendYield: 0.36,
    analystRating: "Buy",
    recommendation: "Buy",
    riskScore: 5,
    bullishConfidence: 66,
    bearishConfidence: 34,
    shortTermTrend: "Constructive if ad checks remain stable.",
    swingTradeIdea: "Favor a higher-low entry near the 21 day moving average.",
    earningsPlay: "Buy-the-dip setup if capex commentary is controlled.",
    unusualOptionsActivity: "Steady call accumulation, concentrated in monthly expiries.",
    whyThisStock: "Advertising strength and AI-driven engagement keep earnings leverage attractive.",
    nextEarningsDate: "July 30, 2026",
    reasoning: reasoning("bullish", "bullish", "neutral", "bullish", "bullish", "neutral"),
    intraday: makeSeries(509.6, 29, 10, 0.9, 2.8),
    performance: makeSeries(430, 28, 12, 7.1, 12.6, monthLabels),
    rsi: makeRsi(28),
    macd: makeMacd(28),
    candles: makeCandles(460, 28),
    news: [
      news("Ad Spend Daily", "Digital ad checks point to stable demand", "bullish", "3h ago"),
      news("AI Brief", "Engagement tools remain a central investor focus", "bullish", "6h ago"),
      news("Capital Desk", "Capex debate keeps risk premium from falling further", "neutral", "Yesterday")
    ]
  }
];

export const topGainers: StockMover[] = [
  { symbol: "MU", name: "Micron Technology Inc.", price: 803.63, changePercent: 4.83, volume: "53.8M" },
  { symbol: "AMD", name: "Advanced Micro Devices", price: 164.73, changePercent: 3.34, volume: "71.3M" },
  { symbol: "NVDA", name: "NVIDIA Corp.", price: 227.09, changePercent: 2.86, volume: "112.5M" },
  { symbol: "AAPL", name: "Apple Inc.", price: 298.87, changePercent: 1.38, volume: "43.1M" }
];

export const topLosers: StockMover[] = [
  { symbol: "TSLA", name: "Tesla Inc.", price: 186.24, changePercent: -2.47, volume: "94.3M" },
  { symbol: "GOOGL", name: "Alphabet Inc.", price: 183.54, changePercent: -0.72, volume: "31.2M" },
  { symbol: "BA", name: "Boeing Co.", price: 172.88, changePercent: -1.85, volume: "12.9M" },
  { symbol: "SHOP", name: "Shopify Inc.", price: 71.24, changePercent: -1.18, volume: "9.8M" }
];

export const mostActive: StockMover[] = [
  { symbol: "TSLA", name: "Tesla Inc.", price: 186.24, changePercent: -2.47, volume: "94.3M" },
  { symbol: "AMD", name: "Advanced Micro Devices", price: 164.73, changePercent: 3.34, volume: "71.3M" },
  { symbol: "MU", name: "Micron Technology Inc.", price: 803.63, changePercent: 4.83, volume: "53.8M" },
  { symbol: "NVDA", name: "NVIDIA Corp.", price: 227.09, changePercent: 2.86, volume: "112.5M" },
  { symbol: "AAPL", name: "Apple Inc.", price: 298.87, changePercent: 1.38, volume: "43.1M" }
];

export const dailyTopPicks = [
  { symbol: "NVDA", thesis: "AI infrastructure demand plus bullish options flow", action: "Buy" as const, risk: 6 },
  { symbol: "MSFT", thesis: "Lower-beta AI compounder with resilient cloud demand", action: "Buy" as const, risk: 4 },
  { symbol: "META", thesis: "Ad momentum and engagement gains offset capex concerns", action: "Buy" as const, risk: 5 }
];

export const trendingStocks = [
  { symbol: "AMD", topic: "AI accelerator breakout", sentiment: "bullish" as const },
  { symbol: "MU", topic: "AI memory pricing surge", sentiment: "bullish" as const },
  { symbol: "TSLA", topic: "Options volume and delivery debate", sentiment: "neutral" as const },
  { symbol: "AAPL", topic: "Device-cycle watch", sentiment: "neutral" as const },
  { symbol: "NVDA", topic: "Data center estimate revisions", sentiment: "bullish" as const }
];

export const sectorPerformance: SectorPerformance[] = [
  { sector: "Semiconductors", changePercent: 2.42 },
  { sector: "Software", changePercent: 0.91 },
  { sector: "Communication", changePercent: 0.74 },
  { sector: "Financials", changePercent: 0.21 },
  { sector: "Healthcare", changePercent: -0.18 },
  { sector: "Consumer cyclical", changePercent: -0.83 },
  { sector: "Energy", changePercent: -1.12 }
];

export const heatmap: HeatmapTile[] = [
  { symbol: "NVDA", sector: "Technology", weight: 18, changePercent: 1.92 },
  { symbol: "MSFT", sector: "Technology", weight: 16, changePercent: 0.87 },
  { symbol: "AAPL", sector: "Technology", weight: 15, changePercent: 1.38 },
  { symbol: "MU", sector: "Technology", weight: 10, changePercent: 4.83 },
  { symbol: "AMD", sector: "Technology", weight: 10, changePercent: 3.34 },
  { symbol: "META", sector: "Communication", weight: 12, changePercent: 1.45 },
  { symbol: "GOOGL", sector: "Communication", weight: 11, changePercent: 0.64 },
  { symbol: "JPM", sector: "Financials", weight: 8, changePercent: 0.28 },
  { symbol: "XOM", sector: "Energy", weight: 7, changePercent: -1.02 },
  { symbol: "TSLA", sector: "Consumer", weight: 9, changePercent: -2.47 },
  { symbol: "LLY", sector: "Healthcare", weight: 8, changePercent: -0.22 }
];

export const portfolioHoldings: PortfolioHolding[] = [
  { symbol: "NVDA", name: "NVIDIA Corp.", shares: 24, averageCost: 104.8, allocation: 28 },
  { symbol: "MU", name: "Micron Technology Inc.", shares: 3, averageCost: 646.6, allocation: 8 },
  { symbol: "MSFT", name: "Microsoft Corp.", shares: 9, averageCost: 402.1, allocation: 24 },
  { symbol: "META", name: "Meta Platforms", shares: 7, averageCost: 471.6, allocation: 18 },
  { symbol: "AAPL", name: "Apple Inc.", shares: 14, averageCost: 190.2, allocation: 14 },
  { symbol: "AMD", name: "Advanced Micro Devices", shares: 18, averageCost: 143.5, allocation: 8 }
];

export const portfolioPerformance: TimePoint[] = [
  { label: "Jun", value: 50000 },
  { label: "Jul", value: 51680 },
  { label: "Aug", value: 52410 },
  { label: "Sep", value: 51120 },
  { label: "Oct", value: 53870 },
  { label: "Nov", value: 55240 },
  { label: "Dec", value: 57420 },
  { label: "Jan", value: 59130 },
  { label: "Feb", value: 58490 },
  { label: "Mar", value: 61280 },
  { label: "Apr", value: 63840 },
  { label: "May", value: 65760 }
];

export const marketNews: NewsItem[] = [
  news("Market Pulse", "Semiconductors lead as AI capex expectations rise", "bullish", "35m ago"),
  news("Macro Desk", "Treasury yields firm ahead of inflation data", "neutral", "1h ago"),
  news("Options Flow", "Single-stock call demand expands in mega-cap tech", "bullish", "2h ago"),
  news("Earnings Desk", "Retail guidance remains uneven into next reporting window", "bearish", "3h ago")
];

export const dailyMarketSummary =
  "Risk appetite is constructive but selective. Mega-cap AI, software, and ad-tech continue to attract flows, while high-beta consumer names need cleaner earnings revisions. Breadth is improving, but elevated rates argue for defined risk sizing.";

const stockAliases: Record<string, string> = {
  APPLE: "AAPL",
  "APPLE INC": "AAPL",
  "APPLE INC.": "AAPL",
  IPHONE: "AAPL",
  MAC: "AAPL",
  ADBE: "ADBE",
  ADOBE: "ADBE",
  "ADOBE INC": "ADBE",
  "ADOBE INC.": "ADBE",
  "ADOBE STOCK": "ADBE",
  PHOTOSHOP: "ADBE",
  MICROSOFT: "MSFT",
  "MICROSOFT CORP": "MSFT",
  "MICROSOFT CORPORATION": "MSFT",
  WINDOWS: "MSFT",
  NVIDIA: "NVDA",
  "NVIDIA CORP": "NVDA",
  "NVIDIA CORPORATION": "NVDA",
  TESLA: "TSLA",
  "TESLA INC": "TSLA",
  AMD: "AMD",
  "ADVANCED MICRO DEVICES": "AMD",
  AMAZON: "AMZN",
  "AMAZON COM": "AMZN",
  "AMAZON.COM": "AMZN",
  NETFLIX: "NFLX",
  "NETFLIX INC": "NFLX",
  SHOPIFY: "SHOP",
  "SHOPIFY INC": "SHOP",
  "SHOPIFY STOCK": "SHOP",
  GOOGLE: "GOOGL",
  ALPHABET: "GOOGL",
  "ALPHABET INC": "GOOGL",
  PALANTIR: "PLTR",
  "PALANTIR TECHNOLOGIES": "PLTR",
  COINBASE: "COIN",
  "COINBASE GLOBAL": "COIN",
  MICRON: "MU",
  "MICRON STOCK": "MU",
  "MICRON PRICE": "MU",
  "MICRON TECHNOLOGY": "MU",
  "MICRON TECHNOLOGY INC": "MU",
  "MICRON TECHNOLOGY INC.": "MU",
  MIRCON: "MU",
  "MIRCON STOCK": "MU",
  "MIRCON TECHNOLOGY": "MU",
  META: "META",
  FACEBOOK: "META",
  "META PLATFORMS": "META"
};

function cleanSearchInput(input: string) {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9. ]/g, "")
    .replace(/\s+/g, " ");
}

export function resolveStockSymbol(input: string) {
  const normalized = cleanSearchInput(input);
  const exactSymbol = stocks.find((stock) => stock.symbol === normalized);
  if (exactSymbol) {
    return exactSymbol.symbol;
  }

  const alias = stockAliases[normalized];
  if (alias) {
    return alias;
  }

  const startsWithAlias = Object.entries(stockAliases).find(([aliasKey]) => normalized.startsWith(aliasKey));
  if (startsWithAlias) {
    return startsWithAlias[1];
  }

  const containsAlias = Object.entries(stockAliases).find(([aliasKey]) => aliasKey.length >= 4 && normalized.includes(aliasKey));
  if (containsAlias) {
    return containsAlias[1];
  }

  const exactName = stocks.find((stock) => cleanSearchInput(stock.name) === normalized);
  if (exactName) {
    return exactName.symbol;
  }

  const startsWithName = stocks.find((stock) => cleanSearchInput(stock.name).startsWith(normalized));
  if (startsWithName) {
    return startsWithName.symbol;
  }

  return normalized;
}

export function getStockSuggestions(query: string, limit = 7): StockProfile[] {
  const normalized = cleanSearchInput(query);
  const recommended = ["NVDA", "MU", "AAPL", "MSFT", "AMD", "META", "TSLA"].map(findStock);

  if (!normalized) {
    return recommended.slice(0, limit);
  }

  const ranked = stocks
    .map((stock) => {
      const name = cleanSearchInput(stock.name);
      const sector = cleanSearchInput(stock.sector);
      const industry = cleanSearchInput(stock.industry);
      const matchingAliases = Object.entries(stockAliases)
        .filter(([, symbol]) => symbol === stock.symbol)
        .map(([alias]) => alias);
      let rank = 99;

      if (stock.symbol === normalized) rank = 0;
      else if (stock.symbol.startsWith(normalized)) rank = 1;
      else if (matchingAliases.some((alias) => alias === normalized)) rank = 2;
      else if (name.startsWith(normalized)) rank = 3;
      else if (matchingAliases.some((alias) => alias.startsWith(normalized) || normalized.startsWith(alias) || normalized.includes(alias))) rank = 4;
      else if (name.includes(normalized)) rank = 5;
      else if (sector.includes(normalized) || industry.includes(normalized)) rank = 6;

      return { rank, stock };
    })
    .filter((item) => item.rank < 99)
    .sort((first, second) => first.rank - second.rank || first.stock.symbol.localeCompare(second.stock.symbol))
    .map((item) => item.stock);

  const resolved = findStock(normalized);
  const suggestions = ranked.length > 0 ? ranked : [resolved];
  const seen = new Set<string>();

  return suggestions
    .filter((stock) => {
      if (seen.has(stock.symbol)) return false;
      seen.add(stock.symbol);
      return true;
    })
    .slice(0, limit);
}

export function findStock(symbol: string): StockProfile {
  const normalized = resolveStockSymbol(symbol);
  return stocks.find((stock) => stock.symbol === normalized) ?? makeSyntheticStock(normalized || "AI");
}

export function buildAiRecommendation(stock: StockProfile): AiRecommendationResponse {
  return {
    action: stock.recommendation,
    riskScore: stock.riskScore,
    bullishConfidence: stock.bullishConfidence,
    bearishConfidence: stock.bearishConfidence,
    shortTermTrend: stock.shortTermTrend,
    reasoning: stock.reasoning,
    swingTradeIdea: stock.swingTradeIdea,
    earningsPlay: stock.earningsPlay,
    unusualOptionsActivity: stock.unusualOptionsActivity,
    eli5Summary: stock.eli5Summary,
    confidenceBreakdown: stock.confidenceBreakdown
  };
}

function makeSyntheticStock(symbol: string): StockProfile {
  const seed = symbol.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  const price = round(42 + (seed % 270) + wave(seed, 4, 8));
  const changePercent = round(((seed % 11) - 5) * 0.48);
  const bullish = Math.max(32, Math.min(78, 55 + Math.round(changePercent * 5)));
  const action = bullish > 64 ? "Buy" : bullish < 42 ? "Sell" : "Hold";

  return {
    symbol,
    name: `${symbol} Holdings`,
    sector: ["Technology", "Healthcare", "Financials", "Consumer", "Industrials"][seed % 5],
    industry: "AI modeled equity",
    price,
    change: round((price * changePercent) / 100),
    changePercent,
    volume: 7_500_000 + (seed % 55) * 1_000_000,
    averageVolume: 12_000_000 + (seed % 34) * 800_000,
    marketCap: `$${round(12 + (seed % 430), 0)}B`,
    peRatio: round(16 + (seed % 42) * 0.8),
    beta: round(0.75 + (seed % 140) / 100),
    dividendYield: round((seed % 20) / 20),
    analystRating: action === "Buy" ? "Buy" : action === "Sell" ? "Reduce" : "Hold",
    recommendation: action,
    riskScore: Math.max(3, Math.min(9, 4 + (seed % 6))),
    bullishConfidence: bullish,
    bearishConfidence: 100 - bullish,
    shortTermTrend: changePercent >= 0 ? "Constructive but needs confirmation from volume." : "Choppy with downside risk until momentum improves.",
    swingTradeIdea: "Use smaller position sizing until live provider data confirms liquidity and trend quality.",
    earningsPlay: "Prefer defined-risk spreads because the demo model has limited earnings history.",
    unusualOptionsActivity: "No verified unusual options activity without a connected options feed.",
    whyThisStock: "This is a generated demo profile so you can test any ticker symbol before connecting live data.",
    eli5Summary: action === "Buy" ? "The demo trend is leaning up, but it still needs real data." : action === "Sell" ? "The demo trend is weak, so be careful." : "The demo signal is mixed, so waiting makes sense.",
    confidenceBreakdown: [
      { label: "Trend", weight: 30, score: bullish, detail: "Demo trend score based on synthetic price action." },
      { label: "Momentum", weight: 25, score: Math.max(20, Math.min(80, 50 + changePercent * 8)), detail: "Demo momentum score based on percent change." },
      { label: "Risk", weight: 20, score: Math.max(20, 90 - (4 + (seed % 6)) * 8), detail: "Lower score when modeled risk is higher." },
      { label: "Valuation", weight: 15, score: 58, detail: "Neutral until live fundamentals are connected." },
      { label: "Sentiment", weight: 10, score: 52, detail: "Neutral until live headlines are connected." }
    ],
    nextEarningsDate: "TBD",
    reasoning: reasoning(
      action === "Buy" ? "bullish" : action === "Sell" ? "bearish" : "neutral",
      changePercent > 1 ? "bullish" : changePercent < -1 ? "bearish" : "neutral",
      "neutral",
      "neutral",
      changePercent >= 0 ? "bullish" : "bearish",
      "neutral"
    ),
    intraday: makeSeries(price - 2, seed, 10, changePercent / 8, 1.6),
    performance: makeSeries(price * 0.78, seed + 1, 12, price * 0.018, price * 0.045, monthLabels),
    rsi: makeRsi(seed),
    macd: makeMacd(seed),
    candles: makeCandles(price * 0.86, seed),
    news: [
      news("Demo Feed", `${symbol} generated profile awaits live provider headlines`, "neutral", "Now"),
      news("AI Screener", "Connect Finnhub or Polygon to replace this sample data", "neutral", "Now")
    ]
  };
}
