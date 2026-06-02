/** Shared candle quality constants — no imports, safe to use in client bundles. */

/** Minimum bars for the full indicator suite (EMA 200 reliability). */
export const MIN_BARS_SUFFICIENT = 200;

/** Minimum bars worth caching at all (EMA 20 needs 20). */
export const MIN_BARS_FETCH = 20;

/** Days of history requested per API call (~1 trading year). */
export const FETCH_DAYS = 252;
