// app/api/manager/maintenance/pin/route.ts

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RequestBody = {
  pin?: unknown;
};

type SuccessResponse = {
  ok: true;
  data: {
    maintenanceUserId: string;
  };
};

type ErrorResponse = {
  ok: false;
  error: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function isAllowedRole(role: string): role is "OWNER" | "MANAGER" {
  return role === "OWNER" || role === "MANAGER";
}

export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (!session || !session.propertyId || !isAllowedRole(session.role)) {
      return NextResponse.json<ErrorResponse>(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as RequestBody;
    const pin = clean(body.pin);

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json<ErrorResponse>(
        { ok: false, error: "PIN must be exactly 4 digits." },
        { status: 400 }
      );
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const existingUser = await prisma.maintenanceUser.findFirst({
      where: {
        propertyId: session.propertyId,
        isActive: true,
      },
      select: {
        id: true,
      },
      orderBy: [{ createdAt: "asc" }],
    });

    let maintenanceUserId = "";

    if (existingUser) {
      const updated = await prisma.maintenanceUser.update({
        where: { id: existingUser.id },
        data: {
          pinHash,
        },
        select: {
          id: true,
        },
      });

      maintenanceUserId = updated.id;
    } else {
      const created = await prisma.maintenanceUser.create({
        data: {
          propertyId: session.propertyId,
          displayName: "Maintenance Crew",
          pinHash,
          isActive: true,
          createdByManagementUserId: session.managementUserId ?? null,
        },
        select: {
          id: true,
        },
      });

      maintenanceUserId = created.id;
    }

    await prisma.auditLog.create({
      data: {
        propertyId: session.propertyId,
        actorType: session.role,
        actorManagementUserId: session.managementUserId ?? null,
        action: "MAINTENANCE_PIN_SET",
        targetType: "MAINTENANCE_USER",
        targetId: maintenanceUserId,
        summary: "Maintenance PIN updated",
      },
    });

    return NextResponse.json<SuccessResponse>({
      ok: true,
      data: {
        maintenanceUserId,
      },
    });
  } catch (error) {
    console.error("POST /api/manager/maintenance/pin failed", error);

    return NextResponse.json<ErrorResponse>(
      { ok: false, error: "Failed to save maintenance PIN." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getSession();

    if (!session || !session.propertyId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const existingUser = await prisma.maintenanceUser.findFirst({
      where: {
        propertyId: session.propertyId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json({
      ok: true,
      hasPin: Boolean(existingUser),
    });
  } catch (error) {
    console.error("GET /api/manager/maintenance/pin failed", error);

    return NextResponse.json(
      { ok: false, error: "Failed to check maintenance PIN." },
      { status: 500 }
    );
  }
}
