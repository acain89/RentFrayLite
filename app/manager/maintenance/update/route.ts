import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES = new Set([
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
]);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const requestId = String(body.requestId || "").trim();
    const statusRaw = String(body.status || "")
      .trim()
      .toUpperCase();
    const internalNotes =
      body.internalNotes == null ? undefined : String(body.internalNotes);

    if (!requestId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (statusRaw && !ALLOWED_STATUSES.has(statusRaw)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await prisma.maintenanceRequest.findUnique({
      where: { id: requestId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Maintenance request not found" },
        { status: 404 }
      );
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        ...(statusRaw ? { status: statusRaw } : {}),
        ...(internalNotes !== undefined ? { internalNotes } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      request: {
        id: updated.id,
        status: updated.status,
        internalNotes: updated.internalNotes || "",
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to update maintenance request" },
      { status: 500 }
    );
  }
}