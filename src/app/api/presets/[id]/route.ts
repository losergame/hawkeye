import { NextResponse } from "next/server";
import {
  getSheetRows, deleteRow, findRowIndexById, isSheetsConfigured,
  writeSetting, SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import { notifyRulePresetChange } from "@/lib/discord-notify";
import type { RulePreset } from "@/app/api/presets/route";

const H = HEADERS[SHEETS.RULE_PRESETS];

// ── DELETE /api/presets/[id] ──────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSheetsConfigured()) return NextResponse.json({ ok: false });
  const { id } = await params;
  try {
    const rowIndex = await findRowIndexById(SHEETS.RULE_PRESETS, id);
    if (!rowIndex) return NextResponse.json({ ok: true, found: false });
    await deleteRow(SHEETS.RULE_PRESETS, rowIndex);
    return NextResponse.json({ ok: true, deleted: id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST /api/presets/[id]/apply ──────────────────────────────────────────────
// scope: "scanner" | "scanner+paper"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSheetsConfigured()) return NextResponse.json({ error: "Sheets not configured" }, { status: 503 });

  const { id }  = await params;
  const { scope = "scanner+paper" } = (await req.json().catch(() => ({}))) as { scope?: string };

  try {
    // Load the preset
    const rows    = await getSheetRows(SHEETS.RULE_PRESETS);
    const row     = rows.slice(1).find((r) => r[0] === id);
    if (!row) return NextResponse.json({ error: "Preset not found" }, { status: 404 });

    const o = rowToObject(H, row);
    const preset: RulePreset = {
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

    // Write to AppSettings (used by scanner + paper trader on next run)
    await Promise.all([
      writeSetting("activePresetId",        preset.id),
      writeSetting("activePresetName",      preset.presetName),
      writeSetting("activePresetScope",     scope),
      writeSetting("activePresetAppliedAt", new Date().toISOString()),
      writeSetting("minScannerScore",       String(preset.minScannerScore)),
      writeSetting("minConfidence",         String(preset.minConfidence)),
      writeSetting("setupTypesAllowed",     preset.setupTypesAllowed.join("|")),
      writeSetting("excludedTickers",       preset.excludedTickers.join("|")),
      writeSetting("allowedMarketRegimes",  preset.allowedMarketRegimes.join("|")),
      writeSetting("minRiskReward",         String(preset.minRiskReward)),
    ]);

    // Discord notification
    void notifyRulePresetChange(preset.presetName, scope);

    return NextResponse.json({ ok: true, preset, scope });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
