// Stock data for the brutalist dashboard
// Values lifted from losergame/stock-ai-dashboard mock-data

window.STOCKS = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    sector: "Technology",
    industry: "Semiconductors",
    price: 227.09, change: 6.31, changePct: 2.86,
    volume: 112_531_656, avgVolume: 159_000_000,
    marketCap: "5.50T", peRatio: 45.06, beta: 2.24, divYield: 0.02,
    high52: 234.18, low52: 84.62,
    open: 221.30, prevClose: 220.78, dayHigh: 228.91, dayLow: 220.04,
    eps: 5.04, nextEarnings: "May 20",
    rec: "BUY", risk: 6, bull: 74, bear: 26,
    rsi: 64.2, macd: 1.84, vwap: 224.61, ema50: 213.10, ema200: 169.40,
    thesis: "AI infrastructure demand keeps estimate revisions positive while technical momentum remains clean.",
    swingIdea: "Buy pullbacks near the 20-day VWAP with a stop below recent support.",
    options: "Elevated call volume at the 135 strike with above-average premium.",
    reasoning: [
      { label: "Valuation", stance: "neut", score: 58, note: "Multiple is fair vs. peers; less margin for execution misses." },
      { label: "Momentum", stance: "bull", score: 79, note: "Relative strength improving with higher lows and healthier breadth." },
      { label: "News", stance: "bull", score: 76, note: "Coverage skews positive around demand, partnerships, product cycles." },
      { label: "Earnings", stance: "bull", score: 73, note: "Recent earnings showed solid beats and improved forward commentary." },
      { label: "Technical", stance: "bull", score: 70, note: "Price above key moving averages with constructive volume." },
      { label: "Analysts", stance: "bull", score: 67, note: "Street revisions positive; target prices moving higher." }
    ],
    news: [
      { src: "MarketWire", time: "2h", stance: "bull", text: "AI server demand keeps semiconductor backlog above seasonal norms" },
      { src: "Earnings Desk", time: "5h", stance: "bull", text: "Analysts raise data center revenue estimates before next report" },
      { src: "Macro Brief", time: "1d", stance: "neut", text: "Chip names pause as yields move higher" }
    ]
  },
  {
    symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology", industry: "Software",
    price: 449.12, change: 3.88, changePct: 0.87,
    volume: 21_400_000, avgVolume: 19_600_000,
    marketCap: "3.34T", peRatio: 36.40, beta: 0.89, divYield: 0.68,
    high52: 468.35, low52: 309.45, open: 446.10, prevClose: 445.24, dayHigh: 451.20, dayLow: 444.80,
    eps: 12.33, nextEarnings: "Jul 29",
    rec: "BUY", risk: 4, bull: 68, bear: 32,
    rsi: 58.7, macd: 0.92, vwap: 448.10, ema50: 432.50, ema200: 398.20,
    thesis: "Cloud, AI copilots, and enterprise renewals provide durable compounding with lower beta.",
    swingIdea: "Use a breakout above the prior high with a tight trailing stop.",
    options: "Moderate bullish put selling around the 430 level.",
    reasoning: [
      { label: "Valuation", stance: "neut", score: 56, note: "Fair multiple vs. growth; modest premium remains." },
      { label: "Momentum", stance: "bull", score: 70, note: "Steady grind higher with low volatility." },
      { label: "News", stance: "neut", score: 57, note: "Cloud commentary stable; AI capex debate ongoing." },
      { label: "Earnings", stance: "bull", score: 72, note: "Azure beat; copilot attach rates expanding." },
      { label: "Technical", stance: "bull", score: 69, note: "Above 50/200 EMA; constructive base." },
      { label: "Analysts", stance: "bull", score: 64, note: "Targets nudged higher post-print." }
    ],
    news: [
      { src: "Cloud Weekly", time: "1h", stance: "bull", text: "Enterprise AI adoption supports Azure growth expectations" },
      { src: "Tech Ledger", time: "4h", stance: "bull", text: "Productivity software renewals remain resilient" },
      { src: "Watchlist", time: "1d", stance: "neut", text: "Software multiples consolidate after a strong quarter" }
    ]
  },
  {
    symbol: "AAPL", name: "Apple Inc.", sector: "Technology", industry: "Consumer electronics",
    price: 298.87, change: 4.07, changePct: 1.38,
    volume: 43_100_000, avgVolume: 43_600_000,
    marketCap: "4.39T", peRatio: 39.71, beta: 1.12, divYield: 0.35,
    high52: 301.30, low52: 184.20, open: 296.80, prevClose: 294.80, dayHigh: 300.10, dayLow: 295.20,
    eps: 7.53, nextEarnings: "Jul 31",
    rec: "HOLD", risk: 5, bull: 52, bear: 48,
    rsi: 67.4, macd: 1.21, vwap: 297.90, ema50: 282.40, ema200: 240.10,
    thesis: "Stronger price momentum and improving sentiment, but valuation keeps the model at Hold.",
    swingIdea: "Wait for a pullback toward the breakout zone or a clean hold above 300 before adding risk.",
    options: "Call interest elevated around the 300 strike; flow needs live options data to verify.",
    reasoning: [
      { label: "Valuation", stance: "bear", score: 38, note: "Premium multiple in a maturing hardware cycle." },
      { label: "Momentum", stance: "bull", score: 71, note: "Breakout closed at new highs with volume." },
      { label: "News", stance: "bull", score: 64, note: "Services and AI device cycle remain debated." },
      { label: "Earnings", stance: "neut", score: 58, note: "In-line; guidance carries the next catalyst load." },
      { label: "Technical", stance: "bull", score: 73, note: "Above all moving averages; stretched short-term." },
      { label: "Analysts", stance: "neut", score: 55, note: "Positioning supportive but no longer fresh." }
    ],
    news: [
      { src: "Market Close", time: "1h", stance: "bull", text: "Apple closes at a new high as momentum buyers return" },
      { src: "Analyst Desk", time: "4h", stance: "neut", text: "Services and AI device cycle remain key debates" },
      { src: "Options Flow", time: "1d", stance: "bull", text: "Traders cluster around the 300 strike after the breakout" }
    ]
  },
  {
    symbol: "TSLA", name: "Tesla Inc.", sector: "Consumer cyclical", industry: "Auto manufacturers",
    price: 186.24, change: -4.72, changePct: -2.47,
    volume: 94_300_000, avgVolume: 88_400_000,
    marketCap: "594B", peRatio: 59.80, beta: 2.31, divYield: 0,
    high52: 271.10, low52: 138.80, open: 191.60, prevClose: 190.96, dayHigh: 192.40, dayLow: 184.10,
    eps: 3.12, nextEarnings: "Jul 22",
    rec: "HOLD", risk: 8, bull: 46, bear: 54,
    rsi: 42.1, macd: -0.74, vwap: 188.30, ema50: 199.40, ema200: 218.70,
    thesis: "Optionality is high, but execution and margin uncertainty keep risk elevated.",
    swingIdea: "Trade smaller size; favor mean reversion only after RSI stabilizes.",
    options: "Heavy two-way weekly options volume, skew slightly bearish.",
    reasoning: [
      { label: "Valuation", stance: "bear", score: 35, note: "Premium without earnings support." },
      { label: "Momentum", stance: "bear", score: 32, note: "Below 50 and 200 EMA; lower highs intact." },
      { label: "News", stance: "neut", score: 50, note: "Pricing & delivery cadence dominate flow." },
      { label: "Earnings", stance: "neut", score: 48, note: "Margins compressed; guidance choppy." },
      { label: "Technical", stance: "bear", score: 30, note: "Below trend; MACD has not confirmed reversal." },
      { label: "Analysts", stance: "neut", score: 49, note: "Split views; few high-conviction calls." }
    ],
    news: [
      { src: "EV Monitor", time: "1h", stance: "bear", text: "Pricing pressure remains the central debate for auto margins" },
      { src: "Options Flow", time: "3h", stance: "neut", text: "Weekly Tesla contracts lead single-stock options volume" },
      { src: "Street Notes", time: "1d", stance: "neut", text: "Robotaxi catalyst timing remains a split analyst view" }
    ]
  },
  {
    symbol: "AMD", name: "Advanced Micro Devices", sector: "Technology", industry: "Semiconductors",
    price: 164.73, change: 5.33, changePct: 3.34,
    volume: 71_300_000, avgVolume: 53_200_000,
    marketCap: "266B", peRatio: 48.50, beta: 1.89, divYield: 0,
    high52: 178.40, low52: 90.10, open: 159.80, prevClose: 159.40, dayHigh: 165.90, dayLow: 159.40,
    eps: 3.40, nextEarnings: "Aug 4",
    rec: "BUY", risk: 7, bull: 69, bear: 31,
    rsi: 68.8, macd: 1.62, vwap: 163.20, ema50: 152.40, ema200: 138.90,
    thesis: "AI accelerator share gains and improving sentiment create a tradable catalyst stack.",
    swingIdea: "Buy a retest of the breakout level if volume holds above average.",
    options: "Large call sweep detected in the front-month 175 strike.",
    reasoning: [
      { label: "Valuation", stance: "neut", score: 55, note: "Premium reflects accelerator share gains." },
      { label: "Momentum", stance: "bull", score: 75, note: "Breakout with improving relative strength." },
      { label: "News", stance: "bull", score: 71, note: "Accelerator commentary lifts peer group appetite." },
      { label: "Earnings", stance: "neut", score: 58, note: "Margin remains the key debate into next print." },
      { label: "Technical", stance: "bull", score: 72, note: "Above 50/200 EMA; constructive volume." },
      { label: "Analysts", stance: "bull", score: 66, note: "Targets nudged higher across coverage." }
    ],
    news: [
      { src: "Chip Channel", time: "2h", stance: "bull", text: "AI accelerator commentary lifts peer group appetite" },
      { src: "Options Flow", time: "4h", stance: "bull", text: "Call demand rises as traders position for a breakout" },
      { src: "Tech Ledger", time: "1d", stance: "neut", text: "Margins remain the key debate into the next print" }
    ]
  },
  {
    symbol: "META", name: "Meta Platforms", sector: "Communication", industry: "Internet content",
    price: 517.96, change: 7.41, changePct: 1.45,
    volume: 14_600_000, avgVolume: 13_700_000,
    marketCap: "1.31T", peRatio: 27.90, beta: 1.19, divYield: 0.36,
    high52: 542.81, low52: 401.10, open: 511.20, prevClose: 510.55, dayHigh: 519.30, dayLow: 510.00,
    eps: 18.55, nextEarnings: "Jul 30",
    rec: "BUY", risk: 5, bull: 66, bear: 34,
    rsi: 60.1, macd: 1.05, vwap: 515.40, ema50: 498.10, ema200: 462.30,
    thesis: "Advertising strength and AI-driven engagement keep earnings leverage attractive.",
    swingIdea: "Favor a higher-low entry near the 21-day moving average.",
    options: "Steady call accumulation concentrated in monthly expiries.",
    reasoning: [
      { label: "Valuation", stance: "bull", score: 68, note: "Reasonable multiple vs. growth and FCF." },
      { label: "Momentum", stance: "bull", score: 71, note: "Constructive if ad checks remain stable." },
      { label: "News", stance: "neut", score: 58, note: "Capex debate keeps risk premium from falling further." },
      { label: "Earnings", stance: "bull", score: 73, note: "Ad strength + AI engagement leverage." },
      { label: "Technical", stance: "bull", score: 70, note: "Above 21/50-day; uptrend intact." },
      { label: "Analysts", stance: "neut", score: 60, note: "Split on capex pace; bias positive." }
    ],
    news: [
      { src: "Ad Spend Daily", time: "3h", stance: "bull", text: "Digital ad checks point to stable demand" },
      { src: "AI Brief", time: "6h", stance: "bull", text: "Engagement tools remain a central investor focus" },
      { src: "Capital Desk", time: "1d", stance: "neut", text: "Capex debate keeps risk premium from falling further" }
    ]
  },
  {
    symbol: "MU", name: "Micron Technology", sector: "Technology", industry: "Memory & storage",
    price: 803.63, change: 37.05, changePct: 4.83,
    volume: 53_757_433, avgVolume: 42_755_974,
    marketCap: "906B", peRatio: 37.94, beta: 1.92, divYield: 0.08,
    high52: 819.40, low52: 268.30, open: 775.20, prevClose: 766.58, dayHigh: 810.60, dayLow: 770.10,
    eps: 21.18, nextEarnings: "Jun 26",
    rec: "BUY", risk: 8, bull: 71, bear: 29,
    rsi: 74.6, macd: 4.31, vwap: 792.40, ema50: 712.30, ema200: 521.40,
    thesis: "Benefiting from AI-driven memory demand and aggressive analyst repricing, but extended and volatile.",
    swingIdea: "Avoid chasing vertical candles; look for a controlled pullback toward VWAP.",
    options: "Memory names seeing elevated call interest; live flow needed.",
    reasoning: [
      { label: "Valuation", stance: "neut", score: 55, note: "Cyclical multiple discount embedded." },
      { label: "Momentum", stance: "bull", score: 82, note: "Vertical move; RSI overheated near term." },
      { label: "News", stance: "bull", score: 76, note: "AI memory pricing expectations move higher." },
      { label: "Earnings", stance: "bull", score: 74, note: "HBM unit economics improve sequentially." },
      { label: "Technical", stance: "bull", score: 78, note: "Above all EMAs; volume strong." },
      { label: "Analysts", stance: "bull", score: 73, note: "Targets accelerating across HBM suppliers." }
    ],
    news: [
      { src: "Memory Market", time: "1h", stance: "bull", text: "Micron rallies as AI memory pricing expectations move higher" },
      { src: "Analyst Desk", time: "3h", stance: "bull", text: "Price target revisions accelerate across HBM suppliers" },
      { src: "Risk Monitor", time: "1d", stance: "neut", text: "Extended semi rallies raise pullback risk for late entries" }
    ]
  },
  {
    symbol: "GOOGL", name: "Alphabet Inc.", sector: "Communication", industry: "Internet content",
    price: 183.54, change: -1.33, changePct: -0.72,
    volume: 31_200_000, avgVolume: 28_900_000,
    marketCap: "2.28T", peRatio: 25.10, beta: 1.04, divYield: 0.50,
    high52: 198.40, low52: 130.60, open: 184.90, prevClose: 184.87, dayHigh: 185.80, dayLow: 182.10,
    eps: 7.31, nextEarnings: "Jul 23",
    rec: "HOLD", risk: 5, bull: 54, bear: 46,
    rsi: 49.2, macd: 0.18, vwap: 184.10, ema50: 181.40, ema200: 169.80,
    thesis: "Ad strength holds; AI distribution debate is the swing factor for the multiple.",
    swingIdea: "Wait for a clean reclaim of the 21-day moving average before sizing up.",
    options: "Balanced positioning; modest skew toward downside hedges.",
    reasoning: [
      { label: "Valuation", stance: "bull", score: 67, note: "Below big-tech peers on forward earnings." },
      { label: "Momentum", stance: "neut", score: 52, note: "Range-bound around the 50-day." },
      { label: "News", stance: "neut", score: 54, note: "Mixed coverage on AI distribution costs." },
      { label: "Earnings", stance: "bull", score: 64, note: "Ads/cloud both stable; capex elevated." },
      { label: "Technical", stance: "neut", score: 51, note: "Holding 200-day; needs reclaim of 50-day." },
      { label: "Analysts", stance: "neut", score: 58, note: "Targets mostly unchanged post-print." }
    ],
    news: [
      { src: "Ad Spend Daily", time: "2h", stance: "neut", text: "Search ad pacing steady ahead of holiday quarter" },
      { src: "AI Brief", time: "5h", stance: "neut", text: "Capex remains the swing factor for multiple expansion" },
      { src: "Cloud Weekly", time: "1d", stance: "bull", text: "GCP enterprise wins continue at steady pace" }
    ]
  }
];

