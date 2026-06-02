import { NextResponse } from "next/server";
import { google } from "googleapis";
import { isSheetsConfigured, initializePaperTradingSheets } from "@/lib/google-sheets";

interface DiagResult {
  ok: boolean;
  detail: string;
  error?: string;
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) return null;
  return new google.auth.JWT({
    email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function runDiagnostics() {
  const sid = process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? null;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null;
  const hasKey = !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  const config = {
    spreadsheetId:    sid ? sid.slice(0, 8) + "..." : "(not set)",
    serviceAccount:   email ?? "(not set)",
    privateKeySet:    hasKey,
    sheetsConfigured: isSheetsConfigured(),
  };

  if (!isSheetsConfigured()) {
    return {
      config,
      auth:          { ok: false, detail: "Not configured", error: "Missing env vars" },
      metadata:      { ok: false, detail: "Skipped" },
      sheetNames:    [],
      signalsRead:   { ok: false, detail: "Skipped" },
      writeTest:     { ok: false, detail: "Skipped" },
      paperSheets:   { PaperAccount: false, PaperPositions: false, PaperTrades: false, PaperEquityCurve: false },
      initTest:      { ok: false, detail: "Skipped" },
    };
  }

  const auth   = getAuth()!;
  const sheets = google.sheets({ version: "v4", auth });

  // ── Test 1: authentication ────────────────────────────────────────────────
  let authResult: DiagResult;
  try {
    await auth.authorize();
    authResult = { ok: true, detail: "JWT authorized successfully" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      config,
      auth: { ok: false, detail: "JWT authorization failed", error: msg },
      metadata: { ok: false, detail: "Skipped" },
      sheetNames: [],
      signalsRead: { ok: false, detail: "Skipped" },
      writeTest: { ok: false, detail: "Skipped" },
      paperSheets: { PaperAccount: false, PaperPositions: false, PaperTrades: false, PaperEquityCurve: false },
      initTest: { ok: false, detail: "Skipped" },
    };
  }

  // ── Test 2: read spreadsheet metadata ────────────────────────────────────
  let sheetNames: string[] = [];
  let metaResult: DiagResult;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sid! });
    sheetNames = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "");
    metaResult = { ok: true, detail: `Found ${sheetNames.length} sheet(s)` };
  } catch (err) {
    const e = err as { message?: string; response?: { data?: { error?: { message?: string } } } };
    const msg = e.response?.data?.error?.message ?? e.message ?? String(err);
    metaResult = { ok: false, detail: "Could not read spreadsheet metadata", error: msg };
    return { config, auth: authResult, metadata: metaResult, sheetNames, signalsRead: { ok: false, detail: "Skipped" }, writeTest: { ok: false, detail: "Skipped" }, paperSheets: { PaperAccount: false, PaperPositions: false, PaperTrades: false, PaperEquityCurve: false }, initTest: { ok: false, detail: "Skipped" } };
  }

  // ── Test 3: read Signals sheet ────────────────────────────────────────────
  let signalsRead: DiagResult;
  if (sheetNames.includes("Signals")) {
    try {
      const rows = await sheets.spreadsheets.values.get({
        spreadsheetId: sid!, range: "Signals!A1:A5",
      });
      const count = (rows.data.values ?? []).length;
      signalsRead = { ok: true, detail: `Read ${count} row(s) from Signals` };
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      signalsRead = { ok: false, detail: "Read failed", error: e.response?.data?.error?.message ?? e.message };
    }
  } else {
    signalsRead = { ok: false, detail: "Signals tab not found" };
  }

  // ── Test 4: write + delete test row ──────────────────────────────────────
  const testSheet = sheetNames.includes("AppSettings") ? "AppSettings" : sheetNames[0];
  let writeTest: DiagResult;
  let testRowIndex: number | null = null;
  try {
    const append = await sheets.spreadsheets.values.append({
      spreadsheetId: sid!,
      range: `${testSheet}!A:A`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [["__DIAG_TEST__", new Date().toISOString()]] },
    });
    // Extract the row number from the updatedRange response
    const updated = append.data.updates?.updatedRange ?? "";
    const match   = updated.match(/!A(\d+)/);
    testRowIndex  = match ? Number(match[1]) : null;
    writeTest     = { ok: true, detail: `Appended test row to ${testSheet}` };
  } catch (err) {
    const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
    writeTest = { ok: false, detail: "Write failed", error: e.response?.data?.error?.message ?? e.message };
  }

  // Delete the test row if we know where it is
  if (testRowIndex !== null) {
    try {
      const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: sid! });
      const sheetId   = sheetMeta.data.sheets?.find((s) => s.properties?.title === testSheet)?.properties?.sheetId;
      if (sheetId !== undefined) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sid!,
          requestBody: {
            requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: testRowIndex - 1, endIndex: testRowIndex } } }],
          },
        });
        writeTest.detail += " (test row cleaned up)";
      }
    } catch { /* cleanup failure is non-fatal */ }
  }

  // ── Test 5: paper sheet existence ─────────────────────────────────────────
  const paperSheets = {
    PaperAccount:    sheetNames.includes("PaperAccount"),
    PaperPositions:  sheetNames.includes("PaperPositions"),
    PaperTrades:     sheetNames.includes("PaperTrades"),
    PaperEquityCurve:sheetNames.includes("PaperEquityCurve"),
  };

  return { config, auth: authResult, metadata: metaResult, sheetNames, signalsRead, writeTest, paperSheets, initTest: { ok: true, detail: "Not run" } };
}

// ── GET /api/sheets/diagnostics ───────────────────────────────────────────────

export async function GET() {
  const result = await runDiagnostics();
  return NextResponse.json(result);
}

// ── POST /api/sheets/diagnostics — also runs initializePaperTradingSheets ────

export async function POST() {
  const [diagResult, initResult] = await Promise.all([
    runDiagnostics(),
    initializePaperTradingSheets(),
  ]);
  return NextResponse.json({ ...diagResult, initTest: initResult });
}
