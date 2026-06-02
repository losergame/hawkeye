"use client";

/**
 * useLivePrice / useLivePrices
 *
 * During market hours:
 *   - Uses Finnhub WebSocket for true real-time quotes (requires NEXT_PUBLIC_FINNHUB_API_KEY)
 *   - Falls back to 12-second HTTP polling if NEXT_PUBLIC_FINNHUB_API_KEY is not set
 *
 * After hours / pre-market:
 *   - 30-second HTTP polling
 *
 * When tab is hidden (Page Visibility API):
 *   - Polling paused entirely. WS connection stays open but UI state frozen.
 *
 * Finnhub free-tier WebSocket: 50 simultaneous subscriptions.
 * useLivePrices silently caps at 50 symbols.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePageVisible } from "@/hooks/usePageVisible";

export type PriceDirection = "up" | "down" | null;
export type LiveMarketStatus = "OPEN" | "PRE-MARKET" | "AFTER-HOURS" | "CLOSED";

export interface LiveQuotePayload {
  symbol:        string;
  name:          string;
  price:         number;
  change:        number;
  changePercent: number;
  timestamp:     string;
  marketStatus:  LiveMarketStatus;
  source:        "live" | "demo";
}

export interface UseLivePriceReturn {
  price:          number | null;
  change:         number | null;
  changePercent:  number | null;
  direction:      PriceDirection;
  lastUpdated:    Date | null;
  marketStatus:   LiveMarketStatus;
  isLive:         boolean;
  pollIntervalMs: number;
}

const INTERVAL_OPEN     = 12_000;
const INTERVAL_EXTENDED = 30_000;
const MAX_INTERVAL      = 60_000;
const DIRECTION_RESET   = 1_500;
const WS_MAX_SYMBOLS    = 50;

// ── WebSocket singleton ───────────────────────────────────────────────────────

type PriceListener = (price: number) => void;

let _ws: WebSocket | null = null;
let _wsReconnect: ReturnType<typeof setTimeout> | null = null;
const _wsDestroyed = false;
const _wsListeners = new Map<string, Set<PriceListener>>();

function wsApiKey(): string {
  if (typeof process === "undefined") return "";
  return process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? "";
}

function wsConnect(): void {
  const key = wsApiKey();
  if (!key || _wsDestroyed) return;
  if (_ws?.readyState === WebSocket.OPEN || _ws?.readyState === WebSocket.CONNECTING) return;

  _ws = new WebSocket(`wss://ws.finnhub.io?token=${key}`);

  _ws.onopen = () => {
    for (const sym of _wsListeners.keys()) {
      if ((_wsListeners.get(sym)?.size ?? 0) > 0) {
        _ws?.send(JSON.stringify({ type: "subscribe", symbol: sym }));
      }
    }
  };

  _ws.onmessage = (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data as string) as {
        type: string;
        data?: Array<{ s: string; p: number }>;
      };
      if (msg.type !== "trade" || !msg.data) return;
      for (const trade of msg.data) {
        _wsListeners.get(trade.s)?.forEach((cb) => cb(trade.p));
      }
    } catch { /* malformed */ }
  };

  _ws.onclose = () => {
    if (_wsDestroyed) return;
    _wsReconnect = setTimeout(wsConnect, 5_000);
  };

  _ws.onerror = () => _ws?.close();
}

function wsSubscribe(symbol: string, cb: PriceListener): void {
  if (!_wsListeners.has(symbol)) _wsListeners.set(symbol, new Set());
  _wsListeners.get(symbol)!.add(cb);

  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ type: "subscribe", symbol }));
  } else {
    wsConnect();
  }
}

function wsUnsubscribe(symbol: string, cb: PriceListener): void {
  const set = _wsListeners.get(symbol);
  if (!set) return;
  set.delete(cb);
  if (set.size === 0) {
    _wsListeners.delete(symbol);
    if (_ws?.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify({ type: "unsubscribe", symbol }));
    }
  }
  if (_wsListeners.size === 0) {
    _ws?.close();
    _ws = null;
  }
}

function wsAvailable(): boolean {
  return !!wsApiKey() && typeof WebSocket !== "undefined";
}

// ── HTTP polling helper ───────────────────────────────────────────────────────

async function fetchQuoteHttp(symbol: string): Promise<LiveQuotePayload | null> {
  try {
    const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LiveQuotePayload;
  } catch { return null; }
}

function intervalFor(status: LiveMarketStatus): number {
  if (status === "OPEN") return INTERVAL_OPEN;
  if (status === "PRE-MARKET" || status === "AFTER-HOURS") return INTERVAL_EXTENDED;
  return 0; // market closed → stop polling
}

// ── useLivePrice ─────────────────────────────────────────────────────────────

