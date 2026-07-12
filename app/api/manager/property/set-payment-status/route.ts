import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageFinancials } from "@/lib/permissions";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function toBool(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (!session || !session.propertyId || !canManageFinancials(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await req.json();

    const processorConnected = toBool(
      (body as { processorConnected?: unknown; stripeConnected?: unknown })
        ?.processorConnected ??
        (body as { stripeConnected?: unknown })?.stripeConnected
    );

    const bankConnected = toBool(
      (body as { bankConnected?: unknown; achEnabled?: unknown })?.bankConnected ??
        (body as { achEnabled?: unknown })?.achEnabled
    );

    const chargesEnabled = toBool(
      (body as { chargesEnabled?: unknown; achEnabled?: unknown })?.chargesEnabled ??
        (body as { achEnabled?: unknown })?.achEnabled
    );

    const payoutsEnabled = toBool(
      (body as { payoutsEnabled?: unknown })?.payoutsEnabled
    );

    const onboardingComplete = toBool(
      (body as { onboardingComplete?: unknown })?.onboardingComplete
    );

    const requirementsDue = toBool(
      (body as { requirementsDue?: unknown })?.requirementsDue
    );

    const requirementsSummary =
      clean((body as { requirementsSummary?: unknown; notes?: unknown })
        ?.requirementsSummary ??
        (body as { notes?: unknown })?.notes) || null;

    const readyForLive =
      processorConnected &&
      bankConnected &&
      chargesEnabled &&
      onboardingComplete &&
      !requirementsDue;

    const paymentStatus = await prisma.paymentConnectionStatus.upsert({
      where: { propertyId: session.propertyId },
      update: {
        processorConnected,
        bankConnected,
        chargesEnabled,
        payoutsEnabled,
        onboardingComplete,
        requirementsDue,
        requirementsSummary,
        readyForLive,
        lastSyncedAt: new Date(),
      },
      create: {
        propertyId: session.propertyId,
        processorConnected,
        bankConnected,
        chargesEnabled,
        payoutsEnabled,
        onboardingComplete,
        requirementsDue,
        requirementsSummary,
        readyForLive,
        lastSyncedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        propertyId: session.propertyId,
        actorType: "MANAGER",
        action: "PAYMENT_STATUS_UPDATED",
        targetType: "PROPERTY",
        targetId: session.propertyId,
        summary: "Manager updated payment connection status.",
        metadataJson: JSON.stringify({
          processorConnected,
          bankConnected,
          chargesEnabled,
          payoutsEnabled,
          onboardingComplete,
          requirementsDue,
          requirementsSummary,
          readyForLive,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      paymentStatus,
      readyForLive,
    });
  } catch (error: unknown) {
    console.error("POST set-payment-status error:", error);

    return NextResponse.json(
      { error: "Failed to update payment status" },
      { status: 500 }
    );
  }
}