window.SECTORS = [
  { name: "Semiconductors", pct: 2.42 },
  { name: "Software", pct: 0.91 },
  { name: "Communication", pct: 0.74 },
  { name: "Financials", pct: 0.21 },
  { name: "Healthcare", pct: -0.18 },
  { name: "Cons. cyclical", pct: -0.83 },
  { name: "Energy", pct: -1.12 }
];

window.INDICES = [
  { sym: "S&P 500", val: 5482.91, pct: 0.62 },
  { sym: "NASDAQ", val: 17862.20, pct: 0.88 },
  { sym: "DOW", val: 39871.45, pct: 0.31 },
  { sym: "VIX", val: 14.21, pct: -3.40 },
  { sym: "10Y", val: 4.183, pct: 0.42 },
  { sym: "DXY", val: 104.92, pct: -0.18 },
  { sym: "GOLD", val: 2491.30, pct: 0.74 },
  { sym: "BTC", val: 96213.40, pct: 1.45 },
  { sym: "OIL", val: 71.84, pct: -0.91 }
];

window.TOP_PICKS = [
  { sym: "NVDA", action: "BUY", risk: 6, thesis: "AI infrastructure demand + bullish options flow" },
  { sym: "MSFT", action: "BUY", risk: 4, thesis: "Lower-beta AI compounder with resilient cloud demand" },
  { sym: "META", action: "BUY", risk: 5, thesis: "Ad momentum + engagement gains offset capex concerns" }
];

