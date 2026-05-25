import { buildAiRecommendation, dailyMarketSummary, findStock, getStockSuggestions, marketNews } from "@/lib/mock-data";
import type { AiRecommendationResponse, AiScoreFactor, CandlePoint, ChartTimeframe, MacdPoint, NewsItem, ReasoningSignal, StockProfile, TimePoint } from "@/lib/types";

export type QuoteProvider = "demo" | "finnhub" | "polygon";

export interface StockProfileResult {
  profile: StockProfile;
  provider: QuoteProvider;
}

export interface StockSearchSuggestion {
  symbol: string;
  name: string;
  subtitle: string;
  price?: number;
  changePercent?: number;
  source: "local" | "finnhub";
}

interface FinnhubQuote {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
}

interface FinnhubProfile {
  finnhubIndustry?: string;
  marketCapitalization?: number;
  name?: string;
  ticker?: string;
}

interface FinnhubMetricResponse {
  metric?: Record<string, number | null | string>;
}

interface FinnhubCandleResponse {
  c?: number[];
  h?: number[];
  l?: number[];
  o?: number[];
  s?: "ok" | "no_data";
  t?: number[];
  v?: number[];
}

interface FinnhubNewsItem {
  source?: string;
  headline?: string;
  summary?: string;
  datetime?: number;
  url?: string;
}

interface FinnhubSearchResponse {
  result?: Array<{
    description?: string;
    displaySymbol?: string;
    symbol?: string;
    type?: string;
  }>;
}

interface PolygonPreviousClose {
  results?: Array<{
    c?: number;
    o?: number;
    v?: number;
  }>;
}

