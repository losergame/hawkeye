/**
 * Google Sheets client — server-side only.
 *
 * Credentials live in environment variables and never reach the browser.
 * All functions return null/[] gracefully when not configured.
 *
 * Rate limit: 300 req/min. In-memory cache keeps read traffic low.
 */

import { google, type sheets_v4 } from "googleapis";

// ── Auth ──────────────────────────────────────────────────────────────────────

function getAuth(): InstanceType<typeof google.auth.JWT> | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Private key is stored with literal \n — replace before use
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) return null;
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

let _client: sheets_v4.Sheets | null = null;

export function getSheetsClient(): sheets_v4.Sheets | null {
  if (_client) return _client;
  const auth = getAuth();
  if (!auth) return null;
  _client = google.sheets({ version: "v4", auth });
  return _client;
}

export function getSpreadsheetId(): string | null {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? null;
}

export function isSheetsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  );
}

// ── In-memory read cache (30-second TTL) ──────────────────────────────────────

const CACHE_TTL_MS = 30_000;
const _cache = new Map<string, { data: string[][]; expiresAt: number }>();

function cacheGet(key: string): string[][] | null {
  const entry = _cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}
function cacheSet(key: string, data: string[][]): void {
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}
function cacheInvalidate(sheetName: string): void {
  _cache.delete(sheetName);
}

/** Force the next read of `sheetName` to bypass the in-memory cache. */
export function invalidateSheetCache(sheetName: string): void {
  cacheInvalidate(sheetName);
}

// ── Sheet names ───────────────────────────────────────────────────────────────

export const SHEETS = {
  SIGNALS:          "Signals",
  PERFORMANCE:      "SignalPerformance",
  PORTFOLIO:        "Portfolio",
  WATCHLIST:        "Watchlist",
  HISTORY:          "ScannerHistory",
  TOP_PICKS:        "DailyTopPicks",
  SETTINGS:         "AppSettings",
  PAPER_ACCOUNT:    "PaperAccount",
  PAPER_POSITIONS:  "PaperPositions",
  PAPER_TRADES:     "PaperTrades",
  PAPER_EQUITY:     "PaperEquityCurve",
  RULE_PRESETS:     "RulePresets",
} as const;

// ── Column headers ────────────────────────────────────────────────────────────

export const HEADERS: Record<string, string[]> = {
  [SHEETS.SIGNALS]: [
    "id","ticker","companyName","setupType",
    "entryPrice","stopLoss","takeProfit1","takeProfit2",
    "riskReward","confidence","scannerScore",
    "status","createdAt","updatedAt",
  ],
  [SHEETS.PERFORMANCE]: [
    "signalId","ticker","setupType",
    "entryPrice","exitPrice","result",
    "returnPct","riskRewardAchieved","holdingDays",
    "confidence","createdAt","resolvedAt",
  ],
  [SHEETS.PORTFOLIO]: [
    "id","ticker","shares","averageCost",
    "currentPrice","marketValue","gainLossDollar","gainLossPercent",
    "allocationPercent","sector","updatedAt",
  ],
  [SHEETS.WATCHLIST]: ["id","ticker","companyName","sector","addedAt","updatedAt"],
  [SHEETS.HISTORY]: [
    "scanId","universe","totalScanned","setupsFound",
    "topScore","avgScore","scanAt",
  ],
  [SHEETS.TOP_PICKS]: [
    "date","rank","ticker","scannerScore","confidence",
    "setupType","entryPrice","stopLoss","takeProfit","reason",
  ],
  [SHEETS.SETTINGS]: ["key","value","updatedAt"],
  [SHEETS.RULE_PRESETS]: [
    "id","presetName","minScannerScore","minConfidence",
    "setupTypesAllowed","excludedTickers","allowedMarketRegimes",
    "minRiskReward","createdAt","notes",
  ],
  [SHEETS.PAPER_ACCOUNT]: [
    "accountId","startingBalance","cashBalance","equityValue",
    "totalAccountValue","totalPnL","totalPnLPercent",
    "totalTrades","wins","losses","winRate","updatedAt",
  ],
  [SHEETS.PAPER_POSITIONS]: [
    "positionId","ticker","companyName","setupType",
    "entryPrice","currentPrice","shares","positionValue",
    "stopLoss","takeProfit1","takeProfit2",
    "unrealizedPnL","unrealizedPnLPercent","status","openedAt","updatedAt",
    "notes",  // JSON: { scannerScore, confidence, scoreBreakdown, dataSource, candleSource }
  ],
  [SHEETS.PAPER_TRADES]: [
    // original columns — order must not change (existing sheet rows depend on it)
    "tradeId","ticker","companyName","setupType",
    "buyPrice","sellPrice","shares","positionSize",
    "profitLoss","profitLossPercent",
    "result","reasonOpened","reasonClosed","openedAt","closedAt",
    "holdTimeHours","notes",
    // realism upgrade columns appended at end to avoid misaligning existing rows
    "effectiveEntryPrice","effectiveExitPrice","slippageCost","gapType","gapAmount",
  ],
  [SHEETS.PAPER_EQUITY]: [
    "date","accountValue","cashBalance","investedValue","dailyPnL","totalPnLPercent",
  ],
};