window.HEATMAP = [
  { sym: "NVDA", weight: 18, pct: 1.92 },
  { sym: "MSFT", weight: 16, pct: 0.87 },
  { sym: "AAPL", weight: 15, pct: 1.38 },
  { sym: "META", weight: 12, pct: 1.45 },
  { sym: "GOOGL", weight: 11, pct: -0.64 },
  { sym: "MU", weight: 10, pct: 4.83 },
  { sym: "AMD", weight: 10, pct: 3.34 },
  { sym: "TSLA", weight: 9, pct: -2.47 },
  { sym: "JPM", weight: 8, pct: 0.28 },
  { sym: "LLY", weight: 8, pct: -0.22 },
  { sym: "XOM", weight: 7, pct: -1.02 },
  { sym: "BA", weight: 6, pct: -1.85 }
];

window.MARKET_BRIEF = "Risk appetite is constructive but selective. Mega-cap AI, software, and ad-tech continue to attract flows. Breadth is improving, but elevated rates argue for defined risk sizing.";

window.MARKET_NEWS = [
  { src: "Market Pulse", time: "35m", stance: "bull", text: "Semiconductors lead as AI capex expectations rise" },
  { src: "Macro Desk", time: "1h", stance: "neut", text: "Treasury yields firm ahead of inflation data" },
  { src: "Options Flow", time: "2h", stance: "bull", text: "Single-stock call demand expands in mega-cap tech" },
  { src: "Earnings Desk", time: "3h", stance: "bear", text: "Retail guidance remains uneven into next reporting window" }
];