export function useLivePrice(symbol: string): UseLivePriceReturn {
  const [price,         setPrice]         = useState<number | null>(null);
  const [change,        setChange]        = useState<number | null>(null);
  const [changePct,     setChangePct]     = useState<number | null>(null);
  const [direction,     setDirection]     = useState<PriceDirection>(null);
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null);
  const [marketStatus,  setMarketStatus]  = useState<LiveMarketStatus>("CLOSED");
  const [isLive,        setIsLive]        = useState(false);
  const [pollIntervalMs,setPollInterval]  = useState(INTERVAL_OPEN);

  const prevPriceRef    = useRef<number | null>(null);
  const symbolRef       = useRef(symbol);
  symbolRef.current = symbol;
  const curIntervalRef  = useRef(INTERVAL_OPEN);
  const dirTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPageVisible   = usePageVisible();

  const applyPrice = useCallback((p: number) => {
    if (prevPriceRef.current !== null && p !== prevPriceRef.current) {
      setDirection(p > prevPriceRef.current ? "up" : "down");
      if (dirTimerRef.current) clearTimeout(dirTimerRef.current);
      dirTimerRef.current = setTimeout(() => setDirection(null), DIRECTION_RESET);
    }
    prevPriceRef.current = p;
    setPrice(p);
  }, []);

  // ── HTTP polling path ─────────────────────────────────────────────────────

  const fetchAndSchedule = useCallback(async () => {
    if (!isPageVisible) return; // paused while tab hidden
    const sym  = symbolRef.current;
    const data = await fetchQuoteHttp(sym);
    if (sym !== symbolRef.current) return; // symbol changed mid-fetch

    if (!data) {
      const backed = Math.min(curIntervalRef.current * 2, MAX_INTERVAL);
      curIntervalRef.current = backed;
      setPollInterval(backed);
      pollTimerRef.current = setTimeout(fetchAndSchedule, backed);
      return;
    }

    const nextMs = intervalFor(data.marketStatus);
    curIntervalRef.current = nextMs || INTERVAL_OPEN;
    setPollInterval(curIntervalRef.current);
    setMarketStatus(data.marketStatus);
    setIsLive(data.source === "live");
    setLastUpdated(new Date(data.timestamp));
    setChange(data.change);
    setChangePct(data.changePercent);
    applyPrice(data.price);

    if (nextMs > 0) pollTimerRef.current = setTimeout(fetchAndSchedule, nextMs);
  }, [isPageVisible, applyPrice]);

  useEffect(() => {
    // Reset on symbol change
    prevPriceRef.current = null;
    setPrice(null); setChange(null); setChangePct(null);
    setDirection(null); setLastUpdated(null);
    curIntervalRef.current = INTERVAL_OPEN;
    if (pollTimerRef.current)  clearTimeout(pollTimerRef.current);
    if (dirTimerRef.current)   clearTimeout(dirTimerRef.current);

    if (!isPageVisible) return; // don't start until visible

    if (wsAvailable()) {
      // WebSocket for real-time price ticks, HTTP for metadata (change %, status)
      wsSubscribe(symbol, applyPrice);
      void fetchAndSchedule(); // initial metadata fetch (no tight loop)
      return () => {
        wsUnsubscribe(symbol, applyPrice);
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      };
    }

    // No WS key — fall back to pure HTTP polling
    void fetchAndSchedule();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (dirTimerRef.current)  clearTimeout(dirTimerRef.current);
    };
  }, [symbol, isPageVisible, fetchAndSchedule, applyPrice]);

  return {
    price, change, changePercent: changePct, direction,
    lastUpdated, marketStatus, isLive, pollIntervalMs,
  };
}

// ── useLivePrices (batch) ─────────────────────────────────────────────────────

/**
 * Batch live prices for multiple tickers.
 * Uses WebSocket subscriptions (max 50 per Finnhub free tier).
 * After hours: single batched HTTP poll every 30s.
 */
export function useLivePrices(
  symbols: string[],
): { prices: Record<string, number>; marketStatus: LiveMarketStatus } {
  const [prices,       setPrices]      = useState<Record<string, number>>({});
  const [marketStatus, setMarketStatus]= useState<LiveMarketStatus>("CLOSED");
  const isPageVisible = usePageVisible();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;
    const limited = symbols.slice(0, WS_MAX_SYMBOLS);

    // Get initial market status
    void fetchQuoteHttp(limited[0]).then((d) => {
      if (d) setMarketStatus(d.marketStatus);
    });

    if (wsAvailable()) {
      // WebSocket path
      const handlers = new Map<string, PriceListener>();
      for (const sym of limited) {
        const handler: PriceListener = (p) => {
          setPrices((prev) => ({ ...prev, [sym]: p }));
        };
        handlers.set(sym, handler);
        wsSubscribe(sym, handler);
      }
      return () => {
        for (const [sym, h] of handlers) wsUnsubscribe(sym, h);
      };
    }

    // HTTP polling path
    const poll = async () => {
      if (!isPageVisible) return;
      const results = await Promise.allSettled(
        limited.map((sym) => fetchQuoteHttp(sym).then((d) => d ? { sym, price: d.price, status: d.marketStatus } : null)),
      );
      const update: Record<string, number> = {};
      let lastStatus: LiveMarketStatus = "CLOSED";
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          update[r.value.sym] = r.value.price;
          lastStatus = r.value.status;
        }
      }
      if (Object.keys(update).length > 0) setPrices((prev) => ({ ...prev, ...update }));
      setMarketStatus(lastStatus);
    };

    void poll();
    const interval = marketStatus === "OPEN" ? INTERVAL_OPEN : INTERVAL_EXTENDED;
    pollRef.current = setInterval(poll, interval);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(","), isPageVisible]);

  return { prices, marketStatus };
}
