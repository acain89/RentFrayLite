// app/api/maintenance/session/route.ts

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED_PROPERTY_STATUSES = new Set(
  ["TEST", "READY", "LIVE", "SETUP", "DRAFT"] as const
);

type MaintenanceLoginBody = {
  propertyCode?: unknown;
  pin?: unknown;
};

type MaintenanceLoginSuccessResponse = {
  ok: true;
  role: "MAINTENANCE";
  propertyId: string;
  maintenanceUserId: string;
};

type MaintenanceLoginErrorResponse = {
  ok: false;
  error: string;
};

type MaintenanceUserRow = {
  id: string;
  pinHash: string;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function isValidPropertyCode(value: string): boolean {
  return value.length >= 4;
}


function isValidPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MaintenanceLoginBody;

    const propertyCode = clean(body.propertyCode);
    const pin = clean(body.pin);

    if (!isValidPropertyCode(propertyCode)) {
      return NextResponse.json<MaintenanceLoginErrorResponse>(
        { ok: false, error: "Invalid property code." },
        { status: 400 }
      );
    }

    if (!isValidPin(pin)) {
      return NextResponse.json<MaintenanceLoginErrorResponse>(
        { ok: false, error: "Invalid PIN." },
        { status: 400 }
      );
    }

    const property = await prisma.property.findUnique({
      where: { propertyCode },
      select: {
        id: true,
        status: true,
        isActive: true,
      },
    });

    if (!property || !property.isActive) {
      return NextResponse.json<MaintenanceLoginErrorResponse>(
        { ok: false, error: "Property not found." },
        { status: 404 }
      );
    }

    if (
      !ALLOWED_PROPERTY_STATUSES.has(
        property.status as "TEST" | "READY" | "LIVE"
      )
    ) {
      return NextResponse.json<MaintenanceLoginErrorResponse>(
        { ok: false, error: "Property not available." },
        { status: 403 }
      );
    }

    const users = await prisma.maintenanceUser.findMany({
      where: {
        propertyId: property.id,
        isActive: true,
      },
      select: {
        id: true,
        pinHash: true,
      },
    });

    let matchedUserId: string | null = null;

    for (const user of users as MaintenanceUserRow[]) {
      const isMatch = await bcrypt.compare(pin, user.pinHash);

      if (isMatch) {
        matchedUserId = user.id;
        break;
      }
    }

    if (!matchedUserId) {
      return NextResponse.json<MaintenanceLoginErrorResponse>(
        { ok: false, error: "Invalid PIN." },
        { status: 401 }
      );
    }

    const token = createSessionToken({
      role: "MAINTENANCE",
      propertyId: property.id,
      maintenanceUserId: matchedUserId,
    });

    await setSessionCookie(token);

    await prisma.maintenanceUser.update({
      where: { id: matchedUserId },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return NextResponse.json<MaintenanceLoginSuccessResponse>({
      ok: true,
      role: "MAINTENANCE",
      propertyId: property.id,
      maintenanceUserId: matchedUserId,
    });
  } catch (error) {
    console.error("POST /api/maintenance/session failed", error);

    return NextResponse.json<MaintenanceLoginErrorResponse>(
      { ok: false, error: "Login failed." },
      { status: 500 }
    );
  }
}