// Deterministic series generators -- mirrors the repo's wave-based mocks
function wave(seed, i, amp) {
  return Math.sin(seed * 0.81 + i * 0.74) * amp + Math.cos(seed * 0.27 + i * 0.43) * amp * 0.5;
}

window.buildIntraday = function(stock, points = 39) {
  // 9:30 → 4:00 ET, 10-minute candles = 39 bars (clean spacing)
  const seed = stock.symbol.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const open = stock.open;
  const close = stock.price;
  const range = stock.dayHigh - stock.dayLow;
  const bars = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    // Linear from open to close + sinusoidal noise
    const base = open + (close - open) * t;
    const noise = wave(seed, i, range * 0.18);
    const o = base + noise;
    const c = base + wave(seed + 7, i, range * 0.15);
    const h = Math.max(o, c) + Math.abs(wave(seed + 11, i, range * 0.08)) + range * 0.02;
    const l = Math.min(o, c) - Math.abs(wave(seed + 13, i, range * 0.08)) - range * 0.02;
    bars.push({
      i,
      o, h, l, c,
      v: Math.round((stock.volume / points) * (0.6 + Math.abs(wave(seed + 5, i, 0.7))))
    });
  }
  // Force last bar close = price
  bars[bars.length - 1].c = close;
  bars[bars.length - 1].h = Math.max(bars[bars.length - 1].h, close);
  bars[bars.length - 1].l = Math.min(bars[bars.length - 1].l, close);
  return bars;
};

