import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SignalStatus as PrismaSignalStatus } from "@prisma/client";
import type { SignalStatus, TrackedSignal } from "@/lib/signal-tracker";

// ── Status mapping ────────────────────────────────────────────────────────────

const TO_PRISMA: Record<SignalStatus, PrismaSignalStatus> = {
  pending:     "PENDING",
  triggered:   "TRIGGERED",
  target_hit:  "TARGET_HIT",
  stopped_out: "STOPPED_OUT",
  expired:     "EXPIRED",
};

const FROM_PRISMA: Record<PrismaSignalStatus, SignalStatus> = {
  PENDING:     "pending",
  TRIGGERED:   "triggered",
  TARGET_HIT:  "target_hit",
  STOPPED_OUT: "stopped_out",
  EXPIRED:     "expired",
};

// ── DB row → TrackedSignal ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSignal(row: any): TrackedSignal {
  return {
    id:             row.id,
    ticker:         row.ticker,
    companyName:    row.companyName,
    setupType:      row.setupType,
    entryPrice:     Number(row.entryPrice),
    stopLoss:       Number(row.stopLoss),
    takeProfit1:    Number(row.takeProfit1),
    takeProfit2:    Number(row.takeProfit2),
    riskReward:     Number(row.riskReward),
    confidenceScore:row.confidenceScore,
    slMethod:       row.slMethod ?? undefined,
    tp1Method:      row.tp1Method ?? undefined,
    status:         FROM_PRISMA[row.status as PrismaSignalStatus],
    generatedAt:    row.generatedAt.toISOString(),
    expiresAt:      row.expiresAt.toISOString(),
    triggeredAt:    row.triggeredAt?.toISOString(),
    triggeredPrice: row.triggeredPrice !== null ? Number(row.triggeredPrice) : undefined,
    resolvedAt:     row.resolvedAt?.toISOString(),
    resolvedPrice:  row.resolvedPrice !== null ? Number(row.resolvedPrice) : undefined,
    actualReturn:   row.actualReturn !== null ? Number(row.actualReturn) : undefined,
    actualRR:       row.actualRR !== null ? Number(row.actualRR) : undefined,
    isSimulated:    row.isSimulated,
  };
}

// ── GET /api/signals ──────────────────────────────────────────────────────────
// Returns all signals, newest first, up to 500.

export async function GET() {
  try {
    const rows = await prisma.scannerSignal.findMany({
      orderBy: { generatedAt: "desc" },
      take: 500,
    });
    return NextResponse.json({ signals: rows.map(rowToSignal), source: "database" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB unavailable";
    return NextResponse.json(
      { error: msg, source: "unavailable" },
      { status: 503 },
    );
  }
}

// ── POST /api/signals ─────────────────────────────────────────────────────────
// Accepts an array of TrackedSignal objects from the client.
// Server-side dedup: skips any ticker+setupType already seen within 7 days.

export async function POST(req: Request) {
  try {
    const { signals } = (await req.json()) as { signals: TrackedSignal[] };
    if (!Array.isArray(signals) || signals.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    const DEDUP_DAYS = 7;
    const cutoff = new Date(Date.now() - DEDUP_DAYS * 86_400_000);

    // Load existing ticker+setupType combos within the dedup window
    const existing = await prisma.scannerSignal.findMany({
      where: { generatedAt: { gte: cutoff } },
      select: { ticker: true, setupType: true },
    });
    const existingKeys = new Set(existing.map((r) => `${r.ticker}::${r.setupType}`));

    const toInsert = signals.filter((s) => {
      const key = `${s.ticker}::${s.setupType}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key); // prevent duplicates within the same batch
      return true;
    });

    if (toInsert.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    await prisma.scannerSignal.createMany({
      data: toInsert.map((s) => ({
        id:             s.id,
        ticker:         s.ticker,
        companyName:    s.companyName,
        setupType:      s.setupType,
        entryPrice:     s.entryPrice,
        stopLoss:       s.stopLoss,
        takeProfit1:    s.takeProfit1,
        takeProfit2:    s.takeProfit2,
        riskReward:     s.riskReward,
        confidenceScore:s.confidenceScore,
        slMethod:       s.slMethod ?? null,
        tp1Method:      s.tp1Method ?? null,
        status:         TO_PRISMA[s.status],
        generatedAt:    new Date(s.generatedAt),
        expiresAt:      new Date(s.expiresAt),
        isSimulated:    s.isSimulated ?? false,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ created: toInsert.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB unavailable";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
