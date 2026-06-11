"use client";

import { AppNav } from "@/components/shared/ui/app-nav";

function Skel({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted ${className ?? ""}`} />;
}

export default function AnalyticsLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav activePage="Analytics" subtitle="Paper trading research" />
      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 lg:px-6">
        {/* Section title */}
        <Skel className="h-5 w-48" />

        {/* Stat cards row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skel key={i} className="h-20" />
          ))}
        </div>

        {/* Equity chart */}
        <Skel className="h-60" />

        {/* Two-column analytics panels */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Skel className="h-52" />
          <Skel className="h-52" />
        </div>

        {/* Trade history table */}
        <Skel className="h-7 w-40" />
        <div className="space-y-px">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skel key={i} className="h-9" />
          ))}
        </div>
      </div>
    </div>
  );
}
