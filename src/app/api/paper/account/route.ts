import { NextResponse } from "next/server";
import {
  getSheetRows, appendRows, updateRow, findRowIndexById,
  isSheetsConfigured, SHEETS, HEADERS, rowToObject,
} from "@/lib/google-sheets";
import {
  makeDefaultAccount, DEFAULT_ACCOUNT_ID, rebuildAccountFromLedger,
  type PaperAccount, type PaperPosition, type PaperTrade,
} from "@/lib/paper-trading";

const H = HEADERS[SHEETS.PAPER_ACCOUNT];
const HP = HEADERS[SHEETS.PAPER_POSITIONS];
const HT = HEADERS[SHEETS.PAPER_TRADES];

function rowToAccount(row: string[]): PaperAccount {
  const o = rowToObject(H, row);
  return {
    accountId:         o.accountId,
    startingBalance:   Number(o.startingBalance),
    cashBalance:       Number(o.cashBalance),
    equityValue:       Number(o.equityValue),
    totalAccountValue: Number(o.totalAccountValue),
    totalPnL:          Number(o.totalPnL),
    totalPnLPercent:   Number(o.totalPnLPercent),
    totalTrades:       Number(o.totalTrades),
    wins:              Number(o.wins),
    losses:            Number(o.losses),
    winRate:           Number(o.winRate),
    updatedAt:         o.updatedAt,
  };
}

function rowToPosition(row: string[]): PaperPosition {
  const o = rowToObject(HP, row);
  return {
    positionId:           o.positionId,
    ticker:               o.ticker,
    companyName:          o.companyName,
    setupType:            o.setupType,
    entryPrice:           Number(o.entryPrice),
    currentPrice:         Number(o.currentPrice),
    shares:               Number(o.shares),
    positionValue:        Number(o.positionValue),
    stopLoss:             Number(o.stopLoss),
    takeProfit1:          Number(o.takeProfit1),
    takeProfit2:          Number(o.takeProfit2),
    unrealizedPnL:        Number(o.unrealizedPnL),
    unrealizedPnLPercent: Number(o.unrealizedPnLPercent),
    status:               "open",
    openedAt:             o.openedAt,
    updatedAt:            o.updatedAt,
  };
}

function rowToTrade(row: string[]): PaperTrade {
  const o = rowToObject(HT, row);
  return {
    tradeId:            o.tradeId,
    ticker:             o.ticker,
    companyName:        o.companyName,
    setupType:          o.setupType,
    buyPrice:           Number(o.buyPrice),
    sellPrice:          Number(o.sellPrice),
    effectiveEntryPrice:Number(o.effectiveEntryPrice) || Number(o.buyPrice),
    effectiveExitPrice: Number(o.effectiveExitPrice)  || Number(o.sellPrice),
    shares:             Number(o.shares),
    positionSize:       Number(o.positionSize),
    profitLoss:         Number(o.profitLoss),
    profitLossPercent:  Number(o.profitLossPercent),
    slippageCost:       Number(o.slippageCost) || 0,
    gapType:            (o.gapType as PaperTrade["gapType"]) || "none",
    gapAmount:          Number(o.gapAmount) || 0,
    result:             o.result as PaperTrade["result"],
    reasonOpened:       o.reasonOpened,
    reasonClosed:       o.reasonClosed,
    openedAt:           o.openedAt,
    closedAt:           o.closedAt,
    holdTimeHours:      o.holdTimeHours ? Number(o.holdTimeHours) : undefined,
  };
}

function accountToRow(a: PaperAccount): (string | number)[] {
  return H.map((col) => {
    switch (col) {
      case "accountId":         return a.accountId;
      case "startingBalance":   return a.startingBalance;
      case "cashBalance":       return a.cashBalance;
      case "equityValue":       return a.equityValue;
      case "totalAccountValue": return a.totalAccountValue;
      case "totalPnL":          return a.totalPnL;
      case "totalPnLPercent":   return a.totalPnLPercent;
      case "totalTrades":       return a.totalTrades;
      case "wins":              return a.wins;
      case "losses":            return a.losses;
      case "winRate":           return a.winRate;
      case "updatedAt":         return a.updatedAt;
      default:                  return "";
    }
  });
}

// ── GET /api/paper/account ────────────────────────────────────────────────────

const ACCOUNT_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
};

export async function GET() {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ account: makeDefaultAccount(), source: "default" });
  }
  try {
    const [rows, posRows, tradeRows] = await Promise.all([
      getSheetRows(SHEETS.PAPER_ACCOUNT),
      getSheetRows(SHEETS.PAPER_POSITIONS),
      getSheetRows(SHEETS.PAPER_TRADES),
    ]);
    const dataRows = rows.slice(1).filter((r) => r[0]);
    if (dataRows.length === 0) {
      const account = makeDefaultAccount();
      await appendRows(SHEETS.PAPER_ACCOUNT, [accountToRow(account)]);
      return NextResponse.json({ account, source: "created" });
    }
    const storedAccount = rowToAccount(dataRows[0]);
    const positions = posRows.slice(1).filter((r) => r[0]).map(rowToPosition);
    const trades = tradeRows.slice(1).filter((r) => r[0]).map(rowToTrade);
    const account = rebuildAccountFromLedger(storedAccount, positions, trades);
    return NextResponse.json({ account, source: "sheets" }, { headers: ACCOUNT_CACHE_HEADERS });
  } catch (err) {
    return NextResponse.json({ account: makeDefaultAccount(), source: "fallback", error: String(err) });
  }
}

// ── PUT /api/paper/account ────────────────────────────────────────────────────

export async function PUT(req: Request) {
  if (!isSheetsConfigured()) {
    return NextResponse.json({ ok: true, source: "unconfigured" });
  }
  try {
    const { account } = (await req.json()) as { account: PaperAccount };
    const rowIndex = await findRowIndexById(SHEETS.PAPER_ACCOUNT, DEFAULT_ACCOUNT_ID);
    if (rowIndex) {
      await updateRow(SHEETS.PAPER_ACCOUNT, rowIndex, accountToRow({ ...account, updatedAt: new Date().toISOString() }));
    } else {
      await appendRows(SHEETS.PAPER_ACCOUNT, [accountToRow(account)]);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
