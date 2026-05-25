"use client";

import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";

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

export const defaultFilters: ScannerFiltersState = {
  search: "",
  setupType: "All",
  status: "All",
  confidence70: false,
  riskReward2: false,
  sortBy: "confidence"
};

export function ScannerFilters({
  filters,
  onChange
}: {
  filters: ScannerFiltersState;
  onChange: (filters: ScannerFiltersState) => void;
}) {
  const patch = (next: Partial<ScannerFiltersState>) => onChange({ ...filters, ...next });

  const isFiltered =
    filters.search !== "" ||
    filters.setupType !== "All" ||
    filters.status !== "All" ||
    filters.confidence70 ||
    filters.riskReward2;

  return (
    <div className="glass rounded-lg p-3.5">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00D084]/80">Scanner controls</p>
          <p className="text-sm text-slate-400">Mock setups today — API-ready architecture.</p>
        </div>
        <div className="flex items-center gap-2">
          {isFiltered && (
            <button
              type="button"
              onClick={() => onChange(defaultFilters)}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/20 bg-rose-300/[0.07] px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-300/[0.12]"
            >
              <X className="size-3" />
              Reset
            </button>
          )}
          <SlidersHorizontal className="size-5 text-[#00D084]/70" />
        </div>
      </div>

      {/* Row 1: Search */}
      <label className="mb-2.5 flex h-11 items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 text-sm text-slate-300 transition focus-within:border-[#00D084]/40 focus-within:bg-white/[0.06]">
        <Search className="size-4 shrink-0 text-slate-500" />
        <input
          value={filters.search}
          onChange={(event) => patch({ search: event.target.value })}
          placeholder="Search ticker or company…"
          className="min-w-0 flex-1 bg-transparent text-white placeholder:text-slate-500 focus:outline-none"
        />
      </label>

      {/* Row 2: Setup type pills */}
      <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
        <span className="shrink-0 text-xs text-slate-500">Setup:</span>
        {setupTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => patch({ setupType: type })}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition",
              filters.setupType === type
                ? "border-[#00D084]/35 bg-[#00D084]/15 text-white shadow-[0_0_12px_rgba(0,208,132,0.15)]"
                : "border-white/[0.06] bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-white"
            )}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Row 3: Status pills + toggles + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Status:</span>
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => patch({ status: s })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition",
              filters.status === s
                ? "border-[#00D084]/35 bg-[#00D084]/15 text-white shadow-[0_0_12px_rgba(0,208,132,0.15)]"
                : "border-white/[0.06] bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-white"
            )}
          >
            {s}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <FilterToggle active={filters.confidence70} label="70%+" onClick={() => patch({ confidence70: !filters.confidence70 })} />
          <FilterToggle active={filters.riskReward2} label="2:1+" onClick={() => patch({ riskReward2: !filters.riskReward2 })} />

          <div className="relative">
            <select
              value={filters.sortBy}
              onChange={(event) => patch({ sortBy: event.target.value as ScannerSortKey })}
              className="h-9 appearance-none rounded-lg border border-white/[0.06] bg-[#0D1520] pl-3 pr-8 text-xs text-slate-200 transition hover:border-white/[0.12]"
            >
              <option value="confidence">Sort: Confidence</option>
              <option value="potentialGain">Sort: Gain</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
          </div>
        </div>
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
        "h-9 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition",
        active
          ? "border-[#00D084]/35 bg-[#00D084]/15 text-white shadow-[0_0_12px_rgba(0,208,132,0.15)]"
          : "border-white/[0.06] bg-white/[0.03] text-slate-400 hover:bg-white/[0.07] hover:text-white"
      )}
    >
      {label}
    </button>
  );
}
