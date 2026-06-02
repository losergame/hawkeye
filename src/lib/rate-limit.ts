/**
 * Rate limiter — in-memory, single-process.
 *
 * ⚠ Vercel limitation: stateless functions reset this Map on cold starts.
 * For persistent rate limiting on Vercel, swap in @upstash/ratelimit (Redis).
 * For local dev and single-process servers this is fully effective.
 */

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export function getClientRateLimitKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();

  return `${scope}:${forwarded || realIp || cfIp || "local"}`;
}

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { limited: true, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { limited: false, retryAfterMs: bucket.resetAt - now };
}

// ── Login-specific convenience helpers ────────────────────────────────────────

const LOGIN_LIMIT  = 10;
const LOGIN_WINDOW = 60 * 60_000; // 1 hour

/** Check if an IP can attempt another login. Returns { allowed, remaining, resetAt }. */
export function checkLoginRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const key    = `login:${ip}`;
  const result = checkRateLimit(key, LOGIN_LIMIT, LOGIN_WINDOW);
  const bucket = buckets.get(key);
  return {
    allowed:   !result.limited,
    remaining: bucket ? Math.max(0, LOGIN_LIMIT - bucket.count) : LOGIN_LIMIT - 1,
    resetAt:   bucket?.resetAt ?? Date.now() + LOGIN_WINDOW,
  };
}

/** Clear an IP's login counter on successful auth (no reason to keep penalising). */
export function clearLoginRateLimit(ip: string): void {
  buckets.delete(`login:${ip}`);
}

/** Extract the best available IP from an incoming request's headers. */
export function getRequestIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip")?.trim() ??
    req.headers.get("cf-connecting-ip")?.trim() ??
    "unknown"
  );
}
