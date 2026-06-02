"use client";

import { useCallback, useEffect, useState } from "react";
import { getMarketInfo, type MarketInfo } from "@/lib/market-hours";

const OUTSIDE_HOURS_KEY = "hawkeye-paper-outside-hours-v1";

interface UseMarketHoursReturn {
  market:                  MarketInfo;
  allowOutsideHours:       boolean;
  setAllowOutsideHours:    (v: boolean) => void;
  /** True if paper trading is allowed right now */
  tradingAllowed:          boolean;
}

export function useMarketHours(): UseMarketHoursReturn {
  const [market, setMarket]                     = useState<MarketInfo>(() => getMarketInfo());
  const [allowOutsideHours, setAllowRaw]        = useState(false);

  // Load persisted setting on mount
  useEffect(() => {
    const stored = localStorage.getItem(OUTSIDE_HOURS_KEY);
    if (stored !== null) setAllowRaw(stored === "true");
  }, []);

  // Tick every 60 seconds to update market status
  useEffect(() => {
    const update = () => setMarket(getMarketInfo());
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  const setAllowOutsideHours = useCallback((v: boolean) => {
    setAllowRaw(v);
    localStorage.setItem(OUTSIDE_HOURS_KEY, String(v));
  }, []);

  const tradingAllowed = market.isOpen || allowOutsideHours;

  return { market, allowOutsideHours, setAllowOutsideHours, tradingAllowed };
}
