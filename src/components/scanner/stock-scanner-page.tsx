"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  Eye,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Zap
} from "lucide-react";

import { DisclaimerCard } from "@/components/scanner/disclaimer-card";
import { ScannerFilters, defaultFilters, type ScannerFiltersState } from "@/components/scanner/scanner-filters";
import { ScannerTable } from "@/components/scanner/scanner-table";
import { StockDetailModal } from "@/components/scanner/stock-detail-modal";
import { potentialGainPercent, StockSetupCard } from "@/components/scanner/stock-setup-card";
import { Panel, SectionHeader } from "@/components/shared/ui";
import { HawkeyeLogo } from "@/components/shared/ui/hawkeye-logo";
import { cn } from "@/lib/cn";
import { mockStockSetups, scannerConditions } from "@/lib/mockStockSetups";
import type { StockSetup } from "@/lib/types";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Stock Scanner", href: "/scanner", icon: Target },
  { label: "Watchlist", href: "/#watchlist-section", icon: Eye },
  { label: "Portfolio", href: "/#portfolio-section", icon: BriefcaseBusiness },
  { label: "Settings", href: "/#alerts-section", icon: Settings }
];

function useCountUp(target: number, duration = 650) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const frame = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [target, duration]);
  return display;
}

function SetupTypeIcon({ type }: { type: string }) {
  const map: Record<string, React.ReactNode> = {
    "Momentum Breakout": <Zap className="size-3.5 text-[#00D084]" />,
    "Pullback Buy": <TrendingDown className="size-3.5 text-amber-300" />,
    "Oversold Bounce": <TrendingUp className="size-3.5 text-cyan-300" />,
    "Trend Continuation": <ArrowUpRight className="size-3.5 text-purple-300" />
  };
  return (
    <span className="flex size-6 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.04]">
      {map[type] ?? <Zap className="size-3.5 text-slate-400" />}
    </span>
  );
}

interface Toast {
  id: number;
  message: string;
}

