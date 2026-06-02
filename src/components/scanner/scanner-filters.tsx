"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Filter,
  Flame,
  Search,
  TrendingUp,
  X,
  Zap,
  ArrowDownUp,
  BarChart2,
  Check
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/cn";
import type { ScannerSortKey, StockSetupStatus, StockSetupType } from "@/lib/types";

export type ScannerFiltersState = {
  search: string;
  setupType: "All" | StockSetupType;
  status: "All" | StockSetupStatus;
  confidence70: boolean;
  riskReward2: boolean;
  sortBy: ScannerSortKey;
  preset: string | null;
};

const setupTypes: Array<"All" | StockSetupType> = [
  "All",
  "Momentum Breakout",
  "Pullback Buy",
  "Oversold Bounce",
  "Trend Continuation"
];
const statuses: Array<"All" | StockSetupStatus> = [
  "All",
  "Waiting",
  "Triggered",
  "Failed",
  "Completed"
];

export const defaultFilters: ScannerFiltersState = {
  search: "",
  setupType: "All",
  status: "All",
  confidence70: false,
  riskReward2: false,
  sortBy: "confidence",
  preset: null
};

// Smart preset filter chips
const PRESETS = [
  {
    id: "high-conviction",
    label: "High Conviction",
    icon: Flame,
    color: "text-amber-400 border-amber-400/25 bg-amber-400/10",
    activeColor: "border-amber-400/50 bg-amber-400/20 text-amber-300",
    apply: (f: ScannerFiltersState): ScannerFiltersState => ({
      ...f,
      confidence70: true,
      riskReward2: true,
      sortBy: "confidence",
      preset: "high-conviction"
    })
  },
  {
    id: "breakout-today",
    label: "Breakout Today",
    icon: Zap,
    color: "text-positive border-positive/25 bg-positive/10",
    activeColor: "border-positive/50 bg-positive/20 text-positive",
    apply: (f: ScannerFiltersState): ScannerFiltersState => ({
      ...f,
      setupType: "Momentum Breakout",
      status: "Triggered",
      preset: "breakout-today"
    })
  },
  {
    id: "oversold-bounces",
    label: "Oversold Bounces",
    icon: TrendingUp,
    color: "text-blue-400 border-blue-400/25 bg-blue-400/10",
    activeColor: "border-blue-400/50 bg-blue-400/20 text-blue-300",
    apply: (f: ScannerFiltersState): ScannerFiltersState => ({
      ...f,
      setupType: "Oversold Bounce",
      preset: "oversold-bounces"
    })
  },
  {
    id: "best-rr",
    label: "Best R/R",
    icon: BarChart2,
    color: "text-purple-400 border-purple-400/25 bg-purple-400/10",
    activeColor: "border-purple-400/50 bg-purple-400/20 text-purple-300",
    apply: (f: ScannerFiltersState): ScannerFiltersState => ({
      ...f,
      riskReward2: true,
      sortBy: "potentialGain",
      preset: "best-rr"
    })
  }
];

