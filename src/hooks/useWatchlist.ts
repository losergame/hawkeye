"use client";

/**
 * useWatchlist
 *
 * Source of truth: Google Sheets (Watchlist tab)
 * Fallback: localStorage snapshot when Sheets is unreachable
 *
 * Provides a simple string[] of tickers for backward compatibility
 * with all existing dashboard code that checks `watchlist.includes(sym)`.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { WatchlistEntry } from "@/app/api/watchlist/route";

const LS_KEY = "hawkeye-watchlist-cache-v1";

// Default tickers shown before Sheets responds (never persisted as truth)
const DEFAULT_TICKERS = ["NVDA", "MSFT", "AMD", "META", "AAPL", "TSLA", "MU", "GOOGL"];

export interface UseWatchlistReturn {
  tickers:      string[];
  entries:      WatchlistEntry[];
  isLoading:    boolean;
  isSaving:     boolean;
  source:       "sheets" | "cache" | "default";
  lastError:    string | null;
  lastLoadTime: string | null;
  add:          (ticker: string) => Promise<boolean>;
  remove:       (ticker: string) => Promise<void>;
  has:          (ticker: string) => boolean;
  reload:       () => Promise<void>;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useWatchlist(): UseWatchlistReturn {
  const [entries, setEntries]       = useState<WatchlistEntry[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [isSaving, setIsSaving]     = useState(false);
  const [source, setSource]         = useState<"sheets" | "cache" | "default">("default");
  const [lastError, setLastError]   = useState<string | null>(null);
  const [lastLoadTime, setLoadTime] = useState<string | null>(null);

  const tickers = entries.map((e) => e.ticker);

  // ── Load ────────────────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    setIsLoading(true);
    setLastError(null);
    try {
      const data = await apiFetch<{ entries: WatchlistEntry[]; source: string }>(
        "/api/watchlist",
      );

      if (data.source === "sheets") {
        setEntries(data.entries);
        setSource("sheets");
        // Update localStorage cache
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(data.entries));
        } catch { /* quota */ }
      } else {
        // Sheets not configured — try localStorage cache
        throw new Error("Sheets not configured");
      }
    } catch (err) {
      const msg = String(err);
      setLastError(msg);

      // Try localStorage snapshot
      try {
        const cached = localStorage.getItem(LS_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as WatchlistEntry[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEntries(parsed);
            setSource("cache");
            return;
          }
        }
      } catch { /* parse error */ }

      // Ultimate fallback: default tickers as minimal entries
      setEntries(DEFAULT_TICKERS.map((t, i) => ({
        id: `default-${i}`, ticker: t, companyName: t,
        sector: "", addedAt: "", updatedAt: "",
      })));
      setSource("default");
    } finally {
      setIsLoading(false);
      setLoadTime(new Date().toISOString());
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // ── Add ─────────────────────────────────────────────────────────────────────

  const add = useCallback(async (ticker: string): Promise<boolean> => {
    const sym = ticker.trim().toUpperCase();
    if (tickers.includes(sym)) return false; // already in list

    setIsSaving(true);
    try {
      const data = await apiFetch<{ ok: boolean; duplicate?: boolean }>(
        "/api/watchlist",
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ ticker: sym }),
        },
      );
      if (data.duplicate) return false;
      await reload();
      return true;
    } catch (err) {
      setLastError(String(err));
      toast.error(`Watchlist save failed: ${String(err)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [tickers, reload]);

  // ── Remove ──────────────────────────────────────────────────────────────────

  const remove = useCallback(async (ticker: string): Promise<void> => {
    const sym = ticker.trim().toUpperCase();
    setIsSaving(true);
    try {
      await apiFetch(
        `/api/watchlist/${encodeURIComponent(sym)}`,
        { method: "DELETE" },
      );
      // Optimistic update then confirm with reload
      setEntries((prev) => prev.filter((e) => e.ticker !== sym));
      await reload();
    } catch (err) {
      setLastError(String(err));
      toast.error(`Watchlist remove failed: ${String(err)}`);
      await reload(); // revert optimistic update
    } finally {
      setIsSaving(false);
    }
  }, [reload]);

  const has = useCallback((ticker: string) =>
    tickers.includes(ticker.trim().toUpperCase()),
  [tickers]);

  return {
    tickers, entries, isLoading, isSaving, source,
    lastError, lastLoadTime,
    add, remove, has, reload,
  };
}