export function StockScannerPage() {
  const [filters, setFilters] = useState<ScannerFiltersState>(defaultFilters);
  const [selectedSetup, setSelectedSetup] = useState<StockSetup | null>(null);
  const [tableLoading, setTableLoading] = useState(true);
  const [openPlaybook, setOpenPlaybook] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimer = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const id = setTimeout(() => setTableLoading(false), 450);
    return () => clearTimeout(id);
  }, []);

  function showToast(message: string) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimer.current.delete(id);
    }, 2800);
    toastTimer.current.set(id, timer);
  }

  function handleAddToWatchlist(ticker: string) {
    setWatchlist((prev) => (prev.includes(ticker) ? prev : [...prev, ticker]));
    showToast(`${ticker} added to watchlist`);
  }

  const filteredSetups = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return mockStockSetups
      .filter((setup) => {
        const matchesSearch = !query || setup.ticker.toLowerCase().includes(query) || setup.companyName.toLowerCase().includes(query);
        const matchesSetup = filters.setupType === "All" || setup.setupType === filters.setupType;
        const matchesStatus = filters.status === "All" || setup.status === filters.status;
        const matchesConfidence = !filters.confidence70 || setup.confidenceScore >= 70;
        const matchesRiskReward = !filters.riskReward2 || setup.riskReward >= 2;
        return matchesSearch && matchesSetup && matchesStatus && matchesConfidence && matchesRiskReward;
      })
      .sort((a, b) => {
        if (filters.sortBy === "potentialGain") return potentialGainPercent(b) - potentialGainPercent(a);
        return b.confidenceScore - a.confidenceScore;
      });
  }, [filters]);

  const triggeredCount = mockStockSetups.filter((s) => s.status === "Triggered").length;
  const highConfidenceCount = mockStockSetups.filter((s) => s.confidenceScore >= 70).length;
  const averageConfidence = Math.round(mockStockSetups.reduce((sum, s) => sum + s.confidenceScore, 0) / mockStockSetups.length);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#080C14] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(120deg,rgba(0,208,132,0.08),transparent_34%),linear-gradient(240deg,rgba(255,59,92,0.07),transparent_35%),linear-gradient(180deg,rgba(8,12,20,0),#080C14_82%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#080C14]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="group inline-flex items-center gap-3 text-left">
              <HawkeyeLogo subtitle="Stock setup scanner" />
            </Link>
            <nav className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-1 text-xs font-semibold text-slate-400">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-2 transition hover:bg-white/[0.07] hover:text-white",
                      item.label === "Stock Scanner" && "bg-[#00D084]/12 text-[#00D084]/90"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
        </div>
      </header>

      <main id="main-content" className="relative mx-auto grid max-w-[1600px] gap-4 px-4 py-5 lg:px-6">
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel tight className="overflow-hidden">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00D084]/80">Dedicated scanner</p>
                <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">Stock Scanner</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Demo-only scan of possible trade setups with entries, stops, targets, risk/reward, confidence, and trader-style reasoning.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <HeroMetric label="Setups" value={mockStockSetups.length} />
                <HeroMetric label="Triggered" value={triggeredCount} trend="up" />
                <HeroMetric label="70%+" value={highConfidenceCount} />
                <HeroMetric label="Avg conf." value={averageConfidence} suffix="%" />
              </div>
            </div>
          </Panel>
          <DisclaimerCard />
        </section>

        <ScannerFilters filters={filters} onChange={setFilters} />

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3">
            <Panel tight>
              <SectionHeader
                eyebrow="Scanner results"
                title={`${filteredSetups.length} setup${filteredSetups.length === 1 ? "" : "s"} found`}
                action={<Zap className="size-5 text-[#00D084]" />}
              />
              <ScannerTable setups={filteredSetups} onOpen={setSelectedSetup} isLoading={tableLoading} />
              {!tableLoading && (
                <div className="grid gap-3 xl:hidden">
                  {filteredSetups.map((setup) => (
                    <StockSetupCard key={setup.ticker} setup={setup} onOpen={setSelectedSetup} />
                  ))}
                </div>
              )}
              {!tableLoading && filteredSetups.length === 0 && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-10 text-center">
                  <Crosshair className="mx-auto mb-3 size-8 text-slate-600" />
                  <p className="text-sm font-semibold text-slate-300">No setups match</p>
                  <p className="mt-1 text-xs text-slate-500">Try adjusting your filters or clearing the search.</p>
                </div>
              )}
            </Panel>
          </div>

          <aside className="grid gap-3 self-start">
            <Panel tight>
              <SectionHeader eyebrow="Playbook" title="Scanner conditions" action={<ShieldAlert className="size-5 text-amber-200" />} />
              <div className="grid gap-2">
                {Object.entries(scannerConditions).map(([setupType, conditions]) => (
                  <div key={setupType} className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03]">
                    <button
                      type="button"
                      onClick={() => setOpenPlaybook(openPlaybook === setupType ? null : setupType)}
                      className="flex w-full items-center justify-between p-3 text-left transition hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-2">
                        <SetupTypeIcon type={setupType} />
                        <span className="text-sm font-semibold text-white">{setupType}</span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-slate-500 transition-transform duration-200",
                          openPlaybook === setupType && "rotate-180"
                        )}
                      />
                    </button>
                    <div
                      className={cn(
                        "overflow-hidden transition-[max-height] duration-300 ease-in-out",
                        openPlaybook === setupType ? "max-h-64" : "max-h-0"
                      )}
                    >
                      <ul className="space-y-1 border-t border-white/[0.06] px-3 pb-3 pt-2 text-xs leading-5 text-slate-400">
                        {conditions.map((condition) => (
                          <li key={condition} className="flex gap-2">
                            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#00D084]" />
                            <span>{condition}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel tight>
              <SectionHeader eyebrow="Future-ready" title="Next integrations" action={<Bot className="size-5 text-[#00D084]/70" />} />
              <div className="grid gap-2 text-sm text-slate-300">
                {["Polygon/Finnhub scanners", "OpenAI reasoning", "Discord and email alerts", "Backtesting and paper trading", "Real-time WebSocket updates"].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5">
                    <Star className="size-3.5 shrink-0 text-[#00D084]/60" />
                    {item}
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        </section>
      </main>

      <StockDetailModal
        setup={selectedSetup}
        watchlist={watchlist}
        onClose={() => setSelectedSetup(null)}
        onAddToWatchlist={handleAddToWatchlist}
      />

      {/* Toast notifications */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[200] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-fade-in inline-flex items-center gap-2 rounded-lg border border-[#00D084]/25 bg-[#080C14]/95 px-4 py-3 text-sm font-semibold text-[#00D084] shadow-lg shadow-black/40 backdrop-blur"
          >
            <CheckCircle2 className="size-4 shrink-0" />
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  suffix = "",
  trend
}: {
  label: string;
  value: number;
  suffix?: string;
  trend?: "up" | "down";
}) {
  const display = useCountUp(value);
  return (
    <div className="min-w-24 rounded-lg border border-white/[0.06] bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_2px_8px_rgba(0,0,0,0.28)]">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <p className="font-display text-xl font-bold text-white">
          {display}{suffix}
        </p>
        {trend === "up" && <TrendingUp className="size-3.5 text-[#00D084]" />}
        {trend === "down" && <TrendingDown className="size-3.5 text-[#FF3B5C]" />}
      </div>
    </div>
  );
}
