# Hawkeye — Master Project Context

> Read this file first. It is the single source of truth for project state.
> After reading this, read the specific `features/` file for any feature you are modifying.
> Log what you did in `sessions/session-log.md` at the end of every session.

---

## What Is This?

**Hawkeye** is a Bloomberg-aesthetic stock analysis dashboard built with Next.js 15.
It scans stocks for technical setups, paper-trades those setups, tracks signal performance,
and logs everything to Google Sheets for persistence.

No broker integration. No real money. Research and simulation only.

---

## Tech Stack (short version)

| Layer | Technology |
|---|---|
| Framework | Next.js 15.5 App Router, TypeScript 5, React 19 |
| Styling | Tailwind CSS v4 (`@import "tailwindcss"`), no config file |
| Charts | Recharts (analytics/equity), lightweight-charts (price charts) |
| UI primitives | Radix UI via lucide-react icons, sonner toasts |
| Animation | Framer Motion |
| Data store | Google Sheets API v4 (service account auth) — **sole source of truth** |
| Secondary DB | Supabase / Prisma (schema exists but mostly unused — Sheets is primary) |
| Live prices | Finnhub API (free tier: 60 req/min) |
| Historical candles | Finnhub (daily bars) → Polygon fallback |
| Notifications | Discord webhook |
| Theme | Dark/light toggle via next-themes + `ThemeProvider` |

Full details → `architecture/stack.md`

---

## Current State (as of 2026-05-31)

- **725 tickers** across S&P 500 (503), NASDAQ 100 (100), Russell 2000 (~2000 raw, many overlap)
- **4 setup types**: Momentum Breakout, Pullback Buy, Oversold Bounce, Trend Continuation
- **Scanner scoring**: 6 components, max 100 pts
- **Paper trader**: $1,000 starting balance, 2% risk/trade, max 3 concurrent positions
- **Execution realism score**: ~74/100 (slippage, gap risk, liquidity filter active)
- **Persistence**: Google Sheets (PaperAccount, PaperPositions, PaperTrades, PaperEquityCurve)
- **Real candle coverage**: Variable — depends on prefetch cache warmth (4-hr TTL)
- **Allow Synthetic Data setting**: OFF by default (AppSettings in Sheets)

---

## Current Priority

**Real candle coverage** — eliminate synthetic LCG candles wherever possible.
- `GET /api/scanner/prefetch` shows coverage per universe
- `POST /api/scanner/prefetch` triggers background warm-up
- `allowSyntheticData` AppSetting gates whether mock-candle setups are traded

---

## Critical Rules

1. **Never generate synthetic candles when real data is available** — check `allowSyntheticData` setting
2. **Google Sheets is the source of truth** — localStorage is cache/fallback only
3. **Never commit `.env.local`** — it contains Finnhub key, Google service account private key, Discord webhook
4. **Never commit `.claude/settings.local.json`** — contains GitHub PAT tokens
5. **Never rename localStorage keys**: `signalforge-portfolio-v1`, `signalforge-discord-auto-buy-alerts-v1`, `signalforge-discord-buy-alerts-sent-v1` — would break existing user data
6. **Always check `decisions/completed.md`** before making architecture changes
7. **Read `features/*.md`** before modifying any feature
8. **Log work in `sessions/session-log.md`** at end of session

---

## Key Files (quick reference)

| Purpose | File |
|---|---|
| Scanner engine (pure logic) | `src/lib/scanner-engine.ts` |
| Scanner API route | `src/app/api/scanner/route.ts` |
| Paper trading engine | `src/lib/paper-trading.ts` |
| Paper run API (with FIFO lock) | `src/app/api/paper/run/route.ts` |
| Real candle fetcher + cache | `src/lib/real-candles.ts` |
| Google Sheets client | `src/lib/google-sheets.ts` |
| Technical indicators | `src/lib/indicators.ts` |
| Scanner scoring | `src/lib/scanner-scoring.ts` |
| Paper analytics | `src/lib/paper-analytics.ts` |
| Main dashboard UI | `src/components/dashboard/dashboard-shell.tsx` |
| Paper trader hook | `src/hooks/usePaperTrader.ts` |

Full map → `architecture/file-map.md`

---

## Known Limitations

1. Synthetic candle generation still used when real candles aren't cached
2. No broker integration or live order routing
3. No sector exposure or correlation controls
4. Prisma/Supabase schema exists but Google Sheets is the actual data layer
5. Paper trader only supports long positions (no shorts)
6. In-process FIFO lock prevents duplicate positions within one process — not multi-process safe

---

## Quick Links

- `architecture/data-flow.md` — API → Scanner → Paper Trader → Sheets pipeline
- `features/paper-trader.md` — risk controls, execution model, slippage
- `features/scanner.md` — setup logic, scoring breakdown
- `bugs/known-issues.md` — current bugs and workarounds
- `decisions/completed.md` — all past architecture decisions and why
- `sessions/session-log.md` — what was done each session
