# Git Workflow

## Repository State

- **Branch**: `master` (single active branch)
- **Remote**: GitHub (user: losergame)
- **Commits**: 2 total (initial commit + skills/theme/UI improvements)

## Commit Convention

No formal convention enforced. Descriptive messages preferred:
```
Add FIFO lock to prevent duplicate paper positions
Fix PaperTrades column order after realism upgrade
Add real candle prefetch endpoint and coverage metrics
```

## What NOT to Commit

- `.env.local` — contains Finnhub key, Google service account private key, Discord webhook URL
- `.claude/settings.local.json` — contains GitHub PAT tokens
- `.next/` — build output (already in .gitignore)
- `node_modules/` (already in .gitignore)

## Build Before Committing

Always run `npm run build` and ensure zero TypeScript errors before committing.

## Session Work Pattern

1. Make changes
2. Test manually in browser
3. `npm run build` — verify zero errors
4. Log what was done in `hawkeye-vault/sessions/session-log.md`
5. Commit

## Critical Files to Protect

If any of these are accidentally modified, verify integrity before committing:
- `src/lib/google-sheets.ts` — auth logic, cache logic
- `src/app/api/paper/run/route.ts` — FIFO lock, all paper trading state management
- `src/lib/paper-trading.ts` — risk constants (changing these affects live dataset)
- `src/lib/tickers/sp500.ts` / `nasdaq100.ts` / `russell2000.ts` — universe lists
