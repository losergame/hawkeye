/**
 * Google Sheets Conditional Formatting
 *
 * Sets up persistent color rules on paper trading sheets so that
 * WIN/LOSS, P/L, and return columns are color-coded directly inside
 * the spreadsheet — independent of any frontend CSS.
 *
 * Designed to run once (or on demand). Rules persist in the sheet and
 * auto-apply to all existing + future rows, so there is no per-write API cost.
 *
 * Color palette (matches user spec):
 *   Green  #16a34a (text) + #dcfce7 (background for WIN)
 *   Red    #dc2626 (text) + #fee2e2 (background for LOSS)
 *   Neutral #9ca3af (used for zero / breakeven cells)
 */

import type { sheets_v4 } from "googleapis";
import { getSheetsClient, getSpreadsheetId, SHEETS, HEADERS } from "@/lib/google-sheets";

// ── Colour definitions (Google Sheets uses 0–1 floats) ────────────────────────

const C = {
  GREEN_TEXT:  { red: 0.086, green: 0.639, blue: 0.290 }, // #16a34a
  RED_TEXT:    { red: 0.863, green: 0.149, blue: 0.149 }, // #dc2626
  NEUTRAL:     { red: 0.612, green: 0.639, blue: 0.686 }, // #9ca3af
  GREEN_BG:    { red: 0.863, green: 0.988, blue: 0.906 }, // #dcfce7
  RED_BG:      { red: 0.996, green: 0.890, blue: 0.890 }, // #fee2e2
  WHITE:       { red: 1.000, green: 1.000, blue: 1.000 },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get 0-based column index for a named header in a sheet. */
function col(sheetName: string, colName: string): number {
  return (HEADERS[sheetName] ?? []).indexOf(colName);
}

/** Build a GridRange covering one column (rows 2+ to skip header). */
function colRange(sheetId: number, colIdx: number): sheets_v4.Schema$GridRange {
  return {
    sheetId,
    startRowIndex:    1,        // 0-based, row 2 in UI
    endRowIndex:      10_000,   // covers all realistic data
    startColumnIndex: colIdx,
    endColumnIndex:   colIdx + 1,
  };
}

/** Build a GridRange covering all columns in every data row (for full-row rules). */
function fullRowRange(sheetId: number): sheets_v4.Schema$GridRange {
  return {
    sheetId,
    startRowIndex:    1,
    endRowIndex:      10_000,
    startColumnIndex: 0,
    endColumnIndex:   30,
  };
}

/** Convert 0-based column index to A1 letter (A, B, … Z, AA…). */
function colLetter(idx: number): string {
  let s = "";
  let n = idx + 1;
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Full-row conditional rule using a custom formula referencing a specific column. */
function rowByTextEq(
  sheetId: number,
  colIdx: number,
  value: string,
  bgColor: typeof C[keyof typeof C],
  textColor: typeof C[keyof typeof C],
): sheets_v4.Schema$ConditionalFormatRule {
  return {
    ranges: [fullRowRange(sheetId)],
    booleanRule: {
      condition: {
        type: "CUSTOM_FORMULA",
        values: [{ userEnteredValue: `=$${colLetter(colIdx)}2="${value}"` }],
      },
      format: {
        backgroundColor: bgColor,
        textFormat: { foregroundColor: textColor, bold: false },
      },
    },
  };
}

/** Conditional rule: number > 0 → green text. */
function numGtZeroGreen(sheetId: number, colIdx: number): sheets_v4.Schema$ConditionalFormatRule {
  return {
    ranges: [colRange(sheetId, colIdx)],
    booleanRule: {
      condition: { type: "NUMBER_GREATER", values: [{ userEnteredValue: "0" }] },
      format: { textFormat: { foregroundColor: C.GREEN_TEXT } },
    },
  };
}

/** Conditional rule: number < 0 → red text. */
function numLtZeroRed(sheetId: number, colIdx: number): sheets_v4.Schema$ConditionalFormatRule {
  return {
    ranges: [colRange(sheetId, colIdx)],
    booleanRule: {
      condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] },
      format: { textFormat: { foregroundColor: C.RED_TEXT } },
    },
  };
}

/** Conditional rule: number == 0 → neutral gray text. */
function numEqZeroNeutral(sheetId: number, colIdx: number): sheets_v4.Schema$ConditionalFormatRule {
  return {
    ranges: [colRange(sheetId, colIdx)],
    booleanRule: {
      condition: { type: "NUMBER_EQ", values: [{ userEnteredValue: "0" }] },
      format: { textFormat: { foregroundColor: C.NEUTRAL } },
    },
  };
}