// ── Generic CRUD ──────────────────────────────────────────────────────────────

/** Read all rows from a sheet (returns header row + data rows). */
export async function getSheetRows(sheetName: string): Promise<string[][]> {
  const cached = cacheGet(sheetName);
  if (cached) return cached;

  const sheets = getSheetsClient();
  const sid    = getSpreadsheetId();
  if (!sheets || !sid) return [];

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sid,
      range: `${sheetName}!A:Z`,
    });
    const rows = (res.data.values ?? []) as string[][];
    cacheSet(sheetName, rows);
    return rows;
  } catch {
    return [];
  }
}

/** Append one or more rows to a sheet. */
export async function appendRows(
  sheetName: string,
  rows: (string | number | boolean | null)[][],
): Promise<void> {
  const sheets = getSheetsClient();
  const sid    = getSpreadsheetId();
  if (!sheets || !sid || rows.length === 0) return;

  cacheInvalidate(sheetName);
  await sheets.spreadsheets.values.append({
    spreadsheetId: sid,
    range: `${sheetName}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

/** Update a single row by 1-based sheet row index. */
export async function updateRow(
  sheetName: string,
  rowIndex: number,
  values: (string | number | boolean | null)[],
): Promise<void> {
  const sheets = getSheetsClient();
  const sid    = getSpreadsheetId();
  if (!sheets || !sid) return;

  cacheInvalidate(sheetName);
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range: `${sheetName}!A${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
}

/** Overwrite the entire data range of a sheet (replaces all rows after header). */
export async function replaceAllRows(
  sheetName: string,
  rows: (string | number | boolean | null)[][],
): Promise<void> {
  const sheets = getSheetsClient();
  const sid    = getSpreadsheetId();
  if (!sheets || !sid) return;

  cacheInvalidate(sheetName);

  // Clear from row 2 onward, then write new data
  const header = HEADERS[sheetName] ?? [];
  const clearRange = `${sheetName}!A2:Z`;
  await sheets.spreadsheets.values.clear({ spreadsheetId: sid, range: clearRange });

  if (rows.length === 0) return;

  await sheets.spreadsheets.values.append({
    spreadsheetId: sid,
    range: `${sheetName}!A2`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });

  void header; // silence unused
}

/**
 * Delete a single row by 1-based sheet row index using batchUpdate.
 * Row 1 is the header and cannot be deleted.
 */
export async function deleteRow(sheetName: string, rowIndex: number): Promise<void> {
  const sheets = getSheetsClient();
  const sid    = getSpreadsheetId();
  if (!sheets || !sid || rowIndex <= 1) return;

  cacheInvalidate(sheetName);

  // Get the sheet's numeric ID first
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sid });
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === sheetName,
  );
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sid,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowIndex - 1, // 0-based
            endIndex: rowIndex,       // exclusive
          },
        },
      }],
    },
  });
}

/** Find the 1-based row index of a row whose first column matches `id`. */
export async function findRowIndexById(
  sheetName: string,
  id: string,
): Promise<number | null> {
  const rows = await getSheetRows(sheetName);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) return i + 1; // sheet rows are 1-based
  }
  return null;
}

/** Find the 1-based row index of a row whose Nth column (0-indexed) matches value. */
export async function findRowIndexByColumn(
  sheetName: string,
  colIndex: number,
  value: string,
): Promise<number | null> {
  const rows = await getSheetRows(sheetName);
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][colIndex] ?? "") === value) return i + 1;
  }
  return null;
}

// ── Sheet initialisation ──────────────────────────────────────────────────────

/**
 * Ensure a sheet exists and has the correct header row.
 * Creates the tab if missing; writes headers if row 1 is empty.
 */
export async function ensureSheet(sheetName: string): Promise<void> {
  const sheets = getSheetsClient();
  const sid    = getSpreadsheetId();
  if (!sheets || !sid) return;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sid });
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === sheetName,
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sid,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
  }

  // Write headers if row 1 is blank
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${sheetName}!A1:Z1`,
  });
  if (!existing.data.values?.[0]?.length) {
    const headers = HEADERS[sheetName];
    if (headers) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sid,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    }
  }
}

/** Read a single key from the AppSettings tab (key-value store). */
export async function readSetting(key: string): Promise<string | null> {
  const rows = await getSheetRows(SHEETS.SETTINGS);
  const row  = rows.slice(1).find((r) => r[0] === key);
  return row?.[1] ?? null;
}

/** Write (upsert) a key-value pair to the AppSettings tab. */
export async function writeSetting(key: string, value: string): Promise<void> {
  const sheets = getSheetsClient();
  const sid    = getSpreadsheetId();
  if (!sheets || !sid) return;

  cacheInvalidate(SHEETS.SETTINGS);
  const rows  = await getSheetRows(SHEETS.SETTINGS);
  const rowIdx= rows.findIndex((r, i) => i > 0 && r[0] === key);
  const now   = new Date().toISOString();

  if (rowIdx > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sid,
      range: `${SHEETS.SETTINGS}!A${rowIdx + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: [[key, value, now]] },
    });
  } else {
    await appendRows(SHEETS.SETTINGS, [[key, value, now]]);
  }
}

