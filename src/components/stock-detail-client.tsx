"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, CalendarClock, ExternalLink, Gauge, Layers, Newspaper, RefreshCw, Shield, Sparkles, TrendingUp } from "lucide-react";

import { CandlestickChart, MacdChart, RsiChart, TechnicalOverlayChart, VolumeAnalysisChart } from "@/components/charts";
import { ChangePill, ConfidenceBars, MetricTile, Panel, RecommendationBadge, RiskMeter, SectionHeader, SignalDot } from "@/components/shared/ui";
import { findStock } from "@/lib/mock-data";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });

interface StockApiResponse {
  profile: ReturnType<typeof findStock>;
}

export function StockDetailClient({ symbol }: { symbol: string }) {
  const [stock, setStock] = useState(findStock(symbol));
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDetailStock() {
      setStock(findStock(symbol));
      setLoading(true);
      setFetchError(null);

      try {
        const response = await fetch(`/api/stocks/${encodeURIComponent(symbol)}`, { cache: "no-store" });
        if (!response.ok) {
          if (active) {
            setStock(findStock(symbol));
            setFetchError(response.status >= 500 ? "Live quote service error. Showing cached demo profile." : "Could not load live quote. Showing demo profile.");
          }
          return;
        }

        const data = (await response.json()) as StockApiResponse;
        if (active) {
          setStock(data.profile);
        }
      } catch {
        if (active) {
          setStock(findStock(symbol));
          setFetchError("Network error while loading quote. Showing demo profile.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDetailStock();

    return () => {
      active = false;
    };
  }, [symbol]);

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(120deg,rgba(34,211,238,0.14),transparent_36%),linear-gradient(240deg,rgba(52,211,153,0.12),transparent_36%),linear-gradient(180deg,transparent,#030712_80%)]" />
      <main
        id="main-content"
        tabIndex={-1}
        aria-busy={loading}
        className="relative z-10 mx-auto grid max-w-[1450px] gap-4 px-4 py-5 outline-none lg:px-6"
      >
        {fetchError ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
          >
            {fetchError}
          </div>
        ) : null}

        <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="grid size-11 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-slate-300 transition hover:text-white">
              <ArrowLeft className="size-5" />
            </Link>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold text-white">{stock.symbol}</h1>
                {loading ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium text-cyan-100">
                    <RefreshCw className="size-3.5 animate-spin" aria-hidden />
                    Syncing quote
                  </span>
                ) : null}
                <RecommendationBadge action={stock.recommendation} />
                <ChangePill value={stock.changePercent} />
              </div>
              <p className="text-sm text-slate-400">{stock.name} · {stock.industry}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <span className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-slate-300">Price {money.format(stock.price)}</span>
            <span className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-slate-300">Volume {compact.format(stock.volume)}</span>
            <span className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-slate-300">P/E {stock.peRatio}</span>
            <span className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-slate-300">Beta {stock.beta}</span>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_420px]">
          <Panel>
            <SectionHeader eyebrow="Candlestick chart" title="Price action" action={<Activity className="size-5 text-cyan-200" />} />
            <CandlestickChart data={stock.candles} />
          </Panel>

          <Panel>
            <SectionHeader eyebrow="AI generated summary" title="Recommendation" action={<Sparkles className="size-5 text-amber-200" />} />
            <p className="mb-5 text-sm leading-6 text-slate-300">{stock.whyThisStock}</p>
            <div className="grid gap-4">
              <RiskMeter score={stock.riskScore} />
              <ConfidenceBars bullish={stock.bullishConfidence} bearish={stock.bearishConfidence} />
            </div>
            <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="mb-2 text-sm font-semibold text-white">Short-term prediction</p>
              <p className="text-sm leading-6 text-slate-300">{stock.shortTermTrend}</p>
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <MetricTile icon={<CalendarClock className="size-4 text-cyan-200" />} label="Earnings date" value={stock.nextEarningsDate} caption={stock.earningsPlay} />
          <MetricTile icon={<TrendingUp className="size-4 text-emerald-200" />} label="Swing trade" value={stock.recommendation} caption={stock.swingTradeIdea} />
          <MetricTile icon={<Layers className="size-4 text-amber-200" />} label="Options activity" value="Detected" caption={stock.unusualOptionsActivity} />
          <MetricTile icon={<Shield className="size-4 text-rose-200" />} label="Risk level" value={`${stock.riskScore}/10`} caption="Based on volatility, valuation, and catalyst risk." />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <Panel>
            <SectionHeader eyebrow="Technical analysis" title="VWAP, 50 EMA, 200 EMA" action={<Gauge className="size-5 text-cyan-200" />} />
            <TechnicalOverlayChart data={stock.candles} />
          </Panel>
          <Panel>
            <SectionHeader eyebrow="Volume analysis" title="Participation" />
            <VolumeAnalysisChart data={stock.candles} />
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <SectionHeader eyebrow="RSI" title="Momentum oscillator" />
            <RsiChart data={stock.rsi} />
          </Panel>
          <Panel>
            <SectionHeader eyebrow="MACD" title="Trend confirmation" />
            <MacdChart data={stock.macd} />
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel>
            <SectionHeader eyebrow="AI reasoning" title="Factor breakdown" />
            <div className="grid gap-3 md:grid-cols-2">
              {stock.reasoning.map((item) => (
                <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold text-white">
                      <SignalDot stance={item.stance} />
                      {item.label}
                    </span>
                    <span className="text-xs text-slate-500">{item.score}/100</span>
                  </div>
                  <p className="text-sm leading-6 text-slate-300">{item.summary}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel>
            <SectionHeader eyebrow="News feed" title="Sentiment tape" action={<Newspaper className="size-5 text-cyan-200" />} />
            <div className="grid gap-3">
              {stock.news.map((item) => {
                const content = (
                  <>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <SignalDot stance={item.sentiment} />
                        <span className="truncate text-xs uppercase tracking-[0.14em] text-slate-500">{item.source}</span>
                      </span>
                      {item.url ? <ExternalLink className="size-3.5 shrink-0 text-cyan-200" /> : null}
                    </div>
                    <p className="text-sm font-semibold leading-5 text-white">{item.headline}</p>
                    <p className="mt-2 text-xs text-slate-500">{item.publishedAt}</p>
                  </>
                );

                return item.url ? (
                  <a
                    key={`${item.source}-${item.headline}`}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/10 bg-white/[0.04] p-3 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.07]"
                  >
                    {content}
                  </a>
                ) : (
                  <div key={`${item.source}-${item.headline}`} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    {content}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}
