import { findStock, portfolioHoldings } from "@/lib/mock-data";
import type { PortfolioHolding, TimePoint } from "@/lib/types";

export const PORTFOLIO_STORAGE_KEY = "signalforge-portfolio-v1";

export interface StoredPortfolioRow {
  id: string;
  symbol: string;
  shares: number;
  averageCost: number;
}

interface StoredFile {
  version: 1;
  rows: StoredPortfolioRow[];
}

function newRowId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function seedRowsFromHoldings(holdings: PortfolioHolding[]): StoredPortfolioRow[] {
  return holdings.map((h, index) => ({
    id: `seed-${index}-${h.symbol}`,
    symbol: h.symbol,
    shares: h.shares,
    averageCost: h.averageCost
  }));
}

export function loadPortfolioRows(): StoredPortfolioRow[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFile>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.rows) || parsed.rows.length === 0) {
      return null;
    }

    return parsed.rows
      .filter((row) => row && typeof row.symbol === "string" && typeof row.shares === "number" && typeof row.averageCost === "number")
      .map((row) => ({
        id: typeof row.id === "string" ? row.id : newRowId(),
        symbol: String(row.symbol).trim().toUpperCase(),
        shares: Math.max(0, Number(row.shares)),
        averageCost: Math.max(0, Number(row.averageCost))
      }))
      .filter((row) => row.symbol.length > 0);
  } catch {
    return null;
  }
}

export function savePortfolioRows(rows: StoredPortfolioRow[]) {
  if (typeof window === "undefined") return;

  try {
    const payload: StoredFile = { version: 1, rows };
    window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearPortfolioStorage() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(PORTFOLIO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function portfolioValueFromHoldings(holdings: PortfolioHolding[]) {
  return holdings.reduce((sum, h) => sum + findStock(h.symbol).price * h.shares, 0);
}

function portfolioValueFromRows(rows: StoredPortfolioRow[]) {
  return rows.reduce((sum, r) => sum + findStock(r.symbol).price * r.shares, 0);
}

export function rowsToHoldings(rows: StoredPortfolioRow[]): PortfolioHolding[] {
  const enriched = rows.map((row) => {
    const stock = findStock(row.symbol);
    const value = stock.price * row.shares;
    return {
      row,
      stock,
      value,
      name: stock.name
    };
  });

  const total = enriched.reduce((sum, item) => sum + item.value, 0);

  const mapped = enriched.map((item) => ({
    symbol: item.stock.symbol,
    name: item.name,
    shares: item.row.shares,
    averageCost: item.row.averageCost,
    allocation: total > 0 ? (item.value / total) * 100 : 0
  }));

  const rounded = mapped.map((h) => ({
    ...h,
    allocation: Math.round(h.allocation * 10) / 10
  }));

  const drift = 100 - rounded.reduce((sum, h) => sum + h.allocation, 0);
  if (rounded.length > 0 && Math.abs(drift) >= 0.05) {
    const last = rounded[rounded.length - 1];
    rounded[rounded.length - 1] = {
      ...last,
      allocation: Math.round((last.allocation + drift) * 10) / 10
    };
  }

  return rounded;
}

export function scalePerformanceToModeledValue(
  basePerformance: TimePoint[],
  baselineHoldings: PortfolioHolding[],
  rows: StoredPortfolioRow[]
): TimePoint[] {
  const baseline = portfolioValueFromHoldings(baselineHoldings);
  const modeled = portfolioValueFromRows(rows);
  if (baseline <= 0 || modeled <= 0) return basePerformance;

  const factor = modeled / baseline;
  return basePerformance.map((point) => ({
    ...point,
    value: Math.round(point.value * factor)
  }));
}

export const defaultPortfolioBaseline = portfolioHoldings;
