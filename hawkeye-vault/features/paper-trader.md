# Paper Trading Feature

## Overview

Simulates swing trading with $1,000 starting capital. Tracks positions in Google Sheets. Runs automatically every 5 minutes (when enabled) or manually via "Execute Top Pick". All execution parameters model real-world constraints.

---

## Risk Controls

| Parameter | Value | Constant |
|---|---|---|
| Starting balance | $1,000 | `DEFAULT_STARTING_BALANCE` |
| Risk per trade | 2% of account | `RISK_PER_TRADE_PCT = 0.02` |
| Max position size | 25% of account | `MAX_POSITION_PCT = 0.25` |
| Max concurrent positions | 3 | `MAX_POSITIONS = 3` |
| Min price to trade | $5.00 | `MIN_PRICE_FOR_PAPER_TRADE` |
| Min daily volume (ADV) | 500,000 | `MIN_DAILY_VOLUME` |
| Cooldown after any exit | 30 minutes | `TICKER_COOLDOWN_MINUTES = 30` |

---

## Position Sizing Formula

```
shares = min(
  floor(accountValue × 0.02 / (entryPrice - stopLoss)),  // 2% risk
  floor(accountValue × 0.25 / entryPrice)                // 25% cap
)
```
Rounds DOWN to whole shares. If result is 0, trade is rejected.

---

## Execution Realism

### Slippage
- Buy slippage: +0.1% applied to `entryPrice` → `effectiveEntryPrice`
- Sell slippage: −0.1% applied to `exitPrice` → `effectiveExitPrice`
- P&L computed from effective prices
- `slippageCost` = total drag in dollars from both legs

### Gap Risk
- **SL exits**: Fill at current market price (may be WORSE than SL level)
- **TP exits**: Fill at TP1 price exactly (limit order model)
- `gapType`: `"adverse"` (SL gap — market price < SL), `"favorable"` (TP gap — market price > TP), `"none"`
- `gapAmount`: $ amount price gapped beyond the level

### Liquidity Filter
- Rejects tickers with price < $5.00 or ADV < 500,000
- Applied before position sizing, not after

---

## Run Cycle Logic (`runCycle()` in paper-trading.ts)

### Step 1: Evaluate Open Positions

For each open position, fetch current price and check:

```
if price ≤ stopLoss:
  close at market price (gap risk applies)
  result = "loss" (usually), record gapType="adverse" if price < stopLoss

elif price ≥ takeProfit1:
  close at TP1 price (limit order)
  result = "win", record gapType="favorable" if price > TP1
```

### Step 2: Buy Qualifying Signals (only when `isRunning = true`)

Pre-filtering order:
1. Invalid setup geometry (`entryPrice ≤ stopLoss` etc.)
2. Confidence too low (default min: 60%)
3. R/R too low (default min: 1.5)
4. Scanner score too low (if preset active)
5. Price < $5.00
6. ADV < 500,000
7. Zero-quote guard (live price = 0)
8. Position limit reached (MAX_POSITIONS = 3)
9. `heldTickers` — ticker already in open positions
10. Cooldown — ticker in recent closed trades (last 30 min)

---

## Concurrent Access Protection

Three callers can POST `/api/paper/run` simultaneously:
- 30-sec price check loop (`signals: []`)
- 5-min auto-trade loop (`signals: [all]`)
- `executeTopPick()` button

**FIFO lock**: Module-level `acquireRunLock()` / `releaseRunLock()` in `run/route.ts`. Serialises all calls. Timeout: 25 seconds → HTTP 429.

**Position dedup (3 layers)**:
1. `invalidateSheetCache(PAPER_POSITIONS)` before every `loadPaperState()`
2. Pre-write fresh read in `savePaperState()` — aborts if ticker already in Sheets
3. Fingerprint dedup: `ticker|entryPrice|shares|openedAt_min`

**Trade dedup**: `ticker|buyPrice|sellPrice|shares|openedAt_min|closedAt_min` fingerprint, 60-min lookback.

