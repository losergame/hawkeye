import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SignalStatus as PrismaSignalStatus } from "@prisma/client";
import type { SignalStatus } from "@/lib/signal-tracker";

const TO_PRISMA: Record<SignalStatus, PrismaSignalStatus> = {
  pending:     "PENDING",
  triggered:   "TRIGGERED",
  target_hit:  "TARGET_HIT",
  stopped_out: "STOPPED_OUT",
  expired:     "EXPIRED",
};

// ── PATCH /api/signals/[id] ───────────────────────────────────────────────────
// Updates status and/or evaluation outcome fields on a single signal.

interface SignalPatch {
  status?:        SignalStatus;
  triggeredAt?:   string;
  triggeredPrice?:number;
  resolvedAt?:    string;
  resolvedPrice?: number;
  actualReturn?:  number;
  actualRR?:      number;
  isSimulated?:   boolean;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const patch = (await req.json()) as SignalPatch;

    const updated = await prisma.scannerSignal.update({
      where: { id },
      data: {
        ...(patch.status        !== undefined && { status: TO_PRISMA[patch.status] }),
        ...(patch.triggeredAt   !== undefined && { triggeredAt: new Date(patch.triggeredAt) }),
        ...(patch.triggeredPrice!== undefined && { triggeredPrice: patch.triggeredPrice }),
        ...(patch.resolvedAt    !== undefined && { resolvedAt: new Date(patch.resolvedAt) }),
        ...(patch.resolvedPrice !== undefined && { resolvedPrice: patch.resolvedPrice }),
        ...(patch.actualReturn  !== undefined && { actualReturn: patch.actualReturn }),
        ...(patch.actualRR      !== undefined && { actualRR: patch.actualRR }),
        ...(patch.isSimulated   !== undefined && { isSimulated: patch.isSimulated }),
      },
    });

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB unavailable";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