export function ScannerFilters({
  filters,
  onChange
}: {
  filters: ScannerFiltersState;
  onChange: (filters: ScannerFiltersState) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const patch = (next: Partial<ScannerFiltersState>) => onChange({ ...filters, ...next });

  const isFiltered =
    filters.search !== "" ||
    filters.setupType !== "All" ||
    filters.status !== "All" ||
    filters.confidence70 ||
    filters.riskReward2;

  function handleReset() {
    onChange(defaultFilters);
    toast.info("Filters cleared");
    searchRef.current?.focus();
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    if (filters.preset === preset.id) {
      onChange({ ...defaultFilters });
      toast.info("Preset cleared");
    } else {
      onChange(preset.apply({ ...defaultFilters }));
      toast.success(`Applied: ${preset.label}`);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="glass rounded-xl p-4"
    >
      {/* Top row: presets + reset */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Filter className="size-3.5" />
          <span>Smart filters</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = filters.preset === preset.id;
            return (
              <motion.button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                  active ? preset.activeColor : preset.color
                )}
              >
                <Icon className="size-3" />
                {preset.label}
                {active && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="size-1.5 rounded-full bg-current"
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {isFiltered && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              type="button"
              onClick={handleReset}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition hover:bg-destructive/20"
            >
              <X className="size-3" />
              Reset
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Search */}
      <label className="mb-3 flex h-10 items-center gap-2.5 rounded-lg border border-border bg-surface-1 px-3 text-sm transition-all duration-200 focus-within:border-positive/40 focus-within:bg-surface-2 focus-within:shadow-[0_0_0_3px_rgba(0,232,122,0.08)]">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={searchRef}
          value={filters.search}
          onChange={(e) => patch({ search: e.target.value, preset: null })}
          placeholder="Search ticker or company…"
          className="min-w-0 flex-1 bg-transparent font-mono text-foreground placeholder:font-sans placeholder:text-muted-foreground outline-none"
        />
        <AnimatePresence>
          {filters.search && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              type="button"
              onClick={() => patch({ search: "" })}
              className="text-muted-foreground transition hover:text-foreground"
            >
              <X className="size-3.5" />
            </motion.button>
          )}
        </AnimatePresence>
      </label>

      {/* Setup type pills */}
      <div className="mb-2.5 flex items-center gap-2 overflow-x-auto pb-0.5">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Setup</span>
        <div className="flex items-center gap-1.5">
          {setupTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => patch({ setupType: type, preset: null })}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200",
                filters.setupType === type
                  ? "border-positive/40 bg-positive/15 text-positive shadow-[0_0_8px_rgba(0,232,122,0.2)]"
                  : "border-border bg-surface-1 text-muted-foreground hover:border-border hover:bg-surface-2 hover:text-foreground"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Status + toggles + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Status</span>
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => patch({ status: s, preset: null })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200",
              filters.status === s
                ? "border-positive/40 bg-positive/15 text-positive shadow-[0_0_8px_rgba(0,232,122,0.2)]"
                : "border-border bg-surface-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )}
          >
            {s}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <FilterToggle
            active={filters.confidence70}
            label="70%+ conf."
            onClick={() => patch({ confidence70: !filters.confidence70, preset: null })}
          />
          <FilterToggle
            active={filters.riskReward2}
            label="2:1+ R/R"
            onClick={() => patch({ riskReward2: !filters.riskReward2, preset: null })}
          />

          <SortDropdown
            value={filters.sortBy}
            onChange={(v) => patch({ sortBy: v as ScannerSortKey })}
          />
        </div>
      </div>
    </motion.div>
  );
}

const SORT_OPTIONS: { value: ScannerSortKey; label: string }[] = [
  { value: "confidence", label: "Confidence" },
  { value: "potentialGain", label: "Potential gain" },
];

function SortDropdown({ value, onChange }: { value: ScannerSortKey; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={cn(
          "flex h-8 items-center gap-1.5 border border-border bg-surface-1 pl-2.5 pr-2 text-xs font-semibold text-foreground transition hover:border-border hover:bg-surface-2",
          open && "border-positive/30 bg-surface-2"
        )}
      >
        <ArrowDownUp className="size-3.5 text-muted-foreground" />
        {current.label}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15 }}
          className="ml-0.5 inline-flex"
        >
          <ArrowDownUp className="size-3 rotate-90 text-muted-foreground" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[140px] border border-border bg-card py-0.5"
          >
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-semibold transition",
                  opt.value === value
                    ? "bg-surface-1 text-foreground"
                    : "text-muted-foreground hover:bg-surface-1 hover:text-foreground"
                )}
              >
                {opt.label}
                {opt.value === value && <Check className="size-3 text-positive" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-all duration-200",
        active
          ? "border-positive/40 bg-positive/15 text-positive shadow-[0_0_8px_rgba(0,232,122,0.2)]"
          : "border-border bg-surface-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}
