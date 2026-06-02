# Handoff: Hawkeye Stock Dashboard — Brutalist Monospace Redesign

## Overview

A high-density single-page stock analysis dashboard for the **Hawkeye** stock-AI app
(`losergame/stock-ai-dashboard` on GitHub). Inspired by Bloomberg-terminal density
but rendered in a strict **brutalist monospace** aesthetic — flat colors, sharp
corners, no shadows, everything aligned to a 1px grid.

The dashboard combines:
- Live ticker tape + market session status
- Watchlist + AI top picks (left rail)
- Price chart with technicals (center: line/candle, 6 timeframes, VWAP/EMA/Bollinger overlays, RSI + MACD oscillators, volume bars, crosshair tooltip)
- AI recommendation panel (right rail: buy/hold/sell verdict, confidence bars, risk meter, 6-factor signal decomposition, trade plan, per-ticker news)
- Bottom strip: gainers/losers, weighted heatmap, sector performance, AI market brief, fear & greed gauge, market news

## About the Design Files

The files in this bundle are **design references created in HTML** — a working
prototype demonstrating intended look, density, and interactions. They are NOT
production code to copy directly.

The target codebase already exists: **Next.js 14 + TypeScript + Tailwind +
Recharts + Lucide icons + Prisma** (see `losergame/stock-ai-dashboard`). The
existing implementation uses a dark cyan/emerald gradient theme; this redesign
replaces that with the brutalist monospace system below.

**The task is to recreate this HTML design inside the existing Next.js app**,
keeping its file structure (`src/components/dashboard/dashboard-shell.tsx`,
`src/components/charts/`, `src/lib/mock-data.ts`, etc.), API routes, and Prisma
schema intact. Rebuild the visual layer (Tailwind config, component styling,
chart rendering) — do not rebuild the data layer.

## Fidelity

**High-fidelity (hifi).** Exact hex values, typography, spacing, and
interaction states are all final. Recreate pixel-perfectly using the
codebase's existing libraries:
- Replace inline SVG charts with **Recharts** (already used) styled to match
- Replace this prototype's flat CSS with **Tailwind** + the design tokens below
- Reuse the existing **Lucide** icon set sparingly (the design is mostly text)

## Design System

### Color tokens (CSS custom properties)

These are the exact tokens the dashboard ships with. Put them in `globals.css`
(replacing the existing `:root` and `.dark` blocks).

```css
:root {
  --card: #ffffff;
  --ring: #a1a1a1;
  --input: #e5e5e5;
  --muted: #f5f5f5;
  --accent: #f5f5f5;
  --border: #e5e5e5;
  --radius: 0rem;
  --chart: #737373;
  --popover: #ffffff;
  --primary: #737373;
  --sidebar: #fafafa;
  --secondary: #f5f5f5;
  --background: #ffffff;
  --foreground: #0a0a0a;
  --destructive: #e7000b;
  --muted-foreground: #717171;
  --positive: oklch(0.55 0.14 145); /* green for gains by default */
  --grid-line: #ededed;
}

.dark {
  --card: #191919;
  --ring: #737373;
  --input: #525252;
  --muted: #262626;
  --accent: #404040;
  --border: #383838;
  --chart: #a1a1a1;
  --popover: #262626;
  --primary: #a1a1a1;
  --sidebar: #171717;
  --secondary: #262626;
  --background: #0a0a0a;
  --foreground: #fafafa;
  --destructive: #ff6467;
  --muted-foreground: #a1a1a1;
  --positive: oklch(0.74 0.14 145);
  --grid-line: #1f1f1f;
}
```

A user-facing tweak toggles `--positive` between `oklch(...)` green and the
foreground color (mono mode). Default is green.

### Typography

- **Family:** Geist Mono (`@import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap')`)
- **Stack:** `'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace`
- **Base size:** 13px / 1.45 line-height
- **Features:** `font-feature-settings: "tnum" 1, "zero" 1` (tabular numerals,
  slashed zero) — critical for column alignment of prices.

Type scale:
| Use | Size | Weight |
| --- | --- | --- |
| Ticker symbol headline | 28px | 700 |
| Price block | 32px | 700, letter-spacing -0.02em |
| AI verdict (BUY/HOLD/SELL) | 28px | 700 |
| Section/stat values | 14px | 700 |
| Body text | 12–13px | 400 |
| Stat labels | 9–10px | uppercase, letter-spacing 0.12em, muted |
| Eyebrows / section heads | 10px | 700, uppercase, letter-spacing 0.14em, muted |

