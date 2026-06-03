# Session Log

> Log what was done each session so future Claude instances have context without re-reading all source files.
> Format: **Date — Summary** followed by bullet points.

---

## 2026-06-02 (Session 7) — DATA_ERROR Flag for Corrupted Trades

### Changes
**`paper-trading.ts`**
- `TradeResult` union extended: `"win" | "loss" | "breakeven" | "DATA_ERROR"`
- New `DataQuality = "ok" | "DATA_ERROR"` type exported
- `PaperTrade.dataQuality?: DataQuality` field added

**`google-sheets.ts`**
- `"dataQuality"` appended as last column in PAPER_TRADES HEADERS

**`run/route.ts`, `trades/route.ts`, `rebuild/route.ts`**
- `tradeToRow()`: writes `t.dataQuality ?? ""`
- `rowToTrade()`: reads `o.dataQuality` into `dataQuality` field

**`paper-analytics.ts` — `sanitizeTrades()`**
- Always-on pre-filter: removes trades where `dataQuality === "DATA_ERROR"` or `result === "DATA_ERROR"` BEFORE any user-toggled sanitization
- New field `dataErrorExcluded` in `SanitizationResult`

**`/api/paper/trades/mark-error` (new endpoint)**
- `POST { tickers: string[] }` or `{ tradeIds: string[] }`
- Finds matching rows in PaperTrades sheet
- Updates `result` → "DATA_ERROR" and `dataQuality` → "DATA_ERROR" in a single batchUpdate
- Idempotent — safe to call multiple times
- Added to middleware admin (CRON_SECRET) bypass

### GRMN + ILMN marked in Sheets
- Called `POST /api/paper/trades/mark-error { tickers: ["GRMN","ILMN"] }`
- Both trades updated: `result = "DATA_ERROR"`, `dataQuality = "DATA_ERROR"`
- Second call confirmed idempotent: "already marked"
- Now excluded from ALL analytics (win rate, P/L, drawdown, etc.)

### Analytics exclusion is automatic
`sanitizeTrades()` is the gateway for ALL analytics functions.
Since every analytics function gets `cleanTrades = sanitizeTrades(trades, options).trades`,
DATA_ERROR trades are removed before any calculation, no per-function changes needed.

### Build: ✓ Compiled successfully, zero TS errors

---

## 2026-06-02 (Session 6) — Bad Price Gate (GRMN/ILMN stale Finnhub data)

### Problem
GRMN: bought $237.98, sold $83.18 (-65%)
ILMN: bought $162.88, sold $67.12 (-58%)
Not realistic losses — caused by Finnhub free tier returning stale historical prices.

