import { cn } from "@/lib/cn";
import type { StockSetupStatus } from "@/lib/types";

export function ConfidenceBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "border-[#00D084]/30 bg-[#00D084]/12 text-[#00D084] shadow-[0_0_10px_rgba(0,208,132,0.18)]"
      : score >= 70
        ? "border-[#00D084]/20 bg-[#00D084]/8 text-[#00D084]/80"
        : "border-amber-300/25 bg-amber-300/12 text-amber-100";

  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold font-display", tone)}>
      {score}%
    </span>
  );
}

export function RiskRewardBadge({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "rounded-full border border-[#00D084]/20 bg-[#00D084]/10 px-2.5 py-1 text-xs font-bold font-display text-[#00D084]",
        value >= 2 && "shadow-[0_0_8px_rgba(0,208,132,0.35)]"
      )}
    >
      {value.toFixed(1)}:1
    </span>
  );
}

export function StatusBadge({ status }: { status: StockSetupStatus }) {
  const tone: Record<StockSetupStatus, string> = {
    Waiting: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    Triggered: "border-[#00D084]/30 bg-[#00D084]/12 text-[#00D084] shadow-[0_0_10px_rgba(0,208,132,0.15)]",
    Failed: "border-[#FF3B5C]/25 bg-[#FF3B5C]/10 text-rose-100",
    Completed: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
  };

  return <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", tone[status])}>{status}</span>;
}