window.buildExtended = function(stock, timeframe) {
  // For non-1D timeframes, generate daily candles
  const seed = stock.symbol.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const counts = { "1W": 35, "1M": 22, "3M": 65, "YTD": 105, "1Y": 252 };
  const n = counts[timeframe] || 60;
  const range = (stock.high52 - stock.low52);
  const startPrice = stock.price - (n * range * 0.0015);
  const drift = (stock.price - startPrice) / n;
  const bars = [];
  for (let i = 0; i < n; i++) {
    const base = startPrice + i * drift;
    const noise = wave(seed, i, range * 0.025);
    const o = base + noise;
    const c = base + wave(seed + 9, i, range * 0.02);
    const h = Math.max(o, c) + Math.abs(wave(seed + 11, i, range * 0.012)) + range * 0.005;
    const l = Math.min(o, c) - Math.abs(wave(seed + 13, i, range * 0.012)) - range * 0.005;
    bars.push({ i, o, h, l, c, v: Math.round(stock.avgVolume * (0.6 + Math.abs(wave(seed + 5, i, 0.6)))) });
  }
  bars[bars.length - 1].c = stock.price;
  return bars;
};

window.formatPrice = (n) => n >= 1000 ? n.toFixed(2) : n.toFixed(2);
window.formatVol = (n) => {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
};
window.formatPct = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
window.formatChange = (n) => (n >= 0 ? "+" : "") + n.toFixed(2);
