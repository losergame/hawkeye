import { NextResponse } from "next/server";
import {
  getSheetRows, appendRows, isSheetsConfigured,
  SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";

const H = HEADERS[SHEETS.RULE_PRESETS];

export interface RulePreset {
  id:                  string;
  presetName:          string;
  minScannerScore:     number;
  minConfidence:       number;
  setupTypesAllowed:   string[];  // empty = all
  excludedTickers:     string[];
  allowedMarketRegimes:string[];  // empty = all
  minRiskReward:       number;
  createdAt:           string;
  notes:               string;
}

function rowToPreset(row: string[]): RulePreset {
  const o = rowToObject(H, row);
  return {
    id:                   o.id,
    presetName:           o.presetName,
    minScannerScore:      Number(o.minScannerScore)  || 0,
    minConfidence:        Number(o.minConfidence)     || 0,
    setupTypesAllowed:    o.setupTypesAllowed ? o.setupTypesAllowed.split("|").filter(Boolean) : [],
    excludedTickers:      o.excludedTickers   ? o.excludedTickers.split("|").filter(Boolean)   : [],
    allowedMarketRegimes: o.allowedMarketRegimes ? o.allowedMarketRegimes.split("|").filter(Boolean) : [],
    minRiskReward:        Number(o.minRiskReward) || 0,
    createdAt:            o.createdAt,
    notes:                o.notes ?? "",
  };
}

function presetToRow(p: RulePreset): (string | number)[] {
  return H.map((col) => {
    switch (col) {
      case "id":                   return p.id;
      case "presetName":           return p.presetName;
      case "minScannerScore":      return p.minScannerScore;
      case "minConfidence":        return p.minConfidence;
      case "setupTypesAllowed":    return p.setupTypesAllowed.join("|");
      case "excludedTickers":      return p.excludedTickers.join("|");
      case "allowedMarketRegimes": return p.allowedMarketRegimes.join("|");
      case "minRiskReward":        return p.minRiskReward;
      case "createdAt":            return p.createdAt;
      case "notes":                return p.notes;
      default:                     return "";
    }
  });
}

// ── GET /api/presets ──────────────────────────────────────────────────────────

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ presets: [], source: "unconfigured" });
  }
  try {
    const rows    = await getSheetRows(SHEETS.RULE_PRESETS);
    const presets = rows.slice(1).filter((r) => r[0]).map(rowToPreset);
    return NextResponse.json({ presets, source: "sheets" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/presets ─────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Sheets not configured" }, { status: 503 });
  }
  try {
    const preset = (await req.json()) as Omit<RulePreset, "id" | "createdAt"> & { id?: string };
    const full: RulePreset = {
      ...preset,
      id:        preset.id ?? `rp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    await appendRows(SHEETS.RULE_PRESETS, [presetToRow(full)]);
    return NextResponse.json({ ok: true, preset: full });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
