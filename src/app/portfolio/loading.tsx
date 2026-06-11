"use client";

import { AppNav } from "@/components/shared/ui/app-nav";

function Skel({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted ${className ?? ""}`} />;
}

export default function PortfolioLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav activePage="Portfolio" subtitle="Holdings & performance" />
      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 lg:px-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skel key={i} className="h-20" />
          ))}
        </div>

        {/* Holdings table header */}
        <Skel className="h-5 w-32" />
        <Skel className="h-9" />

        {/* Holding rows */}
        <div className="space-y-px">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skel key={i} className="h-10" />
          ))}
        </div>
      </div>
    </div>
  );
}
