# Portfolio Close Position Design

## Goal

Add a normal "Close Position" action to the Portfolio page that removes an open holding and persists the realized trade in a Google Sheets tab named `PortfolioTrades`.

## Existing Context

Portfolio holdings are stored in the `Portfolio` sheet through `/api/portfolio`. Current rows contain `id`, `ticker`, `shares`, `averageCost`, and derived sheet columns such as `updatedAt`. The UI recalculates open-position analytics from the rows currently loaded from Sheets.

Paper trading already has a server-side close flow, but it writes to `PaperTrades` and updates simulator account state. Manual portfolio closes need a separate ledger so user-entered holdings are not mixed with simulator history.

## Approach

Create a portfolio-specific close route at `POST /api/portfolio/[id]/close`. The route will load the holding fresh from Google Sheets, fetch a latest quote, calculate a closed-trade record, ensure the `PortfolioTrades` tab exists, append the trade, delete the open holding, and optionally send a Discord notification.

Existing portfolio rows do not have a true original open timestamp or reason. For historical/manual rows, use `openedAt = Portfolio.updatedAt || closedAt` and `reasonOpened = Manual Portfolio Entry`.

## Data Model

`PortfolioTrades` columns:

- `tradeId`
- `ticker`
- `companyName`
- `entryPrice`
- `exitPrice`
- `shares`
- `positionSize`
- `profitLoss`
- `profitLossPercent`
- `result`
- `reasonOpened`
- `reasonClosed`
- `openedAt`
- `closedAt`

## Close Calculations

- `entryPrice = averageCost`
- `exitPrice = latest quote price`
- `shares = holding.shares`
- `positionSize = entryPrice * shares`
- `profitLoss = (exitPrice - entryPrice) * shares`
- `profitLossPercent = positionSize > 0 ? (profitLoss / positionSize) * 100 : 0`
- `result = win` when profit is above zero, `loss` when below zero, and `breakeven` at zero
- `reasonClosed = Manual Portfolio Close`

## UI Behavior

Each open holding row shows:

- `Close Position`, the primary action
- `Delete / Remove Entry`, for mistaken/manual cleanup only

Closing asks for confirmation, shows a per-row loading state, reloads portfolio rows from Sheets after success, and shows errors without removing the row if quote or save fails.

## Safety

The route fetches the quote server-side immediately before closing. If the quote is missing, invalid, or unavailable, the close fails and no sheet mutation is made. Duplicate closes are prevented by requiring the holding to still exist in `Portfolio`; if it is already removed, no trade is appended.

## Verification

Automated tests cover closed-trade calculation and row mapping. Manual/dev verification covers that close removes the row, writes `PortfolioTrades`, preserves Delete behavior, and persists after refresh.
