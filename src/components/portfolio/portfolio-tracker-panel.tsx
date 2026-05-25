"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";

import { PortfolioPerformanceChart } from "@/components/charts";
import { ChangePill, MetricTile, Panel, ScrollBody, SectionHeader } from "@/components/shared/ui";
import { cn } from "@/lib/cn";
import { findStock, portfolioHoldings, portfolioPerformance } from "@/lib/mock-data";
import {
  clearPortfolioStorage,
  loadPortfolioRows,
  savePortfolioRows,
  seedRowsFromHoldings,
  type StoredPortfolioRow
} from "@/lib/portfolio-storage";
import type { TimePoint } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

interface PortfolioQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  source: "live" | "demo";
}

interface ModeledHolding {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
  changePercent: number;
  costBasis: number;
  marketValue: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  allocation: number;
  source: "live" | "demo";
}

interface PortfolioTotals {
  value: number;
  cost: number;
  gain: number;
  gainPercent: number;
  dayChange: number;
  dayChangePercent: number;
}

interface SectorExposure {
  sector: string;
  value: number;
  allocation: number;
}

interface PortfolioAnalytics {
  sharpeRatio: number;
  volatility: number;
  riskScore: number;
  topContributor: ModeledHolding | null;
  topDrag: ModeledHolding | null;
  sectorExposure: SectorExposure[];
}

interface StockApiResponse {
  provider: "demo" | "finnhub" | "polygon";
  profile: {
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
  };
}

function normalizeSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  return normalized ? findStock(normalized).symbol : "";
}

function fallbackQuote(symbol: string): PortfolioQuote {
  const stock = findStock(symbol);
  return {
    symbol: stock.symbol,
    name: stock.name,
    price: stock.price,
    changePercent: stock.changePercent,
    source: "demo"
  };
}

