// app/api/admin/property/set-status/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isPaymentReady } from "@/lib/paymentStatus";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const propertyId = String(body.propertyId || "");
    const nextStatus = String(body.status || "").toUpperCase();

    if (!propertyId || !nextStatus) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        paymentStatus: true,
        settings: true,
        units: true,
      },
    });

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    if (nextStatus === "LIVE") {
      const paymentReady = isPaymentReady(property.paymentStatus || {});
      const hasUnits = property.units.length > 0;
      const hasSettings = Boolean(property.settings);

      if (!paymentReady || !hasUnits || !hasSettings) {
        return NextResponse.json(
          { error: "Property not ready for LIVE" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.property.update({
      where: { id: propertyId },
      data: { status: nextStatus },
    });

    await prisma.auditLog.create({
      data: {
        propertyId,
        actorRole: "ADMIN",
        actorLabel: "admin",
        action: "PROPERTY_STATUS_CHANGED",
        entityType: "PROPERTY",
        entityId: propertyId,
        notes: JSON.stringify({
          from: property.status,
          to: nextStatus,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      property: updated,
    });
  } catch (error) {
    console.error("POST set-status error:", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