interface PolygonAggResponse {
  results?: Array<{
    c?: number;
    h?: number;
    l?: number;
    o?: number;
    t?: number;
    v?: number;
    vw?: number;
  }>;
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function metricNumber(metrics: Record<string, number | null | string> | undefined, key: string) {
  const value = metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatMarketCapFromMillions(value?: number) {
  if (!value || !Number.isFinite(value)) return undefined;
  const dollars = value * 1_000_000;
  if (dollars >= 1_000_000_000_000) return `$${round(dollars / 1_000_000_000_000, 2)}T`;
  if (dollars >= 1_000_000_000) return `$${round(dollars / 1_000_000_000, 2)}B`;
  return `$${round(dollars / 1_000_000, 2)}M`;
}

function ema(values: number[], period: number) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const result: number[] = [values[0]];

  for (let index = 1; index < values.length; index += 1) {
    result.push(values[index] * multiplier + result[index - 1] * (1 - multiplier));
  }

  return result;
}

function bollinger(values: number[], period = 20) {
  return values.map((value, index) => {
    const window = values.slice(Math.max(0, index - period + 1), index + 1);
    const average = window.reduce((sum, item) => sum + item, 0) / window.length;
    const variance = window.reduce((sum, item) => sum + (item - average) ** 2, 0) / window.length;
    const deviation = Math.sqrt(variance);

    return {
      upper: round(average + deviation * 2),
      lower: round(average - deviation * 2),
      middle: round(value)
    };
  });
}

function buildRsi(closes: number[], labels: string[]): TimePoint[] {
  return closes.map((_, index) => {
    if (index === 0) return { label: labels[index], value: 50 };

    const start = Math.max(1, index - 13);
    let gains = 0;
    let losses = 0;

    for (let pointIndex = start; pointIndex <= index; pointIndex += 1) {
      const change = closes[pointIndex] - closes[pointIndex - 1];
      if (change >= 0) gains += change;
      else losses += Math.abs(change);
    }

    const averageGain = gains / Math.max(1, index - start + 1);
    const averageLoss = losses / Math.max(1, index - start + 1);
    const value = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

    return { label: labels[index], value: round(value, 1) };
  });
}

function buildMacd(closes: number[], labels: string[]): MacdPoint[] {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd = closes.map((_, index) => (ema12[index] ?? closes[index]) - (ema26[index] ?? closes[index]));
  const signal = ema(macd, 9);

  return macd.map((value, index) => ({
    label: labels[index],
    macd: round(value),
    signal: round(signal[index] ?? value),
    histogram: round(value - (signal[index] ?? value))
  }));
}

function buildQuoteIntraday(quote: FinnhubQuote, fallback: StockProfile): TimePoint[] {
  const close = quote.c ?? fallback.price;
  const open = quote.o ?? fallback.intraday[0]?.value ?? close;
  const high = Math.max(quote.h ?? close, open, close);
  const low = Math.min(quote.l ?? close, open, close);
  const labels = ["9:30 AM", "10:15 AM", "11:00 AM", "11:45 AM", "12:30 PM", "1:15 PM", "2:00 PM", "2:45 PM", "3:30 PM", "4:00 PM"];

  return labels.map((label, index) => {
    const progress = index / (labels.length - 1);
    const baseline = open + (close - open) * progress;
    const wave = Math.sin(progress * Math.PI * 1.35) * (high - low) * 0.22;
    const lateFade = progress > 0.72 ? (progress - 0.72) * (close - baseline) : 0;
    const value = index === labels.length - 1 ? close : Math.max(low, Math.min(high, baseline + wave + lateFade));

    return { label, value: round(value) };
  });
}

function buildQuoteCandles(quote: FinnhubQuote, fallback: StockProfile): CandlePoint[] {
  const close = quote.c ?? fallback.price;
  const previousClose = quote.pc ?? fallback.price * 0.98;
  const high = Math.max(quote.h ?? close, close, previousClose);
  const low = Math.min(quote.l ?? close, close, previousClose);
  const closes = Array.from({ length: 30 }, (_, index) => {
    const progress = index / 29;
    const trend = previousClose + (close - previousClose) * progress;
    const oscillation = Math.sin(progress * Math.PI * 4) * (high - low) * 0.16;
    return round(Math.max(low * 0.985, Math.min(high * 1.015, trend + oscillation)));
  });
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const ema20 = ema(closes, 20);
  const bands = bollinger(closes);

  return closes.map((pointClose, index) => {
    const prior = index === 0 ? previousClose : closes[index - 1];
    const open = round(prior + (pointClose - prior) * 0.35);
    const candleHigh = round(Math.max(open, pointClose) + Math.abs(pointClose - open) * 0.42 + (high - low) * 0.025);
    const candleLow = round(Math.min(open, pointClose) - Math.abs(pointClose - open) * 0.42 - (high - low) * 0.025);
    const volumeBase = fallback.averageVolume || fallback.volume || 10_000_000;

    return {
      label: `${index + 1}`,
      open,
      high: candleHigh,
      low: candleLow,
      close: pointClose,
      volume: Math.round(volumeBase * (0.62 + Math.sin(index * 0.7) * 0.14 + index / 80)),
      vwap: round((open + candleHigh + candleLow + pointClose) / 4),
      ema20: round(ema20[index] ?? pointClose),
      ema50: round(ema50[index] ?? pointClose),
      ema200: round(ema200[index] ?? pointClose),
      bollingerUpper: bands[index]?.upper ?? pointClose,
      bollingerLower: bands[index]?.lower ?? pointClose
    };
  });
}

function buildFallbackQuoteCharts(quote: FinnhubQuote, fallback: StockProfile): Pick<StockProfile, "intraday" | "performance" | "rsi" | "macd" | "candles"> {
  const candles = buildQuoteCandles(quote, fallback);
  const closes = candles.map((point) => point.close);
  const labels = candles.map((point) => point.label);

  return {
    intraday: buildQuoteIntraday(quote, fallback),
    performance: candles
      .filter((_, index) => index % 3 === 2)
      .slice(-12)
      .map((point) => ({ label: point.label, value: point.close })),
    rsi: buildRsi(closes, labels),
    macd: buildMacd(closes, labels),
    candles
  };
}

function buildFromFinnhubCandles(candles: FinnhubCandleResponse, fallback: StockProfile): Pick<StockProfile, "intraday" | "performance" | "rsi" | "macd" | "candles"> | null {
  if (candles.s !== "ok" || !candles.c?.length || !candles.o?.length || !candles.h?.length || !candles.l?.length || !candles.t?.length) {
    return null;
  }

  const points = candles.c.map((close, index) => ({
    close,
    high: candles.h?.[index] ?? close,
    low: candles.l?.[index] ?? close,
    open: candles.o?.[index] ?? close,
    timestamp: candles.t?.[index] ?? index,
    volume: candles.v?.[index] ?? fallback.averageVolume ?? fallback.volume
  }));

  const sampled = points.slice(-60);
  const closes = sampled.map((point) => point.close);
  const labels = sampled.map((point) => new Date(point.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const ema20 = ema(closes, 20);
  const bands = bollinger(closes);

  const candlesOut: CandlePoint[] = sampled.slice(-30).map((point, index, lastThirty) => {
    const closeIndex = sampled.length - lastThirty.length + index;
    return {
      label: `${index + 1}`,
      open: round(point.open),
      high: round(point.high),
      low: round(point.low),
      close: round(point.close),
      volume: Math.round(point.volume),
      vwap: round((point.open + point.high + point.low + point.close) / 4),
      ema20: round(ema20[closeIndex] ?? point.close),
      ema50: round(ema50[closeIndex] ?? point.close),
      ema200: round(ema200[closeIndex] ?? point.close),
      bollingerUpper: bands[closeIndex]?.upper ?? point.close,
      bollingerLower: bands[closeIndex]?.lower ?? point.close
    };
  });

  const intraday: TimePoint[] = sampled.slice(-10).map((point) => ({
    label: new Date(point.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: round(point.close)
  }));

  const performance: TimePoint[] = sampled.slice(-12).map((point) => ({
    label: new Date(point.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: round(point.close)
  }));

  return {
    candles: candlesOut,
    intraday,
    performance,
    rsi: buildRsi(closes, labels).slice(-30),
    macd: buildMacd(closes, labels).slice(-30)
  };
}

function polygonRangeConfig(timeframe: ChartTimeframe) {
  const now = new Date();
  const from = new Date(now);
  let multiplier = 1;
  let timespan: "minute" | "day" = "day";
  let maxPoints = 120;

  switch (timeframe) {
    case "1D":
      multiplier = 5;
      timespan = "minute";
      maxPoints = 90;
      from.setDate(now.getDate() - 7);
      break;
    case "1W":
      multiplier = 30;
      timespan = "minute";
      maxPoints = 120;
      from.setDate(now.getDate() - 14);
      break;
    case "1M":
      from.setDate(now.getDate() - 45);
      maxPoints = 45;
      break;
    case "3M":
      from.setDate(now.getDate() - 120);
      maxPoints = 90;
      break;
    case "YTD":
      from.setMonth(0, 1);
      maxPoints = 160;
      break;
    case "1Y":
      from.setDate(now.getDate() - 390);
      maxPoints = 260;
      break;
    default:
      from.setDate(now.getDate() - 45);
      break;
  }

  return {
    multiplier,
    timespan,
    maxPoints,
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10)
  };
}

function formatPolygonLabel(timestamp: number, timespan: "minute" | "day") {
  const date = new Date(timestamp);

  if (timespan === "minute") {
    return date.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric"
  });
}

function buildChartDataFromRows(
  rows: NonNullable<PolygonAggResponse["results"]>,
  fallback: StockProfile,
  timespan: "minute" | "day"
): Pick<StockProfile, "intraday" | "performance" | "rsi" | "macd" | "candles"> | null {
  const cleaned = rows
    .filter((row) => typeof row.c === "number" && typeof row.o === "number" && typeof row.h === "number" && typeof row.l === "number" && typeof row.t === "number")
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));

  if (!cleaned.length) return null;

  const closes = cleaned.map((row) => row.c ?? fallback.price);
  const labels = cleaned.map((row) => formatPolygonLabel(row.t ?? Date.now(), timespan));
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const bands = bollinger(closes);
  let cumulativeTypicalVolume = 0;
  let cumulativeVolume = 0;

  const candles = cleaned.map((row, index) => {
    const open = row.o ?? row.c ?? fallback.price;
    const high = row.h ?? row.c ?? fallback.price;
    const low = row.l ?? row.c ?? fallback.price;
    const close = row.c ?? fallback.price;
    const volume = row.v ?? fallback.averageVolume ?? fallback.volume;
    const typical = row.vw ?? (open + high + low + close) / 4;
    cumulativeTypicalVolume += typical * volume;
    cumulativeVolume += volume;

    return {
      label: labels[index],
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(volume),
      vwap: round(cumulativeVolume ? cumulativeTypicalVolume / cumulativeVolume : typical),
      ema20: round(ema20[index] ?? close),
      ema50: round(ema50[index] ?? close),
      ema200: round(ema200[index] ?? close),
      bollingerUpper: bands[index]?.upper ?? close,
      bollingerLower: bands[index]?.lower ?? close
    };
  });

  const compactPerformance = candles.filter((_, index) => index === candles.length - 1 || index % Math.max(1, Math.floor(candles.length / 12)) === 0);
  return {
    candles,
    intraday: candles.map((point) => ({ label: point.label, value: point.close })),
    performance: compactPerformance.slice(-12).map((point) => ({ label: point.label, value: point.close })),
    rsi: buildRsi(closes, labels),
    macd: buildMacd(closes, labels)
  };
}

async function buildFromPolygonAggregates(
  symbol: string,
  fallback: StockProfile,
  timeframe: ChartTimeframe
): Promise<Pick<StockProfile, "intraday" | "performance" | "rsi" | "macd" | "candles"> | null> {
  const polygonKey = process.env.POLYGON_API_KEY;
  if (!polygonKey) return null;

  const config = polygonRangeConfig(timeframe);
  const url = new URL(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${config.multiplier}/${config.timespan}/${config.from}/${config.to}`);
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "5000");
  url.searchParams.set("apiKey", polygonKey);

  try {
    const response = await fetch(url, { next: { revalidate: timeframe === "1D" ? 30 : 300 } });
    if (!response.ok) return null;
    const data = (await response.json()) as PolygonAggResponse;
    const rows = data.results?.slice(-config.maxPoints);
    if (!rows?.length) return null;

    return buildChartDataFromRows(rows, fallback, config.timespan);
  } catch {
    return null;
  }
}

function averageVolumeFromMetrics(metrics?: Record<string, number | null | string>) {
  const average = metricNumber(metrics, "10DayAverageTradingVolume") ?? metricNumber(metrics, "3MonthAverageTradingVolume");
  if (!average) return undefined;

  return Math.round(average < 100_000 ? average * 1_000_000 : average);
}

function buildDynamicReasoning(
  stock: StockProfile,
  quote: FinnhubQuote,
  metrics?: Record<string, number | null | string>
): Pick<
  StockProfile,
  | "recommendation"
  | "riskScore"
  | "bullishConfidence"
  | "bearishConfidence"
  | "shortTermTrend"
  | "swingTradeIdea"
  | "earningsPlay"
  | "unusualOptionsActivity"
  | "whyThisStock"
  | "eli5Summary"
  | "confidenceBreakdown"
  | "technicalSnapshot"
  | "reasoning"
  | "analystRating"
> {
  const pe = metricNumber(metrics, "peTTM") ?? metricNumber(metrics, "forwardPE") ?? stock.peRatio;
  const beta = metricNumber(metrics, "beta") ?? stock.beta;
  const revenueGrowth = metricNumber(metrics, "revenueGrowthTTMYoy") ?? metricNumber(metrics, "revenueGrowthQuarterlyYoy") ?? 0;
  const epsGrowth = metricNumber(metrics, "epsGrowthTTMYoy") ?? 0;
  const threeMonthReturn = metricNumber(metrics, "13WeekPriceReturnDaily") ?? 0;
  const dayChange = quote.dp ?? stock.changePercent;
  const latestCandle = stock.candles.at(-1);
  const price = quote.c ?? stock.price;
  const vwap = latestCandle?.vwap ?? price;
  const ema20 = latestCandle?.ema20 ?? price;
  const ema50 = latestCandle?.ema50 ?? price;
  const ema200 = latestCandle?.ema200 ?? price;
  const support = Math.min(...stock.candles.slice(-12).map((point) => point.low), quote.l ?? price);
  const resistance = Math.max(...stock.candles.slice(-12).map((point) => point.high), quote.h ?? price);
  const relativeVolume = stock.averageVolume > 0 ? stock.volume / stock.averageVolume : 1;
  const trendStrength = Math.max(0, Math.min(100, 50 + (price - ema50) / Math.max(price * 0.0025, 0.01)));

  const valuationStance: ReasoningSignal["stance"] = pe > 70 ? "bearish" : pe > 38 ? "neutral" : "bullish";
  const momentumStance: ReasoningSignal["stance"] =
    (dayChange > 1.2 && price >= vwap) || threeMonthReturn > 8 ? "bullish" : dayChange < -1.2 || price < vwap * 0.995 || threeMonthReturn < -8 ? "bearish" : "neutral";
  const earningsStance: ReasoningSignal["stance"] = revenueGrowth > 15 || epsGrowth > 12 ? "bullish" : revenueGrowth < -5 || epsGrowth < -10 ? "bearish" : "neutral";
  const technicalStance: ReasoningSignal["stance"] = price > vwap && ema20 >= ema50 ? "bullish" : price < vwap && ema20 < ema50 ? "bearish" : "neutral";
  const analystStance: ReasoningSignal["stance"] = stock.analystRating.toLowerCase().includes("buy") ? "bullish" : stock.analystRating.toLowerCase().includes("sell") ? "bearish" : "neutral";
  const scoreFromStance = (stance: ReasoningSignal["stance"], offset = 0) => (stance === "bullish" ? 78 + offset : stance === "neutral" ? 56 + offset : 34 + offset);
  const confidenceBreakdown: AiScoreFactor[] = [
    {
      label: "VWAP and trend",
      weight: 28,
      score: scoreFromStance(technicalStance, price >= vwap ? 4 : -4),
      detail: `Price is ${price >= vwap ? "above" : "below"} VWAP by ${round(((price - vwap) / Math.max(vwap, 0.01)) * 100, 2)}%; EMA 20 is ${ema20 >= ema50 ? "above" : "below"} EMA 50.`
    },
    {
      label: "Momentum",
      weight: 22,
      score: scoreFromStance(momentumStance, Math.round(Math.min(8, relativeVolume * 2))),
      detail: `${round(dayChange, 2)}% day move, ${round(threeMonthReturn, 1)}% 13-week return, ${round(relativeVolume, 2)}x relative volume.`
    },
    {
      label: "Support/resistance",
      weight: 16,
      score: price > (support + resistance) / 2 ? 68 : 44,
      detail: `Support near ${round(support)} and resistance near ${round(resistance)}; price is ${price > (support + resistance) / 2 ? "in the upper half of range" : "closer to range support"}.`
    },
    {
      label: "Valuation",
      weight: 16,
      score: scoreFromStance(valuationStance),
      detail: `P/E near ${round(pe, 1)} versus growth and sector expectations.`
    },
    {
      label: "Earnings and sentiment",
      weight: 18,
      score: Math.round((scoreFromStance(earningsStance) + scoreFromStance(analystStance)) / 2),
      detail: `Revenue growth near ${round(revenueGrowth, 1)}%, EPS growth near ${round(epsGrowth, 1)}%, analyst tone is ${analystStance}.`
    }
  ];
  const weightedScore = confidenceBreakdown.reduce((sum, item) => sum + item.score * (item.weight / 100), 0);
  const bullishConfidence = Math.max(
    24,
    Math.min(
      84,
      Math.round(weightedScore)
    )
  );
  const recommendation = bullishConfidence >= 64 ? "Buy" : bullishConfidence <= 42 ? "Sell" : "Hold";
  const riskScore = Math.max(2, Math.min(10, Math.round(4 + Math.abs(dayChange) / 1.4 + Math.max(0, beta - 1) * 2 + (pe > 65 ? 1 : 0))));

  return {
    recommendation,
    analystRating: recommendation === "Buy" ? "Buy" : recommendation === "Sell" ? "Reduce" : "Hold",
    riskScore,
    bullishConfidence,
    bearishConfidence: 100 - bullishConfidence,
    shortTermTrend:
      technicalStance === "bullish"
        ? "Short-term trend is constructive while price holds above the current session range midpoint."
        : technicalStance === "bearish"
          ? "Short-term trend is under pressure until buyers reclaim the prior close."
          : "Short-term trend is mixed and needs stronger volume confirmation.",
    swingTradeIdea:
      recommendation === "Buy"
        ? "Favor pullbacks into support or a tight breakout retest instead of chasing the first candle."
        : recommendation === "Sell"
          ? "Avoid fresh long exposure until momentum stabilizes; aggressive traders can watch failed bounces."
          : "Wait for either a clean breakout or a reset into support before sizing a swing trade.",
    earningsPlay: riskScore >= 7 ? "Use defined-risk spreads around earnings because volatility and gap risk are elevated." : "A smaller directional structure can work if guidance and trend agree.",
    unusualOptionsActivity: "Options activity requires a connected options-flow feed; current signal is based on quote, profile, and metrics.",
    whyThisStock:
      recommendation === "Buy"
        ? `${stock.name} earns a Buy because price is holding ${price >= vwap ? "above" : "near"} VWAP, trend strength is ${round(trendStrength, 0)}/100, and earnings/analyst inputs are not fighting the tape. Key invalidation is a break below ${round(support)}.`
        : recommendation === "Sell"
          ? `${stock.name} screens as Sell because price is below key intraday reference levels, momentum is weak, and valuation/growth do not offset the technical damage. Reclaiming ${round(resistance)} would reduce the bearish read.`
          : `${stock.name} is a Hold because the model sees a mixed tape: price versus VWAP and trend are not aligned enough to chase, while valuation and earnings inputs do not justify a clean Sell.`,
    eli5Summary:
      recommendation === "Buy"
        ? "The stock is acting strong, like a runner staying ahead of the pack. It still has risk, but buyers are in control right now."
        : recommendation === "Sell"
          ? "The stock is slipping and needs to prove it can stand back up before it is worth chasing."
          : "The stock is in the middle. It is not clearly strong or clearly broken, so waiting is smarter than guessing.",
    confidenceBreakdown,
    technicalSnapshot: {
      price,
      vwap,
      ema20,
      ema50,
      ema200,
      support,
      resistance,
      relativeVolume,
      trendStrength
    },
    reasoning: [
      {
        label: "Valuation",
        stance: valuationStance,
        weight: 16,
        score: scoreFromStance(valuationStance),
        summary: pe > 70 ? `P/E near ${round(pe, 1)} is demanding and leaves little room for misses.` : `P/E near ${round(pe, 1)} is ${valuationStance === "bullish" ? "reasonable versus growth" : "fair but not cheap"}.`
      },
      {
        label: "Momentum",
        stance: momentumStance,
        weight: 22,
        score: scoreFromStance(momentumStance, 1),
        summary: `Price is moving ${round(dayChange, 2)}% today, trading ${price >= vwap ? "above" : "below"} VWAP, with a 13-week return near ${round(threeMonthReturn, 1)}%.`
      },
      {
        label: "News sentiment",
        stance: "neutral",
        weight: 8,
        score: 56,
        summary: "Live headlines are shown separately; connect sentiment scoring for stronger news attribution."
      },
      {
        label: "Earnings performance",
        stance: earningsStance,
        weight: 18,
        score: scoreFromStance(earningsStance, -2),
        summary: `Revenue growth is near ${round(revenueGrowth, 1)}% and EPS growth is near ${round(epsGrowth, 1)}%.`
      },
      {
        label: "Technical analysis",
        stance: technicalStance,
        weight: 28,
        score: scoreFromStance(technicalStance, 2),
        summary:
          technicalStance === "bullish"
            ? `Price is above VWAP with EMA 20 ${ema20 >= ema50 ? "above" : "near"} EMA 50; resistance sits near ${round(resistance)}.`
            : technicalStance === "bearish"
              ? `Price is below VWAP and needs to reclaim ${round(vwap)} before momentum improves.`
              : `Technical action is balanced between support near ${round(support)} and resistance near ${round(resistance)}.`
      },
      {
        label: "Analyst sentiment",
        stance: analystStance,
        weight: 8,
        score: scoreFromStance(analystStance, -4),
        summary: "Analyst label is model-derived until a dedicated analyst-rating endpoint is connected."
      }
    ]
  };
}

async function fetchFinnhubJson<T>(url: URL): Promise<T | null> {
  try {
    const response = await fetch(url, { next: { revalidate: 60 } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizeSentiment(text: string): NewsItem["sentiment"] {
  const lower = text.toLowerCase();
  if (["beat", "raise", "growth", "strong", "record", "surge"].some((token) => lower.includes(token))) {
    return "bullish";
  }

  if (["miss", "cut", "weak", "probe", "pressure", "falls"].some((token) => lower.includes(token))) {
    return "bearish";
  }

  return "neutral";
}

export async function getStockProfile(symbol: string, timeframe: ChartTimeframe = "1D"): Promise<StockProfileResult> {
  const stock = findStock(symbol);
  const finnhubKey = process.env.FINNHUB_API_KEY;

  if (finnhubKey) {
    try {
      const quoteUrl = new URL("https://finnhub.io/api/v1/quote");
      quoteUrl.searchParams.set("symbol", stock.symbol);
      quoteUrl.searchParams.set("token", finnhubKey);

      const quote = await fetchFinnhubJson<FinnhubQuote>(quoteUrl);
      if (!quote || typeof quote.c !== "number" || quote.c <= 0) {
        return { profile: stock, provider: "demo" };
      }

      const profileUrl = new URL("https://finnhub.io/api/v1/stock/profile2");
      profileUrl.searchParams.set("symbol", stock.symbol);
      profileUrl.searchParams.set("token", finnhubKey);

      const metricUrl = new URL("https://finnhub.io/api/v1/stock/metric");
      metricUrl.searchParams.set("symbol", stock.symbol);
      metricUrl.searchParams.set("metric", "all");
      metricUrl.searchParams.set("token", finnhubKey);

      const nowSeconds = Math.floor(Date.now() / 1000);
      const candleUrl = new URL("https://finnhub.io/api/v1/stock/candle");
      candleUrl.searchParams.set("symbol", stock.symbol);
      candleUrl.searchParams.set("resolution", "D");
      candleUrl.searchParams.set("from", String(nowSeconds - 120 * 24 * 60 * 60));
      candleUrl.searchParams.set("to", String(nowSeconds));
      candleUrl.searchParams.set("token", finnhubKey);

      const [profileData, metricData, candleData] = await Promise.all([
        fetchFinnhubJson<FinnhubProfile>(profileUrl),
        fetchFinnhubJson<FinnhubMetricResponse>(metricUrl),
        fetchFinnhubJson<FinnhubCandleResponse>(candleUrl)
      ]);

      const metrics = metricData?.metric;
      const peRatio = metricNumber(metrics, "peTTM") ?? metricNumber(metrics, "forwardPE") ?? stock.peRatio;
      const beta = metricNumber(metrics, "beta") ?? stock.beta;
      const dividendYield = metricNumber(metrics, "currentDividendYieldTTM") ?? metricNumber(metrics, "dividendYieldIndicatedAnnual") ?? stock.dividendYield;
      const averageVolume = averageVolumeFromMetrics(metrics) ?? stock.averageVolume;
      const change = quote.d ?? (quote.pc ? quote.c - quote.pc : stock.change);
      const changePercent = quote.dp ?? (quote.pc ? (change / quote.pc) * 100 : stock.changePercent);
      const polygonChartData = await buildFromPolygonAggregates(stock.symbol, stock, timeframe);
      const chartData = polygonChartData ?? (candleData ? buildFromFinnhubCandles(candleData, stock) ?? buildFallbackQuoteCharts(quote, stock) : buildFallbackQuoteCharts(quote, stock));
      const enrichedBase: StockProfile = {
        ...stock,
        symbol: (profileData?.ticker || stock.symbol).toUpperCase(),
        name: profileData?.name || stock.name,
        sector: profileData?.finnhubIndustry || stock.sector,
        industry: stock.industry === "AI modeled equity" ? profileData?.finnhubIndustry || stock.industry : stock.industry,
        price: round(quote.c),
        change: round(change),
        changePercent: round(changePercent, 2),
        volume: chartData.candles.at(-1)?.volume ?? averageVolume ?? stock.volume,
        averageVolume,
        marketCap: formatMarketCapFromMillions(profileData?.marketCapitalization) ?? formatMarketCapFromMillions(metricNumber(metrics, "marketCapitalization")) ?? stock.marketCap,
        peRatio: round(peRatio, 2),
        beta: round(beta, 2),
        dividendYield: round(dividendYield, 2),
        ...chartData
      };

      return {
        provider: "finnhub",
        profile: {
          ...enrichedBase,
          ...buildDynamicReasoning(enrichedBase, quote, metrics)
        }
      };
    } catch {
      return { profile: stock, provider: "demo" };
    }
  }

  const polygonKey = process.env.POLYGON_API_KEY;

  if (polygonKey) {
    try {
      const response = await fetch(`https://api.polygon.io/v2/aggs/ticker/${stock.symbol}/prev?adjusted=true&apiKey=${polygonKey}`, {
        next: { revalidate: 60 }
      });

