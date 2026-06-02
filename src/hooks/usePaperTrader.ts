"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  makeDefaultAccount,
  type PaperAccount,
  type PaperPosition,
  type PaperTrade,
  type EquityCurvePoint,
  type TradeAction,
} from "@/lib/paper-trading";
import { useMarketHours } from "@/hooks/useMarketHours";
import { usePageVisible } from "@/hooks/usePageVisible";
import type { SignalRejection, TradeAuditEntry } from "@/lib/paper-trading";
import { computeMarketRegime, getTopFiveSetups } from "@/lib/scanner-scoring";
import type { StockSetup } from "@/lib/types";
import type { MarketRegime } from "@/lib/scanner-scoring";
import { toast } from "sonner";

const TEST_MODE_KEY       = "hawkeye-paper-test-mode-v1";
const AUTO_TRADE_KEY      = "hawkeye-paper-auto-trade-v1";

const PRICE_POLL_MS       = 30_000;   // TP/SL price checks
const AUTO_TRADE_POLL_MS  = 5 * 60_000; // auto-trade scan interval

export type { TradeAuditEntry };

export interface LastCycleDetail {
  ticker:        string;
  entryPrice:    number;
  currentPrice:  number;
  stopLoss:      number;
  takeProfit1:   number;
  priceSource:   string;  // "fresh-finnhub" | "stale-cache" | "empty"
  action:        string;  // "bought" | "stopped-out" | "tp-hit" | "held" | "rejected"
  reason:        string;
  timestamp:     string;
}

export interface PaperDebugState {
  lastScanTime:        string | null;
  lastBuyAttempt:      string | null;
  lastBuyResult:       "success" | "rejected" | "error" | null;
  lastPositionCreated: { ticker: string; at: string } | null;
  lastDiscordAlert:    string | null;
  lastRejectionReason: string | null;
  recentRejections:    SignalRejection[];
  signalsChecked:      number;
  sheetsConfigured:    boolean;
  lastCycleDetails:    LastCycleDetail[];
}

interface UsePaperTraderReturn {
  auditLog:             TradeAuditEntry[];
  account:              PaperAccount;
  openPositions:        PaperPosition[];
  closedTrades:         PaperTrade[];
  equityCurve:          EquityCurvePoint[];
  recentActions:        TradeAction[];
  isRunning:            boolean;
  isLoading:            boolean;
  isSaving:             boolean;
  debug:                PaperDebugState;
  market:               ReturnType<typeof useMarketHours>["market"];
  tradingAllowed:       boolean;
  allowOutsideHours:    boolean;
  setAllowOutsideHours: (v: boolean) => void;
  testMode:             boolean;
  setTestMode:          (v: boolean) => void;
  autoTradeEnabled:     boolean;
  setAutoTradeEnabled:  (v: boolean) => void;
  start:                () => void;
  pause:                () => void;
  reset:                (startingBalance?: number) => Promise<void>;
  rebuild:              () => Promise<void>;
  runScan:              (signals: StockSetup[], regime: MarketRegime) => Promise<void>;
  executeTopPick:       () => Promise<void>;
  closePosition:        (positionId: string) => Promise<void>;
  reload:               () => Promise<void>;
}

// ── API fetch helpers ─────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; detail?: string };
    const msg  = body.error ?? `HTTP ${res.status}`;
    const detail = body.detail ? ` — ${body.detail}` : "";
    throw new Error(msg + detail);
  }
  return res.json() as Promise<T>;
}

