"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle, CheckCircle, Database, Loader2, RefreshCw, XCircle,
} from "lucide-react";

import { AppNav } from "@/components/shared/ui/app-nav";
import { cn } from "@/lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CandleCoverage {
  real: number; synthetic: number; uncached: number; total: number;
  realPct: number; syntheticPct: number;
}

interface PrefetchCoverage {
  sp500:      CandleCoverage;
  nasdaq100:  CandleCoverage;
  russell2000:CandleCoverage;
}

interface UniverseDiag {
  sp500:      { raw: number; dead: number; valid: number; deadTickers: string[] };
  nasdaq100:  { raw: number; dead: number; valid: number; deadTickers: string[] };
  russell2000:{ raw: number; dead: number; valid: number; deadTickers: string[] };
  combined:   { uniqueTickers: number; crossUniverse: number; deadTickers: string[] };
  blacklist:  string[];
  minPrice:   number;
  healthPct:  number;
  timestamp:  string;
}

interface DiagResult { ok: boolean; detail: string; error?: string; created?: string[] }

interface DiagData {
  config: {
    spreadsheetId:    string;
    serviceAccount:   string;
    privateKeySet:    boolean;
    sheetsConfigured: boolean;
  };
  auth:        DiagResult;
  metadata:    DiagResult;
  sheetNames:  string[];
  signalsRead: DiagResult;
  writeTest:   DiagResult;
  paperSheets: Record<string, boolean>;
  initTest:    DiagResult & { created?: string[] };
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ ok, loading = false }: { ok: boolean | null; loading?: boolean }) {
  if (loading) return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  if (ok === null) return <span className="size-4 rounded-full bg-surface-2 inline-block" />;
  return ok
    ? <CheckCircle className="size-4 text-positive" />
    : <XCircle className="size-4 text-destructive" />;
}

// ── Row ───────────────────────────────────────────────────────────────────────

