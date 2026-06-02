# APIs and Rate Limits

> No secrets stored here. See `.env.local` for actual keys (never commit that file).

## Finnhub

- **Tier**: Free
- **Rate limit**: 60 requests/minute
- **Used for**:
  - Live quotes: `GET /api/v1/quote?symbol=X&token=KEY`
  - Historical daily candles: `GET /api/v1/stock/candle?symbol=X&resolution=D&from=T&to=T&token=KEY`
- **Candle data quality**: `"real"` (same-day data available)
- **Limitations**: Daily bars only on free tier. No intraday. Returns `s: "no_data"` for delisted tickers.
- **Scanner usage**: Fetches live quotes for up to 60 tickers per scan. Candle prefetch at ~40 req/min (8 concurrent, 1.2s delay).
- **Cache strategy**: Quote cached 30s (Next.js `revalidate: 30`). Candles cached 4 hours in `real-candles.ts` memory cache.

## Polygon.io

- **Tier**: Free (delayed data)
- **Rate limit**: Unknown (used as fallback only)
- **Used for**: Historical daily candles when Finnhub returns no data
- **Candle data quality**: `"delayed"` (~15 min delay on free tier)
- **Endpoint**: `GET /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}?adjusted=true&sort=asc&apiKey=KEY`
- **Key env var**: `POLYGON_API_KEY` (optional — Finnhub is primary)

## Google Sheets API v4

- **Auth**: Service account (JWT via `googleapis`)
- **Rate limit**: 300 requests/minute (Google quota)
- **Used for**: All data persistence
- **Key operations**:
  - `spreadsheets.values.get` — read rows (cached 30s in-memory)
  - `spreadsheets.values.append` — append rows to sheet
  - `spreadsheets.values.clear` — clear data range
  - `spreadsheets.values.update` — update single cell/row
  - `spreadsheets.batchUpdate` — conditional formatting
- **Auth setup**: `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (stored with literal `\n` — must `.replace(/\\n/g, "\n")` before use)

## Discord Webhook

- **Rate limit**: Not enforced, but best practice is 1 per second
- **Used for**: Paper buy alerts, sell/SL alerts, preset change notifications, test pings
- **Env var**: `DISCORD_WEBHOOK_URL`
- **Format**: Rich embeds with color coding (green=buy, red=loss, amber=SL)

## Supabase / PostgreSQL

- **Status**: Schema exists (`prisma/schema.prisma`), not actively used for paper trading
- **Contains models**: User, Watchlist, Portfolio, StockAlert, AiRecommendation, Transaction, ScannerSignal, MarketNews
- **Connection**: `DATABASE_URL` (Supabase pooled), `DIRECT_URL` (direct for migrations)
- **Note**: Google Sheets has replaced most Supabase usage. Prisma schema is retained for potential future use.