      if (!response.ok) {
        return { profile: stock, provider: "demo" };
      }

      const result = ((await response.json()) as PolygonPreviousClose).results?.[0];
      if (!result?.c || !result.o) {
        return { profile: stock, provider: "demo" };
      }

      const change = result.c - result.o;
      const quote: FinnhubQuote = {
        c: result.c,
        d: change,
        dp: (change / result.o) * 100,
        o: result.o,
        pc: result.o
      };
      const chartData = (await buildFromPolygonAggregates(stock.symbol, stock, timeframe)) ?? buildFallbackQuoteCharts(quote, stock);
      const enrichedBase: StockProfile = {
        ...stock,
        price: round(result.c),
        change: round(change),
        changePercent: round((change / result.o) * 100, 2),
        volume: result.v ?? chartData.candles.at(-1)?.volume ?? stock.volume,
        ...chartData
      };

      return {
        provider: "polygon",
        profile: {
          ...enrichedBase,
          ...buildDynamicReasoning(enrichedBase, quote)
        }
      };
    } catch {
      return { profile: stock, provider: "demo" };
    }
  }

  return { profile: stock, provider: "demo" };
}

export async function getCompanyNews(symbol: string): Promise<NewsItem[]> {
  const stock = findStock(symbol);
  const finnhubKey = process.env.FINNHUB_API_KEY;

  if (!finnhubKey) {
    return stock.news;
  }

  try {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 7);

    const newsUrl = new URL("https://finnhub.io/api/v1/company-news");
    newsUrl.searchParams.set("symbol", stock.symbol);
    newsUrl.searchParams.set("from", from.toISOString().slice(0, 10));
    newsUrl.searchParams.set("to", now.toISOString().slice(0, 10));
    newsUrl.searchParams.set("token", finnhubKey);

    const response = await fetch(newsUrl, { next: { revalidate: 300 } });
    if (!response.ok) {
      return stock.news;
    }

    const items = (await response.json()) as FinnhubNewsItem[];

    return items.slice(0, 10).map((item) => {
      const headline = item.headline ?? item.summary ?? `${stock.symbol} market update`;

      return {
        source: item.source ?? "Finnhub",
        headline,
        sentiment: normalizeSentiment(headline),
        publishedAt: item.datetime ? new Date(item.datetime * 1000).toLocaleDateString("en-US") : "Recent",
        url: item.url
      };
    });
  } catch {
    return stock.news;
  }
}

