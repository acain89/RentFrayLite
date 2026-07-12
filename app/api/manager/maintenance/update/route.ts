// /app/api/manager/maintenance/update/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { Prisma } from "@prisma/client";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED_STATUSES = new Set(
  ["OPEN", "IN_PROGRESS", "COMPLETE", "THIRD_PARTY"] as const
);

const ALLOWED_ROLES = new Set(
  ["OWNER", "MANAGER", "STAFF", "MAINTENANCE"] as const
);

type AllowedStatus = "OPEN" | "IN_PROGRESS" | "COMPLETE" | "THIRD_PARTY";
type AllowedAction = "DELETE";

type AllowedRole = "OWNER" | "MANAGER" | "STAFF" | "MAINTENANCE";

type RequestBody = {
  requestId?: unknown;
  status?: unknown;
  action?: unknown;
};

type UpdateSuccessResponse = {
  ok: true;
  request?: {
    id: string;
    propertyId: string;
    unitId: string;
    category: string;
    urgency: string;
    status: string;
    description: string;
    tenantVisibleName: string | null;
    createdByTenant: boolean;
    createdByManagementUserId: string | null;
    createdByMaintenanceUserId: string | null;
    lastUpdatedByManagementUserId: string | null;
    lastUpdatedByMaintenanceUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
  };
  deletedId?: string;
};

type UpdateErrorResponse = {
  ok: false;
  error: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function parseStatus(value: unknown): AllowedStatus | null {
  const normalized = clean(value).toUpperCase();

  if (!ALLOWED_STATUSES.has(normalized as AllowedStatus)) {
    return null;
  }

  return normalized as AllowedStatus;
}

function parseAction(value: unknown): AllowedAction | null {
  const normalized = clean(value).toUpperCase();
  return normalized === "DELETE" ? "DELETE" : null;
}

function isAllowedRole(role: string): role is AllowedRole {
  return ALLOWED_ROLES.has(role as AllowedRole);
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await getSession();

    if (
      !session ||
      !session.propertyId ||
      !session.role ||
      !isAllowedRole(session.role)
    ) {
      return NextResponse.json<UpdateErrorResponse>(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as RequestBody;

    const requestId = clean(body.requestId);
    const status = parseStatus(body.status);
    const action = parseAction(body.action);

    if (!requestId) {
      return NextResponse.json<UpdateErrorResponse>(
        { ok: false, error: "Missing request ID." },
        { status: 400 }
      );
    }

    if (!status && !action) {
      return NextResponse.json<UpdateErrorResponse>(
        { ok: false, error: "Missing or invalid update instruction." },
        { status: 400 }
      );
    }

    const requestRow = await prisma.maintenanceRequest.findFirst({
      where: {
        id: requestId,
        propertyId: session.propertyId,
      },
      include: {
        unit: {
          select: {
            unitNumber: true,
          },
        },
      },
    });

    if (!requestRow) {
      return NextResponse.json<UpdateErrorResponse>(
        { ok: false, error: "Request not found." },
        { status: 404 }
      );
    }

    if (action === "DELETE") {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.maintenanceRequest.delete({
          where: { id: requestId },
        });

        await tx.auditLog.create({
          data: {
            propertyId: session.propertyId,
            actorType: session.role,
            actorManagementUserId:
              session.role === "OWNER" ||
              session.role === "MANAGER" ||
              session.role === "STAFF"
                ? session.managementUserId ?? null
                : null,
            actorMaintenanceUserId:
              session.role === "MAINTENANCE"
                ? session.maintenanceUserId ?? null
                : null,
            action: "MAINTENANCE_REQUEST_DELETED",
            targetType: "MAINTENANCE_REQUEST",
            targetId: requestId,
            summary: `Maintenance request deleted for unit ${requestRow.unit.unitNumber}`,
            metadataJson: JSON.stringify({
              unitNumber: requestRow.unit.unitNumber,
              previousStatus: requestRow.status,
              category: requestRow.category,
              urgency: requestRow.urgency,
            }),
          },
        });
      });

      return NextResponse.json<UpdateSuccessResponse>({
        ok: true,
        deletedId: requestId,
      });
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status,
        completedAt: status === "COMPLETE" ? new Date() : null,
        lastUpdatedByMaintenanceUserId:
          session.role === "MAINTENANCE"
            ? session.maintenanceUserId ?? null
            : requestRow.lastUpdatedByMaintenanceUserId,
        lastUpdatedByManagementUserId:
          session.role === "OWNER" ||
          session.role === "MANAGER" ||
          session.role === "STAFF"
            ? session.managementUserId ?? null
            : requestRow.lastUpdatedByManagementUserId,
      },
      select: {
        id: true,
        propertyId: true,
        unitId: true,
        category: true,
        urgency: true,
        status: true,
        description: true,
        tenantVisibleName: true,
        createdByTenant: true,
        createdByManagementUserId: true,
        createdByMaintenanceUserId: true,
        lastUpdatedByManagementUserId: true,
        lastUpdatedByMaintenanceUserId: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        propertyId: session.propertyId,
        actorType: session.role,
        actorManagementUserId:
          session.role === "OWNER" ||
          session.role === "MANAGER" ||
          session.role === "STAFF"
            ? session.managementUserId ?? null
            : null,
        actorMaintenanceUserId:
          session.role === "MAINTENANCE"
            ? session.maintenanceUserId ?? null
            : null,
        action: "MAINTENANCE_REQUEST_UPDATED",
        targetType: "MAINTENANCE_REQUEST",
        targetId: requestId,
        summary: `Maintenance request status changed from ${requestRow.status} to ${status}`,
        metadataJson: JSON.stringify({
          unitNumber: requestRow.unit.unitNumber,
          previousStatus: requestRow.status,
          nextStatus: status,
        }),
      },
    });

    return NextResponse.json<UpdateSuccessResponse>({
      ok: true,
      request: updated,
    });
  } catch (error: unknown) {
    console.error("POST /api/manager/maintenance/update error:", error);

    return NextResponse.json<UpdateErrorResponse>(
      { ok: false, error: "Failed to update maintenance request." },
      { status: 500 }
    );
  }
}
