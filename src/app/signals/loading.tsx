"use client";

import { AppNav } from "@/components/shared/ui/app-nav";

function Skel({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted ${className ?? ""}`} />;
}

export default function SignalsLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav activePage="Signals" />
      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 lg:px-6">
        {/* Header + controls */}
        <div className="flex items-center justify-between">
          <Skel className="h-6 w-40" />
          <div className="flex gap-2">
            <Skel className="h-8 w-24" />
            <Skel className="h-8 w-24" />
          </div>
        </div>

        {/* Filter row */}
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skel key={i} className="h-8 w-28" />
          ))}
        </div>

        {/* Table header */}
        <Skel className="h-8" />

        {/* Signal rows */}
        <div className="space-y-px">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skel key={i} className="h-10" />
          ))}
        </div>
      </div>
    </div>
  );
}
