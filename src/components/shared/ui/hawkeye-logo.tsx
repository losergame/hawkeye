"use client";

import { cn } from "@/lib/cn";

function HawkeyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer eye shape */}
      <path
        d="M2 16C2 16 8 6 16 6C24 6 30 16 30 16C30 16 24 26 16 26C8 26 2 16 2 16Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Iris circle */}
      <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="1.5" />
      {/* Pupil dot */}
      <circle cx="16" cy="16" r="2" fill="currentColor" />
      {/* Crosshair lines */}
      <line x1="16" y1="1" x2="16" y2="9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <line x1="16" y1="23" x2="16" y2="31" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <line x1="1" y1="16" x2="9" y2="16" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <line x1="23" y1="16" x2="31" y2="16" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export function HawkeyeLogo({
  compact = false,
  subtitle = "Stock intelligence dashboard"
}: {
  compact?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {/* Logo mark */}
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-lg border transition-all duration-500",
          "border-positive/25 bg-positive/10",
          compact ? "size-8" : "size-10"
        )}
      >
        <HawkeyeIcon
          className={cn(
            "text-positive transition-all duration-500",
            compact ? "size-4" : "size-[22px]"
          )}
        />
      </div>

      {/* Wordmark */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-500",
          compact ? "max-h-5 opacity-90" : "max-h-12 opacity-100"
        )}
      >
        <p
          className={cn(
            "font-display font-bold leading-none tracking-tight text-foreground transition-all duration-500",
            compact ? "text-base" : "text-lg"
          )}
        >
          HAWKEYE
        </p>
        <p
          className={cn(
            "font-mono text-positive/60 transition-all duration-500",
            compact ? "max-h-0 overflow-hidden text-[10px] opacity-0" : "mt-0.5 max-h-4 text-[10px] opacity-100"
          )}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
