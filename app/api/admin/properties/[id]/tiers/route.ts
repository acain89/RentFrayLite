import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type TierInput = {
  id?: string;
  tierName: string;
  unitCount: string;
  markedForDelete?: boolean;
  baseRent: string;
  dueDay: string;
  graceDays: string;
  lateFeeEnabled: boolean;
  lateFeeAmount: string;
  lateFeeDaily?: string;
  lateFeeMaxDays?: string;
};

type PostBody = {
  tiers?: TierInput[];
};

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value: unknown, fallback = 0): number {
  return Math.trunc(toNumber(value, fallback));
}

function toCents(value: unknown): number {
  return Math.round(toNumber(value, 0) * 100);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || (session.role !== "OWNER" && session.role !== "MANAGER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await req.json()) as PostBody;

    const tiers: TierInput[] = Array.isArray(body.tiers) ? body.tiers : [];

    if (!id || tiers.length === 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {

      for (let i = 0; i < tiers.length; i += 1) {
        const t = tiers[i];

                const name = String(t.tierName || "").trim() || `Tier ${i + 1}`;
        const baseRentCents = toCents(t.baseRent);
        const rentDueDay = toInt(t.dueDay, 1);
        const gracePeriodDays = toInt(t.graceDays, 0);
        const lateFeeInitialCents = t.lateFeeEnabled ? toCents(t.lateFeeAmount) : 0;
        const lateFeeDailyCents = t.lateFeeEnabled ? toCents(t.lateFeeDaily) : 0;
        const maxLateFeeDays = t.lateFeeEnabled ? toInt(t.lateFeeMaxDays, 0) : 0;
        const unitCount = Math.max(0, toInt(t.unitCount, 0));

        if (t.markedForDelete && t.id) {
  const occupiedUnits = await tx.tenantAssignment.count({
    where: {
      propertyId: id,
      isCurrent: true,
      moveOutDate: null,
      unit: {
        tierId: t.id,
      },
    },
  });

  if (occupiedUnits > 0) {
    throw new Error(
      `Cannot delete tier "${name}" because units are still assigned.`
    );
  }

  const activeTierUnitCount = await tx.unit.count({
  where: {
    propertyId: id,
    tierId: t.id,
    isActive: true,
  },
});

  await tx.propertyTier.update({
    where: { id: t.id },
    data: { isActive: false },
  });

  continue;
}

if (t.id && !t.id.startsWith("new-tier-")) {
  const existingTier = await tx.propertyTier.findFirst({
    where: {
      id: t.id,
      propertyId: id,
      isActive: true,
    },
    select: {
      id: true,
      unitCount: true,
    },
  });

  if (!existingTier) {
    throw new Error(`Tier "${name}" was not found.`);
  }

  const activeTierUnitCount = await tx.unit.count({
    where: {
      propertyId: id,
      tierId: t.id,
      isActive: true,
    },
  });

  const submittedUnitCount = Math.max(0, toInt(t.unitCount, 0));

  const nextUnitCount =
    submittedUnitCount === activeTierUnitCount &&
    existingTier.unitCount > activeTierUnitCount
      ? existingTier.unitCount
      : submittedUnitCount;

  if (nextUnitCount < activeTierUnitCount) {
    throw new Error(
      `Tier "${name}" cannot be lower than ${activeTierUnitCount} active units.`
    );
  }

  await tx.propertyTier.update({
    where: { id: existingTier.id },
    data: {
      name,
      unitCount: nextUnitCount,
      activeUnitCount: activeTierUnitCount,
      baseRentCents,
      rentDueDay,
      gracePeriodDays,
      lateFeeInitialCents,
      lateFeeDailyCents,
      maxLateFeeDays,
      lateFeeType: "FLAT",
      sortOrder: i,
      isActive: true,
    },
  });

  continue;
}

await tx.propertyTier.create({
  data: {
    propertyId: id,
    name,
    unitCount,
    activeUnitCount: 0,
    baseRentCents,
    rentDueDay,
    gracePeriodDays,
    lateFeeInitialCents,
    lateFeeDailyCents,
    maxLateFeeDays,
    lateFeeType: "FLAT",
    sortOrder: i,
    isActive: true,
  },
});
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
  console.error("SAVE TIERS FAILED", err);

  const message =
    err instanceof Error ? err.message : "Failed to save tiers";

  return NextResponse.json(
    { error: message },
    { status: 400 }
  );
}
}