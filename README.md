# SignalForge AI Stock Dashboard

A modern AI-powered stock analysis and recommendation dashboard built with Next.js, TypeScript, TailwindCSS, Prisma, Supabase-ready schema, Recharts, and API examples for OpenAI plus market-data providers.

## Features

- Search any ticker with deterministic mock fallback data.
- Quote tracking through `/api/stocks/:symbol`, with route-level caching and 30 second dashboard polling when Finnhub or Polygon credentials are configured.
- AI recommendation model: Buy, Hold, Sell, risk score, bullish/bearish confidence, short-term trend, swing trade ideas, earnings plays, unusual options activity, weighted confidence factors, and an ELI5 explanation.
- AI reasoning across valuation, momentum, news sentiment, earnings, technical analysis, and analyst sentiment.
- Watchlist, portfolio tracker with P/L, allocation, sector exposure, portfolio risk score, Sharpe/volatility estimates, daily top picks, trending stocks, market summary, sector performance, heatmap, top gainers, top losers, most active names, and fear/greed indicator.
- Upgraded chart controls with 1D/1W/1M/3M/YTD/1Y timeframes, line/candlestick modes, volume bars, crosshair tooltips, and toggleable VWAP, EMA 20/50/200, and Bollinger overlays.
- Stock detail pages with candlestick chart, RSI, MACD, VWAP, 50/200 EMA, volume analysis, earnings date, news feed, and AI summary.
- Alert settings UI for Discord, in-app/email-ready rules, automatic throttled Buy alerts, VWAP crosses, support/resistance breaks, unusual volume, momentum shifts, earnings reminders, and a test-alert button.
- Supabase SQL migration and Prisma schema for users, watchlists, portfolios, stock alerts, AI recommendations, transactions, and market news.

## Project Structure

```text
src/components/dashboard      Main dashboard shell
src/components/charts         Chart primitives and technical overlays
src/components/portfolio      Portfolio tracker and analytics
src/components/alerts         Alert settings UI
src/components/shared/ui      Shared cards, badges, meters, and layout primitives
src/lib                       Market data, mock data, storage, and shared types
src/app/api                   Stock, AI, market summary, and alert routes
```

## Getting Started

```bash
npm install
npm run prisma:generate
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the keys you want to enable:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
FINNHUB_API_KEY=
POLYGON_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=
DIRECT_URL=
DISCORD_WEBHOOK_URL=
EMAIL_PROVIDER_API_KEY=
```

The app works without keys using mock demo data and labels the UI as `Demo feed`. API keys are only read in server routes. Provider plans determine whether quotes are real-time, delayed, or end-of-day.

## API Examples

Fetch a stock profile:

```bash
curl http://localhost:3000/api/stocks/NVDA
```

Generate or fetch an AI recommendation:

```bash
curl -X POST http://localhost:3000/api/ai/recommendation \
  -H "Content-Type: application/json" \
  -d "{\"symbol\":\"NVDA\"}"
```

Fetch the daily market summary:

```bash
curl http://localhost:3000/api/market/summary
```

Send a Discord alert:

```bash
curl -X POST http://localhost:3000/api/alerts/discord \
  -H "Content-Type: application/json" \
  -d "{\"symbol\":\"NVDA\",\"message\":\"Price crossed target\"}"
```

## Database

Prisma models live in `prisma/schema.prisma`. Supabase SQL lives in `supabase/migrations/001_initial_schema.sql`.

For a Supabase project, set `DATABASE_URL` and `DIRECT_URL`, then run:

```bash
npm run prisma:migrate
```

## Provider Notes

- OpenAI: `src/app/api/ai/recommendation/route.ts` and `src/app/api/market/summary/route.ts` call the Responses API with JSON schema output.
- Finnhub: `src/lib/market-data.ts` demonstrates quote, profile, metrics, search, and company-news calls. API routes cache recent quote/search responses to reduce provider pressure and are structured for future WebSocket replacement.
- Polygon: `src/lib/market-data.ts` uses aggregate bars for chart timeframes when `POLYGON_API_KEY` is configured, with previous-close quote fallback if Finnhub is not available.
- Alerts: Discord routes send webhooks when credentials are present and return queued demo responses otherwise.

This project is for educational analysis workflows and is not financial advice.