async function loadAll() {
  const [accData, posData, tradesData, equityData] = await Promise.all([
    apiFetch<{ account: PaperAccount }>("/api/paper/account"),
    apiFetch<{ positions: PaperPosition[] }>("/api/paper/positions"),
    apiFetch<{ trades: PaperTrade[] }>("/api/paper/trades"),
    apiFetch<{ points: EquityCurvePoint[] }>("/api/paper/equity"),
  ]);
  return {
    account:      accData.account ?? makeDefaultAccount(),
    positions:    posData.positions ?? [],
    trades:       tradesData.trades ?? [],
    equityCurve:  equityData.points ?? [],
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePaperTrader(): UsePaperTraderReturn {
  const [account, setAccount]         = useState<PaperAccount>(makeDefaultAccount);
  const [openPositions, setPositions] = useState<PaperPosition[]>([]);
  const [closedTrades, setTrades]     = useState<PaperTrade[]>([]);
  const [equityCurve, setEquity]      = useState<EquityCurvePoint[]>([]);
  const [recentActions, setActions]   = useState<TradeAction[]>([]);
  const [auditLog, setAuditLog]       = useState<TradeAuditEntry[]>([]);
  const [isRunning, setIsRunning]     = useState(true);
  const [isLoading, setIsLoading]     = useState(true);
  const [isSaving, setIsSaving]       = useState(false);
  const [debug, setDebug]             = useState<PaperDebugState>({
    lastScanTime:        null,
    lastBuyAttempt:      null,
    lastBuyResult:       null,
    lastPositionCreated: null,
    lastDiscordAlert:    null,
    lastRejectionReason: null,
    recentRejections:    [],
    signalsChecked:      0,
    sheetsConfigured:    false,
    lastCycleDetails:    [],
  });

  const { market, allowOutsideHours, setAllowOutsideHours } = useMarketHours();
  const isPageVisible = usePageVisible();

  // ── Test mode ─────────────────────────────────────────────────────────────
  const [testMode, setTestModeRaw]           = useState(false);
  const [autoTradeEnabled, setAutoTradeRaw]  = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(TEST_MODE_KEY);
    if (stored === "true") setTestModeRaw(true);
    const stored2 = localStorage.getItem(AUTO_TRADE_KEY);
    if (stored2 === "true") setAutoTradeRaw(true);
  }, []);

  const setTestMode = useCallback((v: boolean) => {
    setTestModeRaw(v);
    localStorage.setItem(TEST_MODE_KEY, String(v));
    if (v) toast.info("Test mode ON — market hours bypassed");
    else   toast.info("Test mode OFF — following market hours");
  }, []);

  const setAutoTradeEnabled = useCallback((v: boolean) => {
    setAutoTradeRaw(v);
    localStorage.setItem(AUTO_TRADE_KEY, String(v));
    if (v) toast.info("Auto-trade ON — Paper Trader will scan every 5 min");
    else   toast.info("Auto-trade OFF — only manual Execute Top Pick buys");
  }, []);

  // tradingAllowed: market open OR outside-hours toggle OR test mode
  const tradingAllowed = market.isOpen || allowOutsideHours || testMode;
  const positionsRef = useRef<PaperPosition[]>([]);
  positionsRef.current = openPositions;

  // ── Full reload from Sheets ───────────────────────────────────────────────

  const reload = useCallback(async () => {
    try {
      const data = await loadAll();
      setAccount(data.account);
      setPositions(data.positions);
      setTrades(data.trades);
      setEquity(data.equityCurve);
    } catch (err) {
      toast.error(`Failed to load paper trading data: ${String(err)}`);
    }
  }, []);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    reload().finally(() => setIsLoading(false));
  }, [reload]);

  // ── Periodic price check ──────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(async () => {
      // Skip price checks when tab is in background — saves Finnhub quota
      if (!isPageVisible) return;
      const positions = positionsRef.current;
      if (positions.length === 0) return;

      const tickers = [...new Set(positions.map((p) => p.ticker))];
      const entries = await Promise.allSettled(
        tickers.map(async (ticker) => {
          const d = await apiFetch<{ price: number }>(`/api/quote/${encodeURIComponent(ticker)}`);
          return { ticker, price: d.price };
        }),
      );
      const prices: Record<string, number> = {};
      for (const r of entries) {
        if (r.status === "fulfilled" && r.value.price > 0) prices[r.value.ticker] = r.value.price;
      }
      if (Object.keys(prices).length === 0) return;

      try {
        const data = await apiFetch<{
          account: PaperAccount;
          openPositions: PaperPosition[];
          closedTrades: PaperTrade[];
          actions: TradeAction[];
        }>("/api/paper/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signals: [], prices, regime: "neutral", isRunning, allowOutsideHours }),
        });
        setAccount(data.account);
        setPositions(data.openPositions);
        if (data.closedTrades.length > 0) {
          setTrades((prev) => [...data.closedTrades, ...prev]);
          setActions((prev) => [...data.actions, ...prev].slice(0, 20));
        }
      } catch { /* silent — will retry in 30s */ }
    }, PRICE_POLL_MS);

    return () => clearInterval(id);
  }, [isRunning, allowOutsideHours, isPageVisible]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const start = useCallback(() => setIsRunning(true),  []);
  const pause = useCallback(() => setIsRunning(false), []);

  // ── Reset — clears positions + equity, preserves trade history ────────────

  const reset = useCallback(async (startingBalance = 1_000) => {
    setIsSaving(true);
    try {
      const data = await apiFetch<{ account: PaperAccount }>("/api/paper/account/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingBalance }),
      });
      setAccount(data.account);
      setPositions([]);
      setEquity([]);
      setActions([]);
      // Do NOT clear trades — historical record
      toast.success("Paper account reset.");
    } catch (err) {
      toast.error(`Reset failed: ${String(err)}`);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // ── Rebuild account from current valid data ───────────────────────────────
  // Strips suspicious trades, recalculates stats, keeps open positions.

  const rebuild = useCallback(async () => {
    setIsSaving(true);
    try {
      const data = await apiFetch<{
        ok:            boolean;
        account:       PaperAccount;
        openPositions: PaperPosition[];
        validTrades:   number;
        removedTrades: number;
        message:       string;
      }>("/api/paper/rebuild", { method: "POST" });

      setAccount(data.account);
      setPositions(data.openPositions);
      setAuditLog([]);          // clear stale audit entries
      await reload();           // re-fetch trades from Sheets after cleanup
      toast.success(data.message);
      setDebug((prev) => ({ ...prev, lastBuyResult: null, recentRejections: [] }));
    } catch (err) {
      toast.error(`Rebuild failed: ${String(err)}`);
    } finally {
      setIsSaving(false);
    }
  }, [reload]);

  // ── Run scan ──────────────────────────────────────────────────────────────

  const runScan = useCallback(async (signals: StockSetup[], regime: MarketRegime) => {
    const positions = positionsRef.current;
    const tickers   = [...new Set(positions.map((p) => p.ticker))];

    const entries = await Promise.allSettled(
      tickers.map(async (ticker) => {
        const d = await apiFetch<{ price: number }>(`/api/quote/${encodeURIComponent(ticker)}`);
        return { ticker, price: d.price };
      }),
    );
    const prices: Record<string, number> = {};
    for (const r of entries) {
      if (r.status === "fulfilled" && r.value.price > 0) prices[r.value.ticker] = r.value.price;
    }

    const now = new Date().toISOString();
    setDebug((prev) => ({ ...prev, lastScanTime: now, lastBuyAttempt: now }));

    try {
      const data = await apiFetch<{
        account: PaperAccount;
        openPositions: PaperPosition[];
        closedTrades: PaperTrade[];
        actions: TradeAction[];
        equityPoint: EquityCurvePoint;
        auditLog?: TradeAuditEntry[];
        sheetsConfigured?: boolean;
        debug?: {
          signalsReceived: number;
          signalsChecked: number;
          gatedSignals: number;
          positionsOpened: number;
          positionsClosed: number;
          rejections: SignalRejection[];
        };
      }>("/api/paper/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signals, prices, regime, isRunning, allowOutsideHours }),
      });

      // Update debug state
      const d = data.debug;
      const prevIds = new Set(positionsRef.current.map((p) => p.positionId));
      const opened  = data.openPositions.filter((p) => !prevIds.has(p.positionId));

      // Build per-position cycle detail for the debug panel
      const cycleDetails: LastCycleDetail[] = [
        ...data.openPositions.map((p): LastCycleDetail => ({
          ticker:       p.ticker,
          entryPrice:   p.entryPrice,
          currentPrice: p.currentPrice,
          stopLoss:     p.stopLoss,
          takeProfit1:  p.takeProfit1,
          priceSource:  prices[p.ticker] ? "fresh-finnhub" : "stale-cache",
          action:       prevIds.has(p.positionId) ? "held" : "bought",
          reason:       prevIds.has(p.positionId)
            ? `price ${p.currentPrice.toFixed(2)} between SL ${p.stopLoss.toFixed(2)} and TP ${p.takeProfit1.toFixed(2)}`
            : `bought at ${p.entryPrice.toFixed(2)}`,
          timestamp:    now,
        })),
        ...data.closedTrades.map((t): LastCycleDetail => ({
          ticker:       t.ticker,
          entryPrice:   t.buyPrice,
          currentPrice: t.sellPrice,
          stopLoss:     t.slAtEntry ?? 0,
          takeProfit1:  t.tp1AtEntry ?? 0,
          priceSource:  "fresh-finnhub",
          action:       t.result === "win" ? "tp-hit" : "stopped-out",
          reason:       t.reasonClosed,
          timestamp:    t.closedAt,
        })),
      ];

      setDebug((prev) => ({
        ...prev,
        lastScanTime:        now,
        lastBuyAttempt:      now,
        lastBuyResult:       d ? (d.positionsOpened > 0 ? "success" : "rejected") : null,
        lastPositionCreated: opened.length > 0
          ? { ticker: opened[0].ticker, at: now }
          : prev.lastPositionCreated,
        lastRejectionReason: d?.rejections[0]
          ? `${d.rejections[0].ticker}: ${d.rejections[0].reason}${d.rejections[0].detail ? ` (${d.rejections[0].detail})` : ""}`
          : prev.lastRejectionReason,
        recentRejections:    d?.rejections ?? prev.recentRejections,
        signalsChecked:      d?.signalsChecked ?? prev.signalsChecked,
        sheetsConfigured:    data.sheetsConfigured ?? prev.sheetsConfigured,
        lastCycleDetails:    cycleDetails,
      }));

      setAccount(data.account);
      setPositions(data.openPositions);
      if (data.closedTrades.length > 0) {
        setTrades((prev) => [...data.closedTrades, ...prev]);
      }
      setEquity((prev) => {
        const today = data.equityPoint.date;
        return [...prev.filter((p) => p.date !== today), data.equityPoint]
          .sort((a, b) => a.date.localeCompare(b.date));
      });
      if (data.actions.length > 0) {
        setActions((prev) => [...data.actions, ...prev].slice(0, 20));
        for (const a of data.actions) {
          if (a.type === "buy")  toast.success(`📈 Paper bought ${a.ticker} × ${a.shares}`);
          if (a.type === "sell") toast.info(`📉 Paper closed ${a.ticker}`);
        }
      }
      // Accumulate audit log entries (cap at 100)
      if (data.auditLog?.length) {
        const newEntries = data.auditLog ?? [];
        setAuditLog((prev) => [...newEntries, ...prev].slice(0, 100));
        // Warn on suspicious trades
        for (const entry of newEntries) {
          if (entry.suspicious) {
            toast.warning(`⚠️ Suspicious trade: ${entry.ticker} ${entry.profitPct.toFixed(1)}% — ${entry.flag}`);
          }
        }
      }
    } catch (err) {
      setDebug((prev) => ({ ...prev, lastBuyResult: "error" }));
      toast.error(`Scan cycle failed: ${String(err)}`);
    }
  }, [isRunning, allowOutsideHours]);

  // ── Auto-trade loop (Paper Trader only — completely independent of scanner) ─
  // Only runs when autoTradeEnabled = true AND isRunning = true.
  // The scanner page NEVER triggers this — scanner only finds ideas.
  // Fires immediately on enable (not after the first 5-min delay) so the
  // user sees activity right away rather than wondering if it's working.

  useEffect(() => {
    if (!autoTradeEnabled || !isRunning) return;

    const runAutoTrade = async () => {
      try {
        const [sp500, nasdaq, russell] = await Promise.allSettled([
          apiFetch<{ results: StockSetup[] }>("/api/scanner?universe=sp500&pageSize=500"),
          apiFetch<{ results: StockSetup[] }>("/api/scanner?universe=nasdaq100&pageSize=200"),
          apiFetch<{ results: StockSetup[] }>("/api/scanner?universe=russell2000&pageSize=200"),
        ]);
        const combined: StockSetup[] = [
          ...(sp500.status   === "fulfilled" ? sp500.value.results   : []),
          ...(nasdaq.status  === "fulfilled" ? nasdaq.value.results  : []),
          ...(russell.status === "fulfilled" ? russell.value.results : []),
        ];
        const byTicker = new Map<string, StockSetup>();
        for (const s of combined) {
          const ex = byTicker.get(s.ticker);
          if (!ex || s.confidenceScore > ex.confidenceScore) byTicker.set(s.ticker, s);
        }
        const allSignals = [...byTicker.values()];
        if (allSignals.length > 0) {
          const { computeMarketRegime } = await import("@/lib/scanner-scoring");
          const regime = computeMarketRegime(allSignals);
          await runScan(allSignals, regime);
        }
      } catch { /* silent — will retry next interval */ }
    };

    // Fire immediately so the user doesn't wait 5 min for the first scan
    void runAutoTrade();
    const id = setInterval(() => void runAutoTrade(), AUTO_TRADE_POLL_MS);
    return () => clearInterval(id);
  }, [autoTradeEnabled, isRunning, runScan]);

  // ── Execute top pick (test mode shortcut) ────────────────────────────────
  // Fetches fresh scanner results, scores them, takes rank #1, runs the full
  // paper trade cycle with testMode/allowOutsideHours forced true.

  const executeTopPick = useCallback(async () => {
    setIsSaving(true);
    try {
      toast.info("Fetching scanner results for top pick…");

      // Fetch all three universes in parallel, combine into one pool
      toast.info("Scanning S&P 500, NASDAQ 100 and Russell 2000…");
      const [sp500, nasdaq, russell] = await Promise.allSettled([
        apiFetch<{ results: StockSetup[] }>("/api/scanner?universe=sp500&pageSize=500"),
        apiFetch<{ results: StockSetup[] }>("/api/scanner?universe=nasdaq100&pageSize=200"),
        apiFetch<{ results: StockSetup[] }>("/api/scanner?universe=russell2000&pageSize=200"),
      ]);

      const combined: StockSetup[] = [
        ...(sp500.status    === "fulfilled" ? sp500.value.results    : []),
        ...(nasdaq.status   === "fulfilled" ? nasdaq.value.results   : []),
        ...(russell.status  === "fulfilled" ? russell.value.results  : []),
      ];

      // Deduplicate by ticker (keep highest-confidence entry per ticker)
      const byTicker = new Map<string, StockSetup>();
      for (const s of combined) {
        const existing = byTicker.get(s.ticker);
        if (!existing || s.confidenceScore > existing.confidenceScore) {
          byTicker.set(s.ticker, s);
        }
      }
      const allSignals = [...byTicker.values()];

      if (!allSignals.length) {
        toast.error("No scanner results — check connection");
        return;
      }
      const scanRes = { results: allSignals };

      // Score and pick rank #1
      const regime  = computeMarketRegime(scanRes.results);
      const topFive = getTopFiveSetups(scanRes.results, "All", regime);
      if (topFive.length === 0) {
        toast.error("No qualifying top picks (check scoring thresholds in debug panel)");
        return;
      }

      const pick = topFive[0];
      toast.info(`Executing #1 pick: ${pick.setup.ticker} (${pick.setup.setupType}, score ${pick.score})`);

      // Fetch live prices for all open positions so TP/SL checks use fresh data.
      // Passing prices:{} was Bug #1 — stale currentPrice triggered immediate stop-outs.
      const currentPositions = positionsRef.current;
      const allTickers = [
        ...new Set([
          ...currentPositions.map((p) => p.ticker),
          pick.setup.ticker,
        ]),
      ];
      const priceEntries2 = await Promise.allSettled(
        allTickers.map(async (ticker) => {
          const d = await apiFetch<{ price: number }>(`/api/quote/${encodeURIComponent(ticker)}`);
          return { ticker, price: d.price };
        }),
      );
      const freshPrices: Record<string, number> = {};
      for (const r of priceEntries2) {
        if (r.status === "fulfilled" && r.value.price > 0) {
          freshPrices[r.value.ticker] = r.value.price;
        }
      }

      // Run the full paper trade cycle — allowOutsideHours forced true for test
      await apiFetch("/api/paper/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signals:          [pick.setup],
          prices:           freshPrices,  // ← was {} — now has real prices
          regime,
          isRunning:        true,
          allowOutsideHours:true,
        }),
      }).then((data) => {
        const d = data as {
          account: PaperAccount;
          openPositions: PaperPosition[];
          closedTrades: PaperTrade[];
          actions: TradeAction[];
          equityPoint: EquityCurvePoint;
        };
        setAccount(d.account);
        setPositions(d.openPositions);
        if (d.actions.length > 0) {
          setActions((prev) => [...d.actions, ...prev].slice(0, 20));
          const bought = d.actions.filter((a) => a.type === "buy");
          if (bought.length > 0) {
            toast.success(`✅ Paper bought ${bought[0].ticker} × ${bought[0].shares} @ $${bought[0].price.toFixed(2)}`);
            setDebug((prev) => ({
              ...prev,
              lastBuyResult:       "success",
              lastBuyAttempt:      new Date().toISOString(),
              lastPositionCreated: { ticker: bought[0].ticker, at: new Date().toISOString() },
            }));
          } else {
            toast.warning(`No position created — check debug panel for rejection reasons`);
            setDebug((prev) => ({ ...prev, lastBuyResult: "rejected" }));
          }
        }
      });

      // Reload from Sheets to confirm persistence
      await reload();
    } catch (err) {
      toast.error(`Execute top pick failed: ${String(err)}`);
      setDebug((prev) => ({ ...prev, lastBuyResult: "error" }));
    } finally {
      setIsSaving(false);
    }
  }, [reload]);

  // ── Close position — single atomic API call, no double-write hack ─────────

  const closePosition = useCallback(async (positionId: string) => {
    const pos = positionsRef.current.find((p) => p.positionId === positionId);
    if (!pos) return;

    // Get current price
    let sellPrice = pos.currentPrice;
    try {
      const d = await apiFetch<{ price: number }>(`/api/quote/${encodeURIComponent(pos.ticker)}`);
      if (d.price > 0) sellPrice = d.price;
    } catch { /* use last known price */ }

    setIsSaving(true);
    try {
      const data = await apiFetch<{
        account: PaperAccount;
        openPositions: PaperPosition[];
        trade: PaperTrade;
      }>("/api/paper/positions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId, sellPrice, reason: "Manual close" }),
      });

      setAccount(data.account);
      setPositions(data.openPositions);
      setTrades((prev) => [data.trade, ...prev]);
      setActions((prev) => [
        { type: "sell" as const, ticker: pos.ticker, reason: "Manual close", shares: pos.shares, price: sellPrice },
        ...prev,
      ].slice(0, 20));
      toast.info(`Closed ${pos.ticker} @ $${sellPrice.toFixed(2)}`);
    } catch (err) {
      toast.error(`Failed to close position: ${String(err)}`);
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    auditLog,
    account, openPositions, closedTrades, equityCurve, recentActions,
    isRunning, isLoading, isSaving, debug,
    market, tradingAllowed, allowOutsideHours, setAllowOutsideHours,
    testMode, setTestMode,
    autoTradeEnabled, setAutoTradeEnabled,
    start, pause, reset, rebuild, runScan, executeTopPick, closePosition, reload,
  };
}
