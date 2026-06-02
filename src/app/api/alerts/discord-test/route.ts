import { NextResponse } from "next/server";
import { notifyConnected } from "@/lib/discord-notify";

/**
 * POST /api/alerts/discord-test
 * Sends the one-time connection confirmation message to Discord.
 * Run once after configuring the webhook to verify the integration.
 */
export async function POST() {
  const ok = await notifyConnected();
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "DISCORD_WEBHOOK_URL not set or webhook failed" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, message: "Connection test sent to Discord." });
}
