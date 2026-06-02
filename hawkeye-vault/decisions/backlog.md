# Backlog — Future Improvements

> Ordered roughly by value. None of these are committed to.

---

## High Value

### Real-Time Intraday Candles
Currently using daily bars only (Finnhub free tier). Intraday bars (15-min, 1-hr) would make indicators much more meaningful for swing trading. Requires Finnhub paid tier or a different provider.

### Multi-Asset Correlation / Sector Exposure
Currently no concept of sector concentration. Opening 3 positions all in the same sector inflates correlation risk. Could use GICS sector tags on ticker list + a max-sector-exposure filter.

### Paper Trade Entry Timing
Currently buys at `entryPrice` (scanner entry level). In reality, price must reach that level. Could add a "pending order" state — position only opens when live price crosses entry.

### Short Selling Support
Currently only long positions. Adding short would require negative position sizes and reversed TP/SL logic.

---

## Medium Value

### Position Sizing Validation Warnings
When `calculatePositionSize()` returns 0 (account too small for minimum risk), surface a warning in the Paper Trader UI before the trade is attempted.

### Per-Universe Scan Cache Invalidation Button
Give the user a button to force-refresh a specific universe's scanner cache (currently requires `?refresh=1` query param).

### Better ATR-Based Exit Tracking
Currently SL is set at entry and doesn't trail. Adding a trailing stop (e.g., 1.5× ATR below recent high) would be more realistic for trend-following setups.

### Analytics: Sector Performance Breakdown
Add a sector breakdown panel to analytics. Shows which sectors are generating most wins/losses. Requires sector tags on ticker list.

### Signal Calibration Feedback Loop
The signal tracker computes `calibrationLabel` (bull/bear/neutral per setup type), but this isn't surfaced in the scanner UI as a confidence modifier. Could show "historically bearish for Pullback Buy" badge.

---

## Low Value / Nice-to-Have

### Discord Auto-Buy Alerts (Full Automation)
The `signalforge-discord-auto-buy-alerts-v1` localStorage key suggests this was planned. Would mean paper trader notifies Discord AND auto-approves the trade. Not sure if desired.

### Russell 2000 Prefetch
2000+ tickers × 1.2s = ~40 minutes. Not practical for routine prefetch. Could run as an overnight job or on-demand from diagnostics.

### Light Theme Polish
Most hardcoded dark colors have been replaced with semantic tokens. A few UI panels may still have dark-only styles. A full light-mode audit would be needed.

### Export Paper Trades to CSV
Useful for analysis in Excel. Could add an export button to analytics that converts the PaperTrades Google Sheet to a CSV download.

### Google Sheets Backup / Snapshot
One-click export of all sheets to a local JSON snapshot. Useful before making breaking schema changes.

### Multi-Process Lock (Redis/Upstash)
The current FIFO lock only works within one process. If deployed to a multi-instance environment (e.g., Vercel with multiple serverless function instances), a distributed lock would be needed. Current deployment is local so this is not urgent.
