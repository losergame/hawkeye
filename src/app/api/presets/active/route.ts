/**
 * GET  /api/presets/active  — read the currently applied preset from AppSettings
 * DELETE /api/presets/active — clear it, returning scanner/paper trader to defaults
 */

import { NextResponse } from "next/server";
import { readSetting, writeSetting, isSheetsConfigured } from "@/lib/google-sheets";
import { notifyPresetDisabled } from "@/lib/discord-notify";

export interface ActivePresetInfo {
  active:        boolean;
  presetId:      string | null;
  presetName:    string | null;
  scope:         string | null;     // "scanner" | "scanner+paper"
  appliedAt:     string | null;
  minScannerScore:     number;
  minConfidence:       number;
  minRiskReward:       number;
  setupTypesAllowed:   string[];    // empty = all
  excludedTickers:     string[];
  allowedMarketRegimes:string[];    // empty = all
}

const PRESET_KEYS = [
  "activePresetId", "activePresetName", "activePresetScope", "activePresetAppliedAt",
  "minScannerScore", "minConfidence", "minRiskReward",
  "setupTypesAllowed", "excludedTickers", "allowedMarketRegimes",
] as const;

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({
      active: false, presetId: null, presetName: null, scope: null, appliedAt: null,
      minScannerScore: 0, minConfidence: 0, minRiskReward: 0,
      setupTypesAllowed: [], excludedTickers: [], allowedMarketRegimes: [],
      source: "unconfigured",
    } satisfies ActivePresetInfo & { source: string });
  }

  try {
    const [id, name, scope, appliedAt, score, conf, rr, setups, excluded, regimes] =
      await Promise.all(PRESET_KEYS.map((k) => readSetting(k)));

    const info: ActivePresetInfo = {
      active:              !!id,
      presetId:            id,
      presetName:          name,
      scope:               scope,
      appliedAt:           appliedAt,
      minScannerScore:     score ? Number(score)  : 0,
      minConfidence:       conf  ? Number(conf)   : 0,
      minRiskReward:       rr    ? Number(rr)     : 0,
      setupTypesAllowed:   setups   ? setups.split("|").filter(Boolean)   : [],
      excludedTickers:     excluded ? excluded.split("|").filter(Boolean) : [],
      allowedMarketRegimes:regimes  ? regimes.split("|").filter(Boolean)  : [],
    };
    return NextResponse.json({ ...info, source: "sheets" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── DELETE — disable active preset ────────────────────────────────────────────

export async function DELETE() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Sheets not configured" }, { status: 503 });
  }
  try {
    const name = await readSetting("activePresetName");

    // Clear all preset-related settings
    await Promise.all(
      PRESET_KEYS.map((k) => writeSetting(k, "")),
    );

    void notifyPresetDisabled(name ?? "unknown");

    return NextResponse.json({ ok: true, disabled: name });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
