# Data Flow

## Scanner Pipeline

```
Ticker Universe (sp500 / nasdaq100 / russell2000)
    │
    ├─ Dead ticker filter (DEAD_TICKERS Set in scanner-engine.ts)
    │
    ▼
[allowSyntheticData = false]          [allowSyntheticData = true]
    │                                     │
    ├─ getCachedReal(ticker)               ├─ generateCandles(ticker)   ← LCG synthetic
    │  (cache-only, no API call)           │  (all tickers, fast)
    │                                     │
    ├─ Skip if not cached                 ├─ runFullScan() → all results
    │                                     │
    ├─ Trigger prefetchTickers()          ├─ Top 20 by confidence
    │  (background, 40 req/min)           │
    │                                     ├─ getHistoricalCandles() → Finnhub → Polygon
    ▼                                     │
Only real-candle tickers scanned         ├─ Re-score top 20 with real candles
                                          │
                                          ▼
                                     Merged results (real > synthetic)
    │
    ▼
fetchLivePrices(tickers)    ← Finnhub quote API (max 60 per run)
    │
    ▼
scanTicker(info, livePrice, candles, source)
    │  ← returns StockSetup[] with candleSource: "real"|"delayed"|"mock"
    │
    ▼
[allowSyntheticData = false]  → filter(r => r.candleSource !== "mock")
    │
    ▼
Apply preset filters (from AppSettings: minScore, minConf, setupTypes, excludes)
    │
    ▼
Scanner API response with candleCoverage metrics
```

---

## Paper Trading Cycle

```
usePaperTrader hook
    │
    ├─ 30-second interval (price check only)
    │    signals: []
    │    prices: {ticker: livePrice}  ← Finnhub quotes
    │
    ├─ 5-minute interval (auto-trade, when autoTradeEnabled=true)
    │    signals: [all scanner results from 3 universes]
    │    prices: {}
    │
    └─ executeTopPick() button
         signals: [#1 ranked setup]
         prices: {all open tickers + pick ticker}
    │
    ▼
POST /api/paper/run
    │
    ├─ acquireRunLock()  ← FIFO lock prevents concurrent execution
    │
    ├─ Read allowSyntheticData → filter out mock-candle signals if false
    │
    ├─ invalidateSheetCache(PAPER_POSITIONS)
    │
    ├─ loadPaperState()
    │    ├─ getSheetRows(PAPER_ACCOUNT)
    │    ├─ getSheetRows(PAPER_POSITIONS)  ← always fresh (cache invalidated above)
    │    └─ getSheetRows(PAPER_TRADES)     ← last 60 min for cooldown check
    │
    ├─ Read preset overrides from AppSettings
    │
    ├─ runCycle({ account, openPositions, signals, prices, regime })
    │    ├─ Step 1: Evaluate open positions
    │    │    ├─ SL hit → close at market price (gap risk)
    │    │    └─ TP hit → close at TP1 (limit order)
    │    │
    │    └─ Step 2: Buy qualifying signals (if isRunning)
    │         ├─ heldTickers check (no same-ticker re-entry)
    │         ├─ cooldown check (30 min after any exit)
    │         ├─ confidence, R/R, score thresholds
    │         ├─ $5 min price, 500k ADV liquidity filter
    │         └─ calculatePositionSize (2% risk, 25% max)
    │
    ├─ savePaperState(account, positions, newTrades)
    │    ├─ Layer 2: fresh read + ticker conflict check
    │    ├─ Layer 3: dedup by positionFingerprint (ticker|entry|shares|openedAt_min)
    │    ├─ replaceAllRows(PAPER_POSITIONS, deduped)
    │    ├─ replaceAllRows(PAPER_ACCOUNT, [accountRow])
    │    └─ appendRows(PAPER_TRADES, dedupedNewTrades)
    │         └─ Trade dedup: fingerprint = ticker|buy|sell|shares|openedAt_min|closedAt_min
    │
    ├─ releaseRunLock()
    │
    └─ Discord notifications (after confirmed write)
         ├─ notifyPaperBuy() for new positions
         └─ notifyPaperSell() / notifyStopLossHit() for closed trades
```

---

## Real Candle Cache Flow

```
getRealCandles(ticker, days=120)
    │
    ├─ cacheGet(ticker) → hit (TTL not expired)?
    │    ├─ real data → return bars
    │    └─ synthetic marker → return null
    │
    ├─ Miss → fetchFromApis(ticker, days)
    │    ├─ fetchFinnhubCandles() → bars.length >= 20? → return
    │    └─ fetchPolygonCandles() → bars.length >= 20? → return
    │
    ├─ Success → cacheSet(ticker, result, REAL_TTL=4h)
    └─ Failure → cacheSet(ticker, syntheticMarker, FAIL_TTL=5min)
                 return null

getCachedReal(ticker)  [no fetch]
    └─ Returns {bars, quality} if cached real, null if synthetic/missing

prefetchTickers(tickers, concurrency=8, delay=1200ms)
    └─ Batches, respects ~40 req/min, skips already-cached tickers
```

---

## Signal Tracking Flow

```
Scanner scan results (StockSetup[])
    │
    ▼
useSignalTracker.trackScanResults(setups)
    │
    ├─ For each setup: createSignal() → dedup check (same ticker+type within 7 days)
    │
    ├─ applyDemoSimulation() → marks old pending signals as simulated
    │
    ├─ saveSignals() → localStorage cache
    └─ sheetsCreate() → POST /api/sheets/signals (only on migration, NOT every load)

Every 5 minutes (EVAL_INTERVAL_MS):
    ├─ Fetch live price for each open signal ticker
    └─ evaluateSignal(signal, price) → update status
         └─ sheetsPatch() if status changed

Load order (useSignalTracker init):
    1. sheetsLoad() → GET /api/sheets/signals
    2. If Sheets has data → use Sheets (dedup by ID)
    3. If Sheets empty → migrate localStorage → Sheets
    4. applyDemoSimulation()
    5. Client-side ID dedup (defensive)
```

---

## Google Sheets Read Cache

```
getSheetRows(sheetName)
    │
    ├─ cacheGet(sheetName) → hit (30s TTL)?
    │    └─ return cached rows
    │
    └─ Miss → Sheets API read → cacheSet(sheetName, rows, 30s TTL)

invalidateSheetCache(sheetName) [exported]
    └─ Deletes cache entry → next read goes to Sheets

replaceAllRows(sheetName, rows)
    ├─ cacheInvalidate(sheetName) [internal]
    ├─ Sheets clear A2:Z
    └─ Sheets append rows (if any)

appendRows(sheetName, rows)
    └─ Sheets append (does NOT invalidate cache — reads within 30s may be stale)
```
