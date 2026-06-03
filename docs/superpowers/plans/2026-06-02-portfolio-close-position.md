# Portfolio Close Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Portfolio close action that writes realized trades to `PortfolioTrades` and removes the open holding.

**Architecture:** Keep calculations and Sheets row mapping in a small server-side library module, expose a dedicated close route, and wire the Portfolio UI to call it with confirmation and loading state. Google Sheets remains the source of truth.

**Tech Stack:** Next.js App Router, TypeScript, Google Sheets API helpers, Finnhub-backed quote API pattern, Sonner toasts, lucide-react icons.

---

## Files

- Create: `src/lib/portfolio-trades.ts`
- Create: `src/lib/portfolio-trades.test.ts`
- Create: `src/app/api/portfolio/[id]/close/route.ts`
- Modify: `src/lib/google-sheets.ts`
- Modify: `src/lib/discord-notify.ts`
- Modify: `src/components/portfolio/portfolio-page.tsx`
- Modify: `hawkeye-vault/sessions/session-log.md`

### Task 1: Portfolio Trade Helpers

- [ ] Write `src/lib/portfolio-trades.test.ts` with assertions for profit/loss, percent, result, fallback `openedAt`, and row column order.
- [ ] Run `node --experimental-strip-types src/lib/portfolio-trades.test.ts` and confirm it fails because `src/lib/portfolio-trades.ts` does not exist.
- [ ] Create `src/lib/portfolio-trades.ts` with `PortfolioTrade`, `PortfolioCloseInput`, `buildPortfolioTrade`, and `portfolioTradeToRow`.
- [ ] Re-run `node --experimental-strip-types src/lib/portfolio-trades.test.ts` and confirm it passes.

### Task 2: Sheets Schema and Close Route

- [ ] Add `PORTFOLIO_TRADES: "PortfolioTrades"` to `SHEETS`.
- [ ] Add the exact `PortfolioTrades` headers to `HEADERS`.
- [ ] Create `src/app/api/portfolio/[id]/close/route.ts`.
- [ ] The route must call `ensureSheet(SHEETS.PORTFOLIO_TRADES)`, re-read the current `Portfolio` row by id, fetch a quote, append the closed trade, delete the original row, and return `{ ok, trade }`.
- [ ] If the holding is missing or the quote is invalid, return an error before appending or deleting.

### Task 3: Discord Notification

- [ ] Add `notifyPortfolioClose(trade)` to `src/lib/discord-notify.ts`.
- [ ] Call it after successful Sheets writes in the close route. Keep notification failures non-blocking.

### Task 4: Portfolio UI

- [ ] Add a `sheetsClosePosition(id)` client helper.
- [ ] Add `closingId` state and a `closePosition(id)` handler.
- [ ] Confirm before close with `window.confirm`.
- [ ] Disable row actions while a close is in progress.
- [ ] Reload from Sheets after a successful close so analytics update from persisted rows.
- [ ] Rename the existing delete button tooltip/accessible label to `Delete / Remove Entry`.
- [ ] Add visible `Close Position` and `Delete / Remove Entry` buttons in each row.

### Task 5: Verification

- [ ] Run `node --experimental-strip-types src/lib/portfolio-trades.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Start or reuse the Next.js dev server and inspect `/portfolio` in browser if feasible.
