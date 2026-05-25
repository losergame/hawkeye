"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { ConfidenceBadge, RiskRewardBadge, StatusBadge } from "@/components/scanner/badges";
import { potentialGainPercent, riskPercent } from "@/components/scanner/stock-setup-card";
import { Skeleton } from "@/components/shared/ui";
import { cn } from "@/lib/cn";
import type { StockSetup } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type SortColumn = "ticker" | "currentPrice" | "setupType" | "entryPrice" | "riskReward" | "confidenceScore";
type SortDirection = "asc" | "desc";

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

function sortSetups(setups: StockSetup[], sort: SortState): StockSetup[] {
  return [...setups].sort((a, b) => {
    let cmp = 0;
    if (sort.column === "ticker" || sort.column === "setupType") {
      cmp = a[sort.column].localeCompare(b[sort.column]);
    } else {
      cmp = (a[sort.column] as number) - (b[sort.column] as number);
    }
    return sort.direction === "asc" ? cmp : -cmp;
  });
}

function SortableHeader({
  label,
  column,
  sort,
  onSort,
  className
}: {
  label: string;
  column: SortColumn;
  sort: SortState;
  onSort: (col: SortColumn) => void;
  className?: string;
}) {
  const active = sort.column === column;
  const Icon = active ? (sort.direction === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className={cn("cursor-pointer select-none px-3 py-3 transition hover:text-slate-200", className)}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className={cn("size-3 transition", active ? "text-[#00D084]" : "text-slate-600")} />
      </span>
    </th>
  );
}

export function ScannerTable({
  setups,
  onOpen,
  isLoading = false
}: {
  setups: StockSetup[];
  onOpen: (setup: StockSetup) => void;
  isLoading?: boolean;
}) {
  const [sort, setSort] = useState<SortState>({ column: "confidenceScore", direction: "desc" });
  const prevPrices = useRef<Map<string, number>>(new Map());

  const handleSort = (column: SortColumn) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "desc" }
    );
  };

  const sorted = sortSetups(setups, sort);

  return (
    <div className="hidden overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03] xl:block">
      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#080C14]/98 text-xs uppercase tracking-[0.14em] text-slate-500 shadow-[0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
            <tr>
              <SortableHeader label="Ticker" column="ticker" sort={sort} onSort={handleSort} />
              <th className="px-3 py-3">Company</th>
              <SortableHeader label="Price" column="currentPrice" sort={sort} onSort={handleSort} />
              <SortableHeader label="Setup" column="setupType" sort={sort} onSort={handleSort} />
              <SortableHeader label="Entry" column="entryPrice" sort={sort} onSort={handleSort} />
              <th className="px-3 py-3">Stop</th>
              <th className="px-3 py-3">TP1</th>
              <th className="px-3 py-3">TP2</th>
              <SortableHeader label="R/R" column="riskReward" sort={sort} onSort={handleSort} />
              <SortableHeader label="Conf." column="confidenceScore" sort={sort} onSort={handleSort} />
              <th className="px-3 py-3">Reason</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.06]">
                    {[28, 140, 80, 130, 80, 80, 90, 90, 70, 70, 200, 70].map((w, j) => (
                      <td key={j} className="px-3 py-3.5">
                        <Skeleton className={`h-4`} style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((setup) => {
                  const prevPrice = prevPrices.current.get(setup.ticker);
                  const flashClass =
                    prevPrice !== undefined
                      ? setup.currentPrice > prevPrice
                        ? "animate-price-up"
                        : setup.currentPrice < prevPrice
                          ? "animate-price-down"
                          : ""
                      : "";
                  prevPrices.current.set(setup.ticker, setup.currentPrice);

                  return (
                    <tr
                      key={setup.ticker}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${setup.ticker} setup details`}
                      onClick={() => onOpen(setup)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpen(setup);
                        }
                      }}
                      className="cursor-pointer border-b border-white/[0.06] transition hover:bg-[#00D084]/[0.05] hover:shadow-[inset_3px_0_0_#00D084] focus-visible:bg-[#00D084]/[0.07] focus-visible:outline-none"
                    >
                      <td className="px-3 py-3 font-bold font-display text-[#00D084]">{setup.ticker}</td>
                      <td className="px-3 py-3 text-slate-300">{setup.companyName}</td>
                      <td
                        key={`${setup.ticker}-price-${setup.currentPrice}`}
                        className={cn("px-3 py-3 font-semibold font-display tabular-nums text-white", flashClass)}
                      >
                        {money.format(setup.currentPrice)}
                      </td>
                      <td className="px-3 py-3 text-slate-300">{setup.setupType}</td>
                      <td className="px-3 py-3 font-display tabular-nums text-white">{money.format(setup.entryPrice)}</td>
                      <td className="px-3 py-3 font-display tabular-nums text-rose-300">{money.format(setup.stopLoss)}</td>
                      <td className="px-3 py-3 font-display tabular-nums text-[#00D084]">
                        {money.format(setup.takeProfit1)}
                        <span className="ml-1 text-xs text-[#00D084]/60">+{potentialGainPercent(setup).toFixed(1)}%</span>
                      </td>
                      <td className="px-3 py-3 font-display tabular-nums text-[#00D084]/80">{money.format(setup.takeProfit2)}</td>
                      <td className="px-3 py-3">
                        <RiskRewardBadge value={setup.riskReward} />
                        <span className="ml-2 text-xs text-slate-500">risk {riskPercent(setup).toFixed(1)}%</span>
                      </td>
                      <td className="px-3 py-3">
                        <ConfidenceBadge score={setup.confidenceScore} />
                      </td>
                      <td className="max-w-[220px] px-3 py-3">
                        <p className="line-clamp-2 text-xs leading-5 text-slate-400" title={setup.reason}>
                          {setup.reason}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={setup.status} />
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
