import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type GPLFTierInput = {
  id: string;
  dueDay: string;
  graceDays: string;
  lateFeeEnabled: boolean;
  lateFeeAmount: string;
  lateFeeDaily?: string;
  lateFeeMaxDays?: string;
};

type PostBody = {
  tiers?: GPLFTierInput[];
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
    const tiers = Array.isArray(body.tiers) ? body.tiers : [];

    if (!id || tiers.length === 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const tier of tiers) {
        const tierId = String(tier.id || "").trim();

        if (!tierId) {
          continue;
        }

        const rentDueDay = toInt(tier.dueDay, 1);
        const gracePeriodDays = toInt(tier.graceDays, 0);
        const lateFeeInitialCents = tier.lateFeeEnabled ? toCents(tier.lateFeeAmount) : 0;
        const lateFeeDailyCents = tier.lateFeeEnabled ? toCents(tier.lateFeeDaily) : 0;
        const maxLateFeeDays = tier.lateFeeEnabled ? toInt(tier.lateFeeMaxDays, 0) : 0;

        await tx.propertyTier.update({
          where: {
            id: tierId,
          },
          data: {
            rentDueDay,
            gracePeriodDays,
            lateFeeInitialCents,
            lateFeeDailyCents,
            maxLateFeeDays,
            lateFeeType: "FLAT",
          },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("SAVE GP&LF FAILED", err);
    return NextResponse.json(
      { error: "Failed to save GP&LF settings" },
      { status: 500 }
    );
  }
}