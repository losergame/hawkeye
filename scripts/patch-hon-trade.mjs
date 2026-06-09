/**
 * One-time migration: retroactively mark HON trade pt_1780854690187_u7h7p
 * as DATA_ERROR in Google Sheets (false win caused by bad Finnhub price feed).
 *
 * Run: node scripts/patch-hon-trade.mjs
 */

import { readFileSync } from "fs";
import { google } from "googleapis";

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnv(path) {
  try {
    const text = readFileSync(path, "utf8");
    const out = {};
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const env = loadEnv(".env.local");

// ── Constants ─────────────────────────────────────────────────────────────────

const TRADE_ID   = "pt_1780854690187_u7h7p";
const SHEET_NAME = "PaperTrades";

// Column indices (0-based) — must match HEADERS[SHEETS.PAPER_TRADES] in google-sheets.ts
// "tradeId","ticker","companyName","setupType","buyPrice","sellPrice","shares",
// "positionSize","profitLoss","profitLossPercent","result","reasonOpened",
// "reasonClosed","openedAt","closedAt","holdTimeHours","notes",
// "effectiveEntryPrice","effectiveExitPrice","slippageCost","gapType","gapAmount",
// "dataQuality"
const COL_TRADE_ID      = 0;   // A
const COL_RESULT        = 10;  // K
const COL_REASON_CLOSED = 12;  // M
const COL_DATA_QUALITY  = 22;  // W

const REASON_SUFFIX =
  " | DATA_ERROR — TP overshoot 17.6%, market $273.65 vs TP1 $232.75, bad price feed";

function colLetter(idx) {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return `A${String.fromCharCode(65 + idx - 26)}`; // AA, AB, …
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const sid   = env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!email || !key || !sid) {
    console.error("❌  Missing credentials — check GOOGLE_SERVICE_ACCOUNT_EMAIL, " +
                  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_SHEETS_SPREADSHEET_ID in .env.local");
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // ── Read entire sheet ─────────────────────────────────────────────────────
  console.log(`Reading ${SHEET_NAME}…`);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `${SHEET_NAME}!A:Z`,
  });
  const rows = res.data.values ?? [];
  console.log(`  ${rows.length - 1} data rows found (excluding header).`);

  // ── Find the target row (rows[0] = header, data starts at rows[1]) ────────
  let foundIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][COL_TRADE_ID] ?? "") === TRADE_ID) {
      foundIdx = i;
      break;
    }
  }

  if (foundIdx < 0) {
    console.error(`❌  Trade "${TRADE_ID}" not found in ${SHEET_NAME}.`);
    process.exit(1);
  }

  const sheetRow          = foundIdx + 1; // 1-based sheet row number
  const row               = rows[foundIdx];
  const currentResult     = row[COL_RESULT]        ?? "";
  const currentReason     = row[COL_REASON_CLOSED] ?? "";
  const currentDQ         = row[COL_DATA_QUALITY]  ?? "";

  console.log(`\nFound trade at sheet row ${sheetRow}:`);
  console.log(`  ticker:       ${row[1] ?? "—"}`);
  console.log(`  result:       "${currentResult}"`);
  console.log(`  reasonClosed: "${currentReason}"`);
  console.log(`  dataQuality:  "${currentDQ}"`);

  // Guard: already fully patched
  if (currentResult === "DATA_ERROR" &&
      currentDQ === "DATA_ERROR" &&
      currentReason.includes("DATA_ERROR")) {
    console.log("\n✅  Trade already fully marked DATA_ERROR — nothing to do.");
    process.exit(0);
  }

  // Build new reasonClosed — append suffix only if not already present
  const newReason = currentReason.includes("DATA_ERROR")
    ? currentReason
    : currentReason + REASON_SUFFIX;

  const updates = [
    {
      range: `${SHEET_NAME}!${colLetter(COL_RESULT)}${sheetRow}`,
      value: "DATA_ERROR",
    },
    {
      range: `${SHEET_NAME}!${colLetter(COL_REASON_CLOSED)}${sheetRow}`,
      value: newReason,
    },
    {
      range: `${SHEET_NAME}!${colLetter(COL_DATA_QUALITY)}${sheetRow}`,
      value: "DATA_ERROR",
    },
  ];

  console.log("\nWill write:");
  for (const u of updates) {
    console.log(`  ${u.range}  →  "${u.value}"`);
  }

  // ── Apply the batch update ────────────────────────────────────────────────
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sid,
    requestBody: {
      valueInputOption: "RAW",
      data: updates.map(({ range, value }) => ({ range, values: [[value]] })),
    },
  });

  console.log(`\n✅  Done. Trade ${TRADE_ID} patched — excluded from analytics.`);
}

main().catch((err) => {
  console.error("Error:", err?.message ?? err);
  process.exit(1);
});
