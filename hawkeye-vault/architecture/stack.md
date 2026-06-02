# Tech Stack

## Runtime & Framework

| Package | Version | Purpose |
|---|---|---|
| `next` | ^15.3.3 | App Router, SSR/RSC, API routes |
| `react` | ^19.1.1 | UI framework |
| `react-dom` | ^19.1.1 | DOM rendering |
| `typescript` | ^5.9.2 | Type safety |

## Styling

| Package | Version | Purpose |
|---|---|---|
| `tailwindcss` | ^4.1.13 | Utility-first CSS — **v4, uses `@import "tailwindcss"` not config file** |
| `@tailwindcss/postcss` | ^4.1.13 | PostCSS integration |
| `tailwind-merge` | ^3.3.1 | Conditional class merging (`cn()` helper) |
| `clsx` | ^2.1.1 | Class name utility (used inside `cn()`) |
| `next-themes` | ^0.4.6 | Dark/light theme provider |
| `framer-motion` | ^12.40.0 | Animations (page transitions, panel reveals) |

**Important Tailwind v4 note**: No `tailwind.config.ts`. CSS variables defined in `src/app/globals.css` under `:root` and `.dark` blocks, registered in `@theme inline`. Custom utilities like `bg-surface-1`, `bg-surface-2`, `text-foreground` etc. are defined there.

## UI Components & Icons

| Package | Version | Purpose |
|---|---|---|
| `lucide-react` | ^0.544.0 | All icons throughout the app |
| `@radix-ui/react-tooltip` | ^1.2.8 | Accessible tooltips |
| `sonner` | ^2.0.7 | Toast notifications |

## Charts & Data Visualization

| Package | Version | Purpose |
|---|---|---|
| `recharts` | ^3.2.1 | Analytics charts (equity curve, P&L distribution, bar charts) |
| `lightweight-charts` | ^5.2.0 | TradingView-style OHLC price charts in stock detail |

## Data & APIs

| Package | Version | Purpose |
|---|---|---|
| `googleapis` | ^173.0.0 | Google Sheets API v4 (service account auth) |
| `@supabase/supabase-js` | ^2.57.4 | Supabase client (secondary — Sheets is primary) |
| `@prisma/client` | ^6.16.2 | Prisma ORM for PostgreSQL (Supabase) |
| `prisma` | ^6.16.2 | Prisma CLI (dev) |

## External Services & APIs

| Service | Used For | Key Limits |
|---|---|---|
| **Finnhub** | Live quotes, daily candle history | Free: 60 req/min, daily bars only |
| **Polygon.io** | Historical candles (fallback) | Free: delayed data |
| **Google Sheets** | All persistence (positions, trades, signals, watchlist, settings) | 300 req/min |
| **Discord** | Buy/sell/SL alerts, preset change notifications | Webhook POST |
| **Supabase** | PostgreSQL database (Prisma schema defined, mostly unused in practice) | — |

## Build & Lint

| Package | Version | Purpose |
|---|---|---|
| `eslint` | ^9.35.0 | Linting |
| `eslint-config-next` | ^15.5.4 | Next.js ESLint rules |

## Next.js Config (next.config.js)

```js
experimental: {
  optimizePackageImports: ["lucide-react", "recharts"]
}
```

No custom webpack config. No image domains needed (no `next/image` for external images).

## Environment Variables

| Key | Purpose |
|---|---|
| `FINNHUB_API_KEY` | Live quotes + candle history |
| `POLYGON_API_KEY` | Candle history fallback (optional) |
| `DISCORD_WEBHOOK_URL` | Alert notifications |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | The target spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google auth |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Google auth (stored with literal `\n`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key |
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `DIRECT_URL` | Direct PostgreSQL connection (Supabase migrations) |
