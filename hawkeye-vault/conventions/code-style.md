# Code Style & Conventions

## Language & Typing

- **TypeScript strict mode** throughout. No `any`. Use `unknown` + type narrowing for external API responses.
- All API route handlers typed with explicit return types or inferred from `NextResponse.json()`.
- `as const` for enums and literal types (e.g., `SHEETS` object, `SETUP_TYPES` array).
- `type` imports preferred over `import` for types: `import type { Foo } from "..."`.

## File Organization

- Pure logic libs in `src/lib/` — **no I/O, no React, no Next.js imports**.
- API routes in `src/app/api/[path]/route.ts`.
- React hooks in `src/hooks/use*.ts`.
- UI components in `src/components/[domain]/`.
- Shared UI primitives in `src/components/shared/ui/`.
- Ticker data in `src/lib/tickers/`.

## Naming

- Files: `kebab-case.ts` (e.g., `paper-trading.ts`, `scanner-engine.ts`)
- React components: `PascalCase` function exports
- Hooks: `use` prefix (e.g., `usePaperTrader`, `useSignalTracker`)
- API routes: `route.ts` in Next.js App Router style
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `MAX_POSITIONS`, `DEAD_TICKERS`)
- Types/interfaces: `PascalCase` with descriptive names
- CSS variables: `--kebab-case` in globals.css

## Comments Policy

**No comments by default.** Only add a comment when the WHY is non-obvious:
- A hidden constraint
- A subtle invariant
- A workaround for a specific bug
- Behavior that would surprise a reader

Do NOT comment what code does (identifiers should be self-explanatory).
Do NOT reference current task, PR, or caller context in comments (these rot).

Example of good comment:
```ts
// FIX: was using Math.random() — replaced with deterministic seed so the
// same ticker always produces the same status (prevents hydration mismatches)
function setupStatus(currentPrice: number, entry: number, stopLoss: number, seed: number): StockSetupStatus {
```

## Tailwind CSS

- **v4 only** — `@import "tailwindcss"` in globals.css, no config file
- Semantic tokens preferred: `text-foreground`, `border-border`, `bg-card`, `bg-surface-1`, `bg-surface-2`
- Avoid hardcoded hex colors or dark-specific classes like `bg-[#07111f]` — use CSS variables
- The `cn()` utility from `src/lib/cn.ts` for conditional class merging

## Google Sheets Patterns

- Always `invalidateSheetCache(sheetName)` before any critical read where freshness matters
- Use `replaceAllRows` to replace all data rows (preserves header)
- Use `appendRows` to add new rows
- Use `readSetting(key)` / `writeSetting(key, value)` for AppSettings KV
- Batch all parallel writes with `Promise.all()`
- Handle read failures gracefully — fall back to defaults, never throw to user

## Error Handling

- Validate only at system boundaries (API inputs, external API responses)
- Never validate internal function arguments if the caller is always internal
- API routes return `{ error: string }` with appropriate HTTP status on failure
- Non-critical operations (Discord, formatting) are fire-and-forget wrapped in `void (async () => { try { ... } catch { /* non-fatal */ } })()`

## React Patterns

- `useCallback` for functions passed to `useEffect` dependencies
- `useMemo` for expensive computations dependent on large data arrays
- `useRef` for values that shouldn't trigger re-renders (e.g., `positionsRef.current` in usePaperTrader)
- `useState` initializers as functions for expensive initial state: `useState(makeDefaultAccount)` not `useState(makeDefaultAccount())`

## API Route Patterns

- Export named functions (`GET`, `POST`, `PATCH`, etc.) — Next.js App Router convention
- Parse request body once at top: `const { key, value } = await req.json() as { ... }`
- Check `isSheetsConfigured()` early and return 503 if not configured
- Wrap all Sheets operations in try/catch, never let unhandled exceptions crash the route

## Testing

No formal test suite. Manual verification workflow:
1. `npm run build` — TypeScript must compile clean
2. Start dev server, open browser
3. Hard-refresh after code changes
4. Check browser console for React warnings
5. Check server terminal for Next.js errors
