/**
 * Next.js Edge Middleware — Hawkeye security layer
 *
 * Runs before every request matched by `config.matcher`. Handles:
 *
 * 1. Login rate limiting  — blocks brute-force on /api/auth/callback/credentials
 * 2. Cron authentication  — /api/cron/* requires Bearer CRON_SECRET header
 * 3. Session enforcement  — all other routes require a valid NextAuth JWT
 *    • Pages    → redirect to /login?callbackUrl=<original>
 *    • API routes → return 401 JSON
 *
 * Public routes (no session required):
 *   /login, /api/auth/*, /_next/*, static assets
 */

import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkLoginRateLimit, getRequestIp } from "@/lib/rate-limit";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/icon.svg" ||
    pathname === "/favicon.ico"
  );
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1. Rate-limit login submissions ─────────────────────────────────────
  if (pathname === "/api/auth/callback/credentials" && req.method === "POST") {
    const ip     = getRequestIp(req);
    const result = checkLoginRateLimit(ip);

    if (!result.allowed) {
      const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Too many login attempts. Try again in 1 hour." },
        {
          status:  429,
          headers: { "Retry-After": String(retryAfterSec) },
        },
      );
    }
  }

  // ── 2. Admin endpoints: check CRON_SECRET ────────────────────────────────
  // Cron jobs + scanner maintenance ops share the same secret gate.
  const isAdminPath =
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/scanner/prefetch" ||
    pathname === "/api/scanner/diagnose" ||
    pathname === "/api/scanner/cache-stats" ||
    pathname === "/api/paper/trades/mark-error" ||
    pathname === "/api/paper/rebuild";

  if (isAdminPath) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── 3. Allow explicitly public paths ─────────────────────────────────────
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // ── 4. Require valid session for everything else ──────────────────────────
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Redirect to login and remember where they were going
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     *   - _next/static  (build output)
     *   - _next/image   (image optimisation)
     *   - static files with extensions (fonts, images, etc.)
     * Crucially this DOES match /api/* and all pages.
     */
    "/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|woff2?|ttf|otf|css|js)$).*)",
  ],
};
