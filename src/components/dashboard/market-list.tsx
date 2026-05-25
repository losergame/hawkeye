import type { ReactNode } from "react";

import { ChangePill, Panel, ScrollBody, SectionHeader, cardHeightTier } from "@/components/shared/ui";
import { findStock } from "@/lib/mock-data";
import type { StockMover, StockProfile } from "@/lib/types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function MarketList({
  title,
  icon,
  items,
  onPick,
  className
}: {
  title: string;
  icon: ReactNode;
  items: StockMover[];
  onPick: (stock: StockProfile) => void;
  className?: string;
}) {
  return (
    <Panel tight className={`flex flex-col ${className ?? cardHeightTier.medium}`}>
      <SectionHeader title={title} action={icon} />
      <ScrollBody className="grid gap-2">
        {items.map((item) => {
          const stock = findStock(item.symbol);
          return (
            <button
              key={item.symbol}
              onClick={() => onPick(stock)}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-left transition hover:bg-white/[0.075]"
            >
              <div className="min-w-0">
                <p className="font-semibold text-white">{item.symbol}</p>
                <p className="truncate text-sm text-slate-400">{item.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-white">{money.format(item.price)}</p>
                <ChangePill value={item.changePercent} />
              </div>
            </button>
          );
        })}
      </ScrollBody>
    </Panel>
  );
}
