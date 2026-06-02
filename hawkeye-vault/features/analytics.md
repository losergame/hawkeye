# Analytics Dashboard

## Location
`/analytics` → `src/components/paper/analytics-dashboard.tsx`

## Data Sources
Loads on mount from 5 endpoints in parallel:
- `/api/paper/trades` — all closed trades
- `/api/paper/positions` — open positions
- `/api/paper/equity` — equity curve points
- `/api/paper/account` — account stats
- `/api/scanner/prefetch` (GET) — real candle coverage for realism score

---

## Sections

### Data Integrity Panel (top)
`computeFullDataIntegrity(trades)` in `paper-analytics.ts`:
- Dead ticker trades (tickers in `DEAD_TICKERS`)
- Duplicate trade detection (same fingerprint)
- Missing metadata
- Quality score 0–100

Sanitization toggles:
- Remove dead ticker trades
- Remove suspected duplicates
All analytics use `sanitizeTrades(trades, sanitization).trades` as input.

### Core Analytics
`computeAnalytics(trades, equity, openPositionCount)`:
- Win rate, total trades, total P&L, max drawdown
- Avg win %, avg loss %, profit factor
- Best/worst trade, longest win/loss streak

### Confidence Buckets
`computeConfidenceBuckets(trades)` — win rate by confidence score range (50-60, 60-70, 70-80, 80-90, 90+)

### Hold Time Analysis
`computeHoldTimeAnalysis(trades)` — avg hold time, distribution by outcome

### R/R Analysis
`computeRRAnalysis(trades)` — actual R/R vs planned R/R comparison

### Ticker Performance
`computeTickerPerformance(trades)` — per-ticker win rate, P&L, trade count

### Regime Analysis
`computeRegimeAnalysis(trades)` — performance breakdown by market regime (risk-on/neutral/defensive/high-volatility)

### Fill Quality Metrics
`computeFillQualityMetrics(trades)`:
- Total slippage cost ($)
- Avg slippage (%)
- Adverse gap count vs favorable gap count
- Planned R/R vs actual R/R comparison

### Performance Realism Score
`computeRealismScore(realCandlePct)`:
- 11 factors, each weighted
- Dynamic candle quality factor based on live S&P 500 coverage %
- Shows factor-by-factor breakdown with severity badges

### Optimization Suggestions
`generateOptimizationSuggestions(trades)`:
- Analyzes patterns to suggest rule changes
- e.g., "RSI > 60 setups underperform — consider tightening the RSI band"

### Rule Simulator
`simulateRules(trades, filters)`:
- Shows what win rate/P&L would be with different thresholds
- Setup type filter, confidence min, R/R min, RSI range, etc.

### Data Integrity Audit
Full audit report: Scanner health, Paper Trader health, Analytics health scores (0–100 each)

---

## Key Functions in paper-analytics.ts

| Function | Purpose |
|---|---|
| `computeAnalytics()` | Core stats |
| `computeConfidenceBuckets()` | Win rate by confidence band |
| `computeHoldTimeAnalysis()` | Hold time distribution |
| `computeRRAnalysis()` | Risk/reward analysis |
| `computeTickerPerformance()` | Per-ticker breakdown |
| `computeRegimeAnalysis()` | By market regime |
| `computeFillQualityMetrics()` | Slippage + gap stats |
| `computeRealismScore(pct)` | Realism score (now dynamic) |
| `computeFullDataIntegrity()` | Data quality check |
| `sanitizeTrades()` | Filter bad trades for analytics |
| `generateOptimizationSuggestions()` | Rule improvement hints |
| `simulateRules()` | Backtest rule changes |
| `checkDataIntegrity()` | Simple integrity flags |
| `auditUniverse()` | Universe health check |
| `DEAD_TICKERS` | Imported from scanner-engine |