export async function getSearchSuggestions(query: string, limit = 8): Promise<StockSearchSuggestion[]> {
  const local = getStockSuggestions(query, limit).map((stock) => ({
    symbol: stock.symbol,
    name: stock.name,
    subtitle: `${stock.sector} / ${stock.industry}`,
    price: stock.price,
    changePercent: stock.changePercent,
    source: "local" as const
  }));

  const normalized = query.trim();
  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (!normalized || !finnhubKey) {
    return local;
  }

  const searchUrl = new URL("https://finnhub.io/api/v1/search");
  searchUrl.searchParams.set("q", normalized);
  searchUrl.searchParams.set("token", finnhubKey);

  const data = await fetchFinnhubJson<FinnhubSearchResponse>(searchUrl);
  const seen = new Set<string>();
  const remote =
    data?.result
      ?.filter((item) => item.symbol && item.description && !item.symbol.includes(".") && (item.type === "Common Stock" || item.type === "ETP" || !item.type))
      .map((item) => ({
        symbol: (item.displaySymbol || item.symbol || "").toUpperCase(),
        name: item.description || item.symbol || "",
        subtitle: item.type || "US equity",
        source: "finnhub" as const
      }))
      .filter((item) => {
        if (!item.symbol || seen.has(item.symbol)) return false;
        seen.add(item.symbol);
        return true;
      }) ?? [];

  const localFallback = local.filter((item) => {
    if (seen.has(item.symbol)) return false;
    seen.add(item.symbol);
    return true;
  });

  return [...remote, ...localFallback].slice(0, limit);
}

export function getFallbackRecommendation(symbol: string): AiRecommendationResponse {
  return buildAiRecommendation(findStock(symbol));
}

export function getFallbackMarketSummary() {
  return {
    summary: dailyMarketSummary,
    highlights: [
      "AI infrastructure leaders continue to show the strongest earnings revision trend.",
      "High-beta consumer names lag as margin uncertainty remains elevated.",
      "Options flow is active in semiconductors, but position sizing should account for volatility."
    ],
    news: marketNews
  };
}
