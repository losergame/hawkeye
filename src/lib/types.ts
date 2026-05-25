export type RecommendationAction = "Buy" | "Hold" | "Sell";
export type SignalStance = "bullish" | "neutral" | "bearish";
export type AlertChannel = "Discord" | "Email" | "In-app";
export type ChartTimeframe = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y";
export type ChartIndicator = "vwap" | "ema20" | "ema50" | "ema200" | "bollinger";
export type StockSetupType = "Momentum Breakout" | "Pullback Buy" | "Oversold Bounce" | "Trend Continuation";
export type StockSetupStatus = "Waiting" | "Triggered" | "Failed" | "Completed";
export type ScannerSortKey = "confidence" | "potentialGain";

export type AlertType =
  | "price_vwap_cross"
  | "support_resistance_break"
  | "unusual_volume"
  | "bullish_momentum"
  | "bearish_momentum"
  | "earnings_soon";

export interface TimePoint {
  label: string;
  value: number;
}

export interface CandlePoint {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  ema20: number;
  ema50: number;
  ema200: number;
  bollingerUpper: number;
  bollingerLower: number;
}

export interface MacdPoint {
  label: string;
  macd: number;
  signal: number;
  histogram: number;
}

export interface ReasoningSignal {
  label:
    | "Valuation"
    | "Momentum"
    | "News sentiment"
    | "Earnings performance"
    | "Technical analysis"
    | "Analyst sentiment";
  stance: SignalStance;
  score: number;
  summary: string;
  weight?: number;
}

export interface AiScoreFactor {
  label: string;
  weight: number;
  score: number;
  detail: string;
}

export interface TechnicalSnapshot {
  price: number;
  vwap: number;
  ema20: number;
  ema50: number;
  ema200: number;
  support: number;
  resistance: number;
  relativeVolume: number;
  trendStrength: number;
}

export interface NewsItem {
  source: string;
  headline: string;
  sentiment: SignalStance;
  publishedAt: string;
  url?: string;
}

export interface StockProfile {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  averageVolume: number;
  marketCap: string;
  peRatio: number;
  beta: number;
  dividendYield: number;
  analystRating: string;
  recommendation: RecommendationAction;
  riskScore: number;
  bullishConfidence: number;
  bearishConfidence: number;
  shortTermTrend: string;
  swingTradeIdea: string;
  earningsPlay: string;
  unusualOptionsActivity: string;
  whyThisStock: string;
  eli5Summary?: string;
  confidenceBreakdown?: AiScoreFactor[];
  technicalSnapshot?: TechnicalSnapshot;
  nextEarningsDate: string;
  reasoning: ReasoningSignal[];
  intraday: TimePoint[];
  performance: TimePoint[];
  rsi: TimePoint[];
  macd: MacdPoint[];
  candles: CandlePoint[];
  news: NewsItem[];
}

export interface StockMover {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume?: string;
}

export interface SectorPerformance {
  sector: string;
  changePercent: number;
}

export interface HeatmapTile {
  symbol: string;
  sector: string;
  weight: number;
  changePercent: number;
}

export interface PortfolioHolding {
  symbol: string;
  name: string;
  shares: number;
  averageCost: number;
  allocation: number;
}

export interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

export interface AiRecommendationResponse {
  action: RecommendationAction;
  riskScore: number;
  bullishConfidence: number;
  bearishConfidence: number;
  shortTermTrend: string;
  reasoning: ReasoningSignal[];
  swingTradeIdea: string;
  earningsPlay: string;
  unusualOptionsActivity: string;
  eli5Summary?: string;
  confidenceBreakdown?: AiScoreFactor[];
}

export interface AlertRule {
  id: AlertType;
  label: string;
  description: string;
  enabled: boolean;
  channels: AlertChannel[];
}

export interface PortfolioRiskMetrics {
  volatility: number;
  sharpeRatio: number;
  concentrationRisk: number;
  portfolioRiskScore: number;
}

export interface StockSetupIndicators {
  rsi: number;
  ema20: number;
  ema50: number;
  ema200: number;
  macd: "Bullish" | "Neutral" | "Bearish";
  volume: number;
  avgVolume: number;
}

export interface StockSetup {
  ticker: string;
  companyName: string;
  currentPrice: number;
  setupType: StockSetupType;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  confidenceScore: number;
  reason: string;
  status: StockSetupStatus;
  bullishFactors: string[];
  riskFactors: string[];
  indicators: StockSetupIndicators;
}
