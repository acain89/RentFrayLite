import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RequestSetupBody = {
  propertyName?: unknown;
  propertyType?: unknown;
  address?: unknown;
  contactName?: unknown;
  contactInfo?: unknown;
  unitCount?: unknown;
  notes?: unknown;
};

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function toUnitCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestSetupBody;

    const propertyName = toCleanString(body.propertyName);
    const propertyType = toCleanString(body.propertyType);
    const address = toCleanString(body.address);
    const contactName = toCleanString(body.contactName);
    const contactInfo = toCleanString(body.contactInfo);
    const unitCount = toUnitCount(body.unitCount);
    const notes = toCleanString(body.notes);

    if (!propertyName) {
      return NextResponse.json(
        { ok: false, error: "Property name is required." },
        { status: 400 }
      );
    }

    if (!contactName) {
      return NextResponse.json(
        { ok: false, error: "Contact name is required." },
        { status: 400 }
      );
    }

    if (!contactInfo) {
      return NextResponse.json(
        { ok: false, error: "Contact information is required." },
        { status: 400 }
      );
    }

    const request = await prisma.setupRequest.create({
      data: {
        propertyName,
        propertyType: propertyType || null,
        address: address || null,
        contactName,
        contactInfo,
        unitCount,
        notes: notes || null,
        status: "NEW",
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      request,
    });
  } catch (error) {
    console.error("Failed to create setup request:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to submit request.",
      },
      { status: 500 }
    );
  }
}