### Spacing & shape

- **Border radius:** `0` everywhere. No rounded corners, no pill buttons.
- **Borders:** 1px solid `var(--border)`. Use 1px **dashed** for in-list dividers (`reason`, `news-item`, `mover`).
- **Shadows:** none. Depth comes from borders only.
- **Padding scale:** 6px / 8px / 10px / 12px / 14px / 16px / 20px.
- **Grid lines** inside the chart: 1px solid `var(--grid-line)`.

### Interactive states

- **Hover (rows/cells):** `background: var(--muted)`
- **Active/selected (watchlist row):** `background: var(--foreground); color: var(--background)` (inversion)
- **Focus visible:** `outline: 1px solid var(--foreground); outline-offset: -2px`
- **Button primary:** `background: var(--foreground); color: var(--background)`
- **Up values:** `color: var(--positive)` + `▲` prefix
- **Down values:** `color: var(--destructive)` + `▼` prefix

### Iconography

Almost no icons. Use:
- `▲` / `▼` glyphs for up/down deltas (NOT lucide chevrons)
- `⌕` for search, `⌘K` chip in the search input
- 6×6 px square `<span>` ("stance dot") for news/reasoning sentiment — `foreground` (bull), `destructive` (bear), `muted-foreground` (neutral)
- A 10-step 12×12 cell scale for risk (filled vs empty rects)
- A 4-segment horizontal bar with a triangle marker for fear & greed

Lucide can be used sparingly for nav, but the existing design uses none in body
content — keep it that way.

## Layout

The app is a fixed-height vertical stack with a 3-column main:

```
┌─────────────────────────────────────────────────────────────┐  6px
│  STATUS BAR (NYSE OPEN · date · clock · feed · VIX)         │
├─────────────────────────────────────────────────────────────┤  56px
│  HEADER  (logo · nav · search ⌘K)                           │
├─────────────────────────────────────────────────────────────┤  32px
│  TICKER TAPE  (S&P, NASDAQ, DOW, VIX, 10Y, DXY, GOLD, BTC)  │
├──────────┬─────────────────────────────┬────────────────────┤
│ 220px    │  fluid                       │ 380px              │
│          │                              │                    │
│ Watch-   │  Ticker bar                  │ AI recommendation  │
│ list +   │  Chart controls              │ Signal decomp      │
│ Top      │  Price chart + Volume        │ Trade plan         │
│ Picks    │  Stats strip (6 cols)        │ Per-ticker news    │
│ rail     │  RSI + MACD oscillators      │                    │
│          │                              │ (scrolls)          │
├──────────┴─────────────────────────────┴────────────────────┤
│  BOTTOM STRIP  (4 sections, 1fr each, divided by 1px)       │
│  Movers │ Heatmap + Sectors │ AI Brief + F&G │ Market News   │
├─────────────────────────────────────────────────────────────┤
│  FOOTER                                                      │
└─────────────────────────────────────────────────────────────┘
```

Implementation hint: use a top-level CSS Grid with `grid-template-rows: auto auto auto 1fr auto auto`. The 3-column main is `grid-template-columns: 220px 1fr 380px`. The bottom strip is `grid-template-columns: 320px 1fr 1fr 380px`.

## Screens / Views

There is one screen — the dashboard. Below, each region is documented in detail.

---

### 1. Status bar

- Height: 28px (6px vertical padding × text)
- Background: `--sidebar`
- Border-bottom: 1px solid `--border`
- Font: 11px, uppercase, letter-spacing 0.08em, color `--muted-foreground`
- **Left group:** `● NYSE OPEN` (dot is 6×6 px `--foreground`, blinks 2s when open) · `Tue, May 26, 2026` · `14:23:07 LOCAL`
- **Right group:** `FEED: DEMO` · `LAT 12ms` · `BAR 5m` · `VIX 14.21` (VIX in `--destructive`)

Behavior:
- Recompute every second
- The session label switches between OPEN / PRE-MARKET / AFTER-HOURS / CLOSED based on America/New_York time — use the existing `getMarketSession()` helper.

### 2. Header