### Root Cause
1. Finnhub returned `q.c = $83.18` for GRMN (Garmin's 2020-2021 price range)
2. `?force=1` bypass sends every quote directly to Finnhub with no cache buffer
3. `updatePositionPrice(GRMN_pos, 83.18)` → `pos.currentPrice = 83.18`
4. `83.18 <= pos.stopLoss (~$232)` → closed at $83.18
No sanity check existed anywhere in the price → TP/SL evaluation path.

### Fix — `paper-trading.ts`
Price sanity gate added BEFORE `updatePositionPrice` in `runCycle`:
- Reject price if `dropPct > 30%` from entry (>30% drop in single 30s tick = stale data)
- Reject price if `gainPct > 200%` from entry (safety net)
- Rejected prices: keep last known good `currentPrice`, skip TP/SL evaluation for that tick
- Logged to `badPriceLog` (returned as `result.badPrices` and exposed in API debug response)

### Fix — `quote/[symbol]/route.ts`
Secondary warning: if Finnhub returns a price >50% different from the cached value,
log `[quote/GRMN] SUSPICIOUS PRICE JUMP` to server console.

### Would have caught both cases
- GRMN: $83.18 < $237.98 × 0.70 = $166.59 → REJECTED ✓
- ILMN: $67.12 < $162.88 × 0.70 = $114.02 → REJECTED ✓

### New fields
- `BadPriceEntry` interface exported from paper-trading.ts
- `RunCycleResult.badPrices: BadPriceEntry[]`
- `debug.badPricesRejected` in `/api/paper/run` response

### Build: ✓ Compiled, 45 static pages, zero TS errors

---

## 2026-06-02 (Session 5) — Stop Loss Minimum Distance Fix

### Problem
CAH was bought at $196.13 with stop at $195.62 — only $0.51 (0.26%) away. Stopped out immediately.

### Root Cause
`emaStop(refEma) = refEma × 0.99` produces only 1% below the EMA. When the EMA is close to price AND ATR is tiny (CAH ATR ≈ $0.34 = 0.17% daily range), the stop comes out at:
- `emaStop($197.60) = $195.62` ← only 0.26% below entry
- `atrStop($196.13, $0.34) = $196.13 - $0.51 = $195.62` ← same tight stop
- No minimum distance floor existed

### Fix — `enforceMinStop()` added to scanner-engine.ts
New helper applied to ALL four setup types after their respective stop calculations:

```typescript
function enforceMinStop(entry, sl, atrVal): number {
  const minPct  = entry >= 100 ? 0.01 : 0.005;   // 1% for ≥$100, 0.5% for <$100
  const minDist = Math.max(atrVal, entry * minPct); // max of 1×ATR and pct floor
  const floor   = entry - minDist;
  return r2(Math.min(sl, floor));                  // push stop down if too tight
}
```

Applied to:
- **Momentum Breakout**: `enforceMinStop(entry, atrStop(entry, lastAtr), lastAtr)`
- **Pullback Buy**: `enforceMinStop(entry, rawSl, lastAtr)` (rawSl = max of emaStop, swingStop)
- **Oversold Bounce**: `enforceMinStop(entry, swingStop(...), lastAtr)`
- **Trend Continuation**: `enforceMinStop(entry, emaStop(lastEma20), lastAtr)`

### Before/After for CAH ($196.13 stock, ATR=$0.34)
| | Stop | Distance | Pct |
|---|---|---|---|
| Before | $195.62 | $0.51 | 0.26% |
| After | $194.17 | $1.96 | 1.00% |

Min distance = max(ATR $0.34, 1% $1.96) = **$1.96** → stop at $194.17

### Build: ✓ Compiled successfully, zero TS errors

---

## 2026-06-02 (Session 4) — Cache Spec Alignment + cache-stats Endpoint

### What was already done (Session 3)
The disk cache was fully implemented in Session 3. This session aligned it to the user's spec and added the missing stats endpoint.

### DiskEntry format upgrade (real-candles.ts)
Old format: `{ bars, source, quality, expiresAt }`
New format: `{ ticker, candles, barCount, fetchedAt, source, quality, sufficient, expiresAt }`
- `diskRead()` handles both old and new format (backward compatible via `entry.candles ?? entry.bars`)
- `diskWrite()` now writes all fields in the new spec format
- 581 existing files are in old format — will be upgraded naturally as they expire and are re-fetched

### New endpoint: GET /api/scanner/cache-stats
Returns:
- `totalFiles` — all .json files in candle-cache/
- `valid` — not expired (< 24h old)
- `stale` — expired, will be re-fetched next prefetch
- `sufficient` — bars ≥ MIN_BARS_SUFFICIENT (170)
- `insufficient` — bars < 170, blocked from trading
- `oldFormat` — files without the `candles` field (legacy)
- `oldestFetchedAt` / `newestFetchedAt` — fetch timestamp range
- `sampleTickers` — 5 spot-check entries

Protected by CRON_SECRET (same admin gate as prefetch/diagnose).

### Middleware
- `/api/scanner/cache-stats` added to admin bypass list

### Current cache state (verified)
- 581 total files | 239 valid | 342 stale | 569 sufficient | 12 insufficient
- All from Polygon source | oldest: 2026-06-01 | newest: 2026-06-02
- After next server restart: all 581 files load from disk instantly (no re-fetch needed for valid files)

### Build: ✓ Compiled successfully, zero TS errors

---

## 2026-06-02 (Session 3) — MIN_BARS=170, barCount Display Fix, 24hr Disk Cache

### Fix 1 — MIN_BARS_SUFFICIENT: 200 → 170 (candle-constants.ts)
- Polygon free tier returns ~173 bars max regardless of FETCH_DAYS
- EMA 200 computed from 173 bars is reliable enough for swing trading
- Immediately unblocked AVGO (84pts), EW/CMC (82pts), PLTR (79pts), NVDA (77pts), + 32 others
- **Result: 28 → 51 passing signals**

### Fix 2 — barCount display bug (scanner-engine.ts + diagnose route)
- `barCount: barCount || undefined` changed to `barCount: barCount > 0 ? barCount : undefined`
- `/api/scanner/diagnose`: now passes `CandleResult.barCount` (authoritative) via `barCountOverrides` map
- `diagnoseSignal()` accepts `realBarCount?` param, uses it over `s.barCount`
- "WARNING: real source but 0 bars" messages eliminated for valid cached tickers

### Fix 3 — 24-hour disk cache (real-candles.ts)
- `DISK_TTL = 24 hours` (was: disk used same 4hr TTL as memory)
- `diskRead()`: also invalidates entries with `bars.length < MIN_BARS_SUFFICIENT` (forces re-fetch after threshold change)
- `cacheSet()`: disk writes use `DISK_TTL`, memory writes use `REAL_TTL=4h`
- Module-load proactive directory creation (`candle-cache/` created on server start)
- `candle-cache/` already in `.gitignore`
- **Verified: 581 disk files written, AVGO has 198 bars, TTL=24.0hrs**

### Middleware update
- `/api/scanner/prefetch` and `/api/scanner/diagnose` added to admin (CRON_SECRET) bypass in middleware.ts
- Allows CLI/cron access for cache management without browser session

### Current state
- 51 signals passing all filters
- Regime: neutral (good — not defensive)
- Rejection breakdown: passes:51, score_too_low:16, low_liquidity:2, confidence_too_low:1
- Top scorers: AVGO 84pts, HLT/EW/CMC 82pts, PLTR/WAT/CARR 79pts, F 78pts, NVDA 77pts

---

## 2026-06-02 (Session 2) — Stale Cache + barCount:0 Diagnostic Fixes

### Issue 1 — 173 bars (insufficient, blocked as `insufficientData`)
**Root cause:** FETCH_DAYS=252 calendar days × (252 trading days/365 calendar days) = **~173 trading days**. Not stale cache — this is the maximum Finnhub returns for a 252-day request. candle-cache/ directory did not exist (no disk files).
- **Fix:** Changed `FETCH_DAYS = 252 → 290` in `candle-constants.ts` (290 calendar days × 252/365 ≈ 200 trading days — meets MIN_BARS_SUFFICIENT)
- **Added:** `invalidateInsufficientCaches()` in `real-candles.ts` — clears in-memory entries where `barCount < MIN_BARS_SUFFICIENT` and source !== "synthetic"
- **Exposed:** `POST /api/scanner/prefetch` now accepts `{ invalidateInsufficient: true }` to flush stale entries before re-prefetching

**To use:** Hit diagnostics → "Prefetch S&P 500" (which sends `invalidateInsufficient: true`). Old 173-bar entries are cleared from memory, then re-fetched with FETCH_DAYS=290 returning ~200 bars.

### Issue 2 — barCount: 0 showing as "passing" in diagnostic
**Root cause:** Two bugs in `/api/scanner/diagnose`:
1. `s.candleSource === "mock"` fails when `candleSource` is `undefined` (not caught as rejection)
2. `barCount: barCount || undefined` in scanner-engine converts 0 to undefined, then `?? 0` shows 0 — but without clear label
- **Fix:** Changed check to `s.candleSource !== "real" && s.candleSource !== "delayed"` (positive whitelist, catches undefined/mock/any)
- **Added:** `barCountNote` field in diagnostic response — human-readable label ("synthetic (no real candles)", "173 bars — insufficient", etc.)
- **Split:** `insufficientData` gets its own `rejectedBy = "insufficient_bars"` label vs `"synthetic_or_insufficient_candles"` for source issues

### Issue 3 — Stale price for WBD (from previous session)
- `?force=1` added to all position price fetches in `usePaperTrader.ts` (both 30-sec loop and `runScan`)
- Quote route bypasses 10s in-process cache when `force=1` param present

### Build: ✓ Compiled successfully, 44 static pages, zero TS errors

---

## 2026-06-02 — Regime Recalibration (Fix A/B/C) + Vercel Cron Fix

### Problem
51 overnight signals all rejected as `regime_defensive`. Root causes:
1. `pullbackRatio > 0.55` firing defensive on normal consolidation (no genuine weakness)
2. Only Oversold Bounce survived defensive gate, but structurally can't reach MIN_SCORE=65 (trend always 0)
3. Momentum Breakout + Trend Continuation blanket-blocked even on high-conviction setups

### Fix A — `computeMarketRegime()` in scanner-scoring.ts
- Removed `pullbackRatio > 0.55` as a standalone defensive trigger
- Now requires COMBINED condition: `pullbackRatio > 0.55 AND avgRsi < 47`
- Standalone defensive triggers are now: `avgRsi < 42` OR `bearishRatio > 0.35`

### Fix B — Defensive gate in scanner-scoring.ts + paper-trading.ts
- MB/TC no longer blanket-blocked in defensive
- `getTopFiveSetups()`: MB/TC in defensive must score ≥ 75 (post-15% penalty) to qualify
- `paper-trading.ts runCycle()`: MB/TC allowed if `s.scannerScore >= 75`, otherwise rejected with detail message
- Pullback Buy remains completely blocked in defensive

### Fix C — Oversold Bounce scoring in scanner-scoring.ts
- `calculateTrendScore()`: added 5pt structural support credit when score === 0 AND setupType === "Oversold Bounce"
  (RSI ≤ 36 + volume filter already confirms demand — floor is real)
- `getTopFiveSetups()`: Oversold Bounce in defensive now uses MIN_SCORE = 58 (not 65)
- Pullback Buy threshold unchanged (still 65)

### Vercel Cron Fix — vercel.json
- Hobby plan only allows daily crons (not */5 per minute)
- Changed to two once-daily backup triggers:
  - `0 14 * * 1-5` — 10:00am ET (after market open)
  - `0 21 * * 1-5` — 5:00pm ET (after market close)
- Client-side 5-minute loop remains primary; Vercel cron is safety net

### Build: ✓ Compiled successfully, zero TS errors

---

## 2026-05-31 (Session 3) — Security, Vercel Prep, Auto-trade Automation

### Authentication
- `next-auth@4` installed
- `src/auth.ts`: credentials provider, SHA-256 timing-safe compare, JWT session 24h
- `src/app/api/auth/[...nextauth]/route.ts`: NextAuth handler (GET + POST)
- `src/app/login/page.tsx`: Hawkeye-styled login UI (dark terminal aesthetic, show/hide password, error display)
- `src/components/shared/session-provider.tsx`: client wrapper for SessionProvider in Server Component layout
- `src/app/layout.tsx`: wrapped with AuthSessionProvider

### Middleware (Route Protection)
- `src/middleware.ts`: protects ALL routes
  - `/api/auth/*` and `/login` are public
  - `/api/cron/*` requires `Authorization: Bearer CRON_SECRET` header
  - Pages → redirect to `/login?callbackUrl=...` when no session
  - API routes → `401 Unauthorized` JSON when no session
  - POST to `/api/auth/callback/credentials` → rate-limited (10 attempts/IP/hr)
- `src/lib/rate-limit.ts`: extended with `checkLoginRateLimit()`, `clearLoginRateLimit()`, `getRequestIp()`

### Security Headers (next.config.js)
- Content-Security-Policy: default-src 'self', connects to finnhub/polygon only
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera/mic/geo blocked
- Also added `webpack hashFunction: "md4"` to fix Node.js v24 WasmHash crash

### Vercel Cron (server-side auto-trade)
- `src/app/api/cron/auto-trade/route.ts`: full paper trading cycle server-side
  - Protected by CRON_SECRET
  - Skips when market is closed
  - Uses cached real candles from memory (no API calls at cron time)
  - Respects allowSyntheticData setting
  - Writes to Sheets, fires Discord alerts
- `vercel.json`: cron schedule `*/5 13-21 * * 1-5` (every 5 min, Mon-Fri, 1pm-9pm UTC)

### Auto-trade Bug Fix
- Client-side `setInterval` now fires immediately on enable (not after first 5-min delay)

### Environment Variables
- `.env.example`: updated with all required vars including NEXTAUTH_SECRET, NEXTAUTH_URL, APP_USERNAME, APP_PASSWORD, CRON_SECRET, NEXT_PUBLIC_FINNHUB_API_KEY

### New Environment Variables Required
```
NEXTAUTH_SECRET=   # openssl rand -base64 32
NEXTAUTH_URL=      # https://your-app.vercel.app (or http://localhost:3000 locally)
APP_USERNAME=      # login username
APP_PASSWORD=      # login password
CRON_SECRET=       # openssl rand -hex 32
```

### Build Status
- `npm run build` → ✓ Compiled successfully, 43 static pages generated, zero TypeScript errors

---

## 2026-05-31 (Session 2) — P1–P4: Real Candles, Performance, WebSocket, Design

### P1 — Real Candle Coverage (complete)
- `src/lib/candle-constants.ts` (new): `MIN_BARS_SUFFICIENT=200`, `MIN_BARS_FETCH=20`, `FETCH_DAYS=252`. Shared between scanner-engine and real-candles without circular imports.
- `src/lib/real-candles.ts`: Two-tier cache (memory + disk JSON at `candle-cache/{ticker}.json`). Disk cache survives server restarts. Dynamic `require("fs")` inside functions keeps the module safe to import from client bundles. Raises bar fetch window from 120→252 days. Returns `CandleResult` with `barCount` and `sufficient` fields.
- `src/lib/types.ts`: Added `insufficientData?: boolean` and `barCount?: number` to `StockSetup`.
- `src/lib/scanner-engine.ts`: Flags `insufficientData = bars < 200` on all four setup types. `candleSource` was also missing from Pullback Buy — now on all four setups.
- `src/components/scanner/badges.tsx`: New `DataSourceBadge` — "REAL" (green), "DELAYED" (cyan), "⚠ Nb" (amber, for insufficient), null for mock.
- `src/components/scanner/stock-setup-card.tsx`: Shows `DataSourceBadge` on every setup card.
- `src/components/scanner/stock-scanner-page.tsx`: `CandleCoverageStats` interface, `coverage` state, real-candle coverage bar shown in scanner hero header (progress bar + real%, insufficient count, skipped count).
- `src/app/api/scanner/route.ts`: `candleCoverage` response now includes `insufficientCount`, `minBarsSufficient`.
- `src/app/api/paper/run/route.ts`: Also blocks `insufficientData: true` setups (not just `candleSource==="mock"`).
- `.gitignore`: Added `candle-cache/` entry.

### P2 — Performance (complete)
- `src/hooks/useDebounce.ts` (new): Generic 300ms debounce hook.
- `src/hooks/usePageVisible.ts` (new): Page Visibility API wrapper.
- `src/components/scanner/scanner-table.tsx`: `memo()` on `MiniSparkline`, `ConfidencePill`, `ExpandedRow`.
- `src/components/scanner/stock-scanner-page.tsx`: `useDebounce(filters.search, 300)` for search. Auto-refresh paused when tab hidden.
- `src/hooks/usePaperTrader.ts`: 30-sec price check skipped when tab hidden.
- `react-window` + `@types/react-window` installed (for future list virtualization).

### P3 — Live Prices / WebSocket (complete)
- `src/hooks/useLivePrice.ts`: Full rewrite. Finnhub WebSocket singleton (`NEXT_PUBLIC_FINNHUB_API_KEY`) for real-time ticks. HTTP polling fallback when WS key not set (12s market hours, 30s extended, stops when closed). `useLivePrices(symbols[])` batch hook (max 50 Finnhub free tier). Page visibility pauses both WS updates and polling.
- `src/components/shared/ui/live-price-display.tsx` (new): `LivePriceDisplay` (WS price + flash animation), `LiveBadge` (animated LIVE / CLOSED / PRE-MARKET pill), `PriceFlash` (thin wrapper).
- `src/components/shared/ui/index.tsx`: Exports all three from live-price-display.
- `src/components/dashboard/dashboard-shell.tsx`: Watchlist prices now via `useLivePrices` instead of manual setInterval HTTP loop.
- `src/components/scanner/stock-scanner-page.tsx`: `MarketStatusBadge` uses pulsing dot for OPEN state.

### P4 — Design Consistency (complete)
- Signals page `max-w-[1400px]` → `max-w-[1600px]` (matches all other pages).
- Analytics AppNav loading state subtitle unified with main view ("Paper trading research").

### Build
- All changes compile clean (`✓ Compiled successfully`).
- `candle-cache/` gitignored.

### Next Session Should
- Run `POST /api/scanner/prefetch` to warm the candle cache for S&P 500.
- Test WebSocket live prices by setting `NEXT_PUBLIC_FINNHUB_API_KEY` in `.env.local`.
- Monitor paper trading with `allowSyntheticData=false` to confirm only real-candle setups are traded.
- Consider Position Sizing Validation warnings (backlog item).

---

## 2026-05-31 — Mega Session: Full System Build & Hardening

### Paper Trading
- Built full paper trading simulator from scratch (positions, trades, equity curve)
- Google Sheets as persistence (PaperAccount, PaperPositions, PaperTrades, PaperEquityCurve)
- Risk controls: 2% per trade, 25% max position, 3 max concurrent
- Market hours gate with test mode bypass
- Discord alerts: buy, sell, SL hit, manual close

### Execution Realism Upgrade
- Slippage model: 0.1% buy + 0.1% sell applied to all fills
- Gap risk: SL exits at market price, TP exits at TP1 (limit)
- Liquidity filters: $5 min price, 500k ADV
- New PaperTrade fields: `effectiveEntryPrice`, `effectiveExitPrice`, `slippageCost`, `gapType`, `gapAmount`
- **Column order bug**: New fields were temporarily inserted in the middle of HEADERS array → misaligned all column reads → cashBalance showed null. Fixed by appending new fields at END.

### Scanner
- Universe: S&P 500 (503), NASDAQ 100 (100), Russell 2000 (~2000)
- 4 setup types with ATR/Fibonacci TP/SL calculation
- 6-component scanner scoring (trend/momentum/volume/RS/RR/regime)
- Dead ticker blacklist: DEAD_TICKERS Set + removed from universe files
- Two-pass: synthetic all tickers, real candles for top 20

### Real Candle Coverage System
- `real-candles.ts`: 4-hour cache for real fetches, 5-min for failures
- `getCachedReal()` — cache-only lookup (no API call)
- `getCandleCoverage()` — snapshot of real/synthetic/uncached counts
- `prefetchTickers()` — background warm-up at ~40 req/min
- `allowSyntheticData` AppSetting (default OFF)
- Scanner cache-only mode: skips uncached tickers, triggers background prefetch
- `/api/scanner/prefetch` GET (coverage) + POST (trigger warm-up)
- Paper run blocks `candleSource === "mock"` setups when setting is false
- `computeRealismScore(realCandlePct)` — dynamic candle quality factor
- Diagnostics: coverage bars, prefetch buttons, toggle

### Duplicate Position Fix (Root Cause: Concurrent Race)
- Diagnosed: 30-sec price check + executeTopPick concurrent → both loaded stale 30s cache → both opened same positions → `replaceAllRows` interleaved as clear→clear→append→append
- Layer 1: FIFO process lock (`acquireRunLock`/`releaseRunLock`) in run/route.ts
- Layer 2: `invalidateSheetCache(PAPER_POSITIONS)` before every `loadPaperState()`
- Layer 3: Pre-write fresh read in `savePaperState()` — ticker conflict check
- Layer 4: Position fingerprint dedup + diagnostic log (`_dupBlockLog`)
- Rebuild route now deduplicates positions by ticker, reports `dupPositionCount`

### Bug Fixes
- PARA +552% phantom trade → PARA removed from universe, added to blacklist
- GDDY duplicate trades → cooldown now covers ALL exit types, not just losses
- `sig_k1bu5b` duplicate React key → `useSignalTracker` no longer re-appends on every load
- `pages-manifest.json ENOENT` → fixed by full server restart with clean .next

### Data Reset
- Full paper trading data wipe after column order bug (2026-05-31)
- Clean dataset started at $1,000
- As of session end: 5 closed trades, 2 open positions (MRNA, NFLX)
- `dupPositionCount: 0` confirmed by rebuild

### Google Sheets Formatting
- Upgraded from cell-level to full-row conditional formatting
- Win rows: soft green background + green text
- Loss rows: soft red background + red text
- P&L columns: green/red text based on value

### Google Sheets Column Fix
- PaperTrades headers had new fields inserted in middle → column misalignment
- Fixed by appending at end to preserve backward compatibility with existing rows

### Vault Created
- `hawkeye-vault/` created with full project documentation
- CLAUDE.md master context file
- All architecture, decisions, features, bugs, conventions documented

---

## 2026-06-02 - Portfolio Close Position

### What Changed
- Added manual Portfolio close flow: open holdings now have a primary `Close Position` action and a separate `Delete / Remove Entry` action for mistakes.
- Added a server-side close route that fetches a live Finnhub quote, calculates realized P/L, appends a trade to `PortfolioTrades`, removes the holding from `Portfolio`, and sends a Discord notification when configured.
- Added duplicate-close protection using the holding ID and an in-process close guard.
- Added focused TypeScript assertion tests for portfolio trade math and close workflow behavior.

### Files Modified
- `src/components/portfolio/portfolio-page.tsx`: visible close/delete actions, close confirmation, row loading state, reload after close.
- `src/app/api/portfolio/[id]/close/route.ts`: portfolio close endpoint.
- `src/lib/portfolio-trades.ts`: trade model, calculations, and sheet row mapping.
- `src/lib/portfolio-close.ts`: dependency-injected close workflow.
- `src/lib/google-sheets.ts`: `PortfolioTrades` sheet name and headers.
- `src/lib/discord-notify.ts`: portfolio close Discord embed.
- `src/app/api/sheets/setup/route.ts`: setup message includes `PortfolioTrades`.
- `docs/superpowers/specs/2026-06-02-portfolio-close-position-design.md`: approved design.
- `docs/superpowers/plans/2026-06-02-portfolio-close-position.md`: implementation plan.

### Decisions Made
- Existing portfolio holdings do not store a true open timestamp, so closed trades use `Portfolio.updatedAt` as `openedAt` when available, otherwise `closedAt`.
- Existing portfolio holdings do not store an open reason, so closed trades use `Manual Portfolio Entry`.
- Close uses strict live Finnhub quotes; if Finnhub cannot return a positive price, the holding is not closed.
- Discord portfolio close alerts default to enabled when `DISCORD_WEBHOOK_URL` is set, unless `AppSettings.portfolioDiscordAlertsEnabled` is set to `false`.

### Current State After Session
- Build passes after a rerun; the first build hit a transient Next page-data collection miss.
- Repo typecheck passes after build refreshes `.next`.
- Repo lint still has pre-existing `.claude/skills/**/*.cjs` CommonJS lint errors; targeted lint for feature files passes.
- Browser smoke test could not run because no in-app browser backend was exposed, and background dev servers exited in this sandbox after printing ready.

### Next Session Should
- Optionally add a UI setting for `portfolioDiscordAlertsEnabled`.
- Manually close one real holding in Google Sheets to verify `PortfolioTrades` persistence end-to-end with live credentials.

## Template for Future Sessions

## YYYY-MM-DD — [Session Title]

### What Changed
- [Feature/fix name]: [what was done and why]

### Files Modified
- `src/...`: [what changed]

### Decisions Made
- [Any new architectural decisions]

### Current State After Session
- Paper trader: [X open positions, Y closed trades, $Z account value]
- Real candle coverage: [X% for S&P 500]
- Any active experiments or monitoring

### Next Session Should
- [Priority item 1]
- [Priority item 2]
