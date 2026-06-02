# File Map — Key Files and What They Do

## Core Libraries (`src/lib/`)

| File | Purpose |
|---|---|
| `scanner-engine.ts` | Pure scanner logic. `scanTicker()`, `runFullScan()`, `generateCandles()` (LCG synthetic), `DEAD_TICKERS` blacklist, `APPROX_PRICES`, `MIN_TRADEABLE_PRICE`. No I/O. |
| `scanner-scoring.ts` | 6-component scoring (trend/momentum/volume/RS/RR/regime), market regime detection, `getTopFiveSetups()`, `validateForTopFive()`. |
| `paper-trading.ts` | Paper trading engine. `runCycle()` (Step1: eval TP/SL, Step2: buy). All risk constants. `makeDefaultAccount()`, `calculatePositionSize()`. No I/O. |
| `paper-analytics.ts` | Analytics computations: `computeAnalytics()`, `computeRealismScore(realCandlePct)`, `computeFillQualityMetrics()`, `computeFullDataIntegrity()`, `sanitizeTrades()`. |
| `real-candles.ts` | Finnhub → Polygon candle fetcher. 4-hour cache for real data, 5-min for failures. `getRealCandles()` (fetches), `getCachedReal()` (cache-only), `getCandleCoverage()`, `prefetchTickers()`. |
| `indicators.ts` | Technical indicators: `rsi()`, `ema()`, `atr()`, `macd()`, `volumeRatio()`, `nearestSupport()`, `nearestResistance()`. All pure functions on `OHLCBar[]`. |
| `google-sheets.ts` | Google Sheets client. Auth, CRUD helpers (`getSheetRows`, `appendRows`, `replaceAllRows`), 30-sec read cache, `readSetting()`/`writeSetting()` for AppSettings KV store, `invalidateSheetCache()`. |
| `types.ts` | All shared TypeScript interfaces: `StockSetup`, `StockSetupType`, `StockSetupStatus`, `PaperAccount`, etc. |
| `signal-tracker.ts` | Signal lifecycle: `createSignal()`, `evaluateSignal()`, `applyDemoSimulation()`, `computeStats()`. localStorage key: `hawkeye-signals-v1`. |
| `market-hours.ts` | `isMarketOpen()` — NYSE hours check with timezone handling. |
| `discord-notify.ts` | Discord webhook helpers: `notifyPaperBuy()`, `notifyPaperSell()`, `notifyStopLossHit()`, `notifyManualClose()`, `notifyRulePresetChange()`. |
| `paper-trading.ts` | Key constants: `BUY_SLIPPAGE_PCT = 0.001`, `SELL_SLIPPAGE_PCT = 0.001`, `MIN_PRICE_FOR_PAPER_TRADE = 5.00`, `MIN_DAILY_VOLUME = 500_000`, `MAX_POSITIONS = 3`, `TICKER_COOLDOWN_MINUTES = 30`. |
| `sheets-formatting.ts` | `applyPaperTradingFormatting()` — sets Google Sheets conditional format rules (win=green row, loss=red row, P&L colors). |
| `cn.ts` | `cn()` utility — `clsx + tailwind-merge`. |

### Ticker Lists (`src/lib/tickers/`)

| File | Contents |
|---|---|
| `sp500.ts` | 503 S&P 500 tickers (PARA removed — delisted) |
| `nasdaq100.ts` | 100 NASDAQ 100 tickers |
| `russell2000.ts` | ~2000 Russell 2000 tickers (AIRC, EVERI removed — delisted) |

---

## API Routes (`src/app/api/`)

### Scanner
| Route | Method | Purpose |
|---|---|---|
| `/api/scanner` | GET | Main scan endpoint. Reads `allowSyntheticData` setting. Returns results + `candleCoverage` stats. |
| `/api/scanner/prefetch` | GET | Returns coverage snapshot per universe (no API calls). |
| `/api/scanner/prefetch` | POST | Triggers background candle warm-up. Rate-limited 40 req/min. |
| `/api/scanner/universe-audit` | GET | Dead ticker audit per universe. |

### Paper Trading
| Route | Method | Purpose |
|---|---|---|
| `/api/paper/run` | POST | **Main paper trading cycle.** FIFO lock prevents concurrent execution. Loads state, runs `runCycle()`, saves, fires Discord. |
| `/api/paper/run` | GET | Returns duplicate position block log (`_dupBlockLog`). |
| `/api/paper/rebuild` | POST | Recalculates account from scratch. Deduplicates positions. Removes suspicious trades (>100% gain or <-80% loss). |
| `/api/paper/reset` | POST | Wipes PaperPositions, PaperTrades, PaperEquityCurve. Resets account to $1,000. |
| `/api/paper/account` | GET | Current account state. |
| `/api/paper/positions` | GET | All open positions. |
| `/api/paper/positions/close` | POST | Manually close a position. |
| `/api/paper/trades` | GET/POST | Closed trades list. |
| `/api/paper/equity` | GET | Equity curve points. |