function DiagRow({
  label, result, loading = false,
}: {
  label: string; result: DiagResult | null; loading?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
      <StatusIcon ok={result?.ok ?? null} loading={loading} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {result && (
          <p className={cn("mt-0.5 text-[11px]", result.ok ? "text-muted-foreground" : "text-destructive")}>
            {result.detail}
          </p>
        )}
        {result?.error && (
          <p className="mt-1 border border-destructive/20 bg-destructive/[0.04] px-2 py-1 text-[10px] font-mono text-destructive break-all">
            {result.error}
          </p>
        )}
      </div>
      <span className={cn(
        "shrink-0 text-[10px] font-bold uppercase",
        loading ? "text-muted-foreground" :
        result?.ok ? "text-positive" : result ? "text-destructive" : "text-muted-foreground",
      )}>
        {loading ? "Testing…" : result?.ok ? "PASS" : result ? "FAIL" : "—"}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SheetsDiagnostics() {
  const [data, setData]           = useState<DiagData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [ran, setRan]             = useState(false);
  const [fmtStatus, setFmtStatus]             = useState<string | null>(null);
  const [fmtLoading, setFmtLoad]              = useState(false);
  const [univAudit, setUnivAudit]             = useState<UniverseDiag | null>(null);
  const [univLoading, setUnivLoading]         = useState(false);
  // Candle coverage
  const [coverage, setCoverage]               = useState<PrefetchCoverage | null>(null);
  const [coverageLoading, setCovLoading]      = useState(false);
  const [prefetchStatus, setPrefetchStatus]   = useState<string | null>(null);
  const [prefetchLoading, setPrefetchLoading] = useState(false);
  const [allowSynthetic, setAllowSynthetic]   = useState<boolean | null>(null);
  const [toggleLoading, setToggleLoading]     = useState(false);

  // Load coverage + setting on mount
  useEffect(() => {
    void (async () => {
      try {
        const [cov, setting] = await Promise.all([
          fetch("/api/scanner/prefetch", { cache: "no-store" }).then((r) => r.json()) as Promise<PrefetchCoverage>,
          fetch("/api/sheets/settings?key=allowSyntheticData", { cache: "no-store" })
            .then((r) => r.json()).catch(() => ({ value: null })) as Promise<{ value: string | null }>,
        ]);
        setCoverage(cov);
        setAllowSynthetic(setting.value === "true");
      } catch { /* silent */ }
    })();
  }, []);

  async function refreshCoverage() {
    setCovLoading(true);
    try {
      const cov = await fetch("/api/scanner/prefetch", { cache: "no-store" }).then((r) => r.json()) as PrefetchCoverage;
      setCoverage(cov);
    } catch { /* silent */ } finally { setCovLoading(false); }
  }

  async function startPrefetch(universe: string) {
    setPrefetchLoading(true); setPrefetchStatus(null);
    try {
      const res  = await fetch("/api/scanner/prefetch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ universe }),
      });
      const json = await res.json() as { started?: boolean; tickers?: number; alreadyCached?: number };
      setPrefetchStatus(
        json.started
          ? `Prefetching ${json.tickers} tickers in background (${json.alreadyCached} already cached). Refresh coverage in ~2 minutes.`
          : "Prefetch failed.",
      );
      setTimeout(() => void refreshCoverage(), 15_000); // quick refresh after 15s
    } catch (e) { setPrefetchStatus("Error: " + String(e)); }
    finally { setPrefetchLoading(false); }
  }

  async function toggleSynthetic() {
    setToggleLoading(true);
    const next = !allowSynthetic;
    try {
      await fetch("/api/sheets/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "allowSyntheticData", value: String(next) }),
      });
      setAllowSynthetic(next);
    } catch { /* silent */ } finally { setToggleLoading(false); }
  }

  async function runTest(initSheets = false) {
    setLoading(true);
    setRan(false);
    try {
      const res = await fetch("/api/sheets/diagnostics", {
        method:  initSheets ? "POST" : "GET",
        cache:   "no-store",
      });
      const json = (await res.json()) as DiagData;
      setData(json);
      setRan(true);
    } catch (err) {
      setData(null);
      alert("Could not reach diagnostics API: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  const allPaperSheets = data
    ? Object.values(data.paperSheets).every(Boolean)
    : false;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-dot-grid" />
      <AppNav activePage="Settings" subtitle="Google Sheets diagnostics" />

      <main className="relative mx-auto max-w-[900px] px-4 py-6 lg:px-6">

        <div className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-positive/70">Diagnostics</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Google Sheets</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Tests auth, read, write, and paper trading sheet existence.
          </p>
        </div>

        {/* Action buttons */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runTest(false)}
            disabled={loading}
            className="flex items-center gap-2 border border-border bg-surface-1 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-foreground transition hover:bg-surface-2 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Run Sheets Test
          </button>
          <button
            type="button"
            onClick={() => void runTest(true)}
            disabled={loading}
            className="flex items-center gap-2 border border-positive/30 bg-positive/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-positive transition hover:bg-positive/20 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Run Test + Init Paper Sheets
          </button>
          <button
            type="button"
            disabled={fmtLoading}
            onClick={async () => {
              setFmtLoad(true); setFmtStatus(null);
              try {
                const res  = await fetch("/api/sheets/format", { method: "POST", cache: "no-store" });
                const json = await res.json() as { ok?: boolean; message?: string; error?: string };
                setFmtStatus(json.ok ? (json.message ?? "Formatting applied.") : (json.error ?? "Failed."));
              } catch (e) { setFmtStatus("Error: " + String(e)); }
              finally { setFmtLoad(false); }
            }}
            className="flex items-center gap-2 border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-amber-400 transition hover:bg-amber-400/20 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", fmtLoading && "animate-spin")} />
            Apply Conditional Formatting
          </button>
        </div>
        {fmtStatus && (
          <div className="mb-4 border border-border bg-surface-1 px-4 py-2.5 text-[11px] text-foreground">
            {fmtStatus}
          </div>
        )}

        {/* Config summary */}
        {data && (
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Spreadsheet ID", value: data.config.spreadsheetId },
              { label: "Service Account", value: data.config.serviceAccount.split("@")[0] + "@..." },
              { label: "Private Key",     value: data.config.privateKeySet ? "Set ✓" : "Missing ✗" },
              { label: "Configured",      value: data.config.sheetsConfigured ? "YES" : "NO" },
            ].map(({ label, value }) => (
              <div key={label} className="border border-border bg-surface-1 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="mt-1 text-xs font-semibold text-foreground truncate">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Test results */}
        <div className="mb-4 border border-border bg-card">
          <div className="border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Connectivity Tests
          </div>
          <DiagRow label="Authentication (JWT)"          result={data?.auth       ?? null} loading={loading && !ran} />
          <DiagRow label="Spreadsheet metadata (read)"   result={data?.metadata   ?? null} loading={loading && !ran} />
          <DiagRow label="Signals sheet (read)"          result={data?.signalsRead?? null} loading={loading && !ran} />
          <DiagRow label="AppSettings sheet (write+delete)" result={data?.writeTest ?? null} loading={loading && !ran} />
        </div>

        {/* Paper trading sheets */}
        <div className="mb-4 border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-surface-1 px-4 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Paper Trading Sheets
            </p>
            {ran && (
              <span className={cn(
                "text-[10px] font-bold",
                allPaperSheets ? "text-positive" : "text-destructive",
              )}>
                {allPaperSheets ? "All present" : "Missing tabs — click 'Run Test + Init'"}
              </span>
            )}
          </div>
          {(["PaperAccount","PaperPositions","PaperTrades","PaperEquityCurve"] as const).map((name) => (
            <div key={name} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <StatusIcon ok={ran ? (data?.paperSheets[name] ?? false) : null} loading={loading && !ran} />
              <span className="text-xs font-semibold text-foreground">{name}</span>
              <span className={cn(
                "ml-auto text-[10px] font-bold",
                !ran ? "text-muted-foreground" :
                data?.paperSheets[name] ? "text-positive" : "text-destructive",
              )}>
                {!ran ? "—" : data?.paperSheets[name] ? "EXISTS" : "MISSING"}
              </span>
            </div>
          ))}
        </div>

        {/* Init result */}
        {data?.initTest && data.initTest.detail !== "Not run" && (
          <div className="mb-4 border border-border bg-card">
            <div className="border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Initialization Result
            </div>
            <DiagRow label="initializePaperTradingSheets()" result={data.initTest} />
            {(data.initTest.created?.length ?? 0) > 0 && (
              <div className="px-4 py-2 text-[11px] text-positive">
                Created tabs: {data.initTest.created?.join(", ")}
              </div>
            )}
          </div>
        )}

        {/* Sheet names list */}
        {data && data.sheetNames.length > 0 && (
          <div className="mb-4 border border-border bg-card">
            <div className="border-b border-border bg-surface-1 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              All Sheet Tabs ({data.sheetNames.length})
            </div>
            <div className="flex flex-wrap gap-2 p-4">
              {data.sheetNames.map((name) => (
                <span
                  key={name}
                  className={cn(
                    "border px-2 py-1 text-[10px] font-semibold",
                    ["PaperAccount","PaperPositions","PaperTrades","PaperEquityCurve"].includes(name)
                      ? "border-positive/30 bg-positive/10 text-positive"
                      : "border-border bg-surface-1 text-muted-foreground",
                  )}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Candle Coverage ── */}
        <div className="mb-4 border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-surface-1 px-4 py-2">
            <div className="flex items-center gap-2">
              <Database className="size-3.5 text-muted-foreground" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Real Candle Coverage
              </p>
            </div>
            <button type="button" disabled={coverageLoading}
              onClick={() => void refreshCoverage()}
              className="flex items-center gap-1.5 border border-border px-2.5 py-1 text-[11px] text-foreground transition hover:bg-muted disabled:opacity-50">
              <RefreshCw className={cn("size-3", coverageLoading && "animate-spin")} />
              Refresh
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Allow Synthetic toggle */}
            <div className="flex items-center justify-between border border-border bg-surface-1 px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Allow Synthetic Data</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {allowSynthetic
                    ? "ON — scanner uses synthetic candles for tickers without real data"
                    : "OFF — scanner skips tickers without real OHLC candles (recommended)"}
                </p>
              </div>
              <button
                type="button"
                disabled={toggleLoading || allowSynthetic === null}
                onClick={() => void toggleSynthetic()}
                className={cn(
                  "relative ml-4 h-6 w-11 shrink-0 rounded-full border-2 transition-colors disabled:opacity-50",
                  allowSynthetic ? "border-amber-400 bg-amber-400/30" : "border-positive bg-positive/30",
                )}
              >
                <span className={cn(
                  "absolute top-0.5 size-4 rounded-full transition-transform",
                  allowSynthetic ? "translate-x-5 bg-amber-400" : "translate-x-0.5 bg-positive",
                )} />
              </button>
            </div>

            {/* Coverage bars per universe */}
            {coverage ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {(["sp500", "nasdaq100", "russell2000"] as const).map((u) => {
                  const c = coverage[u];
                  const label = u === "sp500" ? "S&P 500" : u === "nasdaq100" ? "NASDAQ 100" : "Russell 2000";
                  return (
                    <div key={u} className="border border-border bg-surface-1 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
                      <div className="flex items-end gap-2 mb-2">
                        <span className={cn("text-2xl font-bold tabular-nums",
                          c.realPct >= 80 ? "text-positive" : c.realPct >= 40 ? "text-amber-400" : "text-destructive")}>
                          {c.realPct}%
                        </span>
                        <span className="text-[11px] text-muted-foreground pb-0.5">real</span>
                      </div>
                      {/* Bar */}
                      <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full bg-positive/70 rounded-full transition-all"
                          style={{ width: `${c.realPct}%` }} />
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                        <span className="text-positive">{c.real} real</span>
                        <span className="text-amber-400 text-center">{c.synthetic} synth</span>
                        <span className="text-right">{c.uncached} missing</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Loading coverage…</p>
            )}

            {/* Prefetch buttons */}
            <div className="flex flex-wrap gap-2">
              {(["sp500", "nasdaq100", "russell2000", "all"] as const).map((u) => (
                <button key={u} type="button" disabled={prefetchLoading}
                  onClick={() => void startPrefetch(u)}
                  className="flex items-center gap-1.5 border border-border bg-surface-1 px-3 py-1.5 text-[11px] text-foreground transition hover:bg-surface-2 disabled:opacity-50">
                  {prefetchLoading ? <Loader2 className="size-3 animate-spin" /> : <Database className="size-3" />}
                  Prefetch {u === "all" ? "All Universes" : u === "sp500" ? "S&P 500" : u === "nasdaq100" ? "NASDAQ 100" : "Russell 2000"}
                </button>
              ))}
            </div>
            {prefetchStatus && (
              <p className="text-[11px] text-muted-foreground border border-border bg-surface-1 px-3 py-2">
                {prefetchStatus}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Real candles are cached for 4 hours. Prefetch runs at ~40 req/min in background — safe for Finnhub free tier.
              Paper trader will block mock-candle setups when Allow Synthetic = OFF.
            </p>
          </div>
        </div>

        {/* ── Universe Audit ── */}
        <div className="border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-surface-1 px-4 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Universe Audit Tool
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={univLoading}
                onClick={async () => {
                  setUnivLoading(true);
                  try {
                    const res  = await fetch("/api/scanner/universe-audit", { cache: "no-store" });
                    const json = await res.json() as UniverseDiag;
                    setUnivAudit(json);
                  } catch { /* silent */ } finally { setUnivLoading(false); }
                }}
                className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] text-foreground transition hover:bg-muted disabled:opacity-50">
                <RefreshCw className={cn("size-3.5", univLoading && "animate-spin")} />
                Run Universe Audit
              </button>
              {univAudit && (
                <button type="button"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(univAudit, null, 2)], { type: "application/json" });
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement("a");
                    a.href = url; a.download = `hawkeye-universe-audit-${Date.now()}.json`;
                    a.click(); URL.revokeObjectURL(url);
                  }}
                  className="border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-muted">
                  Export JSON ↓
                </button>
              )}
            </div>
          </div>

          {univAudit ? (
            <div className="p-4 space-y-4">
              {/* Health summary */}
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className={cn("text-3xl font-bold tabular-nums",
                    univAudit.healthPct >= 95 ? "text-positive" : univAudit.healthPct >= 80 ? "text-amber-400" : "text-destructive")}>
                    {univAudit.healthPct}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Universe Health</p>
                </div>
                <div className="flex-1 grid gap-2 sm:grid-cols-4 text-xs">
                  {[
                    { l: "S&P 500",       raw: univAudit.sp500.raw,       valid: univAudit.sp500.valid,       dead: univAudit.sp500.dead },
                    { l: "NASDAQ 100",    raw: univAudit.nasdaq100.raw,    valid: univAudit.nasdaq100.valid,    dead: univAudit.nasdaq100.dead },
                    { l: "Russell 2000",  raw: univAudit.russell2000.raw,  valid: univAudit.russell2000.valid,  dead: univAudit.russell2000.dead },
                    { l: "Combined",      raw: univAudit.combined.uniqueTickers + univAudit.combined.crossUniverse,
                                          valid: univAudit.combined.uniqueTickers, dead: univAudit.combined.deadTickers.length },
                  ].map(({ l, raw, valid, dead }) => (
                    <div key={l} className="border border-border bg-surface-1 p-2.5">
                      <p className="text-[10px] text-muted-foreground font-bold">{l}</p>
                      <p className="tabular-nums text-foreground">{valid} <span className="text-muted-foreground">/ {raw}</span></p>
                      {dead > 0 && <p className="text-[10px] text-destructive">−{dead} dead</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Cross-universe duplicates */}
              <div className="border border-border bg-surface-1 p-3 text-xs">
                <p className="font-bold text-foreground mb-1">Cross-universe duplicates: {univAudit.combined.crossUniverse} tickers</p>
                <p className="text-muted-foreground">These appear in 2+ universes. The dedup-by-ticker cooldown prevents double-buying but they inflate universe size.</p>
              </div>

              {/* Dead tickers */}
              {univAudit.combined.deadTickers.length > 0 ? (
                <div className="border border-destructive/25 bg-destructive/[0.04] p-3 text-xs">
                  <p className="font-bold text-destructive mb-1">Dead tickers in blacklist: {univAudit.blacklist.length}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {univAudit.blacklist.map((t) => (
                      <span key={t} className="border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive font-bold">{t}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="border border-positive/25 bg-positive/[0.04] p-3 text-xs text-positive">
                  ✓ No dead tickers found in active universe files. Blacklist has {univAudit.blacklist.length} entries as protection.
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">
                Audited at {new Date(univAudit.timestamp).toLocaleString()} · Min price filter: ${univAudit.minPrice}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-xs text-muted-foreground">Click &ldquo;Run Universe Audit&rdquo; to check scanner universe health.</p>
            </div>
          )}
        </div>

        {/* Not-run state */}
        {!ran && !loading && (
          <div className="flex flex-col items-center py-16 text-center">
            <AlertTriangle className="mb-3 size-8 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">No test run yet</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Click <strong>Run Sheets Test</strong> to check connectivity, or{" "}
              <strong>Run Test + Init Paper Sheets</strong> to also create missing tabs.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