---

## Hook Architecture (usePaperTrader)

```
usePaperTrader()
├── 30-second setInterval
│   ├── Fetch live prices for ALL open positions
│   └── POST /api/paper/run { signals: [], prices: {...} }
│       └── Only evaluates TP/SL, does NOT open new positions
│
├── 5-minute setInterval (when autoTradeEnabled)
│   ├── Fetch all 3 universes from scanner API
│   └── POST /api/paper/run { signals: [...all], prices: {} }
│       └── Evaluates TP/SL AND looks for new buys
│
└── executeTopPick()
    ├── Fetch all 3 universes
    ├── Score and pick rank #1
    ├── Fetch live prices for open positions + pick ticker
    └── POST /api/paper/run { signals: [#1 pick], prices: {...}, allowOutsideHours: true }
```

**Test Mode**: `testMode = true` bypasses market hours check (stored in localStorage `hawkeye-paper-test-mode-v1`).

**Auto Trade**: `autoTradeEnabled = true` enables the 5-min loop (stored in `hawkeye-paper-auto-trade-v1`).

---

## Synthetic Candle Gate

If `allowSyntheticData = false` (AppSetting, default):
- Signals with `candleSource === "mock"` or no `candleSource` are filtered out before `runCycle()`
- `debug.syntheticBlocked` in response shows how many were rejected
- This means paper trader will only trade setups derived from real OHLC data

---

## Realism Score Factors

`computeRealismScore(realCandlePct)` in `paper-analytics.ts`:

| Factor | Weight | Score |
|---|---|---|
| Fill Price — TP exits | 15% | 90/100 |
| Fill Price — SL exits | 15% | 75/100 |
| Candle data quality | 20% | Scales with `realCandlePct` (15→95) |
| Live quote source | 15% | 80/100 |
| Position sizing | 10% | 85/100 |
| Market hours | 5% | 90/100 |
| Slippage model | 10% | 75/100 |
| Gap risk — SL | 8% | 80/100 |
| Gap risk — TP | 7% | 85/100 |
| Liquidity filter | 5% | 75/100 |
| Cooldown logic | 5% | 65/100 |

Current score with 0% real candles: ~**65/100**. With 80%+ real candles: ~**78/100**.

---

## Google Sheets Schema

### PaperAccount (single row, replaced on each run)
`accountId, startingBalance, cashBalance, equityValue, totalAccountValue, totalPnL, totalPnLPercent, totalTrades, wins, losses, winRate, updatedAt`

### PaperPositions (replaced on each run)
`positionId, ticker, companyName, setupType, entryPrice, currentPrice, shares, positionValue, stopLoss, takeProfit1, takeProfit2, unrealizedPnL, unrealizedPnLPercent, status, openedAt, updatedAt, notes`

### PaperTrades (appended, deduplicated)
Original columns: `tradeId, ticker, companyName, setupType, buyPrice, sellPrice, shares, positionSize, profitLoss, profitLossPercent, result, reasonOpened, reasonClosed, openedAt, closedAt, holdTimeHours, notes`
Realism upgrade appended columns: `effectiveEntryPrice, effectiveExitPrice, slippageCost, gapType, gapAmount`

**Column order matters** — new fields were appended at the END to avoid misaligning existing row data.

### PaperEquityCurve (appended)
`date, accountValue, cashBalance, investedValue, dailyPnL, totalPnLPercent`

---

## Rebuild Route

`POST /api/paper/rebuild` recalculates account from scratch:

```
cashBalance = startingBalance
            - sum(entryPrice × shares for open positions)
            + sum(profitLoss for valid closed trades)

equityValue = sum(entryPrice × shares for open positions)

totalAccountValue = cashBalance + equityValue
```

Deduplicates open positions by ticker (keeps earliest `openedAt`). Reports `dupPositionCount` in response.
Removes suspicious trades (profitLossPercent > 100 or < -80).
