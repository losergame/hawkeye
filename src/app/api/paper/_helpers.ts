// Shared helpers for paper trading API routes — NOT a route file.

import { HEADERS, SHEETS } from "@/lib/google-sheets";
import type { PaperPosition } from "@/lib/paper-trading";

const H = HEADERS[SHEETS.PAPER_POSITIONS];

export function positionToRow(p: PaperPosition): (string | number)[] {
  return H.map((col) => {
    switch (col) {
      case "positionId":           return p.positionId;
      case "ticker":               return p.ticker;
      case "companyName":          return p.companyName;
      case "setupType":            return p.setupType;
      case "entryPrice":           return p.entryPrice;
      case "currentPrice":         return p.currentPrice;
      case "shares":               return p.shares;
      case "positionValue":        return p.positionValue;
      case "stopLoss":             return p.stopLoss;
      case "takeProfit1":          return p.takeProfit1;
      case "takeProfit2":          return p.takeProfit2;
      case "unrealizedPnL":        return p.unrealizedPnL;
      case "unrealizedPnLPercent": return p.unrealizedPnLPercent;
      case "status":               return p.status;
      case "openedAt":             return p.openedAt;
      case "updatedAt":            return p.updatedAt;
      default:                     return "";
    }
  });
}
