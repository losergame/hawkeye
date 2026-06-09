/**
 * One-time fix: column B14 (ticker) in PaperTrades contains the trade ID
 * "pt_1780854690187_u7h7p" instead of "HON". This was corrupted in the
 * original trade record — not caused by the DATA_ERROR retroactive patch.
 *
 * Run: node scripts/fix-hon-ticker.mjs
 */

import { readFileSync } from "fs";
import { google } from "googleapis";

function loadEnv(p) {
  const t = readFileSync(p, "utf8");
  const o = {};
  for (const l of t.split("\n")) {
    const e = l.trim();
    if (!e || e.startsWith("#")) continue;
    const i = e.indexOf("=");
    if (i < 0) continue;
    let v = e.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[e.slice(0, i).trim()] = v;
  }
  return o;
}

const env = loadEnv(".env.local");
const auth = new google.auth.JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const sid = env.GOOGLE_SHEETS_SPREADSHEET_ID;

// Read B14 first to confirm it still holds the wrong value
const check = await sheets.spreadsheets.values.get({
  spreadsheetId: sid,
  range: "PaperTrades!A14:B14",
});
const [tradeId, currentTicker] = check.data.values?.[0] ?? [];

console.log(`Row 14  tradeId: ${tradeId}`);
console.log(`Row 14  ticker:  ${currentTicker}`);

if (tradeId !== "pt_1780854690187_u7h7p") {
  console.error("❌  Unexpected tradeId in row 14 — aborting to avoid patching the wrong row.");
  process.exit(1);
}

if (currentTicker === "HON") {
  console.log("✅  Ticker already correct — nothing to do.");
  process.exit(0);
}

// Write "HON" into B14
await sheets.spreadsheets.values.update({
  spreadsheetId: sid,
  range: "PaperTrades!B14",
  valueInputOption: "RAW",
  requestBody: { values: [["HON"]] },
});

console.log('✅  B14 updated: "HON"');
