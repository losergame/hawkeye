# Session Log

> Log what was done each session so future Claude instances have context without re-reading all source files.
> Format: **Date — Summary** followed by bullet points.

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
