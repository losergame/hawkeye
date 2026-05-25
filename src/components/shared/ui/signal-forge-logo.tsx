import { LineChart } from "lucide-react";

import { cn } from "@/lib/cn";

export function SignalForgeLogo({
  compact = false,
  subtitle = "Stock intelligence dashboard"
}: {
  compact?: boolean;
  subtitle?: string;
}) {
  return (
    <>
      <span
        className={cn(
          "flex items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)] transition-[width,height,background-color] duration-500 ease-out group-hover:bg-cyan-300/15",
          compact ? "size-9" : "size-10"
        )}
      >
        <LineChart className={cn("transition-[width,height] duration-500 ease-out", compact ? "size-4" : "size-5")} />
      </span>
      <span>
        <span className={cn("block font-semibold leading-5 text-white transition-[font-size] duration-500 ease-out", compact ? "text-base" : "text-lg")}>
          SignalForge AI
        </span>
        <span
          className={cn(
            "block overflow-hidden text-xs text-slate-400 transition-[max-height,opacity,transform] duration-500 ease-out",
            compact ? "max-h-0 -translate-y-1 opacity-0" : "max-h-4 translate-y-0 opacity-100"
          )}
        >
          {subtitle}
        </span>
      </span>
    </>
  );
}
