// app/api/manager/units/vacate/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { emitEvent } from "@/lib/realtime";
import { Prisma } from "@prisma/client";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type VacateBody = {
  unitId?: unknown;
  moveOutDate?: unknown;
  note?: unknown;
};

type VacateSuccessResponse = {
  ok: true;
  data: {
    unitId: string;
    unitNumber: string;
    vacatedAssignmentId: string | null;
    moveOutDate: string;
  };
};

type VacateErrorResponse = {
  ok: false;
  error: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function parseMoveOutDate(value: unknown): Date {
  const raw = clean(value);

  if (!raw) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const parsed = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  return parsed;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isAllowedRole(role: string): role is "OWNER" | "MANAGER" {
  return role === "OWNER" || role === "MANAGER";
}

export async function POST(req: Request) {
  try {
    const session = await getSession();

    if (
      !session ||
      !session.propertyId ||
      !isAllowedRole(session.role)
    ) {
      return NextResponse.json<VacateErrorResponse>(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as VacateBody;

    const unitId = clean(body.unitId);
    const note = clean(body.note);
    const moveOutDate = parseMoveOutDate(body.moveOutDate);

    if (!unitId) {
      return NextResponse.json<VacateErrorResponse>(
        { ok: false, error: "Unit ID is required." },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        propertyId: session.propertyId,
      },
      select: {
        id: true,
        propertyId: true,
        unitNumber: true,
        portalActivated: true,
      },
    });

    if (!unit) {
      return NextResponse.json<VacateErrorResponse>(
        { ok: false, error: "Unit not found." },
        { status: 404 }
      );
    }

    const activeAssignment = await prisma.tenantAssignment.findFirst({
      where: {
        propertyId: session.propertyId,
        unitId: unit.id,
        isCurrent: true,
        OR: [
  { moveOutDate: null },
  { moveOutDate: { gt: new Date() } },
],
      },
      orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        let vacatedAssignmentId: string | null = null;

        if (activeAssignment) {
          await tx.tenantAssignment.update({
            where: { id: activeAssignment.id },
            data: {
              isCurrent: false,
              moveOutDate,
              notes: note || undefined,
            },
          });

          vacatedAssignmentId = activeAssignment.id;
        }

        await tx.unit.update({
          where: { id: unit.id },
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
            propertyId: session.propertyId,
            actorType: session.role,
            actorManagementUserId: session.managementUserId ?? null,
            action: "UNIT_VACATED",
            targetType: "UNIT",
            targetId: unit.id,
            summary: `Unit ${unit.unitNumber} marked vacant`,
            metadataJson: JSON.stringify({
              unitId: unit.id,
              unitNumber: unit.unitNumber,
              tenantAssignmentId: vacatedAssignmentId,
              moveOutDate: formatDateOnly(moveOutDate),
              clearedPortalAccess: true,
              note: note || null,
            }),
          },
        });

        return {
          unitId: unit.id,
          unitNumber: unit.unitNumber,
          vacatedAssignmentId,
          moveOutDate: formatDateOnly(moveOutDate),
        };
      }
    );

    emitEvent("tenant:update", {
      propertyId: session.propertyId,
      unitId: result.unitId,
      tenantAssignmentId: result.vacatedAssignmentId,
      source: "UNIT_VACATED",
    });

    emitEvent("unit:update", {
      propertyId: session.propertyId,
      unitId: result.unitId,
      source: "UNIT_VACATED",
    });

    emitEvent("ledger:update", {
      propertyId: session.propertyId,
      unitId: result.unitId,
      tenantAssignmentId: result.vacatedAssignmentId,
      source: "UNIT_VACATED",
    });

    return NextResponse.json<VacateSuccessResponse>({
      ok: true,
      data: result,
    });
  } catch (error) {
    console.error("POST /api/manager/units/vacate failed", error);

    return NextResponse.json<VacateErrorResponse>(
      { ok: false, error: "Failed to vacate unit." },
      { status: 500 }
    );
  }
}
