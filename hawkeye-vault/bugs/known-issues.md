# Known Issues & Workarounds

---

## RESOLVED (tracked for reference)

### ~~Duplicate Open Positions (MRNA × 2, NFLX × 2)~~ — FIXED 2026-05-31
**Root cause**: Concurrent `POST /api/paper/run` calls (30-sec price check + executeTopPick) both loaded stale 30-second cached PaperPositions, both ran runCycle with empty `heldTickers`, both called `replaceAllRows` which interleaved as clear→clear→append→append.
**Fix**: FIFO lock, cache invalidation before load, pre-write fresh check, fingerprint dedup.

### ~~Duplicate Signal Rows (`sig_k1bu5b` React key warning)~~ — FIXED 2026-05-31
**Root cause**: `useSignalTracker` called `sheetsCreate(simulated signals)` on every page load, re-appending to Sheets each time.
**Fix**: `sheetsCreate` only called during one-time localStorage→Sheets migration. GET endpoint deduplicates by ID.

### ~~Null cashBalance after rebuild~~ — FIXED 2026-05-31
**Root cause**: New PaperTrade fields (`effectiveEntryPrice` etc.) were inserted in the MIDDLE of the HEADERS array, misaligning column reads. `profitLoss` was being read as `"win"/"loss"` string → `Number("win") = NaN`.
**Fix**: New fields appended at END of HEADERS array to preserve backward compatibility.

### ~~PARA +552% trade~~ — FIXED
**Root cause**: PARA delisted, Finnhub returned 0. Exit price was market price (gap risk) which could exceed TP1.
**Fix**: PARA removed from universe, added to DEAD_TICKERS blacklist. TP exits use TP1 price, not market price.

### ~~GDDY duplicate trades~~ — FIXED
**Root cause**: Cooldown only applied to `result === "loss"` exits. After a TP hit, same ticker could immediately re-enter.
**Fix**: Cooldown applies to ALL exit types. `loadPaperState` loads all trades (not just losses) from last 60 min.

### ~~CSS not applying (white page / unstyled)~~ — KNOWN PATTERN
**Root cause**: Dev server started before compilation finishes → CSS file URL in HTML doesn't exist yet.
**Workaround**: Start server from terminal (`npm run dev`), wait for "Ready" message, then open browser. Or `Ctrl+Shift+R` hard refresh.

### ~~PaperTrades columns misaligned after `ENOENT pages-manifest.json`~~ — FIXED
**Root cause**: Deleting `.next` folder while server was running caused partial build state.
**Fix**: Kill all node processes, delete `.next`, restart fresh.

---

## CURRENT KNOWN ISSUES

### Synthetic Candle Coverage
**Status**: Partially mitigated.
**Issue**: When the real candle cache is cold (first run, or >4 hours since prefetch), `allowSyntheticData = false` means the scanner returns 0 results.
**Workaround**: Go to `/diagnostics` → "Prefetch S&P 500" before first scan. After ~8 min the cache is warm. Subsequent scans are instant.

### Duplicate Positions After Process Restart
**Status**: By design.
**Issue**: The FIFO lock is in-process. If the Next.js process restarts mid-run, a second run immediately after could theoretically create duplicates.
**Workaround**: Run `/api/paper/rebuild` after any unexpected server restart. It deduplicates positions and recalculates account.

### `totalTrades: 0` in Rebuild if Trades Have Old Column Order
**Status**: Historical data issue, won't recur.
**Issue**: Trades written before the column-order fix have result="2.5" (holdTimeHours mis-read as result).
**Workaround**: These are filtered as invalid by `wins/losses = 0` checks. cashBalance is still calculated correctly from profitLoss values.

### Russell 2000 Prefetch Impractical
**Status**: By design.
**Issue**: ~2000 tickers × 1.2s delay = ~40 minutes to prefetch. Not feasible for routine use.
**Workaround**: Don't prefetch Russell 2000 unless you have time. Use S&P 500 + NASDAQ 100 for real-candle coverage.

### Prisma Schema Out of Sync with Actual Usage
**Status**: Low priority.
**Issue**: `prisma/schema.prisma` defines models (User, Portfolio, Watchlist, etc.) but these tables are mostly not used — Google Sheets replaced them.
**Risk**: If someone runs `prisma db push` thinking it's needed, they'd create unused tables. The app doesn't call Prisma for paper trading.
**Note**: The Supabase DB env vars are still set. The `@prisma/client` package is installed. It's dormant, not removed.

### Light Mode Incomplete
**Status**: Partially fixed.
**Issue**: Most hardcoded dark colors replaced with semantic tokens (`text-foreground`, `border-border`, `bg-surface-1`, etc.). Some components may still have dark-only inline styles.
**Affected**: Chart tooltip `contentStyle`, some inner circles in fear/greed gauge.

### PaperPositions `positions` Not Sorted
**Status**: Cosmetic.
**Issue**: PaperPositions sheet rows are in open-order. After a rebuild, they may be reordered alphabetically by ticker (first-seen wins dedup). The UI sorts by P&L anyway.

---

## WORKAROUNDS STILL ACTIVE

| Issue | Workaround |
|---|---|
| Empty scanner results (cold cache) | `/diagnostics` → "Prefetch S&P 500" |
| White/unstyled page after restart | Hard refresh `Ctrl+Shift+R` |
| Suspicious rebuild (cashBalance wrong) | `POST /api/paper/rebuild` |
| Discord webhook not firing | Check `DISCORD_WEBHOOK_URL` in `.env.local`; verify URL with "Send Test" on diagnostics |
| Google Sheets 403 errors | Ensure service account email has Editor access on the spreadsheet |
