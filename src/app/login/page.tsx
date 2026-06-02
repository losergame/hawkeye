"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { HawkeyeLogo } from "@/components/shared/ui/hawkeye-logo";

// ── Inner component — uses useSearchParams, must be inside Suspense ───────────

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl  = searchParams.get("callbackUrl") ?? "/";
  const urlError     = searchParams.get("error");

  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Map NextAuth error codes to friendly messages
  useEffect(() => {
    if (urlError === "CredentialsSignin") {
      setError("Incorrect username or password.");
    }
  }, [urlError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      username: username.trim(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.ok) {
      router.push(callbackUrl);
    } else if (result?.status === 429) {
      setError("Too many login attempts. Wait 1 hour and try again.");
    } else {
      setError("Incorrect username or password.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Background grid */}
      <div className="pointer-events-none fixed inset-0 bg-dot-grid opacity-40" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <HawkeyeLogo />
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-positive/70">
              Secure Access
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sign in to access the trading dashboard
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="border border-border bg-card p-6 shadow-lg">
          {/* Lock icon header */}
          <div className="mb-5 flex items-center gap-2 border-b border-border pb-4">
            <Lock className="size-3.5 text-muted-foreground" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Authentication Required
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {/* Username */}
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                disabled={loading}
                className="w-full border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder-muted-foreground/40 outline-none focus:border-positive/60 focus:ring-1 focus:ring-positive/30 disabled:opacity-50"
                placeholder="username"
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  className="w-full border border-border bg-background px-3 py-2.5 pr-10 font-mono text-sm text-foreground placeholder-muted-foreground/40 outline-none focus:border-positive/60 focus:ring-1 focus:ring-positive/30 disabled:opacity-50"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass
                    ? <EyeOff className="size-3.5" />
                    : <Eye    className="size-3.5" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="flex w-full items-center justify-center gap-2 border border-positive/40 bg-positive/10 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-positive transition hover:bg-positive/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading
                ? <><Loader2 className="size-3.5 animate-spin" /> Authenticating…</>
                : "Sign In"}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50">
          Hawkeye · Paper trading simulation · Not financial advice
        </p>
      </div>
    </div>
  );
}

// ── Page export — wraps LoginForm in Suspense (required for useSearchParams) ──

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