### Sheets / Settings
| Route | Method | Purpose |
|---|---|---|
| `/api/sheets/setup` | POST | Initialize all sheets, apply conditional formatting. |
| `/api/sheets/settings` | GET/POST | Read/write single AppSettings key-value. |
| `/api/sheets/diagnostics` | GET/POST | Google Sheets connectivity test. POST also inits paper sheets. |
| `/api/sheets/format` | POST | Re-apply conditional formatting only. |
| `/api/sheets/signals` | GET/POST/PATCH | Signal CRUD — deduplicates by `ticker::setupType` on write. |
| `/api/sheets/watchlist` | GET/POST | Watchlist from Sheets. |

### Market Data
| Route | Method | Purpose |
|---|---|---|
| `/api/quote/[symbol]` | GET | Live price from Finnhub. Cached 30s. |
| `/api/stocks/[symbol]` | GET | Full stock quote + metadata. |
| `/api/stocks/search` | GET | Ticker search. |

---

## Hooks (`src/hooks/`)

| Hook | Purpose |
|---|---|
| `usePaperTrader.ts` | Central paper trading state. 30-sec price check loop (signals:[]), 5-min auto-trade loop, `executeTopPick()`, `closePosition()`. Has FIFO lock awareness via `isRunning` gate. |
| `useSignalTracker.ts` | Signal lifecycle. Loads from Sheets → localStorage fallback. Deduplicates by ID on load. No longer calls `sheetsCreate` on every load (fixed). |
| `useMarketHours.ts` | Market hours state + `allowOutsideHours` toggle. |
| `useWatchlist.ts` | Watchlist from `/api/watchlist` with localStorage fallback. |
| `useActivePreset.ts` | Reads active scanner preset from AppSettings. |

---

## Pages (`src/app/`)

| Route | Component | Purpose |
|---|---|---|
| `/` | `DashboardShell` | Main dashboard: live prices, fear&greed, top movers, watchlist |
| `/scanner` | `StockScannerPage` | Full scanner UI with filters, Top 5, signal tracking |
| `/paper` | Paper trader page | Paper trading UI: positions, trades, auto-trade, test mode |
| `/analytics` | `AnalyticsDashboard` | Performance analytics, realism score, data integrity |
| `/portfolio` | Portfolio page | Portfolio tracker |
| `/signals` | Signal performance | Signal history and calibration |
| `/diagnostics` | `SheetsDiagnostics` | Sheets connectivity, candle coverage, universe audit |

---

## Components (`src/components/`)

| Folder | Key Files |
|---|---|
| `dashboard/` | `dashboard-shell.tsx` (main layout + fear/greed/market data), `quote-context-panel.tsx`, `advanced-trading-panel.tsx` |
| `scanner/` | `stock-scanner-page.tsx`, `scanner-table.tsx`, `scanner-filters.tsx`, `stock-setup-card.tsx`, `stock-detail-modal.tsx`, `top-five-setups.tsx`, `badges.tsx` |
| `paper/` | `analytics-dashboard.tsx` |
| `portfolio/` | `portfolio-tracker-panel.tsx`, `portfolio-page.tsx` |
| `signals/` | `signal-performance-dashboard.tsx` |
| `sheets/` | `sheets-diagnostics.tsx` |
| `shared/` | `active-strategy-panel.tsx`, `theme-provider.tsx` |
| `shared/ui/` | `app-nav.tsx`, `hawkeye-logo.tsx`, `index.tsx` |
| `charts/` | `index.tsx` — Recharts wrappers (equity, P&L, volume) |
| `market-data/` | `market-activity-grid.tsx` |

---

## Google Sheets Tabs

| Tab Name | Contents |
|---|---|
| `PaperAccount` | Single row: account stats |
| `PaperPositions` | Open positions (replaced on each run) |
| `PaperTrades` | All closed trades (appended, deduplicated) |
| `PaperEquityCurve` | Equity curve points (appended) |
| `AppSettings` | Key-value store for: `allowSyntheticData`, `activePresetName`, `activePresetScope`, `minScannerScore`, `minConfidence`, `minRiskReward`, `setupTypesAllowed`, `excludedTickers`, `lastCandlePrefetch` |
| `Signals` | Scanner signal history |
| `SignalPerformance` | Signal outcome tracking |
| `Watchlist` | User watchlist |
| `Portfolio` | Portfolio holdings |
| `ScannerHistory` | Historical scan results |
| `DailyTopPicks` | Daily top 5 setups |
| `RulePresets` | Saved scanner rule presets |