/** One-time setup: create all sheets and write headers. */
export async function initialiseAllSheets(): Promise<{ ok: boolean; error?: string }> {
  try {
    for (const name of Object.values(SHEETS)) {
      await ensureSheet(name);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Paper trading sheet initialisation ───────────────────────────────────────

const PAPER_SHEETS = [
  SHEETS.PAPER_ACCOUNT,
  SHEETS.PAPER_POSITIONS,
  SHEETS.PAPER_TRADES,
  SHEETS.PAPER_EQUITY,
] as const;

let _paperSheetsInitialised = false;

/**
 * Creates PaperAccount / PaperPositions / PaperTrades / PaperEquityCurve if
 * they are missing.  Writes headers and the default $1 000 account row.
 * Safe to call multiple times — fully idempotent.
 */
export async function initializePaperTradingSheets(): Promise<{
  ok: boolean;
  created: string[];
  error?: string;
}> {
  const sheets = getSheetsClient();
  const sid    = getSpreadsheetId();
  if (!sheets || !sid) {
    return { ok: false, created: [], error: "Google Sheets not configured (check env vars)" };
  }

  const created: string[] = [];

  try {
    // ── 1. Get current sheet list in one call ─────────────────────────────
    const meta    = await sheets.spreadsheets.get({ spreadsheetId: sid });
    const existing = new Set(
      (meta.data.sheets ?? []).map((s) => s.properties?.title ?? ""),
    );

    // ── 2. Create missing tabs ─────────────────────────────────────────────
    const missing = PAPER_SHEETS.filter((n) => !existing.has(n));
    if (missing.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sid,
        requestBody: {
          requests: missing.map((title) => ({
            addSheet: { properties: { title } },
          })),
        },
      });
      created.push(...missing);
    }

    // ── 3. Write headers for every paper tab (skip if already present) ────
    for (const sheetName of PAPER_SHEETS) {
      const row1 = await sheets.spreadsheets.values.get({
        spreadsheetId: sid,
        range: `${sheetName}!A1:Z1`,
      });
      if (!row1.data.values?.[0]?.length) {
        const headers = HEADERS[sheetName];
        if (headers) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: sid,
            range: `${sheetName}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: [headers] },
          });
        }
      }
    }

    // ── 4. Seed default PaperAccount row if sheet is empty ────────────────
    const accRows = await sheets.spreadsheets.values.get({
      spreadsheetId: sid,
      range: `${SHEETS.PAPER_ACCOUNT}!A2:A2`,
    });
    if (!accRows.data.values?.[0]?.[0]) {
      const now = new Date().toISOString();
      const HA  = HEADERS[SHEETS.PAPER_ACCOUNT];
      const row = HA.map((col: string) => {
        switch (col) {
          case "accountId":         return "paper_main";
          case "startingBalance":   return 1000;
          case "cashBalance":       return 1000;
          case "equityValue":       return 0;
          case "totalAccountValue": return 1000;
          case "totalPnL":          return 0;
          case "totalPnLPercent":   return 0;
          case "totalTrades":       return 0;
          case "wins":              return 0;
          case "losses":            return 0;
          case "winRate":           return 0;
          case "updatedAt":         return now;
          default:                  return "";
        }
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId: sid,
        range: `${SHEETS.PAPER_ACCOUNT}!A2`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
    }

    _paperSheetsInitialised = true;

    // Apply conditional formatting after initialisation (fire-and-forget — non-fatal)
    try {
      const { applyPaperTradingFormatting } = await import("@/lib/sheets-formatting");
      void applyPaperTradingFormatting();
    } catch { /* formatting is best-effort */ }

    return { ok: true, created };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, created, error: msg };
  }
}

/** Returns true if init has already run in this process (avoids repeated API calls). */
export function arePaperSheetsReady(): boolean {
  return _paperSheetsInitialised;
}

/** Force re-check on next access (call after manual reset). */
export function resetPaperSheetsFlag(): void {
  _paperSheetsInitialised = false;
}

// ── Row → typed object helpers ─────────────────────────────────────────────────

/** Convert a sheet row array to a keyed object using a header row. */
export function rowToObject(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
  return obj;
}

/** Convert keyed object to a row array using a header array (preserving order). */
export function objectToRow(
  headers: string[],
  obj: Record<string, string | number | boolean | null | undefined>,
): (string | number | boolean | null)[] {
  return headers.map((h) => obj[h] ?? null);
}