function formatSignedMoney(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${money.format(value)}`;
}

function makePortfolioCurve(base: TimePoint[], totals: PortfolioTotals): TimePoint[] {
  if (!base.length) return [];

  const first = totals.cost > 0 ? totals.cost : totals.value;
  const last = totals.value;
  if (first <= 0 && last <= 0) {
    return base.map((point) => ({ ...point, value: 0 }));
  }

  const baseStart = base[0]?.value ?? 0;
  const baseEnd = base.at(-1)?.value ?? baseStart;
  const baseRange = baseEnd - baseStart || 1;
  const change = last - first;
  const wiggle = Math.max(Math.abs(change) * 0.12, Math.max(first, last) * 0.012, 18);
  const maxIndex = Math.max(base.length - 1, 1);

  return base.map((point, index) => {
    const timeProgress = index / maxIndex;
    const marketProgress = (point.value - baseStart) / baseRange;
    const progress = timeProgress * 0.65 + marketProgress * 0.35;
    const seasonal = index === 0 || index === maxIndex ? 0 : Math.sin(index * 1.55) * wiggle;
    const value = first + change * progress + seasonal;

    return {
      label: point.label,
      value: Math.max(0, Math.round(index === maxIndex ? last : value))
    };
  });
}

function buildHoldings(rows: StoredPortfolioRow[], quotes: Record<string, PortfolioQuote>): ModeledHolding[] {
  const validRows = rows
    .map((row) => ({ ...row, symbol: normalizeSymbol(row.symbol) }))
    .filter((row) => row.symbol && row.shares > 0);

  const raw = validRows.map((row) => {
    const quote = quotes[row.symbol] ?? fallbackQuote(row.symbol);
    const marketValue = quote.price * row.shares;
    const costBasis = row.averageCost * row.shares;
    const unrealizedGain = marketValue - costBasis;

    return {
      id: row.id,
      symbol: quote.symbol,
      name: quote.name,
      shares: row.shares,
      averageCost: row.averageCost,
      currentPrice: quote.price,
      changePercent: quote.changePercent,
      costBasis,
      marketValue,
      unrealizedGain,
      unrealizedGainPercent: costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0,
      allocation: 0,
      source: quote.source
    };
  });

  const totalValue = raw.reduce((sum, holding) => sum + holding.marketValue, 0);

  return raw.map((holding) => ({
    ...holding,
    allocation: totalValue > 0 ? (holding.marketValue / totalValue) * 100 : 0
  }));
}

function buildTotals(holdings: ModeledHolding[]): PortfolioTotals {
  const value = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const cost = holdings.reduce((sum, holding) => sum + holding.costBasis, 0);
  const gain = value - cost;
  const previousValue = holdings.reduce((sum, holding) => {
    const divisor = 1 + holding.changePercent / 100;
    const previousPrice = divisor > 0 ? holding.currentPrice / divisor : holding.currentPrice;
    return sum + previousPrice * holding.shares;
  }, 0);
  const dayChange = value - previousValue;

  return {
    value,
    cost,
    gain,
    gainPercent: cost > 0 ? (gain / cost) * 100 : 0,
    dayChange,
    dayChangePercent: previousValue > 0 ? (dayChange / previousValue) * 100 : 0
  };
}

function buildPortfolioAnalytics(holdings: ModeledHolding[], totals: PortfolioTotals): PortfolioAnalytics {
  const sectorMap = new Map<string, number>();
  for (const holding of holdings) {
    const sector = findStock(holding.symbol).sector;
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + holding.marketValue);
  }

  const sectorExposure = Array.from(sectorMap.entries())
    .map(([sector, value]) => ({
      sector,
      value,
      allocation: totals.value > 0 ? (value / totals.value) * 100 : 0
    }))
    .sort((first, second) => second.value - first.value);
  const topContributor = holdings.reduce<ModeledHolding | null>((best, holding) => (!best || holding.unrealizedGain > best.unrealizedGain ? holding : best), null);
  const topDrag = holdings.reduce<ModeledHolding | null>((worst, holding) => (!worst || holding.unrealizedGain < worst.unrealizedGain ? holding : worst), null);
  const concentrationRisk = Math.max(0, ...holdings.map((holding) => holding.allocation));
  const weightedBeta = holdings.reduce((sum, holding) => sum + findStock(holding.symbol).beta * (holding.allocation / 100), 0);
  const volatility = Math.max(6, Math.min(72, weightedBeta * 18 + concentrationRisk * 0.22));
  const excessReturn = totals.gainPercent - 4;
  const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0;
  const riskScore = Math.max(1, Math.min(10, Math.round(weightedBeta * 2.2 + concentrationRisk / 16 + (totals.gainPercent < -10 ? 1.5 : 0))));

  return {
    sharpeRatio,
    volatility,
    riskScore,
    topContributor,
    topDrag,
    sectorExposure
  };
}

function PortfolioHoldingsTable({
  holdings,
  totals,
  onPickSymbol
}: {
  holdings: ModeledHolding[];
  totals: PortfolioTotals;
  onPickSymbol?: (symbol: string) => void;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-white/10 bg-slate-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3">
        <div>
          <p className="text-sm text-slate-400">Portfolio value</p>
          <div className="flex flex-wrap items-end gap-3">
            <p className="text-2xl font-semibold text-white">{money.format(totals.value)}</p>
            <p className={cn("pb-1 text-sm font-semibold", totals.gain >= 0 ? "text-emerald-200" : "text-rose-200")}>
              {formatSignedMoney(totals.gain)} ({totals.gainPercent >= 0 ? "+" : ""}
              {totals.gainPercent.toFixed(2)}%)
            </p>
          </div>
        </div>
        <ChangePill value={totals.dayChangePercent} label="Day" />
      </div>
      <div className="max-h-[340px] overflow-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#151a25] text-xs uppercase tracking-[0.14em] text-slate-500 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
            <tr>
              <th className="px-4 py-3">Ticker</th>
              <th className="px-4 py-3">Shares</th>
              <th className="px-4 py-3">Avg cost</th>
              <th className="px-4 py-3">Last</th>
              <th className="px-4 py-3">Cost basis</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">P/L</th>
              <th className="px-4 py-3">Allocation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {holdings.map((holding) => (
              <tr key={holding.id} className="text-slate-300 transition hover:bg-white/[0.025]">
                <td className="px-4 py-3">
                  {onPickSymbol ? (
                    <button
                      type="button"
                      onClick={() => onPickSymbol(holding.symbol)}
                      className="font-semibold text-cyan-200 underline-offset-2 hover:text-cyan-100 hover:underline"
                    >
                      {holding.symbol}
                    </button>
                  ) : (
                    <span className="font-semibold text-white">{holding.symbol}</span>
                  )}
                  <p className="mt-0.5 max-w-[180px] truncate text-xs text-slate-500">{holding.name}</p>
                </td>
                <td className="px-4 py-3">{number.format(holding.shares)}</td>
                <td className="px-4 py-3">{money.format(holding.averageCost)}</td>
                <td className="px-4 py-3">
                  {money.format(holding.currentPrice)}
                  <p className={cn("mt-0.5 text-xs", holding.changePercent >= 0 ? "text-emerald-300" : "text-rose-300")}>
                    {holding.changePercent >= 0 ? "+" : ""}
                    {holding.changePercent.toFixed(2)}%
                  </p>
                </td>
                <td className="px-4 py-3">{money.format(holding.costBasis)}</td>
                <td className="px-4 py-3 font-semibold text-white">{money.format(holding.marketValue)}</td>
                <td className={cn("px-4 py-3 font-semibold", holding.unrealizedGain >= 0 ? "text-emerald-200" : "text-rose-200")}>
                  {formatSignedMoney(holding.unrealizedGain)}
                  <p className="mt-0.5 text-xs opacity-75">
                    {holding.unrealizedGainPercent >= 0 ? "+" : ""}
                    {holding.unrealizedGainPercent.toFixed(2)}%
                  </p>
                </td>
                <td className="px-4 py-3">{holding.allocation.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function newRowId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function PortfolioTrackerPanel({ onPickSymbol }: { onPickSymbol?: (symbol: string) => void }) {
  const [rows, setRows] = useState<StoredPortfolioRow[]>([]);
  const [quotes, setQuotes] = useState<Record<string, PortfolioQuote>>({});
  const [hydrated, setHydrated] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [draftSymbol, setDraftSymbol] = useState("");
  const [draftShares, setDraftShares] = useState("");
  const [draftCost, setDraftCost] = useState("");

  useEffect(() => {
    const stored = loadPortfolioRows();
    setRows(stored && stored.length > 0 ? stored : seedRowsFromHoldings(portfolioHoldings));
    setHydrated(true);
  }, []);

  const persist = useCallback((next: StoredPortfolioRow[]) => {
    setRows(next);
    savePortfolioRows(next);
  }, []);

  const symbolsKey = useMemo(() => {
    const symbols = rows.map((row) => normalizeSymbol(row.symbol)).filter(Boolean);
    return Array.from(new Set(symbols)).sort().join("|");
  }, [rows]);

  const refreshQuotes = useCallback(async () => {
    const symbols = symbolsKey.split("|").filter(Boolean);
    if (!symbols.length) {
      setQuotes({});
      return;
    }

    setQuoteLoading(true);
    try {
      const results = await Promise.allSettled(
        symbols.map(async (symbol) => {
          const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}`, { cache: "no-store" });
          if (!response.ok) throw new Error("Quote failed");
          const data = (await response.json()) as StockApiResponse;
          return {
            symbol,
            quote: {
              symbol: data.profile.symbol,
              name: data.profile.name,
              price: data.profile.price,
              changePercent: data.profile.changePercent,
              source: data.provider === "demo" ? "demo" : "live"
            } satisfies PortfolioQuote
          };
        })
      );

      setQuotes((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status === "fulfilled") {
            next[result.value.symbol] = result.value.quote;
          }
        }
        return next;
      });
    } finally {
      setQuoteLoading(false);
    }
  }, [symbolsKey]);

  useEffect(() => {
    if (!hydrated) return;
    void refreshQuotes();
    const id = window.setInterval(() => {
      void refreshQuotes();
    }, 30_000);

    return () => window.clearInterval(id);
  }, [hydrated, refreshQuotes]);

  const holdings = useMemo(() => buildHoldings(rows, quotes), [quotes, rows]);
  const totals = useMemo(() => buildTotals(holdings), [holdings]);
  const analytics = useMemo(() => buildPortfolioAnalytics(holdings, totals), [holdings, totals]);
  const chartData = useMemo(() => makePortfolioCurve(portfolioPerformance, totals), [totals]);
  const liveHoldings = holdings.filter((holding) => holding.source === "live").length;

  const reset = () => {
    clearPortfolioStorage();
    const next = seedRowsFromHoldings(portfolioHoldings);
    setRows(next);
  };

  const updateRow = (id: string, patch: Partial<Pick<StoredPortfolioRow, "symbol" | "shares" | "averageCost">>) => {
    const next = rows.map((row) => {
      if (row.id !== id) return row;
      const symbol = patch.symbol !== undefined ? patch.symbol : row.symbol;
      const sharesRaw = patch.shares !== undefined ? patch.shares : row.shares;
      const costRaw = patch.averageCost !== undefined ? patch.averageCost : row.averageCost;
      const shares = Number.isFinite(sharesRaw) ? Math.max(0, sharesRaw) : row.shares;
      const averageCost = Number.isFinite(costRaw) ? Math.max(0, costRaw) : row.averageCost;
      return { ...row, symbol, shares, averageCost };
    });
    persist(next);
  };

  const removeRow = (id: string) => {
    persist(rows.filter((row) => row.id !== id));
  };

  const addRow = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const symbol = normalizeSymbol(draftSymbol);
    const shares = Number(draftShares);
    const averageCost = Number(draftCost);
    if (!symbol || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(averageCost) || averageCost < 0) {
      return;
    }

    persist([
      ...rows,
      {
        id: newRowId(),
        symbol,
        shares,
        averageCost
      }
    ]);
    setDraftSymbol("");
    setDraftShares("");
    setDraftCost("");
  };

  if (!hydrated) {
    return (
      <Panel>
        <div className="h-64 animate-pulse rounded-lg bg-white/[0.06]" />
      </Panel>
    );
  }

  return (
    <Panel>
      <SectionHeader eyebrow="Portfolio tracker" title="Performance and holdings" action={<CircleDollarSign className="size-5 text-emerald-200" />} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <p>
          Holdings save in this browser. Value uses the live quote route when available, then demo quotes as fallback.
        </p>
        <button
          type="button"
          onClick={() => void refreshQuotes()}
          className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1 font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.1]"
        >
          <RefreshCw className={cn("size-3.5", quoteLoading && "animate-spin")} />
          {liveHoldings ? `${liveHoldings}/${holdings.length} live` : "Refresh quotes"}
        </button>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Portfolio value" value={money.format(totals.value)} caption={`${holdings.length} open position${holdings.length === 1 ? "" : "s"}`} />
        <MetricTile
          label="Unrealized P/L"
          value={formatSignedMoney(totals.gain)}
          caption={`${totals.gainPercent >= 0 ? "+" : ""}${totals.gainPercent.toFixed(2)}% versus cost basis`}
          className={totals.gain >= 0 ? "border-emerald-300/15 bg-emerald-300/[0.055]" : "border-rose-300/15 bg-rose-300/[0.055]"}
        />
        <MetricTile label="Cost basis" value={money.format(totals.cost)} caption="Shares x average cost" />
        <MetricTile
          label="Day move"
          value={formatSignedMoney(totals.dayChange)}
          caption={`${totals.dayChangePercent >= 0 ? "+" : ""}${totals.dayChangePercent.toFixed(2)}% estimated from quote change`}
        />
      </div>

      <PortfolioPerformanceChart data={chartData} />

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Allocation and sector exposure</p>
              <p className="mt-1 text-xs text-slate-500">Position weights, concentration, and sector mix based on current market value.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-slate-300">
              Risk {analytics.riskScore}/10
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3">
              {holdings.slice(0, 6).map((holding) => (
                <div key={holding.id}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-300">{holding.symbol}</span>
                    <span className="text-slate-500">{holding.allocation.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(3, holding.allocation)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {analytics.sectorExposure.map((sector) => (
                <div key={sector.sector}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-300">{sector.sector}</span>
                    <span className="text-slate-500">{sector.allocation.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.max(3, sector.allocation)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
          <p className="text-sm font-semibold text-white">AI portfolio summary</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {analytics.sectorExposure[0]
              ? `Portfolio is ${analytics.sectorExposure[0].allocation.toFixed(0)}% exposed to ${analytics.sectorExposure[0].sector}. ${analytics.riskScore >= 7 ? "Concentration and beta are elevated, so position sizing matters." : "Risk is balanced enough for a focused watchlist, but concentration should still be monitored."}`
              : "Add holdings to generate a portfolio read."}
          </p>
          <div className="mt-3 grid gap-2">
            <MetricTile label="Sharpe ratio" value={analytics.sharpeRatio.toFixed(2)} caption="Modeled return vs volatility" />
            <MetricTile label="Volatility" value={`${analytics.volatility.toFixed(1)}%`} caption="Weighted beta and concentration estimate" />
            <MetricTile
              label="Top attribution"
              value={analytics.topContributor ? analytics.topContributor.symbol : "N/A"}
              caption={analytics.topContributor ? formatSignedMoney(analytics.topContributor.unrealizedGain) : "No holdings yet"}
            />
            <MetricTile
              label="Largest drag"
              value={analytics.topDrag ? analytics.topDrag.symbol : "N/A"}
              caption={analytics.topDrag ? formatSignedMoney(analytics.topDrag.unrealizedGain) : "No holdings yet"}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.025] p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Customize positions</p>
            <p className="mt-1 text-xs text-slate-500">
              Edit shares and average cost; the table recalculates market value, cost basis, P/L, and allocation.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
          >
            <RotateCcw className="size-3.5" />
            Reset to demo portfolio
          </button>
        </div>

        <ScrollBody className="mb-3 max-h-[248px] space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-2 rounded-lg border border-white/10 bg-slate-950/20 p-2.5 md:grid-cols-[minmax(96px,1fr)_110px_130px_minmax(140px,1.2fr)_40px] md:items-end"
            >
              <label className="grid flex-1 gap-1 text-xs text-slate-500 sm:min-w-[100px]">
                Symbol
                <input
                  value={row.symbol}
                  onChange={(event) => updateRow(row.id, { symbol: event.target.value })}
                  onBlur={(event) => updateRow(row.id, { symbol: normalizeSymbol(event.target.value) })}
                  className="w-full rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-300/50"
                  maxLength={8}
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                Shares
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={row.shares}
                  onChange={(event) => updateRow(row.id, { shares: Number(event.target.value) })}
                  className="w-full rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-300/50"
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                Avg cost
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.averageCost}
                  onChange={(event) => updateRow(row.id, { averageCost: Number(event.target.value) })}
                  className="w-full rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-300/50"
                />
              </label>
              <div className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-400">
                {(() => {
                  const symbol = normalizeSymbol(row.symbol);
                  const quote = symbol ? quotes[symbol] ?? fallbackQuote(symbol) : null;
                  const value = quote ? quote.price * Math.max(0, row.shares) : 0;
                  return quote ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <span>Last</span>
                        <span className="font-semibold text-white">{money.format(quote.price)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span>Value</span>
                        <span className="font-semibold text-white">{money.format(value)}</span>
                      </div>
                    </>
                  ) : (
                    <span>Enter a symbol</span>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-md border border-rose-400/25 bg-rose-400/10 text-rose-100 transition hover:bg-rose-400/20"
                )}
                title="Remove row"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </ScrollBody>

        <form onSubmit={addRow} className="grid gap-2 border-t border-white/10 pt-3 md:grid-cols-[minmax(110px,1fr)_120px_140px_auto] md:items-end">
          <label className="grid gap-1 text-xs text-slate-500">
            Add symbol
            <input
              value={draftSymbol}
              onChange={(event) => setDraftSymbol(event.target.value)}
              placeholder="AMD"
              className="w-full rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-300/50"
              maxLength={8}
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-500">
            Shares
            <input
              value={draftShares}
              onChange={(event) => setDraftShares(event.target.value)}
              placeholder="10"
              className="w-full rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-300/50"
              inputMode="decimal"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-500">
            Avg cost
            <input
              value={draftCost}
              onChange={(event) => setDraftCost(event.target.value)}
              placeholder="120.50"
              className="w-full rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-300/50"
              inputMode="decimal"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            <Plus className="size-4" />
            Add position
          </button>
        </form>
      </div>

      {holdings.length > 0 ? (
        <PortfolioHoldingsTable holdings={holdings} totals={totals} onPickSymbol={onPickSymbol} />
      ) : (
        <p className="mt-4 text-sm text-amber-200/90">Add at least one position with shares greater than zero to see totals.</p>
      )}
    </Panel>
  );
}
