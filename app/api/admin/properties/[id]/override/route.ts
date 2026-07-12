// app/api/admin/properties/[id]/override/route.ts

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function clean(value: unknown) {
  return String(value || "").trim();
}

function cleanUpper(value: unknown) {
  return clean(value).toUpperCase();
}

async function requireAdmin() {
  const session = await getSession();

  if (!session || session.role !== "ADMIN") {
    return null;
  }

  return session;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body: unknown = await req.json();

    const action = cleanUpper((body as { action?: unknown })?.action);
    const reason = clean((body as { reason?: unknown })?.reason);
    const unitId = clean((body as { unitId?: unknown })?.unitId);

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        paymentStatus: true,
        units: {
          orderBy: { unitNumber: "asc" },
        },
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    if (action === "FORCE_LIVE") {
      const updated = await prisma.property.update({
        where: { id },
        data: { status: "LIVE" },
        select: {
          id: true,
          name: true,
          propertyCode: true,
          status: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          propertyId: id,
          actorType: "ADMIN",
          action: "PROPERTY_FORCE_LIVE",
          targetType: "PROPERTY",
          targetId: id,
          summary: "Property forced to LIVE by admin override.",
          metadataJson: JSON.stringify({
            reason: reason || null,
            previousStatus: property.status,
            nextStatus: "LIVE",
          }),
        },
      });

      return NextResponse.json({
        ok: true,
        action,
        property: updated,
      });
    }

    if (action === "RESET_PROPERTY") {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.maintenanceRequest.deleteMany({
          where: { propertyId: id },
        });

        await tx.ledgerEntry.deleteMany({
          where: { propertyId: id },
        });

        await tx.tenantAssignment.updateMany({
          where: {
            propertyId: id,
            isCurrent: true,
          },
          data: {
            moveOutDate: new Date(),
            isCurrent: false,
          },
        });

        await tx.unit.updateMany({
          where: { propertyId: id },
          data: {
            portalActivated: false,
            portalFirstName: null,
            portalLastName: null,
            tenantPinHash: null,
            activatedAt: null,
            activationSource: null,
          },
        });

        await tx.paymentConnectionStatus.upsert({
          where: { propertyId: id },
          update: {
            processorConnected: false,
            bankConnected: false,
            chargesEnabled: false,
            payoutsEnabled: false,
            onboardingComplete: false,
            requirementsDue: false,
            requirementsSummary: null,
            lastSyncedAt: null,
            readyForLive: false,
          },
          create: {
            propertyId: id,
            processorConnected: false,
            bankConnected: false,
            chargesEnabled: false,
            payoutsEnabled: false,
            onboardingComplete: false,
            requirementsDue: false,
            requirementsSummary: null,
            lastSyncedAt: null,
            readyForLive: false,
          },
        });

        await tx.property.update({
          where: { id },
          data: {
            status: "SETUP",
          },
        });

        await tx.auditLog.create({
          data: {
            propertyId: id,
            actorType: "ADMIN",
            action: "PROPERTY_RESET",
            targetType: "PROPERTY",
            targetId: id,
            summary: "Property reset by admin override.",
            metadataJson: JSON.stringify({
              reason: reason || null,
            }),
          },
        });
      });

      return NextResponse.json({
        ok: true,
        action,
      });
    }

    if (action === "UNLOCK_UNIT") {
      if (!unitId) {
        return NextResponse.json({ error: "Missing unitId" }, { status: 400 });
      }

      const unit = await prisma.unit.findFirst({
        where: {
          id: unitId,
          propertyId: id,
        },
        select: {
          id: true,
          unitNumber: true,
        },
      });

      if (!unit) {
        return NextResponse.json({ error: "Unit not found" }, { status: 404 });
      }

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.tenantAssignment.updateMany({
          where: {
            unitId,
            isCurrent: true,
          },
          data: {
            moveOutDate: new Date(),
            isCurrent: false,
          },
        });

        await tx.unit.update({
          where: { id: unitId },
          data: {
            portalActivated: false,
            portalFirstName: null,
            portalLastName: null,
            tenantPinHash: null,
            activatedAt: null,
            activationSource: null,
          },
        });

        await tx.auditLog.create({
          data: {
            propertyId: id,
            actorType: "ADMIN",
            action: "UNIT_UNLOCKED_BY_ADMIN",
            targetType: "UNIT",
            targetId: unitId,
            summary: "Unit portal access reset by admin override.",
            metadataJson: JSON.stringify({
              reason: reason || null,
              unitNumber: unit.unitNumber,
            }),
          },
        });
      });

      return NextResponse.json({
        ok: true,
        action,
        unitId,
      });
    }

    if (action === "REPAIR_PAYMENT_STATUS") {
      const repaired = await prisma.paymentConnectionStatus.upsert({
        where: { propertyId: id },
        update: {},
        create: {
          propertyId: id,
          processorConnected: false,
          bankConnected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          onboardingComplete: false,
          requirementsDue: false,
          requirementsSummary: null,
          lastSyncedAt: null,
          readyForLive: false,
        },
      });

      await prisma.auditLog.create({
        data: {
          propertyId: id,
          actorType: "ADMIN",
          action: "PAYMENT_STATUS_REPAIRED",
          targetType: "PROPERTY",
          targetId: id,
          summary: "Payment connection status record repaired.",
          metadataJson: JSON.stringify({
            reason: reason || null,
            paymentStatusId: repaired.id,
          }),
        },
      });

      return NextResponse.json({
        ok: true,
        action,
        paymentStatus: repaired,
      });
    }

    return NextResponse.json(
      { error: "Invalid override action" },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("POST /api/admin/properties/[id]/override error:", error);
    return NextResponse.json(
      { error: "Override action failed" },
      { status: 500 }
    );
  }
}