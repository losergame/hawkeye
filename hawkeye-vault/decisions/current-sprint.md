# Current Sprint

**Last updated**: 2026-05-31

---

## Active Focus: Real Candle Coverage

Eliminating synthetic LCG candle generation from the scanner and paper trader.

### What's Done
- [x] `real-candles.ts`: 4-hour cache, `getCachedReal()`, `getCandleCoverage()`, `prefetchTickers()`
- [x] `allowSyntheticData` AppSetting (default OFF)
- [x] Scanner cache-only mode: skips uncached tickers, triggers background prefetch
- [x] `/api/scanner/prefetch` GET+POST endpoints
- [x] Paper run blocks mock-candle setups when `allowSyntheticData = false`
- [x] `computeRealismScore(realCandlePct)` — dynamic score based on real coverage
- [x] Diagnostics page: coverage bars, prefetch buttons, toggle

### What's Pending
- [ ] Position Sizing Validation UI — warning when position would exceed risk limits
- [ ] Russell 2000 candle prefetch (2000 tickers — too slow for routine use)

---

## Just Completed: Duplicate Open Position Fix

Full FIFO lock + 3-layer dedup to prevent MRNA/NFLX 2× duplication.
See `decisions/completed.md` → "FIFO Process Lock on Paper Run".

### Verification
- Rebuild reports `dupPositionCount: 0`
- 30-sec price check + executeTopPick no longer race
- Google Sheets cache invalidated before every `loadPaperState()`

---

## Paper Trading Dataset

**Current status**: Clean dataset started 2026-05-31 after full reset.
- Starting balance: $1,000
- 5 closed trades, 2 open positions (MRNA, NFLX) as of reset day
- Official dataset — do not wipe without explicit user request

---

## Watch List (Next Possible Work)

- Position Sizing Validation warnings in Paper Trader UI
- Analytics: sector breakdown panel
- Scanner: intraday relative volume (would need a different data source)
- Light theme polish (most hardcoded dark colors already fixed)
- Multi-universe Top 5 dedup (already done for executeTopPick, confirm for auto-trade)
