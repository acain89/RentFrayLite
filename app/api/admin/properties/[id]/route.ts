import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type PatchBody = {
  name?: unknown;
  address?: unknown;
  propertyType?: unknown;
  isActive?: unknown;
  rentDueDay?: unknown;
  gracePeriodDays?: unknown;
  lateFeeEnabled?: unknown;
  lateFeeFlat?: unknown;
  convenienceFeeEnabled?: unknown;
  convenienceFeeAmount?: unknown;
  billingCycleStartDate?: unknown;
};

function safeString(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return fallback;
}

function isPrismaKnownError(
  err: unknown
): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

/* =========================
   GET PROPERTY
========================= */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing property id." },
        { status: 400 }
      );
    }

    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        settings: true,
        tiers: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            units: {
              orderBy: { unitNumber: "asc" },
            },
          },
        },
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      property: {
  id: property.id,
  name: property.name,
  code: property.propertyCode,
  type: property.propertyType,
  isActive: property.isActive,
  address: property.addressLine1,
  billingCycleStartDate: property.billingCycleStartDate,
},
      settings: property.settings,
      tiers: property.tiers.map((t: (typeof property.tiers)[number]) => ({
  id: t.id,
  name: t.name,
  baseRent: t.baseRentCents / 100,
  unitCount: t.units.length,
  rentDueDay: t.rentDueDay,
  gracePeriodDays: t.gracePeriodDays,
  lateFeeInitialCents: t.lateFeeInitialCents,
  lateFeeDailyCents: t.lateFeeDailyCents,
  maxLateFeeDays: t.maxLateFeeDays,
})),
    });
  } catch (error) {
    console.error("GET property failed", error);
    return NextResponse.json(
      { error: "Failed to load property." },
      { status: 500 }
    );
  }
}

/* =========================
   DELETE PROPERTY
========================= */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }

    await prisma.property.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE property failed", error);
    return NextResponse.json(
      { error: "Failed to delete property." },
      { status: 500 }
    );
  }
}

/* =========================
   UPDATE PROPERTY + SETTINGS
========================= */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing property id." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as PatchBody;

    const name = safeString(body.name);
    const address = safeString(body.address);
    const propertyType = safeString(body.propertyType || "OTHER");
    const isActive = toBoolean(body.isActive, true);

    const rentDueDay = toNumber(body.rentDueDay, 1);
    const gracePeriodDays = toNumber(body.gracePeriodDays, 0);
    const lateFeeEnabled = toBoolean(body.lateFeeEnabled, true);
    const lateFeeFlatCents = Math.round(toNumber(body.lateFeeFlat, 0) * 100);
    const convenienceFeeEnabled = toBoolean(body.convenienceFeeEnabled, true);
    const convenienceFeeAmountCents = Math.round(
      toNumber(body.convenienceFeeAmount, 0) * 100
    );

    const billingCycleStartDateRaw =
  typeof body.billingCycleStartDate === "string"
    ? body.billingCycleStartDate.trim()
    : "";

const billingCycleStartDate = billingCycleStartDateRaw
  ? new Date(`${billingCycleStartDateRaw}T00:00:00`)
  : undefined;

  const billingCycleOnlyUpdate =
  Object.keys(body).length === 1 &&
  typeof body.billingCycleStartDate === "string" &&
  body.billingCycleStartDate.trim().length > 0;

if (billingCycleOnlyUpdate) {
  const existing = await prisma.property.findUnique({
    where: { id },
    select: {
      id: true,
      billingCycleStartDate: true,
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Property not found." },
      { status: 404 }
    );
  }

    if (existing.billingCycleStartDate) {
    return NextResponse.json(
      {
        error:
          "Billing cycle start date has already been locked and cannot be changed.",
      },
      { status: 409 }
    );
  }

  if (!billingCycleStartDate || Number.isNaN(billingCycleStartDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid billing cycle start date." },
      { status: 400 }
    );
  }

  const property = await prisma.property.update({
    where: { id },
    data: {
      billingCycleStartDate,
    },
  });

  return NextResponse.json({
    ok: true,
    property: {
      id: property.id,
      name: property.name,
      billingCycleStartDate: property.billingCycleStartDate,
    },
  });
}

if (!billingCycleOnlyUpdate && !name) {
  return NextResponse.json(
    { error: "Property name is required." },
    { status: 400 }
  );
}

if (!billingCycleOnlyUpdate && !address) {
  return NextResponse.json(
    { error: "Property address is required." },
    { status: 400 }
  );
}

if (
  !billingCycleOnlyUpdate &&
  (!Number.isInteger(rentDueDay) || rentDueDay < 1 || rentDueDay > 31)
) {
  return NextResponse.json(
    { error: "Rent due day must be 1–31." },
    { status: 400 }
  );
}

if (
  !billingCycleOnlyUpdate &&
  (
    !Number.isInteger(gracePeriodDays) ||
    gracePeriodDays < 0 ||
    gracePeriodDays > 31
  )
) {
  return NextResponse.json(
    { error: "Grace period must be 0–31." },
    { status: 400 }
  );
}

  
   const existing = await prisma.property.findUnique({
  where: { id },
  select: {
    id: true,
    billingCycleStartDate: true,
    settings: { select: { id: true } },
  },
});

    if (!existing) {
      return NextResponse.json(
        { error: "Property not found." },
        { status: 404 }
      );
    }

    const hasLedgerActivity = await prisma.ledgerEntry.findFirst({
  where: {
    propertyId: id,
  },
  select: { id: true },
});

const currentStartTime = existing.billingCycleStartDate
  ? new Date(existing.billingCycleStartDate).getTime()
  : null;

const requestedStartTime = billingCycleStartDate
  ? new Date(billingCycleStartDate).getTime()
  : null;

const isChangingBillingCycleStartDate =
  currentStartTime !== null &&
  requestedStartTime !== null &&
  currentStartTime !== requestedStartTime;

    const updated = await prisma.$transaction(
  async (tx: Prisma.TransactionClient) => {
    const property = await tx.property.update({
      where: { id },
      data: {
        ...(billingCycleOnlyUpdate
          ? {}
          : {
              name,
              addressLine1: address,
              propertyType,
              isActive,
            }),
        ...(billingCycleStartDate !== undefined
          ? { billingCycleStartDate }
          : {}),
      },
    });

    const settings = billingCycleOnlyUpdate
      ? existing.settings
        ? await tx.propertySettings.findUnique({
            where: { propertyId: id },
          })
        : null
      : existing.settings
        ? await tx.propertySettings.update({
            where: { propertyId: id },
            data: {
              rentDueDay,
              gracePeriodDays,
              lateFeeEnabled,
              lateFeeFlatCents,
              convenienceFeeEnabled,
              convenienceFeeAmountCents,
            },
          })
        : await tx.propertySettings.create({
            data: {
              propertyId: id,
              rentDueDay,
              gracePeriodDays,
              lateFeeEnabled,
              lateFeeFlatCents,
              convenienceFeeEnabled,
              convenienceFeeAmountCents,
            },
          });

    return { property, settings };
  }
);

    return NextResponse.json({
      ok: true,
      property: {
        id: updated.property.id,
        name: updated.property.name,
      },
      settings: updated.settings,
    });
  } catch (error: unknown) {
    if (isPrismaKnownError(error)) {
      console.error("PATCH property prisma error", error);
    } else {
      console.error("PATCH property failed", error);
    }

    return NextResponse.json(
      { error: "Failed to update property." },
      { status: 500 }
    );
  }
}