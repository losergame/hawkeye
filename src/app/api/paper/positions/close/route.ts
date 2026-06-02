/**
 * POST /api/paper/positions/close
 *
 * Atomically closes one open position:
 *   1. Loads account + positions from Sheets
 *   2. Finds the position to close
 *   3. Builds PaperTrade record
 *   4. Updates account (add cash, update stats)
 *   5. Removes position, writes trade, saves all to Sheets in one batch
 *
 * Replaces the old `closePosition` hack in usePaperTrader that called
 * /api/paper/run with a fake stop price AND then separately called DELETE
 * on the position, causing duplicate trade records.
 */

import { NextResponse } from "next/server";
import {
  isSheetsConfigured, SHEETS,
} from "@/lib/google-sheets";
import {
  buildClosedTrade, recalculateAccount, updatePositionPrice,
} from "@/lib/paper-trading";
import {
  loadPaperState, savePaperState, accountToRow,
} from "@/app/api/paper/run/route";
import { notifyManualClose } from "@/lib/discord-notify";

export async function POST(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets not configured" }, { status: 503 });
  }

  const { positionId, sellPrice, reason } = (await req.json()) as {
    positionId: string;
    sellPrice:  number;
    reason?:    string;
  };

  if (!positionId || !sellPrice || sellPrice <= 0) {
    return NextResponse.json({ error: "positionId and sellPrice required" }, { status: 400 });
  }

  // ── Load fresh state from Sheets ─────────────────────────────────────────

  let state: Awaited<ReturnType<typeof loadPaperState>>;
  try {
    state = await loadPaperState();
  } catch {
    return NextResponse.json({ error: "Failed to load from Google Sheets" }, { status: 503 });
  }

  const { account, openPositions, closedTrades } = state;
  const position = openPositions.find((p) => p.positionId === positionId);

  if (!position) {
    return NextResponse.json({ error: "Position not found" }, { status: 404 });
  }

  // ── Build closed trade ────────────────────────────────────────────────────

  const updatedPosition = updatePositionPrice(position, sellPrice);
  const trade = buildClosedTrade(
    updatedPosition,
    sellPrice,
    reason ?? "Manual close",
  );

  // ── Update account ────────────────────────────────────────────────────────

  let updatedAccount = { ...account };
  updatedAccount.cashBalance += sellPrice * position.shares;
  updatedAccount.totalTrades++;
  if (trade.result === "win")  updatedAccount.wins++;
  if (trade.result === "loss") updatedAccount.losses++;

  const remainingPositions = openPositions.filter((p) => p.positionId !== positionId);
  updatedAccount = recalculateAccount(updatedAccount, remainingPositions, [...closedTrades, trade]);

  // ── Save everything to Sheets ─────────────────────────────────────────────

  try {
    await savePaperState(updatedAccount, remainingPositions, [trade]);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save to Google Sheets", detail: String(err) },
      { status: 500 },
    );
  }

  // ── Discord notification ──────────────────────────────────────────────────

  void notifyManualClose(trade, updatedAccount.totalAccountValue);

  return NextResponse.json({
    ok:             true,
    trade,
    account:        updatedAccount,
    openPositions:  remainingPositions,
  });
}

// Silence the unused import warning — accountToRow is used in the shared savePaperState
void (accountToRow);
void (SHEETS);
