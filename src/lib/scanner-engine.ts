/**
 * Scanner engine — seeded synthetic candles + real indicator calculations
 * + proper ATR/swing/Fibonacci TP/SL logic.
 *
 * No external I/O. Pure functions only.
 */

import type { StockSetup, StockSetupStatus, StockSetupType } from "@/lib/types";
import { MIN_BARS_SUFFICIENT } from "@/lib/candle-constants";
import {
  atr,
  ema,
  macd as calcMacd,
  nearestResistance,
  nearestSupport,
  type OHLCBar,
  rsi as calcRsi,
  volumeRatio as calcVolRatio,
} from "@/lib/indicators";
import type { TickerInfo } from "@/lib/tickers/sp500";
import { SP500 } from "@/lib/tickers/sp500";
import { NASDAQ100 } from "@/lib/tickers/nasdaq100";
import { RUSSELL2000 } from "@/lib/tickers/russell2000";

// ── Dead ticker blacklist ─────────────────────────────────────────────────
// Tickers confirmed delisted/acquired. Scanner skips these even if they
// somehow remain in a universe list. Add new entries here as needed.

export const DEAD_TICKERS = new Set<string>([
  "PARA",   // Paramount Global — acquired by Skydance, delisted Jan 2025
  "AIRC",   // Apartment Income REIT — ticker inactive
  "EVERI",  // Everi Holdings — taken private by Apollo, delisted 2024
  "ATVI",   // Activision Blizzard — acquired by Microsoft, Oct 2023
  "TWTR",   // Twitter — taken private by Elon Musk, Oct 2022
  "XLNX",   // Xilinx — acquired by AMD, Feb 2022
  "PBCT",   // People's United — merged into M&T Bank, Apr 2022
  "NLSN",   // Nielsen Holdings — taken private, Oct 2022
  "SIVB",   // SVB Financial — FDIC receivership, Mar 2023
  "FRC",    // First Republic Bank — FDIC seizure, May 2023
  "SBNY",   // Signature Bank — FDIC receivership, Mar 2023
  "PACW",   // PacWest Bancorp — merged into Banc of California, Nov 2023
]);

/** Minimum price for a ticker to be considered tradeable in the scanner. */
export const MIN_TRADEABLE_PRICE = 3.00;

/** Returns true when a live Finnhub quote price is valid for trading. */
export function isValidQuote(price: number | undefined): boolean {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

/** Returns true when a ticker should be skipped entirely. */
export function isDeadTicker(ticker: string): boolean {
  return DEAD_TICKERS.has(ticker.toUpperCase());
}

// ── Seeded PRNG (LCG) ─────────────────────────────────────────────────────

class LCG {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }
  next(): number {
    this.s = (Math.imul(1664525, this.s) + 1013904223) >>> 0;
    return this.s / 0x100000000;
  }
}

