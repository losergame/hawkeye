"use client";

import { Search, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/cn";
import type { ScannerSortKey, StockSetupStatus, StockSetupType } from "@/lib/types";

export type ScannerFiltersState = {
  search: string;
  setupType: "All" | StockSetupType;
  status: "All" | StockSetupStatus;
  confidence70: boolean;
  riskReward2: boolean;
  sortBy: ScannerSortKey;
};

const setupTypes: Array<"All" | StockSetupType> = ["All", "Momentum Breakout", "Pullback Buy", "Oversold Bounce", "Trend Continuation"];
const statuses: Array<"All" | StockSetupStatus> = ["All", "Waiting", "Triggered", "Failed", "Completed"];

export function ScannerFilters({
  filters,
  onChange
}: {
  filters: ScannerFiltersState;
  onChange: (filters: ScannerFiltersState) => void;
}) {
  const patch = (next: Partial<ScannerFiltersState>) => onChange({ ...filters, ...next });

  return (
    <div className="glass rounded-lg p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Scanner controls</p>
          <p className="text-sm text-slate-400">Mock setups today, API-ready later.</p>
        </div>
        <SlidersHorizontal className="size-5 text-cyan-200" />
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(180px,0.8fr)_minmax(150px,0.7fr)_auto_auto_minmax(170px,0.7fr)]">
        <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.045] px-3 text-sm text-slate-300">
          <Search className="size-4 text-slate-500" />
          <input
            value={filters.search}
            onChange={(event) => patch({ search: event.target.value })}
            placeholder="Search ticker or company"
            className="min-w-0 flex-1 bg-transparent text-white placeholder:text-slate-500 focus:outline-none"
          />
        </label>

        <select
          value={filters.setupType}
          onChange={(event) => patch({ setupType: event.target.value as ScannerFiltersState["setupType"] })}
          className="h-10 rounded-lg border border-white/10 bg-[#111827] px-3 text-sm text-slate-200"
        >
          {setupTypes.map((setupType) => (
            <option key={setupType}>{setupType}</option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(event) => patch({ status: event.target.value as ScannerFiltersState["status"] })}
          className="h-10 rounded-lg border border-white/10 bg-[#111827] px-3 text-sm text-slate-200"
        >
          {statuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>

        <FilterToggle active={filters.confidence70} label="70%+" onClick={() => patch({ confidence70: !filters.confidence70 })} />
        <FilterToggle active={filters.riskReward2} label="2:1+" onClick={() => patch({ riskReward2: !filters.riskReward2 })} />

        <select
          value={filters.sortBy}
          onChange={(event) => patch({ sortBy: event.target.value as ScannerSortKey })}
          className="h-10 rounded-lg border border-white/10 bg-[#111827] px-3 text-sm text-slate-200"
        >
          <option value="confidence">Sort by confidence</option>
          <option value="potentialGain">Sort by potential gain</option>
        </select>
      </div>
    </div>
  );
}

function FilterToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition",
        active ? "border-cyan-300/35 bg-cyan-300/15 text-cyan-50" : "border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"
      )}
    >
      {label}
    </button>
  );
}
