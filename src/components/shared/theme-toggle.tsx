"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/cn";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold transition",
        compact ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
        isDark
          ? "border-slate-300/15 bg-slate-300/8 text-slate-300 hover:bg-white/[0.08]"
          : "border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15"
      )}
    >
      {isDark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
      {isDark ? "Dark" : "Light"}
    </button>
  );
}
