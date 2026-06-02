# Optimization Engine & Rule Simulator

## Location
Both in `src/lib/paper-analytics.ts`, rendered in `src/components/paper/analytics-dashboard.tsx`.

---

## Optimization Suggestions (`generateOptimizationSuggestions`)

Analyzes closed trade data and compares performance across different parameter slices to generate actionable rule change suggestions.

### Suggestion Types
| Suggestion | Trigger Condition | Severity |
|---|---|---|
| Raise min confidence | Win rate for low-confidence trades < 40% | Major |
| Tighten RSI band | High-RSI trades (>70) underperform | Minor |
| Disable setup type | One type with <35% win rate and >5 samples | Major |
| Reduce position size | Max drawdown exceeds 20% of account | Major |
| Loosen R/R threshold | Filtering too many valid setups | Minor |
| Extend cooldown | Same-ticker re-entry losses >50% | Minor |

Each suggestion has:
- `id`: unique string key
- `severity`: `"major"` | `"minor"` | `"info"`
- `title`: short summary
- `description`: detailed explanation
- `currentValue` / `suggestedValue`: the change being recommended

Uses `DEAD_TICKERS` from scanner-engine to exclude dead-ticker trades from analysis.

---

## Rule Simulator (`simulateRules`)

Applies a set of filter rules to the existing trade history and shows what the performance would have been.

### Simulatable Rules
- Setup types (whitelist/blacklist)
- Min confidence score
- Min R/R ratio
- RSI range at entry
- Market regime filter
- Min scanner score
- Max position size %

### Output
```typescript
{
  filteredTrades:   PaperTrade[];
  winRate:          number;
  totalPnL:         number;
  totalTrades:      number;
  avgWin:           number;
  avgLoss:          number;
  profitFactor:     number;
  excluded:         number;   // how many trades were filtered out
  exclusionPct:     number;
}
```

Used in the Analytics Dashboard "Rule Simulator" section. Compare current vs simulated results side-by-side.

---

## Rule Presets

Saved sets of scanner/paper trader thresholds stored in the `RulePresets` Google Sheets tab.

### Preset Fields
- `name`: display name
- `scope`: `"scanner"` | `"paper"` | `"both"`
- `minScannerScore`: number
- `minConfidence`: number
- `minRiskReward`: number
- `setupTypesAllowed`: pipe-delimited string
- `excludedTickers`: pipe-delimited string
- `createdAt`, `updatedAt`

### Applying a Preset
1. User selects preset → `POST /api/presets/active` with preset ID
2. Route writes all threshold values to AppSettings KV store
3. Scanner route reads these overrides on every request
4. Paper run route reads these overrides before `runCycle()`
5. `notifyRulePresetChange()` sends Discord notification

### Active Strategy Panel
`src/components/shared/active-strategy-panel.tsx` — shows on Scanner, Paper, and Analytics pages:
- Active preset name and scope
- All threshold values
- Warnings: low sample size, high exclusion rate, scope mismatch

---

## SETUP_TYPES constant

```typescript
export const SETUP_TYPES = [
  "Momentum Breakout",
  "Pullback Buy",
  "Oversold Bounce",
  "Trend Continuation",
] as const;
```

Used as the canonical list in analytics dropdowns and simulator.