/** Conditional rule: text exactly equals value → format. */
function textEq(
  sheetId: number,
  colIdx: number,
  value: string,
  bgColor: typeof C[keyof typeof C],
  textColor: typeof C[keyof typeof C],
): sheets_v4.Schema$ConditionalFormatRule {
  return {
    ranges: [colRange(sheetId, colIdx)],
    booleanRule: {
      condition: { type: "TEXT_EQ", values: [{ userEnteredValue: value }] },
      format: {
        backgroundColor: bgColor,
        textFormat: { foregroundColor: textColor, bold: true },
      },
    },
  };
}

/** Number > threshold → green. */
function numGtGreen(
  sheetId: number, colIdx: number, threshold: number,
): sheets_v4.Schema$ConditionalFormatRule {
  return {
    ranges: [colRange(sheetId, colIdx)],
    booleanRule: {
      condition: { type: "NUMBER_GREATER", values: [{ userEnteredValue: String(threshold) }] },
      format: { textFormat: { foregroundColor: C.GREEN_TEXT } },
    },
  };
}

/** Number < threshold → red. */
function numLtRed(
  sheetId: number, colIdx: number, threshold: number,
): sheets_v4.Schema$ConditionalFormatRule {
  return {
    ranges: [colRange(sheetId, colIdx)],
    booleanRule: {
      condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: String(threshold) }] },
      format: { textFormat: { foregroundColor: C.RED_TEXT } },
    },
  };
}

// ── Rule builders per sheet ───────────────────────────────────────────────────

function rulesForPaperTrades(sheetId: number): sheets_v4.Schema$ConditionalFormatRule[] {
  const sn = SHEETS.PAPER_TRADES;
  const pnl    = col(sn, "profitLoss");
  const pnlPct = col(sn, "profitLossPercent");
  const result = col(sn, "result");

  const rules: sheets_v4.Schema$ConditionalFormatRule[] = [];

  // Full-row highlight: win → soft green row, loss → soft red row
  if (result >= 0) {
    rules.push(rowByTextEq(sheetId, result, "win",  C.GREEN_BG, C.GREEN_TEXT));
    rules.push(rowByTextEq(sheetId, result, "loss", C.RED_BG,   C.RED_TEXT));
  }
  // P/L $ column — bold green/red text on top of row colour
  if (pnl >= 0) {
    rules.push(numGtZeroGreen(sheetId, pnl));
    rules.push(numLtZeroRed(sheetId, pnl));
    rules.push(numEqZeroNeutral(sheetId, pnl));
  }
  // Return % column
  if (pnlPct >= 0) {
    rules.push(numGtZeroGreen(sheetId, pnlPct));
    rules.push(numLtZeroRed(sheetId, pnlPct));
    rules.push(numEqZeroNeutral(sheetId, pnlPct));
  }
  return rules;
}

function rulesForPaperPositions(sheetId: number): sheets_v4.Schema$ConditionalFormatRule[] {
  const sn  = SHEETS.PAPER_POSITIONS;
  const upnl    = col(sn, "unrealizedPnL");
  const upnlPct = col(sn, "unrealizedPnLPercent");

  const rules: sheets_v4.Schema$ConditionalFormatRule[] = [];
  if (upnl >= 0) {
    rules.push(numGtZeroGreen(sheetId, upnl));
    rules.push(numLtZeroRed(sheetId, upnl));
    rules.push(numEqZeroNeutral(sheetId, upnl));
  }
  if (upnlPct >= 0) {
    rules.push(numGtZeroGreen(sheetId, upnlPct));
    rules.push(numLtZeroRed(sheetId, upnlPct));
    rules.push(numEqZeroNeutral(sheetId, upnlPct));
  }
  return rules;
}

function rulesForPaperAccount(sheetId: number, startingBalance = 1000): sheets_v4.Schema$ConditionalFormatRule[] {
  const sn  = SHEETS.PAPER_ACCOUNT;
  const pnl    = col(sn, "totalPnL");
  const pnlPct = col(sn, "totalPnLPercent");
  const total  = col(sn, "totalAccountValue");
  const winRate= col(sn, "winRate");

  const rules: sheets_v4.Schema$ConditionalFormatRule[] = [];
  // Total P/L
  if (pnl >= 0) {
    rules.push(numGtZeroGreen(sheetId, pnl));
    rules.push(numLtZeroRed(sheetId, pnl));
  }
  if (pnlPct >= 0) {
    rules.push(numGtZeroGreen(sheetId, pnlPct));
    rules.push(numLtZeroRed(sheetId, pnlPct));
  }
  // Account value vs starting balance
  if (total >= 0) {
    rules.push(numGtGreen(sheetId, total, startingBalance));
    rules.push(numLtRed(sheetId, total, startingBalance));
  }
  // Win rate: > 0.5 green, < 0.5 red
  if (winRate >= 0) {
    rules.push(numGtGreen(sheetId, winRate, 0.5));
    rules.push(numLtRed(sheetId, winRate, 0.5));
  }
  return rules;
}

