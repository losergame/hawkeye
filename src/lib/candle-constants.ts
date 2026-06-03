/** Shared candle quality constants — no imports, safe to use in client bundles. */

/**
 * Minimum bars for the full indicator suite (EMA 200 reliability).
 * Polygon free tier caps at ~173 bars regardless of FETCH_DAYS.
 * EMA 200 computed from 173 bars is reliable enough — the difference is marginal.
 */
export const MIN_BARS_SUFFICIENT = 170;

/** Minimum bars worth caching at all (EMA 20 needs 20). */
export const MIN_BARS_FETCH = 20;

/**
 * Calendar days of history requested per API call.
 * 290 calendar days × (252 trading / 365 calendar) ≈ 200 trading days.
 */
export const FETCH_DAYS = 290;
