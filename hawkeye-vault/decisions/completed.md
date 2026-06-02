# Completed Decisions

> Read this before making any architecture changes. Decisions that were already
> tried, rejected, or settled are listed here with rationale.

---

## Google Sheets as Primary Storage (not database)

**Decision**: Use Google Sheets as the sole source of truth for all paper trading data. Supabase/PostgreSQL is NOT used for paper trading.

**Rationale**: The Prisma/Supabase stack was set up initially but Google Sheets provides a human-readable, directly-inspectable, live-updateable ledger. For a personal trading tool, Sheets is better than a headless database. The user can see every trade in real time in the browser.

**Implications**: All writes go to Sheets. localStorage is a read-only cache/fallback. Never use Prisma for paper trading state.

---

## Synthetic Candle Generation (LCG seeded)

**Decision**: Built a seeded LCG (Linear Congruential Generator) for deterministic synthetic OHLC data per ticker.

**Why it was built**: Needed a way to score ALL 2600+ tickers without 2600 API calls per scan. Synthetic candles allow a fast pass-1 scan with no I/O.

**Current status**: Being replaced by real candles. `allowSyntheticData = false` (default OFF). The LCG still exists as fallback when `allowSyntheticData = true`.

**Key file**: `scanner-engine.ts` → `generateCandles()`, `tickerSeed()`, `LCG` class.

---

## Two-Pass Scanner Architecture

**Decision**: Scanner uses pass-1 (synthetic, all tickers) then pass-2 (real candles, top 20 only).

**Rationale**: Finnhub free tier limits prevent scanning all 2600 tickers with real data synchronously. Top-20 re-score gives the most important setups real candle quality.

**Current status**: When `allowSyntheticData = false`, replaced by cache-only mode — only tickers with cached real candles are scored at all.

---

## Real Candle Cache TTL: 4 Hours

**Decision**: Successful real candle fetches cached 4 hours; failures cached 5 minutes.

**Rationale**: Daily bars change once per day (market close). A 4-hour cache means one prefetch per trading session warms the cache for all scans that day. 5-minute fail TTL allows retrying after rate-limit recovery.

---

## FIFO Process Lock on Paper Run

**Decision**: All `POST /api/paper/run` calls queue through a FIFO in-process lock (module-level).

**Why**: Diagnosed 2× MRNA + 2× NFLX duplicate positions. Root cause: concurrent 30-sec price check + executeTopPick both loaded stale cached state (30s cache), both opened same positions, both called `replaceAllRows` which interleaved as clear→clear→append→append.

**Implementation**: `acquireRunLock()` / `releaseRunLock()` in `run/route.ts`. Waiter timeout 25 seconds → HTTP 429.

**Limitation**: In-process only. Multi-process deployment (production) would need Redis/Upstash distributed lock.

---

## Trade Deduplication via Fingerprint

**Decision**: Closed trades deduplicated by `ticker|buyPrice|sellPrice|shares|openedAt(min)|closedAt(min)` fingerprint before appending to Sheets.

**Why**: Concurrent run calls could both close the same position and both try to append the same closed trade row.

**Window**: 60-minute lookback for fingerprint matching.

---

## Position Deduplication (Layers 2 + 3)

**Decision**: Three-layer position dedup added to `savePaperState`:
1. Fresh cache invalidation + re-read before write
2. Check fresh Sheets data for ticker conflicts before writing
3. Fingerprint dedup (`ticker|entryPrice|shares|openedAt_min`) as final guard

---

## Cooldown Window: All Exit Types (not just stop-losses)

**Decision**: 30-minute cooldown applies after ANY exit (TP hit, stop-loss, manual close), not just losses.

**Why it changed**: Only cooling down losses allowed the same ticker to reopen immediately after a TP hit. Caused GDDY to appear 3× in quick succession.

**Implementation**: `loadPaperState()` loads ALL trades from last 60 min (not filtered by result). `runCycle()` checks all recent tickers, not `result === "loss"` only.

---

## Dead Ticker Blacklist

**Decision**: Maintain `DEAD_TICKERS` Set in `scanner-engine.ts` with confirmed delisted/acquired tickers.

**Why**: Finnhub returns price=0 for delisted tickers but doesn't error. Without the blacklist, scanners generated phantom setups.

**Current entries (12)**: PARA, AIRC, EVERI, ATVI, TWTR, XLNX, PBCT, NLSN, SIVB, FRC, SBNY, PACW.

**Also**: PARA removed from `sp500.ts`, AIRC+EVERI removed from `russell2000.ts`.

---

## localStorage Key Names (FROZEN)

**Decision**: These keys must NEVER be renamed:
- `signalforge-portfolio-v1`
- `signalforge-discord-auto-buy-alerts-v1`
- `signalforge-discord-buy-alerts-sent-v1`

**Why**: User has existing data stored under these keys. Renaming = data loss.

---

## Execution Realism: Slippage + Gap Risk

**Decision**: Apply 0.1% buy slippage and 0.1% sell slippage on every paper trade. SL exits use market price (gap risk). TP exits use TP1 price (limit order).

**Why**: Closer to real-world fills. A stop-loss in practice fills at the market price, which can be worse than the stop level (gap risk). A limit TP order fills at exactly the limit price.

**Fields added to PaperTrade**: `effectiveEntryPrice`, `effectiveExitPrice`, `slippageCost`, `gapType`, `gapAmount`.

---

## Liquidity Filters for Paper Trading

**Decision**: Reject trades where price < $5.00 or ADV < 500,000.

**Why**: Sub-$5 stocks and low-ADV names have wide spreads and poor fills in real life. Paper trading them inflates win rates unrealistically.

---

## Signals Hook: No Re-append on Every Load

**Decision**: `useSignalTracker` only calls `sheetsCreate` during the one-time localStorage→Sheets migration, NOT on every page load.

**Why**: Every load was re-appending simulated signals to Sheets, causing duplicate rows. The `sig_k1bu5b` duplicate key React warning was the symptom.

**Also fixed**: GET `/api/sheets/signals` now deduplicates by ID (last occurrence wins) when reading from Sheets.

---

## PaperTrades Column Order (New Fields Appended)

**Decision**: Realism upgrade fields (`effectiveEntryPrice`, `effectiveExitPrice`, `slippageCost`, `gapType`, `gapAmount`) are APPENDED at the end of the HEADERS array, not inserted in the middle.

**Why**: Inserting in the middle shifts all column indices, causing `rowToObject` to read every field from the wrong column. Appending preserves backward compatibility with existing rows.

---

## Scanner/Paper Trader Separation

**Decision**: The Scanner page NEVER triggers `runPaperScan()`. The Paper Trader has its own independent scan loop (`autoTradeEnabled` + 5-min interval).

**Why**: Prevents the scanner from accidentally buying. The scanner is for research; the paper trader is for simulation.

---

## AppSettings as Key-Value Store

**Decision**: Use the `AppSettings` Google Sheets tab as a simple KV store for runtime configuration (active preset, synthetic data flag, last prefetch time).

**Implementation**: `readSetting(key)` / `writeSetting(key, value)` in `google-sheets.ts`.

**Keys in use**: `allowSyntheticData`, `activePresetName`, `activePresetScope`, `minScannerScore`, `minConfidence`, `minRiskReward`, `setupTypesAllowed`, `excludedTickers`, `excludedSetupTypes`, `lastCandlePrefetch`, `lastPrefetchResult`.
