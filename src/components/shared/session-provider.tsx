"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

/** Thin client-only wrapper so the root layout (Server Component) can use SessionProvider. */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