function rulesForPaperEquity(sheetId: number): sheets_v4.Schema$ConditionalFormatRule[] {
  const sn  = SHEETS.PAPER_EQUITY;
  const dpnl    = col(sn, "dailyPnL");
  const tpnlPct = col(sn, "totalPnLPercent");

  const rules: sheets_v4.Schema$ConditionalFormatRule[] = [];
  if (dpnl >= 0) {
    rules.push(numGtZeroGreen(sheetId, dpnl));
    rules.push(numLtZeroRed(sheetId, dpnl));
    rules.push(numEqZeroNeutral(sheetId, dpnl));
  }
  if (tpnlPct >= 0) {
    rules.push(numGtZeroGreen(sheetId, tpnlPct));
    rules.push(numLtZeroRed(sheetId, tpnlPct));
  }
  return rules;
}

// ── Main export ───────────────────────────────────────────────────────────────

const TARGET_SHEETS = [
  SHEETS.PAPER_TRADES,
  SHEETS.PAPER_POSITIONS,
  SHEETS.PAPER_ACCOUNT,
  SHEETS.PAPER_EQUITY,
] as const;

export interface FormatResult {
  ok:          boolean;
  rulesApplied:number;
  sheetsFormatted: string[];
  error?:      string;
}

/**
 * Apply (or refresh) all conditional format rules on paper trading sheets.
 *
 * Steps:
 *  1. Read spreadsheet metadata to get numeric sheet IDs and existing rule counts.
 *  2. Delete all pre-existing conditional rules on the target sheets (avoids duplicates).
 *  3. Add the new rule set in a single batchUpdate.
 *
 * Safe to call multiple times — idempotent.
 */
export async function applyPaperTradingFormatting(
  startingBalance = 1000,
): Promise<FormatResult> {
  const sheets = getSheetsClient();
  const sid    = getSpreadsheetId();
  if (!sheets || !sid) {
    return { ok: false, rulesApplied: 0, sheetsFormatted: [], error: "Sheets not configured" };
  }

  try {
    // ── 1. Get metadata ───────────────────────────────────────────────────────
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sid });
    const sheetList = meta.data.sheets ?? [];

    // Map: title → { sheetId, conditionalRuleCount }
    const sheetInfo = new Map<string, { sheetId: number; ruleCount: number }>();
    for (const s of sheetList) {
      const title = s.properties?.title ?? "";
      if ((TARGET_SHEETS as readonly string[]).includes(title)) {
        sheetInfo.set(title, {
          sheetId:   s.properties?.sheetId ?? 0,
          ruleCount: s.conditionalFormats?.length ?? 0,
        });
      }
    }

    if (sheetInfo.size === 0) {
      return { ok: false, rulesApplied: 0, sheetsFormatted: [], error: "No target sheets found — run /api/sheets/setup first" };
    }

    // ── 2. Build delete requests for existing rules ───────────────────────────
    const deleteRequests: sheets_v4.Schema$Request[] = [];
    for (const [, info] of sheetInfo) {
      // Delete from highest index downward so indexes remain stable
      for (let i = info.ruleCount - 1; i >= 0; i--) {
        deleteRequests.push({
          deleteConditionalFormatRule: { sheetId: info.sheetId, index: i },
        });
      }
    }

    // ── 3. Build add requests for new rules ───────────────────────────────────
    const allRules: sheets_v4.Schema$ConditionalFormatRule[] = [];
    const formatted: string[] = [];

    for (const name of TARGET_SHEETS) {
      const info = sheetInfo.get(name);
      if (!info) continue;
      formatted.push(name);

      let rules: sheets_v4.Schema$ConditionalFormatRule[] = [];
      if (name === SHEETS.PAPER_TRADES)    rules = rulesForPaperTrades(info.sheetId);
      if (name === SHEETS.PAPER_POSITIONS) rules = rulesForPaperPositions(info.sheetId);
      if (name === SHEETS.PAPER_ACCOUNT)   rules = rulesForPaperAccount(info.sheetId, startingBalance);
      if (name === SHEETS.PAPER_EQUITY)    rules = rulesForPaperEquity(info.sheetId);
      allRules.push(...rules);
    }

    const addRequests: sheets_v4.Schema$Request[] = allRules.map((rule) => ({
      addConditionalFormatRule: { rule, index: 0 },
    }));

    // ── 4. Execute in one batchUpdate ─────────────────────────────────────────
    const allRequests = [...deleteRequests, ...addRequests];
    if (allRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sid,
        requestBody: { requests: allRequests },
      });
    }

    return { ok: true, rulesApplied: allRules.length, sheetsFormatted: formatted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, rulesApplied: 0, sheetsFormatted: [], error: msg };
  }
}
