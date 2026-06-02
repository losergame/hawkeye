"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  BriefcaseBusiness,
  FlaskConical,
  LayoutDashboard,
  LineChart,
  Settings,
  Target,
  Wrench,
} from "lucide-react";

import { HawkeyeLogo } from "@/components/shared/ui/hawkeye-logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/",         icon: LayoutDashboard },
  { label: "Scanner",   href: "/scanner",  icon: Target },
  { label: "Signals",   href: "/signals",  icon: LineChart },
  { label: "Portfolio",    href: "/portfolio",        icon: BriefcaseBusiness },
  { label: "Paper Trader",href: "/paper",            icon: FlaskConical },
  { label: "Analytics",   href: "/analytics",        icon: BarChart2 },
  { label: "Diagnostics", href: "/diagnostics",    icon: Wrench },
  { label: "Settings",    href: "/#alerts-section", icon: Settings },
];

interface AppNavProps {
  subtitle?: string;
  /** Override active detection (defaults to pathname match) */
  activePage?: string;
  /** Right-side slot for extra controls */
  right?: React.ReactNode;
}

export function AppNav({ subtitle, activePage, right }: AppNavProps) {
  const pathname = usePathname();

  function isActive(item: (typeof NAV_ITEMS)[number]) {
    if (activePage) return item.label === activePage;
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2.5 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        {/* Brand + nav */}
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/">
            <HawkeyeLogo subtitle={subtitle} />
          </Link>

          <nav className="flex flex-wrap items-center gap-0.5 rounded-none border border-border bg-surface-1 p-1 text-xs font-medium text-muted-foreground">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 transition-all duration-150",
                    active
                      ? "bg-foreground text-background"
                      : "hover:bg-surface-2 hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                  {active && (
                    <span className="size-1.5 bg-background" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right slot */}
        <div className="flex items-center gap-2">
          {right}
          <ThemeToggle compact />
        </div>
      </div>
    </header>
  );
}
