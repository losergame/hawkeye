import { NextResponse } from "next/server";

import { checkRateLimit, getClientRateLimitKey } from "@/lib/rate-limit";

const MAX_MESSAGE_LENGTH = 700;

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(getClientRateLimitKey(request, "discord-alert"), 8, 60_000);
  if (rateLimit.limited) {
    return NextResponse.json(
      { ok: false, error: "Too many alert requests", retryAfterMs: rateLimit.retryAfterMs },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { symbol?: string; message?: string };
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const symbol = body.symbol?.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12) || "MARKET";
  const message = (body.message ?? `${symbol} alert triggered from Hawkeye.`).slice(0, MAX_MESSAGE_LENGTH);

  if (!webhookUrl) {
    return NextResponse.json({
      ok: true,
      queued: true,
      provider: "demo",
      message: "Set DISCORD_WEBHOOK_URL to deliver this alert."
    });
  }

  if (!/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\//.test(webhookUrl)) {
    return NextResponse.json({ ok: false, error: "Invalid Discord webhook URL" }, { status: 500 });
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `**${symbol}** ${message}`
    })
  });

  return NextResponse.json({ ok: response.ok, provider: "discord" }, { status: response.ok ? 200 : 502 });
}
