# Data Integrity

## Dead Ticker Handling

### What Is a Dead Ticker?
A stock that has been delisted, acquired, or taken private. Finnhub returns `price = 0` or no data for these. Without protection, the scanner generates phantom setups.

### Current Blacklist (12 tickers in `DEAD_TICKERS` Set)
```
PARA  — Paramount Global, acquired by Skydance, delisted Jan 2025
AIRC  — Apartment Income REIT, ticker inactive
EVERI — Everi Holdings, taken private by Apollo, delisted 2024
ATVI  — Activision Blizzard, acquired by Microsoft, Oct 2023
TWTR  — Twitter, taken private by Elon Musk, Oct 2022
XLNX  — Xilinx, acquired by AMD, Feb 2022
PBCT  — People's United, merged into M&T Bank, Apr 2022
NLSN  — Nielsen Holdings, taken private, Oct 2022
SIVB  — SVB Financial, FDIC receivership, Mar 2023
FRC   — First Republic Bank, FDIC seizure, May 2023
SBNY  — Signature Bank, FDIC receivership, Mar 2023
PACW  — PacWest Bancorp, merged into Banc of California, Nov 2023
```

### Protection Layers
1. **Universe file removal**: PARA removed from `sp500.ts`, AIRC+EVERI from `russell2000.ts`
2. **`isDeadTicker()`** check in scanner route before scanning
3. **Zero-quote filter** (`isValidQuote(price)`) after live price injection
4. **Min price filter** (`MIN_TRADEABLE_PRICE = $3.00`) in scanner output
5. **Dead ticker filter** applied again at result level before pagination

### Adding New Dead Tickers
Edit `DEAD_TICKERS` Set in `src/lib/scanner-engine.ts`. Also remove from the relevant universe file in `src/lib/tickers/`.

---

## Duplicate Trade Prevention

### Fingerprint
```
ticker|buyPrice|sellPrice|shares|openedAt(YYYY-MM-DDTHH:MM)|closedAt(YYYY-MM-DDTHH:MM)
```
`openedAt` and `closedAt` truncated to the minute to tolerate sub-second timing jitter.

### Check Window
60-minute lookback (not just cooldown window, full hour to catch all edge cases).

### How It Works
In `savePaperState()` before `appendRows(PAPER_TRADES)`:
1. Read last 60 min of existing trades from Sheets
2. Build Set of existing fingerprints
3. Filter new trades — reject any whose fingerprint already exists
4. Only append non-duplicate trades

---

## Duplicate Position Prevention (4 layers)

### Layer 1: FIFO Lock
All `POST /api/paper/run` calls serialize through an in-process FIFO queue. Only one runs at a time. Prevents the root cause: two concurrent calls loading the same stale cached state.

### Layer 2: Cache Invalidation Before Load
`invalidateSheetCache(PAPER_POSITIONS)` called before every `loadPaperState()`. Ensures the positions loaded reflect what's actually in Sheets, not a 30-second-old cache.

### Layer 3: Pre-Write Fresh Read
Inside `savePaperState()`, immediately before writing:
1. Invalidate cache again
2. Fresh read from Sheets
3. Check if any ticker in the new positions list already exists in the fresh read
4. Reject new positions that would duplicate an existing ticker

### Layer 4: Fingerprint Dedup in Memory
Final guard before `replaceAllRows`:
- Fingerprint: `ticker|entryPrice|shares|openedAt_min`
- Any position with duplicate fingerprint is removed and logged

### Diagnostic Log
Every duplicate block is logged to `_dupBlockLog` (ring buffer, 50 entries):
- `ticker`, `reason`, `fingerprint`, `at` (ISO timestamp)
- Console warning: `[DUPLICATE POSITION BLOCKED] ...`
- Available via `GET /api/paper/run` → `{ dupBlockLog: [...] }`
- Also shown in `debug.dupBlocksThisSession` on every run response

---

## Rebuild Route Dedup

`POST /api/paper/rebuild` also deduplicates positions:
- Groups by ticker, keeps earliest `openedAt`
- Reports `dupPositionCount` in response
- Account math recalculated from deduplicated positions (prevents inflated `equityValue`)

---

## Signal Deduplication

### In Hook (client-side)
`useSignalTracker` deduplicates loaded signals by `id` before `setSignals()`.

### In API (server-side)
`GET /api/sheets/signals` deduplicates by `id` when reading from Sheets (keeps last occurrence — most recent state).

### On Write
`POST /api/sheets/signals` deduplicates by `ticker::setupType` within the last 7 days before appending.

### Root Cause That Was Fixed
`useSignalTracker` was calling `sheetsCreate(simulated signals)` on EVERY page load, re-appending signals that were already in Sheets. Fixed by only calling `sheetsCreate` during the one-time localStorage→Sheets migration.

---

## Universe Audit Tool

`GET /api/scanner/universe-audit` returns:
```json
{
  "sp500": { "raw": 503, "dead": 0, "valid": 503, "deadTickers": [] },
  "nasdaq100": { "raw": 100, ... },
  "russell2000": { "raw": 1987, ... },
  "combined": { "uniqueTickers": N, "crossUniverse": N, "deadTickers": [] },
  "blacklist": ["PARA", "AIRC", ...],
  "healthPct": 99.8
}
```

Available from Diagnostics page → "Run Universe Audit" button.