- Height: 56px
- Padding: 14px 16px
- Border-bottom: 1px solid `--border`
- **Brand mark:** 18×18 px solid `--foreground` square with a 4px-inset `--background` square cut out (looks like a window/frame icon). Label: `HAWKEYE / DESK`, 13px 700.
- **Nav:** flat text buttons (`Dashboard` active = `--muted` bg + `--foreground`; others = `--muted-foreground`). 11px uppercase, 0.1em tracking, 6px 12px padding.
- **Search:** 340px wide, right-aligned. `⌕` icon left (absolute, 8px from left). `⌘K` kbd badge right (1px border, `--muted` bg, 10px). Placeholder: "Search symbol or company". Opens a popover of stock suggestions below (border, no shadow, 1px-bordered rows).
- Cmd/Ctrl+K focuses the input globally.

### 3. Ticker tape

- Height: 32px
- Overflow hidden, items in `display: inline-flex` with `border-right: 1px solid --border` between each
- 18px horizontal padding per item
- CSS animation: `transform: translateX(0) → translateX(-50%)`, 90s linear infinite (items are doubled to seamlessly loop)
- Item: `<span class="sym">SYM</span> <span>VALUE</span> <span class="pct up|down">+1.45%</span>`

Indices to show: S&P 500, NASDAQ, DOW, VIX, 10Y, DXY, GOLD, BTC, OIL (see `INDICES` in `data.js`).

### 4. Left rail — Watchlist + Top Picks (220px)

Background: `--sidebar`, border-right: 1px `--border`.

**Rail head** (sticky-feeling per section): 8px 12px, 10px uppercase 0.12em label · `+` add button on the right.

**Watchlist rows:**
- 2-column grid: name block (sym 12/700 + industry 10px muted) / price block (price 12px tabular + pct 10px colored)
- 6px 12px padding, 1px solid border-bottom
- Hover: `--muted` bg
- Selected: `--foreground` bg, `--background` text (full inversion); the `.pct.down` becomes a softer pink (`#ffb3b8`) so it stays readable

**Top Picks** below the watchlist:
- Same row chrome but stacks an action chip (BUY badge: 1px border, 10px 700) and a 1-line thesis (10px muted) + risk score (9px muted)

### 5. Center column

#### Ticker bar (top of center)

A 4-column grid: `auto auto 1fr auto`.

| Col 1 | Col 2 | Col 3 (spacer) | Col 4 |
| --- | --- | --- | --- |
| Sym 28/700 | Name + tag pills | – | Price block (32/700) + change (14px, colored, ▲/▼ prefix) |

Tag pills: 1px joined border (no border-right on all but last). 10px uppercase 0.08em, 2px 6px padding. Tags: sector / industry / NASDAQ.

Change line: format `+6.31 (+2.86%)` with `▲` for up, `▼` for down — `::before` content.

#### Chart controls strip

- 8px 20px padding, `--sidebar` background, 1px bottom border
- 11px font

Contains:
1. **Timeframe segmented control:** 1D / 1W / 1M / 3M / YTD / 1Y. Buttons share a 1px border (border-right: 0 on all but last). Active = inverted (`--foreground` bg).
2. **Mode segmented control:** Line / Candle.
3. **Overlays group:** label "OVERLAYS" then a flex row of checkbox-style labels — VWAP, EMA 20, EMA 50, EMA 200, Bollinger. Active = `--foreground` border + `--foreground` text; inactive = `--border` + muted.

#### Price chart

- Drawn inside a 1px-bordered `.chart-host` div
- Background grid: two repeating linear gradients (`--grid-line` 1px) — 80px horizontal × 40px vertical
- The chart itself is SVG with `preserveAspectRatio="none"` (it stretches with the container)
- **Last price badge** and **y-axis labels** are rendered as ABSOLUTELY POSITIONED HTML overlays, not SVG `<text>` — this is critical because the stretched SVG would distort the type horizontally. Position them with `top: %` based on the y-scale, anchored to a 56px-wide right gutter.
- Line mode: filled area at 5% opacity + 1.4px stroke line, color = `--foreground`
- Candle mode: solid filled candles. Up = `--positive`, down = `--destructive`. Wick 0.8px stroke, body 0.9px stroke matching fill.
- Overlays: dashed strokes at varied opacities (VWAP 4-3 dash, EMA50 6-2 dash, EMA200 2-2 dash). In candle mode, opacities drop by ~20% so candles stay legible.
- Crosshair on hover: vertical + horizontal dashed lines, a small dot at the close, and a popup chrome box (1px solid `--foreground`, `--popover` bg) showing O/H/L/C/Vol with 9px monospace labels.
- Implementation should use the existing **Recharts** library — it supports custom shape renderers; recreate the look with `<ComposedChart>` + `<XAxis tick={false}>` + a custom candle shape.

