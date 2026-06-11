/**
 * One-time migration: push updated conditional format rules to Google Sheets.
 * Adds orange (#FFE0B2) full-row highlight for result = "DATA_ERROR" on PaperTrades.
 * Also refreshes win/loss rules so nothing is lost.
 *
 * Run: node scripts/apply-data-error-formatting.mjs
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

// ── Colours (Google Sheets 0–1 floats) ────────────────────────────────────────

const C = {
  GREEN_TEXT:  { red: 0.086, green: 0.639, blue: 0.290 }, // #16a34a
  RED_TEXT:    { red: 0.863, green: 0.149, blue: 0.149 }, // #dc2626
  NEUTRAL:     { red: 0.612, green: 0.639, blue: 0.686 }, // #9ca3af
  GREEN_BG:    { red: 0.863, green: 0.988, blue: 0.906 }, // #dcfce7
  RED_BG:      { red: 0.996, green: 0.890, blue: 0.890 }, // #fee2e2
  ORANGE_BG:   { red: 1.000, green: 0.878, blue: 0.698 }, // #FFE0B2
  ORANGE_TEXT: { red: 0.749, green: 0.212, blue: 0.047 }, // #BF360C
};

// ── Column helpers ────────────────────────────────────────────────────────────

// PaperTrades header column indices (must match HEADERS[SHEETS.PAPER_TRADES])
const PAPER_TRADES_HEADERS = [
  "tradeId","ticker","companyName","setupType",
  "buyPrice","sellPrice","shares","positionSize",
  "profitLoss","profitLossPercent",
  "result","reasonOpened","reasonClosed","openedAt","closedAt",
  "holdTimeHours","notes",
  "effectiveEntryPrice","effectiveExitPrice","slippageCost","gapType","gapAmount",
  "dataQuality",
];

function colIdx(name) { return PAPER_TRADES_HEADERS.indexOf(name); }

function colLetter(idx) {
  let s = "";
  let n = idx + 1;
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function fullRowRange(sheetId) {
  return { sheetId, startRowIndex: 1, endRowIndex: 10_000, startColumnIndex: 0, endColumnIndex: 30 };
}

function colRange(sheetId, idx) {
  return { sheetId, startRowIndex: 1, endRowIndex: 10_000, startColumnIndex: idx, endColumnIndex: idx + 1 };
}

function rowByTextEq(sheetId, idx, value, bgColor, textColor) {
  return {
    ranges: [fullRowRange(sheetId)],
    booleanRule: {
      condition: {
        type: "CUSTOM_FORMULA",
        values: [{ userEnteredValue: `=$${colLetter(idx)}2="${value}"` }],
      },
      format: {
        backgroundColor: bgColor,
        textFormat: { foregroundColor: textColor, bold: false },
      },
    },
  };
}

function numRule(sheetId, idx, type, threshold, color) {
  return {
    ranges: [colRange(sheetId, idx)],
    booleanRule: {
      condition: { type, values: [{ userEnteredValue: String(threshold) }] },
      format: { textFormat: { foregroundColor: color } },
    },
  };
}

// ── Build rules for PaperTrades ───────────────────────────────────────────────

function buildRules(sheetId) {
  const result  = colIdx("result");
  const pnl     = colIdx("profitLoss");
  const pnlPct  = colIdx("profitLossPercent");
  const rules   = [];

  // Full-row: DATA_ERROR → orange (highest priority — first in list)
  rules.push(rowByTextEq(sheetId, result, "DATA_ERROR", C.ORANGE_BG, C.ORANGE_TEXT));
  // Full-row: win → green, loss → red
  rules.push(rowByTextEq(sheetId, result, "win",        C.GREEN_BG,  C.GREEN_TEXT));
  rules.push(rowByTextEq(sheetId, result, "loss",       C.RED_BG,    C.RED_TEXT));

  // P/L $ text colour
  rules.push(numRule(sheetId, pnl,    "NUMBER_GREATER", 0, C.GREEN_TEXT));
  rules.push(numRule(sheetId, pnl,    "NUMBER_LESS",    0, C.RED_TEXT));
  rules.push(numRule(sheetId, pnl,    "NUMBER_EQ",      0, C.NEUTRAL));
  // Return % text colour
  rules.push(numRule(sheetId, pnlPct, "NUMBER_GREATER", 0, C.GREEN_TEXT));
  rules.push(numRule(sheetId, pnlPct, "NUMBER_LESS",    0, C.RED_TEXT));
  rules.push(numRule(sheetId, pnlPct, "NUMBER_EQ",      0, C.NEUTRAL));

  return rules;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SHEET_NAME = "PaperTrades";

// 1. Get sheet metadata
console.log("Reading spreadsheet metadata…");
const meta = await sheets.spreadsheets.get({ spreadsheetId: sid });
const sheetEntry = meta.data.sheets?.find(
  (s) => s.properties?.title === SHEET_NAME,
);
if (!sheetEntry) {
  console.error(`❌  Sheet "${SHEET_NAME}" not found.`);
  process.exit(1);
}
const sheetId     = sheetEntry.properties.sheetId;
const existingRuleCount = sheetEntry.conditionalFormats?.length ?? 0;
console.log(`  ${SHEET_NAME}  id=${sheetId}  existing rules=${existingRuleCount}`);

// 2. Delete existing rules (highest index first to avoid index shift)
const deleteRequests = [];
for (let i = existingRuleCount - 1; i >= 0; i--) {
  deleteRequests.push({ deleteConditionalFormatRule: { sheetId, index: i } });
}

// 3. Build new rules
const rules = buildRules(sheetId);
const addRequests = rules.map((rule) => ({
  addConditionalFormatRule: { rule, index: 0 },
}));

console.log(`  Deleting ${deleteRequests.length} old rules, adding ${addRequests.length} new rules…`);

// 4. Execute in one batchUpdate
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: sid,
  requestBody: { requests: [...deleteRequests, ...addRequests] },
});

console.log(`✅  Done. ${rules.length} rules applied to ${SHEET_NAME}.`);
console.log("    DATA_ERROR rows (VZ, HON, ON, PYPL) will now show orange (#FFE0B2).");
console.log("    Future DATA_ERROR trades will be coloured automatically.");
