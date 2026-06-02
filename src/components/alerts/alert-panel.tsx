"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Bell, CheckCircle2, MessageCircle, Send } from "lucide-react";

import { Panel, ScrollBody, SectionHeader } from "@/components/shared/ui";
import { cn } from "@/lib/cn";
import type { AlertRule, StockProfile } from "@/lib/types";

function defaultAlertRules(symbol: string, nextEarningsDate: string): AlertRule[] {
  return [
    {
      id: "price_vwap_cross",
      label: "Price crosses VWAP",
      description: `${symbol} crosses the live VWAP reference.`,
      enabled: true,
      channels: ["Discord", "In-app"]
    },
    {
      id: "support_resistance_break",
      label: "Support / resistance break",
      description: `Alert when ${symbol} breaks modeled support or resistance.`,
      enabled: true,
      channels: ["Discord", "In-app"]
    },
    {
      id: "unusual_volume",
      label: "Unusual volume",
      description: "Relative volume moves above 1.5x the normal pace.",
      enabled: true,
      channels: ["Discord", "In-app"]
    },
    {
      id: "bullish_momentum",
      label: "Bullish momentum",
      description: "Price is above VWAP and EMA 20 with rising volume.",
      enabled: false,
      channels: ["Discord"]
    },
    {
      id: "bearish_momentum",
      label: "Bearish momentum",
      description: "Price loses VWAP and short-term trend support.",
      enabled: false,
      channels: ["Discord"]
    },
    {
      id: "earnings_soon",
      label: "Earnings coming soon",
      description: `Reminder before ${nextEarningsDate}.`,
      enabled: true,
      channels: ["Email", "In-app"]
    }
  ];
}

const AUTO_DISCORD_KEY = "signalforge-discord-auto-buy-alerts-v1";


function AlertMetric({
  icon,
  label,
  value,
  caption
}: {
  icon: ReactNode;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.045] p-3">
      <div className="mb-2 flex items-start justify-between gap-2 text-slate-400">
        <span className="min-w-0 break-words text-[11px] font-semibold uppercase leading-4 tracking-[0.14em]">{label}</span>
        <span className="shrink-0">{icon}</span>
      </div>
      <p className="truncate text-xl font-semibold text-white">{value}</p>
      <p className="mt-2 min-w-0 break-words text-xs leading-5 text-slate-400">{caption}</p>
    </div>
  );
}

export function AlertPanel({ selected }: { selected: StockProfile }) {
  const [rules, setRules] = useState<AlertRule[]>(() => defaultAlertRules(selected.symbol, selected.nextEarningsDate));
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [autoDiscord, setAutoDiscord] = useState(true);
  const enabledCount = rules.filter((rule) => rule.enabled).length;
  const buyAlertRuleOn = useMemo(() => rules.some((rule) => rule.id === "bullish_momentum" && rule.enabled), [rules]);

  useEffect(() => {
    const stored = window.localStorage.getItem(AUTO_DISCORD_KEY);
    if (stored !== null) {
      setAutoDiscord(stored === "true");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(AUTO_DISCORD_KEY, String(autoDiscord));
  }, [autoDiscord]);

  useEffect(() => {
    setRules(defaultAlertRules(selected.symbol, selected.nextEarningsDate));
  }, [selected.symbol, selected.nextEarningsDate]);

  // Auto BUY alerts disabled — Discord now only fires for Paper Trader events.
  // (buy, sell, TP hit, SL hit, manual close via /api/paper/run)

  const toggleRule = (id: AlertRule["id"]) => {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule)));
  };

  const testAlert = async () => {
    setTestStatus("Sending test alert...");
    const message = `${selected.symbol} test alert from Hawkeye. Enabled rules: ${enabledCount}.`;
    const response = await fetch("/api/alerts/discord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: selected.symbol, message })
    });
    setTestStatus(response.ok ? "Discord test alert sent." : "Discord test alert could not be sent.");
  };

  return (
    <Panel tight className="flex min-h-[380px] max-h-[460px] flex-col self-start">
      <SectionHeader
        eyebrow="Alerts"
        title="Signal rules and delivery"
        action={
          <button
            type="button"
            onClick={() => void testAlert()}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-300/25 bg-amber-300/10 px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/15"
          >
            <Send className="size-3.5" />
            Test alert
          </button>
        }
      />
      <ScrollBody>
        <div className="mb-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <AlertMetric icon={<MessageCircle className="size-4 text-indigo-200" />} label="Discord" value="Webhook" caption="DISCORD_WEBHOOK_URL" />
          <AlertMetric icon={<CheckCircle2 className="size-4 text-emerald-200" />} label="Auto buy alerts" value={autoDiscord ? "On" : "Off"} caption="Once per ticker per day" />
          <AlertMetric icon={<Bell className="size-4 text-amber-200" />} label="Active rules" value={`${enabledCount}/${rules.length}`} caption={buyAlertRuleOn ? "Momentum alert enabled" : "Momentum alert optional"} />
        </div>
        <button
          type="button"
          onClick={() => setAutoDiscord((value) => !value)}
          className={cn(
            "mb-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition",
            autoDiscord ? "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-50" : "border-white/10 bg-white/[0.035] text-slate-300 hover:bg-white/[0.07]"
          )}
        >
          <span>
            <span className="block font-semibold">Auto-send Discord Buy signals</span>
            <span className="text-xs text-slate-400">Throttled to one alert per symbol each market day.</span>
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-bold">{autoDiscord ? "On" : "Off"}</span>
        </button>
        {testStatus ? <p className="mb-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">{testStatus}</p> : null}
        <p className="mb-3 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.05] px-3 py-2 text-xs text-cyan-100">Discord alerts now fire only for Paper Trader events (buy, sell, TP, SL).</p>
        <div className="grid gap-2">
          {rules.map((rule) => (
            <button
              key={rule.id}
              type="button"
              onClick={() => toggleRule(rule.id)}
              className={cn(
                "flex items-start justify-between gap-4 rounded-lg border p-3 text-left transition",
                rule.enabled ? "border-cyan-300/25 bg-cyan-300/[0.07]" : "border-white/10 bg-white/[0.035] opacity-75 hover:opacity-100"
              )}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", rule.enabled ? "bg-cyan-200" : "bg-slate-500")} />
                  <p className="text-sm font-semibold text-white">{rule.label}</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-400">{rule.description}</p>
                <p className="mt-2 text-xs text-slate-500">{rule.channels.join(" / ")}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-slate-300">
                {rule.enabled ? "On" : "Off"}
              </span>
            </button>
          ))}
        </div>
      </ScrollBody>
    </Panel>
  );
}