#### Volume chart

- 80px tall, 1px border
- Same stretched SVG. Bars: up = `--foreground` 40% opacity, down = `--destructive` 40% opacity
- "VOLUME" label is also an HTML overlay (top: 6px, left: 8px, 9px muted)

#### Stats strip

6 equal columns separated by 1px borders. Each stat: 10px 12px padding.

| Label | Value | Subtext |
| --- | --- | --- |
| Open | 221.30 | Prev 220.78 |
| Day Range | 220.04 – 228.91 | Range 4.02% |
| 52-Week | 84.62 – 234.18 | 95% of range |
| Volume | 112.5M | 71% of avg (colored) |
| Market Cap | $5.50T | P/E 45.1 |
| Beta · Yield | 2.24 · 0.02% | EPS 5.04 · ER May 20 |

#### RSI / MACD oscillator strip

2 columns, 1px border between.
- Each panel: 10px 16px padding
- Header: 10px uppercase label (e.g. "RSI (14)") + value (e.g. "64.2 NEUTRAL/OVERBOUGHT/OVERSOLD")
- Body: 48px tall inline mini-chart (SVG line, no axes)
- RSI shows horizontal 70 (destructive dashed) and 30 (foreground dashed) reference lines + a 50 mid-line
- MACD shows the 0 line. Use simple line plots, no histogram in this view.

### 6. Right rail — AI panel (380px)

Vertical scroll, each section is 14px 16px padding with a 1px bottom border.

**Section header** (`<h3>`): 10px 700 uppercase 0.14em label · 1px-bordered 9px badge on the right (e.g. "MODEL v3.4" or "6 FACTORS").

#### Recommendation verdict
- 2-column grid: action label (28px 700, "BUY"/"HOLD"/"SELL") · confidence number (28px 700, e.g. "74%") + 9px muted "Bull confidence" caption
- Below: 8px tall 1px-bordered horizontal bar — filled portion = bull%, in `--foreground`
- Thesis paragraph: 12px, line-height 1.55
- Dashed divider (1px dashed `--border`)
- Bull/Bear confidence bars: 6px tall, 1px border. Bull = `--foreground` fill, Bear = `--destructive` fill.
- Dashed divider
- Risk: "RISK" label (left) + 10-cell scale (12px tall, 2px gap, filled = `--foreground`, empty = `--muted`) + score "6/10" (right)

#### Signal decomposition
6 rows of: 8×8 marker square · label + 1-line note · score N/100. Marker: bull = `--foreground` fill, bear = `--destructive` fill, neutral = `--muted`. Dashed bottom border between rows.

#### Trade plan
Key-value rows for: Action, Earnings, VWAP, EMA 50, EMA 200. Label uppercase muted 10px, value 11px right-aligned. Then "SWING IDEA" eyebrow + 12px paragraph, then "OPTIONS FLOW" + paragraph.

#### Per-ticker news
3 news items. Each: meta row (source + "Nh AGO", both 9px muted uppercase) · stance dot + headline (11px). Hover underlines the headline.

### 7. Bottom strip (4 columns × 1px dividers)

#### A. Movers (320px)
Two subsections: "▲ GAINERS" / "▼ LOSERS", each a list of rows `sym | px | pct`. Click switches the active ticker.

#### B. Heatmap + Sectors (1fr)
- 4×3 grid of cells (1px gap, background `--border` so gaps look like borders). Each cell 64px min-height. `sym` (12/700) top-left, `pct` (11px) bottom-right. Cell tints with a `::before` overlay of `--foreground` (gains) or `--destructive` (losses) at `--intensity` opacity (proportional to |pct|, capped at 0.45). Hover: 1px solid `--foreground` outline.
- Below heatmap, a dashed divider, then a "SECTORS" list. Each row: 100px name (10px uppercase muted) · centered-zero bar · pct value. The bar's center is at 50%; positive bars extend right (`--foreground`), negative extend left (`--destructive`).

#### C. AI Brief + Fear & Greed (1fr)
- 12px brief paragraph
- Dashed divider
- Eyebrow "FEAR & GREED" + a 32/700 score on the left + a 4-segment horizontal bar (destructive strong / destructive weak / foreground weak / foreground strong opacities) with a small triangle marker positioned at the score%. Labels below: FEAR · NEUTRAL · GREED, 9px muted, space-between.
- 11px muted commentary line.

#### D. Market News (380px)
Same news-item pattern as the right rail.

