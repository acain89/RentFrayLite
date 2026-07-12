// app/api/admin/properties/[id]/lifecycle/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getLiveReadiness } from "@/lib/liveGating";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED_STATUSES = ["SETUP", "TEST", "READY", "LIVE", "SUSPENDED"] as const;
type PropertyStatus = (typeof ALLOWED_STATUSES)[number];

function clean(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function isValidStatus(value: string): value is PropertyStatus {
  return ALLOWED_STATUSES.includes(value as PropertyStatus);
}

function canTransition(from: PropertyStatus, to: PropertyStatus) {
  if (from === to) return true;

  const allowed: Record<PropertyStatus, PropertyStatus[]> = {
    SETUP: ["TEST", "SUSPENDED"],
    TEST: ["SETUP", "READY", "SUSPENDED"],
    READY: ["TEST", "LIVE", "SUSPENDED"],
    LIVE: ["SUSPENDED"],
    SUSPENDED: ["SETUP", "TEST", "READY"],
  };

  return allowed[from].includes(to);
}

export async function GET(
  _req: NextRequest,
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
        settings: true,
        units: {
          select: { id: true },
        },
        paymentConnectionStatus: {
          select: {
            stripeConnected: true,
            achEnabled: true,
            onboardingComplete: true,
            adminApproved: true,
            notes: true,
          },
        },
      },
    });

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const readiness = getLiveReadiness(property);

    return NextResponse.json({
      ok: true,
      property,
      readiness,
      allowedStatuses: ALLOWED_STATUSES,
    });
  } catch (error) {
    console.error("GET lifecycle error:", error);
    return NextResponse.json(
      { error: "Failed to load lifecycle state" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const nextStatusRaw = clean(body.status);
    const reason = String(body.reason || "").trim() || null;

    if (!isValidStatus(nextStatusRaw)) {
      return NextResponse.json(
        { error: "Invalid property status" },
        { status: 400 }
      );
    }

    const property = await prisma.property.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        propertyCode: true,
        status: true,
        settings: true,
        units: {
          select: { id: true },
        },
        paymentConnectionStatus: {
          select: {
            stripeConnected: true,
            achEnabled: true,
            onboardingComplete: true,
            adminApproved: true,
          },
        },
      },
    });

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const currentStatusRaw = clean(property.status);

    if (!isValidStatus(currentStatusRaw)) {
      return NextResponse.json(
        { error: "Current property status invalid" },
        { status: 400 }
      );
    }

    const currentStatus = currentStatusRaw;
    const nextStatus = nextStatusRaw;

    if (!canTransition(currentStatus, nextStatus)) {
      return NextResponse.json(
        { error: `Invalid transition: ${currentStatus} → ${nextStatus}` },
        { status: 400 }
      );
    }

    const readiness = getLiveReadiness(property);

    if (nextStatus === "LIVE" && !readiness.readyForLive) {
      return NextResponse.json(
        {
          error: "Property cannot go LIVE until setup and payments are complete.",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.property.update({
      where: { id },
      data: {
        status: nextStatus,
      },
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
        actorRole: "ADMIN",
        actorLabel: "admin",
        action: "PROPERTY_STATUS_CHANGED",
        entityType: "PROPERTY",
        entityId: id,
        notes: JSON.stringify({
          from: currentStatus,
          to: nextStatus,
          reason,
          readiness,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      property: updated,
      previousStatus: currentStatus,
      readiness,
    });
  } catch (error) {
    console.error("POST lifecycle error:", error);
    return NextResponse.json(
      { error: "Failed to update property status" },
      { status: 500 }
    );
  }
}