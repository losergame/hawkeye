/**
 * Discord notification helper — server-side only.
 *
 * Sends formatted paper trading alerts via the existing DISCORD_WEBHOOK_URL.
 * Old generic BUY scanner alerts have been removed from alert-panel.tsx.
 *
 * discordPaperTradingOnly = true (design intent):
 *   Only paper trader events trigger Discord. Scanner signals do not.
 */

import type { PaperPosition, PaperTrade } from "@/lib/paper-trading";

const WEBHOOK_URL = () => process.env.DISCORD_WEBHOOK_URL ?? null;

async function post(payload: object): Promise<void> {
  const url = WEBHOOK_URL();
  if (!url) return; // unconfigured — silent
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch { /* never throw from a notification helper */ }
}

const money = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
const spct = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

// ── Paper BUY ─────────────────────────────────────────────────────────────────

export async function notifyPaperBuy(
  position: PaperPosition,
  cashRemaining: number,
  confidence: number,
  reason: string,
): Promise<void> {
  const posSize = position.entryPrice * position.shares;
  await post({
    embeds: [{
      color: 0x00d084, // green
      title: "🚨 PAPER BUY ALERT",
      fields: [
        { name: "Ticker",         value: `**${position.ticker}**`,              inline: true },
        { name: "Setup",          value: position.setupType,                    inline: true },
        { name: "Entry",          value: money(position.entryPrice),            inline: true },
        { name: "Shares",         value: String(position.shares),               inline: true },
        { name: "Position Size",  value: money(posSize),                        inline: true },
        { name: "Stop Loss",      value: money(position.stopLoss),              inline: true },
        { name: "Take Profit 1",  value: money(position.takeProfit1),           inline: true },
        { name: "Confidence",     value: `${confidence}%`,                      inline: true },
        { name: "Cash Remaining", value: money(cashRemaining),                  inline: true },
        { name: "Reason",         value: reason.slice(0, 200),                  inline: false },
      ],
      footer: { text: "Hawkeye Paper Trader · Not financial advice" },
      timestamp: new Date().toISOString(),
    }],
  });
}

// ── Paper SELL / Target Hit ───────────────────────────────────────────────────

export async function notifyPaperSell(
  trade: PaperTrade,
  accountValue: number,
): Promise<void> {
  const isWin   = trade.result === "win";
  const color   = isWin ? 0x00d084 : 0xff3b5c;
  const emoji   = isWin ? "✅" : "❌";
  const heading = isWin ? `${emoji} PAPER SELL — TARGET HIT` : `${emoji} PAPER SELL — STOPPED OUT`;

  await post({
    embeds: [{
      color,
      title: heading,
      fields: [
        { name: "Ticker",       value: `**${trade.ticker}**`,        inline: true },
        { name: "Setup",        value: trade.setupType,               inline: true },
        { name: "Result",       value: trade.result.toUpperCase(),    inline: true },
        { name: "Entry",        value: money(trade.buyPrice),         inline: true },
        { name: "Exit",         value: money(trade.sellPrice),        inline: true },
        { name: "Shares",       value: String(trade.shares),          inline: true },
        { name: "P / L",        value: `${money(trade.profitLoss)} (${spct(trade.profitLossPercent)})`, inline: true },
        { name: "Reason Closed",value: trade.reasonClosed,            inline: false },
        { name: "Account Value",value: money(accountValue),           inline: true },
      ],
      footer: { text: "Hawkeye Paper Trader · Not financial advice" },
      timestamp: new Date().toISOString(),
    }],
  });
}

// ── Stop Loss Hit ─────────────────────────────────────────────────────────────

export async function notifyStopLossHit(
  trade: PaperTrade,
  accountValue: number,
): Promise<void> {
  await post({
    embeds: [{
      color: 0xff3b5c, // red
      title: "🛑 PAPER STOP LOSS HIT",
      fields: [
        { name: "Ticker",  value: `**${trade.ticker}**`,         inline: true },
        { name: "Entry",   value: money(trade.buyPrice),          inline: true },
        { name: "Stop",    value: money(trade.sellPrice),         inline: true },
        { name: "Shares",  value: String(trade.shares),           inline: true },
        { name: "Loss",    value: money(trade.profitLoss),        inline: true },
        { name: "Return",  value: spct(trade.profitLossPercent),  inline: true },
        { name: "Account", value: money(accountValue),            inline: true },
      ],
      footer: { text: "Hawkeye Paper Trader · Not financial advice" },
      timestamp: new Date().toISOString(),
    }],
  });
}

// ── Manual Close ──────────────────────────────────────────────────────────────

export async function notifyManualClose(
  trade: PaperTrade,
  accountValue: number,
): Promise<void> {
  const isWin = trade.result === "win";
  await post({
    embeds: [{
      color: 0xf59e0b, // amber for manual
      title: "🤚 PAPER MANUAL CLOSE",
      fields: [
        { name: "Ticker",  value: `**${trade.ticker}**`,        inline: true },
        { name: "Entry",   value: money(trade.buyPrice),         inline: true },
        { name: "Exit",    value: money(trade.sellPrice),        inline: true },
        { name: "P / L",   value: `${money(trade.profitLoss)} (${spct(trade.profitLossPercent)})`, inline: true },
        { name: "Result",  value: isWin ? "Win" : "Loss",        inline: true },
        { name: "Account", value: money(accountValue),           inline: true },
      ],
      footer: { text: "Hawkeye Paper Trader · Not financial advice" },
      timestamp: new Date().toISOString(),
    }],
  });
}

// ── Rule preset change ────────────────────────────────────────────────────────

export async function notifyPresetDisabled(presetName: string): Promise<void> {
  await post({
    content: `⚙️ **Hawkeye rule preset disabled:** ${presetName}\nScanner and Paper Trader returned to default thresholds.`,
  });
}

export async function notifyRulePresetChange(
  presetName: string,
  scope: string,
): Promise<void> {
  const scopeLabel = scope === "scanner+paper"
    ? "Scanner + Paper Trader"
    : "Scanner only";
  await post({
    content: `⚙️ **Hawkeye rule preset updated:** ${presetName}\nScope: ${scopeLabel} · Applied at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET`,
  });
}

// ── Connection test ───────────────────────────────────────────────────────────

export async function notifyConnected(): Promise<boolean> {
  const url = WEBHOOK_URL();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "✅ **Hawkeye paper trading alerts connected.** Scanner buy alerts disabled — only paper trader events will appear here.",
      }),
    });
    return res.ok;
  } catch { return false; }
}
