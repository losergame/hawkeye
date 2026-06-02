# Scanner Feature

## What It Does

Scans stock universes (S&P 500, NASDAQ 100, Russell 2000) for 4 bullish technical setups using OHLC candle data and live prices. Returns scored, ranked results.

---

## Setup Types

| Setup | Entry Condition | Stop Loss Method | TP1 Method |
|---|---|---|---|
| **Momentum Breakout** | Price > EMA50 > EMA200, RSI 48–73, volRatio ≥ 1.15 | 1.5× ATR below entry | Nearest resistance or 2:1 RR |
| **Pullback Buy** | Price > EMA200, near EMA20 or EMA50 (±4%), RSI 35–60 | Below EMA20 or EMA50 (whichever is reference) | Nearest resistance or 2.5:1 RR |
| **Oversold Bounce** | RSI ≤ 36, volRatio ≥ 1.1 | Swing low | EMA20 (if above entry) or 2:1 RR |
| **Trend Continuation** | Price > EMA20 > EMA50 > EMA200, MACD > 0 + increasing, RSI 48–76 | Below EMA20 (×0.99) | Swing high or 2:1 RR |

**TP2**: Always a Fibonacci extension (0.618 for Momentum, 1.0 for Pullback, 0.5 for Oversold, 1.618 for Trend Continuation).

**TP caps**: TP1 capped at +35–40% above entry; TP2 capped at +60–70%. Prevents unrealistic levels from wide ATR.

---

## Scoring System (0–100)

| Component | Max Points | Logic |
|---|---|---|
| Trend | 25 | +10 price > EMA200, +8 price > EMA50, +7 price > EMA20 |
| Momentum | 20 | RSI 50–65 = 15pts, MACD bullish = +5 |
| Volume | 15 | volRatio ≥ 2.5 = 15pts, scales down |
| Relative Strength | 15 | Confidence score proxy (≥85 = 15pts) |
| Risk/Reward | 15 | RR ≥ 4.0 = 15pts, scales down |
| Market Regime | 10 | Regime fit bonus (risk-on = 10 for aggressive setups) |

Minimum score to appear in Top 5: 65/100. Minimum RR: 1.5. Minimum confidence: 60%.

---

## Market Regime Detection

Computed from aggregate of all scanned setups:

| Regime | Condition |
|---|---|
| `risk-on` | Avg RSI > 58, >48% aggressive setups, avg volRatio > 1.2 |
| `high-volatility` | Avg volRatio > 1.8, mixed aggressive/defensive |
| `defensive` | Avg RSI < 42 or >38% oversold bounce setups |
| `neutral` | Everything else |

In `defensive` regime, Momentum Breakout and Trend Continuation scores are multiplied by 0.9.

---

## Technical Indicators Used

All computed in `src/lib/indicators.ts` on `OHLCBar[]`:

| Indicator | Implementation |
|---|---|
| RSI | Wilder's smoothed RSI (14-period) |
| EMA | Standard EMA (20, 50, 200 periods) |
| ATR | Wilder's ATR (14-period) |
| MACD | EMA(12) - EMA(26), signal EMA(9), histogram |
| Volume Ratio | `currentVolume / avg(last 20 bars volume)` |
| Swing High/Low | Searches last N bars for local extremes |
| Nearest Resistance | Finds nearest swing high above current price |
| Nearest Support | Finds nearest swing low below current price |

---

## Candle Data Priority

1. **Cached real candles** (`getCachedReal`) — 4-hour TTL, Finnhub daily bars
2. **Fetched real candles** — `getRealCandles()` makes API call + caches
3. **Synthetic candles** — only when `allowSyntheticData = true`

When `allowSyntheticData = false` (default): tickers without cached real candles are **skipped entirely**. A background `prefetchTickers()` call warms the cache for missing tickers.

---

## Universe Composition

| Universe | Tickers | Notes |
|---|---|---|
| S&P 500 | 503 | PARA removed (delisted) |
| NASDAQ 100 | 100 | Significant overlap with S&P 500 |
| Russell 2000 | ~2000 | AIRC, EVERI removed (delisted) |

Total unique: ~2200+ (after cross-universe dedup). Scanner deduplicates by ticker when combining universes for paper trading.

---

## Dead Ticker Protection

Multi-layer:
1. `DEAD_TICKERS` Set in `scanner-engine.ts` — 12 confirmed delisted tickers blacklisted
2. Zero-quote filter (`isValidQuote(price)` — rejects price ≤ 0)
3. Min price filter (`MIN_TRADEABLE_PRICE = $3.00` for scanner output)
4. Removed from universe files (PARA from sp500.ts, AIRC/EVERI from russell2000.ts)

---

## Setup Validation (Hard Rules)

Before any setup is returned, `isValidSetup()` rejects it if:
- `entryPrice ≤ 0` or not finite
- `stopLoss ≥ entryPrice` (inverted — would be a short, not long)
- `takeProfit1 ≤ entryPrice` (inverted)
- `riskReward ≤ 0` or NaN

---

## API Response Fields

Key fields in `candleCoverage` object:
```
realCount, syntheticCount, uncachedCount, totalTickers
realPct, syntheticPct
allowSynthetic
realScanned, syntheticScanned, skippedCount
```

---

## Active Preset Override

If `activePresetScope` in AppSettings includes `"scanner"`:
- `minScannerScore` — minimum composite score filter
- `minConfidence` — minimum confidence % filter
- `setupTypesAllowed` — pipe-delimited allowed types
- `excludedTickers` — pipe-delimited blacklisted tickers

These override the default thresholds at query time, not at scan time (applied after scanning, before pagination).