### 8. Footer
6px 16px, `--sidebar` bg, 10px uppercase muted. Left: "HAWKEYE / DESK · Demo feed · Not financial advice". Right: "Session OPEN · 14:23:07 LOCAL".

## Interactions & Behavior

- **Ticker switching:** Clicking any symbol anywhere (watchlist, top picks, movers, heatmap, top-pick cards) sets the active stock. The chart, ticker bar, stats, AI panel, and per-ticker news all rerender from the new symbol's data.
- **Search:** Typing filters the suggestions popover (matches symbol prefix or company name). Click or Enter selects.
- **⌘K / Ctrl+K:** focuses the search input globally.
- **Timeframe switch:** Regenerates chart data. 1D = 39 intraday bars; others = 22–252 daily bars.
- **Mode switch:** Line ↔ Candle. Overlays auto-dim in candle mode.
- **Overlay toggles:** Independent on/off for VWAP, EMA 20/50/200, Bollinger.
- **Chart hover:** Crosshair + tooltip with O/H/L/C/Vol at the hovered bar index.
- **Tweaks panel** (floating bottom-right, optional): theme (light/dark), density (default/compact), gains color (mono/green). Density compact reduces section padding by ~30%.
- **Session clock:** Recomputes every second.
- **Ticker tape:** Pure CSS marquee, 90s linear infinite, content doubled for seamless loop.

## State Management

The existing Next.js app already handles all state. Keys this design needs:
- `selected: StockProfile` — the active ticker
- `watchlist: string[]` — symbols
- `chartMode: "line" | "candle"`
- `timeframe: "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y"`
- `activeIndicators: ChartIndicator[]` — overlays
- `theme: "light" | "dark"`
- `density: "comfortable" | "compact"`
- `upColor: "neutral" | "green"` — gains color preference
- `search: string` + `searchFocused: boolean`

Server state (already wired in the existing app):
- `/api/stocks/[symbol]` for quotes
- `/api/stocks/search?query=` for suggestions
- 30-second auto-refresh polling

## Files

- `Dashboard.html` — entry point, loads scripts in order
- `styles.css` — all visual styling, tokens, animations
- `data.js` — mock stock data, indices, sectors, heatmap; series generators
  (`buildIntraday`, `buildExtended`) — these mirror `src/lib/mock-data.ts` from the source repo
- `charts.jsx` — `PriceChart`, `VolumeChart`, `OscChart` React components
- `dashboard.jsx` — `App` shell composing the layout
- `tweaks-panel.jsx` — floating tweak panel (ignore in production — these are
  prototype-only knobs)

## Implementation Notes for the Developer

1. **Map this to the existing `dashboard-shell.tsx`.** The component tree
   exists; replace styling and reorganize the JSX into the new 3-column layout.
2. **Replace the cyan/emerald gradient theme** in the existing `globals.css`
   with the token set above. The existing `--card`, `--border`, `--popover`
   tokens already exist; just override values.
3. **Convert chart rendering** from the existing Recharts components
   (`PriceAreaChart`, `CandlestickChart` in `src/components/charts/index.tsx`)
   to use these new visuals — keep Recharts but customize tick rendering,
   stroke colors, and add the custom candle shape. Critical: y-axis tick
   labels and the last-price badge must render in HTML (or a non-stretched
   SVG layer) — never as text inside a `preserveAspectRatio="none"` SVG, or
   they distort.
4. **Drop most Lucide icons.** This design is text-forward — keep the brand
   mark and a few nav icons only.
5. **Tabular numerals** — set `font-feature-settings` on `<body>` so prices
   align in columns.
6. **Borders, not shadows.** Tailwind `shadow-*` classes should be removed
   throughout.
7. **`rounded-*` classes should all become `rounded-none`** (or remove
   entirely).
8. **Tweaks-panel logic isn't needed** in production — replace with the
   existing theme toggle and a settings menu if you want exposure to density
   / gain-color options.

## Open questions for the developer

- Do you want to keep the existing scanner page and stock-detail page in the
  same brutalist style? If yes, those need their own design pass (this handoff
  covers the dashboard only).
- The 9-item ticker tape is hard-coded in `data.js`. In production it should
  pull from `/api/market/summary` or a live indices feed.
- The mock series generators use deterministic sine waves — production charts
  use real OHLCV from Finnhub/Polygon via `src/lib/market-data.ts`.

---

This is not financial advice. Educational analysis workflows only.
