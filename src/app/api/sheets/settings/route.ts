/**
 * GET  /api/sheets/settings?key=xxx  → { value: string | null }
 * POST /api/sheets/settings          body: { key, value } → { ok: true }
 */

import { NextResponse } from "next/server";
import { readSetting, writeSetting, isSheetsConfigured } from "@/lib/google-sheets";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  if (!isSheetsConfigured()) return NextResponse.json({ value: null });
  try {
    const value = await readSetting(key);
    return NextResponse.json({ value });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isSheetsConfigured()) return NextResponse.json({ ok: false, error: "Sheets not configured" }, { status: 503 });
  try {
    const { key, value } = (await req.json()) as { key: string; value: string };
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
    await writeSetting(key, value);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
