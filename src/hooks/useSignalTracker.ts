"use client";

/**
 * useSignalTracker
 *
 * Persistence hierarchy:
 *   1. Google Sheets via /api/sheets/signals  ← permanent, inspectable
 *   2. localStorage ("hawkeye-signals-v1")    ← offline cache / fallback
 *
 * Writes go to BOTH layers simultaneously so the cache stays warm.
 * If Sheets returns 503 (not configured) the hook silently uses localStorage.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyDemoSimulation,
  calibrateConfidence,
  calibrationLabel,
  computeStats,
  createSignal,
  evaluateSignal,
  loadSignals,
  saveSignals,
  type PerformanceStats,
  type TrackedSignal,
} from "@/lib/signal-tracker";
import type { StockSetup } from "@/lib/types";

const EVAL_INTERVAL_MS = 5 * 60_000;

// ── Sheets API helpers (fire-and-forget safe) ─────────────────────────────────

async function sheetsLoad(): Promise<{ signals: TrackedSignal[]; available: boolean }> {
  try {
    const res = await fetch("/api/sheets/signals", { cache: "no-store" });
    if (!res.ok) return { signals: [], available: false };
    const data = (await res.json()) as { signals: TrackedSignal[]; source: string };
    return {
      signals:   data.signals ?? [],
      available: data.source === "sheets",
    };
  } catch {
    return { signals: [], available: false };
  }
}

async function sheetsCreate(signals: TrackedSignal[]): Promise<void> {
  try {
    await fetch("/api/sheets/signals", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ signals }),
    });
  } catch { /* offline — localStorage already written */ }
}

async function sheetsPatch(id: string, patch: Partial<TrackedSignal>): Promise<void> {
  try {
    await fetch(`/api/sheets/signals/${encodeURIComponent(id)}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
    });
  } catch { /* offline */ }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseSignalTrackerReturn {
  signals:             TrackedSignal[];
  stats:               PerformanceStats | null;
  sheetsAvailable:     boolean;
  trackScanResults:    (setups: StockSetup[]) => void;
  calibrate:           (rawScore: number, setupType: string) => number;
  getCalibrationLabel: (setupType: string) => ReturnType<typeof calibrationLabel>;
  clearAll:            () => void;
}

export function useSignalTracker(): UseSignalTrackerReturn {
  const [signals, setSignals]             = useState<TrackedSignal[]>([]);
  const [stats, setStats]                 = useState<PerformanceStats | null>(null);
  const [sheetsAvailable, setSheetsAvail] = useState(false);

  const statsRef   = useRef<PerformanceStats | null>(null);
  const loadedRef  = useRef(false);

  // ── Stats stay in sync ────────────────────────────────────────────────────

  useEffect(() => {
    if (signals.length === 0 && !loadedRef.current) return;
    const s = computeStats(signals);
    setStats(s);
    statsRef.current = s;
  }, [signals]);

  // ── Initial load: Sheets → localStorage fallback ──────────────────────────

  useEffect(() => {
    void (async () => {
      const { signals: sheetSignals, available } = await sheetsLoad();
      setSheetsAvail(available);

      let loaded: TrackedSignal[];
      let needsMigration = false;

      if (available && sheetSignals.length > 0) {
        // Sheets is authoritative — use it directly, no write-back needed
        loaded = sheetSignals;
        saveSignals(loaded); // warm the localStorage cache
      } else if (available && sheetSignals.length === 0) {
        const cached = loadSignals();
        if (cached.length > 0) {
          loaded = cached;
          needsMigration = true; // migrate localStorage → Sheets
        } else {
          loaded = [];
        }
      } else {
        loaded = loadSignals();
      }

      loaded = applyDemoSimulation(loaded);
      // Deduplicate by id in case the sheet accumulated duplicates
      const seen = new Set<string>();
      loaded = loaded.filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
      saveSignals(loaded);

      // Only write to Sheets during migration (localStorage → Sheets), not on every load
      if (needsMigration) void sheetsCreate(loaded);

      loadedRef.current = true;
      setSignals(loaded);
    })();
  }, []);

  // ── Periodic evaluation of open signals ───────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      setSignals((prev) => {
        const active = prev.filter(
          (s) => s.status === "pending" || s.status === "triggered",
        );
        if (active.length === 0) return prev;

        const tickers = [...new Set(active.map((s) => s.ticker))];
        void Promise.allSettled(
          tickers.map(async (ticker) => {
            try {
              const res = await fetch(
                `/api/quote/${encodeURIComponent(ticker)}`,
                { cache: "no-store" },
              );
              if (!res.ok) return;
              const data = (await res.json()) as { price: number };

              setSignals((current) => {
                const updated = current.map((s) => {
                  if (s.ticker !== ticker) return s;
                  const next = evaluateSignal(s, data.price);
                  if (next.status !== s.status) {
                    void sheetsPatch(s.id, {
                      status:        next.status,
                      triggeredAt:   next.triggeredAt,
                      triggeredPrice:next.triggeredPrice,
                      resolvedAt:    next.resolvedAt,
                      resolvedPrice: next.resolvedPrice,
                      actualReturn:  next.actualReturn,
                      actualRR:      next.actualRR,
                    });
                  }
                  return next;
                });
                saveSignals(updated);
                return updated;
              });
            } catch { /* network error */ }
          }),
        );
        return prev;
      });
    }, EVAL_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  // ── Track scanner results ─────────────────────────────────────────────────

  const trackScanResults = useCallback((setups: StockSetup[]) => {
    setSignals((prev) => {
      let next = [...prev];
      const newSignals: TrackedSignal[] = [];

      for (const setup of setups) {
        if (setup.riskReward <= 0 || setup.confidenceScore <= 0) continue;
        const signal = createSignal(setup, next);
        if (signal) {
          next.push(signal);
          newSignals.push(signal);
        }
      }

      if (newSignals.length === 0) return prev;

      next = applyDemoSimulation(next);
      saveSignals(next);
      void sheetsCreate(newSignals);
      return next;
    });
  }, []);

  // ── Calibration ───────────────────────────────────────────────────────────

  const calibrate = useCallback((rawScore: number, setupType: string) => {
    if (!statsRef.current) return rawScore;
    return calibrateConfidence(rawScore, setupType, statsRef.current);
  }, []);

  const getCalibrationLabel = useCallback((setupType: string) => {
    if (!statsRef.current) {
      return { arrow: "—", tone: "neutral" as const, winRate: 0, dataPoints: 0 };
    }
    return calibrationLabel(setupType, statsRef.current);
  }, []);

  // ── Clear ─────────────────────────────────────────────────────────────────

  const clearAll = useCallback(() => {
    saveSignals([]);
    setSignals([]);
    setStats(null);
    statsRef.current = null;
  }, []);

  return {
    signals, stats, sheetsAvailable,
    trackScanResults, calibrate, getCalibrationLabel, clearAll,
  };
}
