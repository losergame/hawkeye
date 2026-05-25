import { cn } from "@/lib/cn";
import type { StockSetupStatus } from "@/lib/types";

export function ConfidenceBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "border-emerald-300/25 bg-emerald-300/12 text-emerald-100"
      : score >= 70
        ? "border-cyan-300/25 bg-cyan-300/12 text-cyan-100"
        : "border-amber-300/25 bg-amber-300/12 text-amber-100";

  return <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", tone)}>{score}%</span>;
}

export function RiskRewardBadge({ value }: { value: number }) {
  return (
    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-bold text-emerald-100">
      {value.toFixed(1)}:1
    </span>
  );
}

export function StatusBadge({ status }: { status: StockSetupStatus }) {
  const tone: Record<StockSetupStatus, string> = {
    Waiting: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    Triggered: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    Failed: "border-rose-300/25 bg-rose-300/10 text-rose-100",
    Completed: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
  };

  return <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", tone[status])}>{status}</span>;
}
