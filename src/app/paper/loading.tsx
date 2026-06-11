"use client";

import { AppNav } from "@/components/shared/ui/app-nav";

function Skel({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted ${className ?? ""}`} />;
}

export default function PaperLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav activePage="Paper Trader" subtitle="Paper trading simulator" />
      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 lg:px-6">
        {/* Account summary bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skel key={i} className="h-16" />
          ))}
        </div>

        {/* Controls row */}
        <div className="flex gap-2">
          <Skel className="h-8 w-28" />
          <Skel className="h-8 w-28" />
          <Skel className="h-8 w-28" />
        </div>

        {/* Open positions table */}
        <Skel className="h-5 w-36" />
        <div className="space-y-px">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skel key={i} className="h-10" />
          ))}
        </div>

        {/* Closed trades table */}
        <Skel className="h-5 w-36" />
        <div className="space-y-px">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skel key={i} className="h-9" />
          ))}
        </div>
      </div>
    </div>
  );
}
