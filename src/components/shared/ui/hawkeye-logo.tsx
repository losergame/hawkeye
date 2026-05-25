"use client";

import { Crosshair } from "lucide-react";

import { cn } from "@/lib/cn";

export function HawkeyeLogo({
  compact = false,
  subtitle = "Stock intelligence dashboard"
}: {
  compact?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl border transition-all duration-500",
          "border-[#00D084]/20 bg-[#00D084]/10 shadow-[0_0_24px_rgba(0,208,132,0.15)]",
          compact ? "size-8 rounded-lg" : "size-10"
        )}
      >
        <Crosshair
          className={cn(
            "text-[#00D084] transition-all duration-500",
            compact ? "size-4" : "size-5"
          )}
        />
      </div>
      <div
        className={cn(
          "overflow-hidden transition-all duration-500",
          compact ? "max-h-5 opacity-90" : "max-h-12 opacity-100"
        )}
      >
        <p
          className={cn(
            "font-display font-bold leading-none tracking-tight text-white transition-all duration-500",
            compact ? "text-base" : "text-lg"
          )}
        >
          Hawkeye
        </p>
        <p
          className={cn(
            "text-[#00D084]/70 transition-all duration-500",
            compact ? "max-h-0 overflow-hidden text-[10px] opacity-0" : "mt-0.5 max-h-4 text-[11px] opacity-100"
          )}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
