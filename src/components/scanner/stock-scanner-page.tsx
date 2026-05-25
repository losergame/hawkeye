"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, BriefcaseBusiness, Eye, LayoutDashboard, Settings, ShieldAlert, Star, Target, Zap } from "lucide-react";

import { DisclaimerCard } from "@/components/scanner/disclaimer-card";
import { ScannerFilters, type ScannerFiltersState } from "@/components/scanner/scanner-filters";
import { ScannerTable } from "@/components/scanner/scanner-table";
import { StockDetailModal } from "@/components/scanner/stock-detail-modal";
import { potentialGainPercent, StockSetupCard } from "@/components/scanner/stock-setup-card";
import { Panel, SectionHeader } from "@/components/shared/ui";
import { SignalForgeLogo } from "@/components/shared/ui/signal-forge-logo";
import { cn } from "@/lib/cn";
import { mockStockSetups, scannerConditions } from "@/lib/mockStockSetups";
import type { StockSetup } from "@/lib/types";

const initialFilters: ScannerFiltersState = {
  search: "",
  setupType: "All",
  status: "All",
  confidence70: false,
  riskReward2: false,
  sortBy: "confidence"
};

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Stock Scanner", href: "/scanner", icon: Target },
  { label: "Watchlist", href: "/#watchlist-section", icon: Eye },
  { label: "Portfolio", href: "/#portfolio-section", icon: BriefcaseBusiness },
  { label: "Settings", href: "/#alerts-section", icon: Settings }
];

export function StockScannerPage() {
  const [filters, setFilters] = useState<ScannerFiltersState>(initialFilters);
  const [selectedSetup, setSelectedSetup] = useState<StockSetup | null>(null);

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

  const triggeredCount = mockStockSetups.filter((setup) => setup.status === "Triggered").length;
  const highConfidenceCount = mockStockSetups.filter((setup) => setup.confidenceScore >= 70).length;
  const averageConfidence = Math.round(mockStockSetups.reduce((sum, setup) => sum + setup.confidenceScore, 0) / mockStockSetups.length);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030712] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(120deg,rgba(20,184,166,0.14),transparent_34%),linear-gradient(240deg,rgba(244,63,94,0.11),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0),#030712_82%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.052)_1px,transparent_1px)] [background-size:32px_32px]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#030712]/94 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="group inline-flex items-center gap-3 text-left">
              <SignalForgeLogo subtitle="Stock setup scanner" />
            </Link>
            <nav className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-white/[0.035] p-1 text-xs font-semibold text-slate-400">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-3 py-2 transition hover:bg-white/[0.07] hover:text-white",
                      item.label === "Stock Scanner" && "bg-cyan-300/12 text-cyan-50"
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
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2 text-sm font-semibold text-slate-300 transition hover:text-white"
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
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Dedicated scanner</p>
                <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Stock Scanner</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Demo-only scan of possible trade setups with entries, stops, targets, risk/reward, confidence, and trader-style reasoning.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <HeroMetric label="Setups" value={String(mockStockSetups.length)} />
                <HeroMetric label="Triggered" value={String(triggeredCount)} />
                <HeroMetric label="70%+" value={String(highConfidenceCount)} />
                <HeroMetric label="Avg conf." value={`${averageConfidence}%`} />
              </div>
            </div>
          </Panel>

          <DisclaimerCard />
        </section>

        <ScannerFilters filters={filters} onChange={setFilters} />

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3">
            <Panel tight>
              <SectionHeader eyebrow="Scanner results" title={`${filteredSetups.length} setups found`} action={<Zap className="size-5 text-cyan-200" />} />
              <ScannerTable setups={filteredSetups} onOpen={setSelectedSetup} />
              <div className="grid gap-3 xl:hidden">
                {filteredSetups.map((setup) => (
                  <StockSetupCard key={setup.ticker} setup={setup} onOpen={setSelectedSetup} />
                ))}
              </div>
              {filteredSetups.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-slate-400">
                  No mock setups match those filters.
                </div>
              ) : null}
            </Panel>
          </div>

          <aside className="grid gap-3 self-start">
            <Panel tight>
              <SectionHeader eyebrow="Playbook" title="Scanner conditions" action={<ShieldAlert className="size-5 text-amber-200" />} />
              <div className="grid gap-2">
                {Object.entries(scannerConditions).map(([setupType, conditions]) => (
                  <div key={setupType} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <p className="font-semibold text-white">{setupType}</p>
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
                      {conditions.map((condition) => (
                        <li key={condition} className="flex gap-2">
                          <span className="mt-2 size-1.5 rounded-full bg-cyan-300" />
                          <span>{condition}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel tight>
              <SectionHeader eyebrow="Future-ready" title="Next integrations" action={<Bot className="size-5 text-cyan-200" />} />
              <div className="grid gap-2 text-sm text-slate-300">
                {["Polygon/Finnhub scanners", "OpenAI reasoning", "Discord and email alerts", "Backtesting and paper trading", "Real-time WebSocket updates"].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                    <Star className="size-3.5 text-cyan-200" />
                    {item}
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        </section>
      </main>

      <StockDetailModal setup={selectedSetup} onClose={() => setSelectedSetup(null)} />
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border border-white/10 bg-white/[0.045] p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}