function tickerSeed(ticker: string): number {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) {
    h = (Math.imul(31, h) + ticker.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Realistic approximate prices per ticker ───────────────────────────────
// FIX: replaces `8 + (seed % 792)` which produced nonsensical levels
// (CPB≈$478 real $30, BLK≈$129 real $950, FITB≈$793 real $38).
// ±5% deterministic noise is added via seed so adjacent scans feel live.

export const APPROX_PRICES: Record<string, number> = {
  // Technology
  AAPL:210, MSFT:420, NVDA:125, AVGO:195, ORCL:155, ADBE:380, CRM:285,
  CSCO:58,  ACN:290,  PLTR:38,  IBM:225,  TXN:185,  QCOM:155, INTU:625,
  AMAT:175, AMD:110,  MU:95,    LRCX:720, KLAC:700, NOW:820,  ADI:185,
  PANW:175, MCHP:65,  CDNS:265, SNPS:495, APH:70,   KEYS:145, ANSS:295,
  FTNT:82,  WDC:45,   HPQ:33,   HPE:21,   STX:85,   NTAP:105, IT:520,
  CDW:165,  PTC:155,  FSLR:155, ON:35,    AKAM:85,  MPWR:555, SWKS:55,
  ZBRA:290, GLW:45,   VRSN:195, TER:100,  TRMB:56,  EA:130,   LDOS:130,
  CTSH:77,  JNPR:33,  GPN:85,   PAYX:155, ADP:270,  FISV:185, FIS:77,
  MSCI:575, ANET:87,  CRWD:380, DDOG:110, SNOW:140, MRVL:65,  GDDY:195,
  EPAM:175, TTWO:170,
  // Communication Services
  META:575, GOOGL:178, GOOG:178, NFLX:700, DIS:100, T:21, CMCSA:37,
  VZ:42,    CHTR:345,  TMUS:245, WBD:8,    LYV:95,   OMC:87, // PARA removed: delisted
  // Consumer Discretionary
  AMZN:195, TSLA:250, HD:345,  MCD:305, NKE:62,  SBUX:88,  TJX:115,
  LOW:235,  BKNG:4500,CMG:54,  ABNB:125, YUM:130, F:11,     GM:47,
  RIVN:11,  EBAY:62,  ETSY:52, APTV:55, MGM:28,   WYNN:90,  ROST:145,
  DRI:155,  MHK:115,  NCLH:20, CCL:18,  RCL:115,  HLT:225,  MAR:240,
  // Consumer Staples
  PG:165,  KO:65,  PEP:145, COST:920, WMT:95, MDLZ:60, PM:130,
  MO:52,   CL:90,  EL:65,   GIS:59,   K:75,   CAG:25,  CPB:30,
  HSY:165, SJM:105, MNST:55, CHD:98,  CLX:140, HRL:30, TSN:57,
  MKC:71,  SFM:35,  BJ:82,
  // Healthcare
  UNH:585, JNJ:155, LLY:745, ABBV:195, MRK:125, ABT:118, TMO:530,
  DHR:210, BMY:48,  AMGN:295, GILD:88, REGN:775, VRTX:450, ISRG:560,
  SYK:355, BSX:92,  MRNA:42,  PFE:27,  CI:325,   CVS:58,  HCA:320,
  MCK:640, MOH:285, ELV:375,  HUM:295, ZBH:115,  BAX:22,  BDX:195,
  // Financials
  JPM:220, V:315,  MA:530, BAC:42,  WFC:67,  GS:555, MS:115,
  BLK:950, SCHW:77, AXP:285, C:65,   USB:42,  PNC:170, TFC:38,
  COF:175, FITB:38, HBAN:15, KEY:16,  RF:22,   CFG:40,  ZION:44,
  MTB:180, CMA:48,  ALLY:34, DFS:165, SYF:52,  CINF:145, L:75,
  PRU:115, MET:72,  AFL:90,  ALL:175, AIG:75,  PGR:235, TRV:225,
  CB:255,  MMC:215, AON:350, WTW:295, ICE:145, CME:225, NDAQ:72,
  SPGI:465, MCO:405, IVZ:15, BEN:20,
  // Energy
  XOM:105, CVX:145, COP:110, EOG:118, SLB:38,  OXY:45,  DVN:34,
  MPC:150, PSX:130, VLO:135, HES:140, HAL:28,  BKR:35,  FANG:175,
  APA:22,  MRO:25,  PXD:220,
  // Materials
  LIN:470, APD:295, ECL:225, NEM:48,  FCX:42,  NUE:105, CF:77,
  MOS:26,  ALB:78,  PPG:115, SHW:325, EMN:75,  CE:88,   PKG:195,
  IP:47,   WRK:42,  SEE:32,
  // Industrials
  HON:225, GE:175,  RTX:125, LMT:480, BA:175,  CAT:360, DE:365,
  UPS:105, FDX:225, EMR:115, ETN:330, PH:610,  FAST:72, ROK:270,
  GD:285,  NOC:525, MMM:115, GWW:940, IEX:210, XYL:118, PWR:255,
  FTV:70,  NDSN:225, SWK:68, IR:85,   DOV:175, AME:170, TDG:1200,
  CARR:68, OTIS:90, ROP:540, VRSK:265, CPRT:56, CTAS:175,
  // Real Estate
  PLD:112, AMT:182, CCI:98,  EQIX:835, SPG:165, PSA:295, WY:35,
  ARE:105, BXP:73,  O:55,    VTR:55,   WELL:115, DLR:142,
  // Utilities
  NEE:72,  DUK:112, SO:92,  AEP:96,  EXC:38,  SRE:75,  D:47,
  AES:14,  ES:84,   EIX:78,  PCG:18,  XEL:58,  WEC:92,  CMS:65,
  ETR:82,  PPL:28,  EVRG:55, NI:28,   ATO:120, LNT:55,
};

// ── Synthetic candle generation (memoised) ────────────────────────────────
// FIX: module-level cache makes hot-path O(1) for repeated runFullScan calls

const _candleCache = new Map<string, OHLCBar[]>();

export function generateCandles(ticker: string, bars = 120): OHLCBar[] {
  const cacheKey = `${ticker}:${bars}`;
  const hit = _candleCache.get(cacheKey);
  if (hit) return hit;

  const seed = tickerSeed(ticker);
  const rng = new LCG(seed);

  // FIX: use realistic ticker-specific price; apply ±5% deterministic noise
  const knownPrice = APPROX_PRICES[ticker];
  const noise = ((seed % 100) / 100 - 0.5) * 0.1; // ±5%, seeded
  const basePrice = knownPrice
    ? Math.max(1, knownPrice * (1 + noise))
    : Math.max(5, 5 + (seed % 195)); // $5–$200 fallback for unknown tickers

  const dailyVol = 0.008 + (seed % 35) / 1000;
  const drift = -0.0008 + (seed % 55) / 35000;
  const avgVolume = 500_000 + (seed % 200_000_000);

  let price = basePrice;
  const candles: OHLCBar[] = [];

  for (let i = 0; i < bars; i++) {
    const dayReturn = drift + (rng.next() - 0.5) * 2 * dailyVol;
    const open = price;
    const close = Math.max(0.01, price * (1 + dayReturn));
    const hlRange = Math.max(open, close) * dailyVol * (0.4 + rng.next() * 1.6);
    const high = Math.max(open, close) + hlRange * rng.next();
    const low = Math.min(open, close) - hlRange * rng.next();
    const volume = avgVolume * (0.4 + rng.next() * 1.2);

    candles.push({
      open: +open.toFixed(4),
      high: +high.toFixed(4),
      low: +low.toFixed(4),
      close: +close.toFixed(4),
      volume: Math.round(volume),
    });
    price = close;
  }

  _candleCache.set(cacheKey, candles);
  return candles;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function r2(n: number) { return Math.round(n * 100) / 100; }

/**
 * Cap a take-profit level so it cannot exceed entry × (1 + maxGainPct).
 * Prevents inflated returns from extreme ATR-based or Fibonacci projections.
 * Default cap: 40% above entry for TP1, 80% above entry for TP2.
 * This also protects against nearestResistance returning distant swing highs.
 */
function capTP(tp: number, entry: number, maxGainPct = 0.40): number {
  const maxTP = entry * (1 + maxGainPct);
  return r2(Math.min(tp, maxTP));
}

function macdLabel(
  histogram: number[],
  macdLine: number[]
): "Bullish" | "Neutral" | "Bearish" {
  const n = macdLine.length;
  const hist = histogram[n - 1];
  const mac = macdLine[n - 1];
  if (hist > 0 && mac > 0) return "Bullish";
  if (hist < 0 && mac < 0) return "Bearish";
  return "Neutral";
}

/** ATR-based SL: entry - 1.5 × ATR, capped at 5% below entry */
function atrStop(entry: number, atrVal: number): number {
  const raw = entry - 1.5 * atrVal;
  const cap = entry * 0.95;
  return r2(Math.max(raw, cap));
}

/** Swing-low SL: tightest swing low below price, or ATR fallback */
function swingStop(bars: OHLCBar[], entry: number, atrVal: number): number {
  const sup = nearestSupport(bars, entry, 3);
  if (sup !== null && sup > entry * 0.9) return r2(sup * 0.995);
  return atrStop(entry, atrVal);
}

/** EMA-based SL: 1% below the reference EMA */
function emaStop(emaVal: number): number {
  return r2(emaVal * 0.99);
}

/** Fibonacci extension TP: recentLow → recentHigh projected forward.
 *  FIX: guard against zero range (all 40 bars at same price) — fall back to
 *  a percentage-based target so tp2 never collapses to == entry. */
function fibTP(bars: OHLCBar[], from: number, mult: number): number {
  const lookback = bars.slice(-40);
  const lo = Math.min(...lookback.map((b) => b.low));
  const hi = Math.max(...lookback.map((b) => b.high));
  const range = hi - lo;
  if (range < from * 0.001) return r2(from * (1 + 0.05 * mult));
  return r2(from + range * mult);
}

/** Confidence score 0–100 based on how cleanly conditions are met */
function confidence(scores: number[]): number {
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  if (!Number.isFinite(avg)) return 50;
  return Math.min(95, Math.max(40, Math.round(avg)));
}

/** Status from whether current price is near/past entry.
 *  FIX: was using Math.random() — replaced with deterministic seed value so
 *  the same ticker always produces the same status (prevents hydration
 *  mismatches and status flicker on re-render). */
function setupStatus(
  currentPrice: number,
  entry: number,
  stopLoss: number,
  seed: number,
): StockSetupStatus {
  const r = (seed % 1000) / 1000; // deterministic 0–1
  if (currentPrice <= stopLoss) return "Failed";
  if (currentPrice >= entry * 1.01) return r < 0.4 ? "Triggered" : "Waiting";
  if (currentPrice >= entry * 0.98) return r < 0.3 ? "Triggered" : "Waiting";
  return "Waiting";
}

// Reason templates per setup type
const REASONS: Record<StockSetupType, (t: string, rsi: number, ema: string) => string> = {
  "Momentum Breakout": (t, rsi, ema) =>
    `${t} is trading above ${ema} with RSI at ${rsi} — momentum is building without being overbought. Volume is confirming the move. Entry is only valid on a close above the entry level with expanding volume.`,
  "Pullback Buy": (t, rsi, ema) =>
    `${t} is pulling back to the ${ema} in a healthy reset. RSI at ${rsi} shows cooling without becoming bearish. Entry is valid if price confirms strength above the trigger level.`,
  "Oversold Bounce": (t, rsi, ema) =>
    `${t} has reached oversold territory with RSI at ${rsi}. Price is near a key support level. A reversal candle with volume is needed before the entry becomes actionable. First target is the ${ema}.`,
  "Trend Continuation": (t, rsi, ema) =>
    `${t} is holding above all major EMAs with MACD confirming bullish momentum. RSI at ${rsi} is constructive. The cleanest entry is a controlled push through the trigger with ${ema} acting as a dynamic floor.`,
};

const BULLISH: Record<StockSetupType, string[]> = {
  "Momentum Breakout": [
    "Price above 50 EMA and 200 EMA",
    "RSI in momentum zone without overbought",
    "Volume exceeding 20-day average by 1.5×+",
  ],
  "Pullback Buy": [
    "Long-term uptrend intact above 200 EMA",
    "RSI cooled into constructive reset zone",
    "Price holding near rising short-term EMA",
  ],
  "Oversold Bounce": [
    "RSI deeply oversold below 32",
    "Price near identifiable support level",
    "Elevated volume suggests capitulation",
  ],
  "Trend Continuation": [
    "Price above 20, 50, and 200 EMA",
    "MACD histogram positive and rising",
    "Higher lows pattern intact",
  ],
};

const RISK: Record<StockSetupType, string[]> = {
  "Momentum Breakout": [
    "Breakout failure can trap buyers quickly",
    "Volume must sustain or setup weakens",
    "Sector rotation can reverse momentum",
  ],
  "Pullback Buy": [
    "EMA support may not hold on macro pressure",
    "A failed reclaim leaves room for deeper pullback",
    "Stop must be respected if key level breaks",
  ],
  "Oversold Bounce": [
    "Oversold can become more oversold in downtrends",
    "Confirmation candle is required before entry",
    "Bounce may only reach first resistance before fading",
  ],
  "Trend Continuation": [
    "Break below 20 EMA would invalidate setup",
    "Relative volume must confirm the move",
    "Sector sympathy can pressure even strong charts",
  ],
};

// ── Post-generation validation (long trades only) ─────────────────────────
// FIX: all four setup blocks previously pushed unconditionally; invalid
// setups (sl ≥ entry, tp1 ≤ entry, rr ≤ 0 / NaN) now get rejected here.

function isValidSetup(s: StockSetup): boolean {
  if (!Number.isFinite(s.entryPrice) || s.entryPrice <= 0) return false;
  if (!Number.isFinite(s.stopLoss)   || s.stopLoss  <= 0) return false;
  if (!Number.isFinite(s.takeProfit1)|| s.takeProfit1 <= 0) return false;
  if (s.stopLoss  >= s.entryPrice)   return false; // SL must be below entry
  if (s.takeProfit1 <= s.entryPrice) return false; // TP1 must be above entry
  if (!Number.isFinite(s.riskReward) || s.riskReward <= 0) return false;
  if (!Number.isFinite(s.confidenceScore) || s.confidenceScore < 0) return false;
  return true;
}

// ── Core scanner ──────────────────────────────────────────────────────────

export function scanTicker(
  info: TickerInfo,
  overridePrice?: number,
  /** Real historical candles from Finnhub/Polygon. When provided, synthetic
   *  generation is skipped and indicators/levels use real market data. */
  realCandles?: OHLCBar[],
  candleSource: "real" | "delayed" | "mock" = "mock",
): StockSetup[] {
  const seed = tickerSeed(info.ticker);

  // Use real candles if provided and at least minimally usable (≥ 20 bars); else synthetic.
  // Flag as insufficientData when real bars are available but < 200 (EMA 200 unreliable).
  const useReal        = realCandles && realCandles.length >= 20;
  const rawBars        = useReal ? realCandles! : generateCandles(info.ticker, 120);
  const actualSource: "real" | "delayed" | "mock" = useReal ? candleSource : "mock";
  const barCount       = useReal ? realCandles!.length : 0;
  const insufficientData = useReal ? realCandles!.length < MIN_BARS_SUFFICIENT : false;

  const closes      = rawBars.map((b) => b.close);
  const currentPrice= overridePrice ?? closes[closes.length - 1];

  // Recenter candles around live price when quote override is available.
  // For real candles the last close IS the market price, so ratio ≈ 1 when
  // the live quote is fresh — minor rounding only.
  let pricedBars = rawBars;
  if (overridePrice !== undefined) {
    const lastClose = closes[closes.length - 1];
    if (lastClose > 0 && Math.abs(overridePrice / lastClose - 1) > 0.001) {
      const ratio = overridePrice / lastClose;
      pricedBars = rawBars.map((b) => ({
        open: b.open * ratio,
        high: b.high * ratio,
        low:  b.low  * ratio,
        close:b.close* ratio,
        volume: b.volume,
      }));
    }
  }

  const pricedCloses = pricedBars.map((b) => b.close);

  // Indicators
  const ema20v = ema(pricedCloses, 20);
  const ema50v = ema(pricedCloses, 50);
  const ema200v = ema(pricedCloses, 200);
  const rsiV = calcRsi(pricedCloses);
  const atrV = atr(pricedBars);
  const { macdLine, histogram } = calcMacd(pricedCloses);
  const volRatio = calcVolRatio(pricedBars);

  const lastEma20 = ema20v[ema20v.length - 1];
  const lastEma50 = ema50v[ema50v.length - 1];
  const lastEma200 = ema200v[ema200v.length - 1];
  const lastRsi = Math.round(rsiV[rsiV.length - 1]);
  const lastAtr = atrV[atrV.length - 1];
  const macdStatus = macdLabel(histogram, macdLine);

  const avgVolume = pricedBars.slice(-21, -1).reduce((s, b) => s + b.volume, 0) / 20;

  const results: StockSetup[] = [];

  // ── MOMENTUM BREAKOUT ─────────────────────────────────────────────────
  if (
    currentPrice > lastEma50 &&
    currentPrice > lastEma200 &&
    lastRsi >= 48 && lastRsi <= 73 &&
    volRatio >= 1.15
  ) {
    const entry = r2(currentPrice * 1.003);
    const sl = atrStop(entry, lastAtr);
    const risk = entry - sl;
    const resist = nearestResistance(pricedBars, entry, 3);
    const tp1 = capTP(resist !== null && resist > entry + risk * 1.5
      ? r2(resist)
      : r2(entry + risk * 2), entry, 0.40);
    const tp2 = capTP(fibTP(pricedBars, entry, 0.618), entry, 0.60);
    const rr = r2((tp1 - entry) / risk);
    const conf = confidence([
      60 + (lastRsi - 50) * 2,
      Math.min(100, volRatio * 50),
      (currentPrice / lastEma50 - 1) > 0.03 ? 80 : 65,
    ]);
    results.push({
      ticker: info.ticker,
      companyName: info.name,
      currentPrice: r2(currentPrice),
      setupType: "Momentum Breakout",
      entryPrice: entry,
      stopLoss: sl,
      slMethod: "1.5× ATR",
      takeProfit1: tp1,
      tp1Method: resist !== null ? "nearest resistance" : "2:1 RR",
      takeProfit2: tp2,
      tp2Method: "0.618 fib ext",
      riskReward: rr,
      confidenceScore: conf,
      reason: REASONS["Momentum Breakout"](info.ticker, lastRsi, "50 EMA"),
      status: setupStatus(currentPrice, entry, sl, seed),
      bullishFactors: BULLISH["Momentum Breakout"],
      riskFactors: RISK["Momentum Breakout"],
      indicators: {
        rsi: lastRsi,
        ema20: r2(lastEma20),
        ema50: r2(lastEma50),
        ema200: r2(lastEma200),
        macd: macdStatus,
        volume: pricedBars[pricedBars.length - 1].volume,
        avgVolume: Math.round(avgVolume),
      },
      atr: r2(lastAtr),
      volRatio: r2(volRatio),
      candleSource: actualSource,
      insufficientData,
      barCount: barCount || undefined,
    });
  }

  // ── PULLBACK BUY ──────────────────────────────────────────────────────
  // nearEma20 fires when price is within 4% of EMA20 in EITHER direction,
  // so EMA20 can be above currentPrice. emaStop(refEma) = refEma * 0.99 can
  // then exceed entry = currentPrice * 1.005 → sl > entry → negative risk.
  // FIX: compute sl then skip the setup entirely when sl >= entry.
  const nearEma20 = Math.abs(currentPrice - lastEma20) / currentPrice < 0.04;
  const nearEma50 = Math.abs(currentPrice - lastEma50) / currentPrice < 0.055;
  if (
    currentPrice > lastEma200 &&
    (nearEma20 || nearEma50) &&
    lastRsi >= 35 && lastRsi <= 60
  ) {
    const entry = r2(currentPrice * 1.005);
    const refEma = nearEma20 ? lastEma20 : lastEma50;
    const sl = r2(Math.max(emaStop(refEma), swingStop(pricedBars, entry, lastAtr)));
    if (sl < entry) { // FIX: reject when EMA is above entry → inverted setup
      const risk = entry - sl;
      const resist = nearestResistance(pricedBars, entry, 3);
      const tp1 = capTP(resist !== null && resist > entry + risk * 1.8
        ? r2(resist)
        : r2(entry + risk * 2.5), entry, 0.35);
      const tp2 = capTP(fibTP(pricedBars, entry, 1.0), entry, 0.60);
      const rr = r2((tp1 - entry) / risk);
      const conf = confidence([
        70 + (56 - lastRsi) * 1.5,
        nearEma20 ? 80 : 70,
        currentPrice > lastEma200 ? 75 : 55,
      ]);
      results.push({
        ticker: info.ticker,
        companyName: info.name,
        currentPrice: r2(currentPrice),
        setupType: "Pullback Buy",
        entryPrice: entry,
        stopLoss: sl,
        slMethod: nearEma20 ? "below EMA20" : "below EMA50",
        takeProfit1: tp1,
        tp1Method: resist !== null ? "nearest resistance" : "2.5:1 RR",
        takeProfit2: tp2,
        tp2Method: "1.0 fib ext",
        riskReward: rr,
        confidenceScore: conf,
        reason: REASONS["Pullback Buy"](info.ticker, lastRsi, nearEma20 ? "20 EMA" : "50 EMA"),
        status: setupStatus(currentPrice, entry, sl, seed),
        bullishFactors: BULLISH["Pullback Buy"],
        riskFactors: RISK["Pullback Buy"],
        indicators: {
          rsi: lastRsi,
          ema20: r2(lastEma20),
          ema50: r2(lastEma50),
          ema200: r2(lastEma200),
          macd: macdStatus,
          volume: pricedBars[pricedBars.length - 1].volume,
          avgVolume: Math.round(avgVolume),
        },
        atr: r2(lastAtr),
        volRatio: r2(volRatio),
        candleSource: actualSource,
      });
    } // end sl < entry guard
  }

  // ── OVERSOLD BOUNCE ───────────────────────────────────────────────────
  if (lastRsi <= 36 && volRatio >= 1.1) {
    const entry = r2(currentPrice * 1.012);
    // FIX: was swingStop(pricedBars, currentPrice, lastAtr) — anchor mismatch
    // caused sl to be computed relative to currentPrice while risk = entry - sl.
    // A swing low between currentPrice and entry would set sl above entry.
    const sl = swingStop(pricedBars, entry, lastAtr);
    const risk = entry - sl;
    const tp1 = capTP(lastEma20 > entry
      ? r2(lastEma20)
      : r2(entry + risk * 2), entry, 0.30);
    const tp2 = capTP(lastEma50 > entry
      ? r2(lastEma50)
      : fibTP(pricedBars, entry, 0.5), entry, 0.50);
    const rr = r2((tp1 - entry) / risk);
    const conf = confidence([
      Math.min(90, 90 - (lastRsi - 20) * 2),
      Math.min(90, volRatio * 50),
      55,
    ]);
    results.push({
      ticker: info.ticker,
      companyName: info.name,
      currentPrice: r2(currentPrice),
      setupType: "Oversold Bounce",
      entryPrice: entry,
      stopLoss: sl,
      slMethod: "swing low",
      takeProfit1: tp1,
      tp1Method: lastEma20 > entry ? "EMA20" : "2:1 RR",
      takeProfit2: tp2,
      tp2Method: lastEma50 > entry ? "EMA50" : "0.5 fib ext",
      riskReward: rr,
      confidenceScore: conf,
      reason: REASONS["Oversold Bounce"](info.ticker, lastRsi, "20 EMA"),
      status: setupStatus(currentPrice, entry, sl, seed),
      bullishFactors: BULLISH["Oversold Bounce"],
      riskFactors: RISK["Oversold Bounce"],
      indicators: {
        rsi: lastRsi,
        ema20: r2(lastEma20),
        ema50: r2(lastEma50),
        ema200: r2(lastEma200),
        macd: macdStatus,
        volume: pricedBars[pricedBars.length - 1].volume,
        avgVolume: Math.round(avgVolume),
      },
      atr: r2(lastAtr),
      volRatio: r2(volRatio),
      candleSource: actualSource,
      insufficientData,
      barCount: barCount || undefined,
    });
  }

  // ── TREND CONTINUATION ────────────────────────────────────────────────
  const lastHist = histogram[histogram.length - 1];
  // FIX: when histogram has fewer than 5 bars, negative index returns
  // undefined and ?? 0 fires — macdIncreasing compared against 0 instead of
  // a real prior bar.  Use length >= 5 guard before accessing the slot.
  const prevHist = histogram.length >= 5 ? (histogram[histogram.length - 5] ?? 0) : 0;
  const macdIncreasing = lastHist > prevHist && histogram.length >= 5;
  if (
    currentPrice > lastEma20 &&
    currentPrice > lastEma50 &&
    currentPrice > lastEma200 &&
    macdLine[macdLine.length - 1] > 0 &&
    lastRsi >= 48 && lastRsi <= 76 &&
    macdIncreasing
  ) {
    const entry = r2(currentPrice * 1.002);
    const sl = emaStop(lastEma20);
    const risk = entry - sl;
    const resist = nearestResistance(pricedBars, entry, 3);
    const tp1 = capTP(resist !== null && resist > entry + risk * 1.6
      ? r2(resist)
      : r2(entry + risk * 2), entry, 0.35);
    const tp2 = capTP(fibTP(pricedBars, entry, 1.618), entry, 0.70);
    const rr = r2((tp1 - entry) / risk);
    // FIX: previous formula `macdLine[last] / (currentPrice * 0.01) * 5` was
    // unbounded — a near-zero synthetic price made the divisor → 0, producing
    // Infinity/NaN in the confidence badge.  Clamp the contribution to ±25.
    const macdNorm = currentPrice > 0
      ? Math.min(25, Math.max(-25, (macdLine[macdLine.length - 1] / currentPrice) * 500))
      : 0;
    const conf = confidence([
      70 + macdNorm,
      60 + (lastRsi - 50),
      macdIncreasing ? 80 : 65,
    ]);
    results.push({
      ticker: info.ticker,
      companyName: info.name,
      currentPrice: r2(currentPrice),
      setupType: "Trend Continuation",
      entryPrice: entry,
      stopLoss: sl,
      slMethod: "below EMA20",
      takeProfit1: tp1,
      tp1Method: resist !== null ? "swing high" : "2:1 RR",
      takeProfit2: tp2,
      tp2Method: "1.618 fib ext",
      riskReward: rr,
      confidenceScore: conf,
      reason: REASONS["Trend Continuation"](info.ticker, lastRsi, "20 EMA"),
      status: setupStatus(currentPrice, entry, sl, seed),
      bullishFactors: BULLISH["Trend Continuation"],
      riskFactors: RISK["Trend Continuation"],
      indicators: {
        rsi: lastRsi,
        ema20: r2(lastEma20),
        ema50: r2(lastEma50),
        ema200: r2(lastEma200),
        macd: macdStatus,
        volume: pricedBars[pricedBars.length - 1].volume,
        avgVolume: Math.round(avgVolume),
      },
      atr: r2(lastAtr),
      volRatio: r2(volRatio),
      candleSource: actualSource,
      insufficientData,
      barCount: barCount || undefined,
    });
  }

  // FIX: reject any setup that violates long-trade invariants before surfacing
  return results.filter(isValidSetup);
}

export function runFullScan(
  tickers:     TickerInfo[],
  livePrices:  Map<string, number> = new Map(),
  realCandles: Map<string, OHLCBar[]> = new Map(),
  candleSources: Map<string, "real" | "delayed" | "mock"> = new Map(),
): StockSetup[] {
  const results: StockSetup[] = [];
  for (const info of tickers) {
    const price   = livePrices.get(info.ticker);
    const candles = realCandles.get(info.ticker);
    const source  = candleSources.get(info.ticker) ?? "mock";
    const setups  = scanTicker(info, price, candles, source);
    results.push(...setups);
  }
  return results;
}

export function getTickerList(universe: string): TickerInfo[] {
  switch (universe) {
    case "nasdaq100": return NASDAQ100;
    case "russell2000": return RUSSELL2000;
    case "sp500":
    default: return SP500;
  }
}
