"use client";

import { AppNav } from "@/components/shared/ui/app-nav";

function Skel({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted ${className ?? ""}`} />;
}

export default function ScannerLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav activePage="Scanner" subtitle="Stock setup scanner" />
      <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-6 lg:px-6">
        {/* Search + filter bar */}
        <div className="flex gap-2">
          <Skel className="h-9 w-64" />
          <Skel className="h-9 w-32" />
          <Skel className="h-9 w-32" />
        </div>

        {/* Universe tabs */}
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skel key={i} className="h-8 w-24" />
          ))}
        </div>

        {/* Signal cards grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skel key={i} className="h-44" />
          ))}
        </div>
      </div>
    </div>
  );
}
