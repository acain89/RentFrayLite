import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function clean(value: unknown) {
  return String(value || "").trim();
}

function toBool(value: unknown) {
  return value === true || value === "true" || value === "1";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const property = await prisma.property.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        propertyCode: true,
        status: true,
        paymentStatus: true,
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      property: {
        id: property.id,
        name: property.name,
        propertyCode: property.propertyCode,
        status: property.status,
      },
      paymentStatus: property.paymentStatus,
    });
  } catch (error: unknown) {
    console.error("GET /api/admin/properties/[id]/payment-status error:", error);
    return NextResponse.json(
      { error: "Failed to load payment status" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
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

    const property = await prisma.property.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        propertyCode: true,
        status: true,
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    const readyForLive =
      processorConnected &&
      bankConnected &&
      chargesEnabled &&
      onboardingComplete &&
      !requirementsDue;

    const paymentStatus = await prisma.paymentConnectionStatus.upsert({
      where: { propertyId: id },
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
        propertyId: id,
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
        propertyId: id,
        actorType: "ADMIN",
        action: "PAYMENT_STATUS_UPDATED",
        targetType: "PROPERTY",
        targetId: id,
        summary: "Admin updated payment connection status.",
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
      property: {
        id: property.id,
        name: property.name,
        propertyCode: property.propertyCode,
        status: property.status,
      },
      paymentStatus,
      readyForLive,
    });
  } catch (error: unknown) {
    console.error("POST /api/admin/properties/[id]/payment-status error:", error);
    return NextResponse.json(
      { error: "Failed to save payment status" },
      { status: 500 }
    );
  }
}