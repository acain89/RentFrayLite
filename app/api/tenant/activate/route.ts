import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/pin";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { canActivateTier, canActivateUnit } from "@/lib/propertyCapacity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActivateBody = {
propertyCode: string;
firstName: string;
lastName: string;
unitNumber: string;
confirmUnitNumber: string;
tierId: string;
pin: string;
confirmPin: string;
recentMoveIn: boolean | null;
moveInDate: string | null;
};

function clean(value: unknown): string {
return String(value ?? "").trim();
}

export async function POST(req: Request) {
try {
const body = (await req.json()) as Partial<ActivateBody>;


const propertyCode = clean(body.propertyCode);
const firstName = clean(body.firstName);
const lastName = clean(body.lastName);
const unitNumber = clean(body.unitNumber).toUpperCase();
const confirmUnitNumber = clean(body.confirmUnitNumber).toUpperCase();
const tierId = clean(body.tierId);
const pin = clean(body.pin);
const confirmPin = clean(body.confirmPin);

const recentMoveIn = body.recentMoveIn;
const moveInDateRaw = clean(body.moveInDate);
const moveInDate = moveInDateRaw
  ? new Date(moveInDateRaw + "T00:00:00")
  : null;

// ---------------- VALIDATION ----------------

if (!/^\d{4,5}$/.test(propertyCode)) {
  return NextResponse.json({ error: "Invalid property code." }, { status: 400 });
}

if (!firstName) {
  return NextResponse.json({ error: "First name required." }, { status: 400 });
}

if (!lastName) {
  return NextResponse.json({ error: "Last name required." }, { status: 400 });
}

if (!unitNumber) {
  return NextResponse.json({ error: "Unit number required." }, { status: 400 });
}

if (unitNumber !== confirmUnitNumber) {
  return NextResponse.json({ error: "Unit numbers do not match." }, { status: 400 });
}

if (!tierId) {
  return NextResponse.json({ error: "Tier selection required." }, { status: 400 });
}

if (!/^\d{4}$/.test(pin)) {
  return NextResponse.json({ error: "PIN must be 4 digits." }, { status: 400 });
}

if (pin !== confirmPin) {
  return NextResponse.json({ error: "PINs do not match." }, { status: 400 });
}

if (typeof recentMoveIn !== "boolean") {
  return NextResponse.json({ error: "Move-in question required." }, { status: 400 });
}

if (recentMoveIn && !moveInDate) {
  return NextResponse.json({ error: "Move-in date required." }, { status: 400 });
}

if (moveInDate && Number.isNaN(moveInDate.getTime())) {
  return NextResponse.json({ error: "Invalid move-in date." }, { status: 400 });
}

// ---------------- PROPERTY ----------------

const property = await prisma.property.findUnique({
  where: { propertyCode },
  select: {
    id: true,
    isActive: true,
    tiers: {
      where: { id: tierId, isActive: true },
      select: {
        id: true,
        baseRentCents: true,
        rentDueDay: true,
        lateFeeInitialCents: true,
        lateFeeDailyCents: true,
        maxLateFeeDays: true,
        gracePeriodDays: true,
      },
    },
  },
});

if (!property || !property.isActive) {
  return NextResponse.json({ error: "Property not available." }, { status: 403 });
}

const selectedTier = property.tiers[0];
if (!selectedTier) {
  return NextResponse.json({ error: "Invalid tier selection." }, { status: 400 });
}

// ---------------- UNIT ----------------

const existingUnit = await prisma.unit.findUnique({
  where: {
    propertyId_unitNumber: {
      propertyId: property.id,
      unitNumber,
    },
  },
  select: {
    id: true,
    isActive: true,
    portalActivated: true,
  },
});

if (existingUnit && !existingUnit.isActive) {
  return NextResponse.json({ error: "This unit is inactive." }, { status: 400 });
}

if (existingUnit?.portalActivated) {
  return NextResponse.json(
    { error: "This unit has already been activated." },
    { status: 400 }
  );
}

if (!existingUnit) {
  const canActivate = await canActivateUnit(property.id);
  if (!canActivate) {
    return NextResponse.json(
      { error: "Property is at full capacity." },
      { status: 409 }
    );
  }
}

const canActivateSelectedTier = await canActivateTier(property.id, selectedTier.id);

if (!canActivateSelectedTier) {
  return NextResponse.json(
    { error: "This rent tier is full. Contact management for help." },
    { status: 409 }
  );
}

const pinHash = await hashPin(pin);
const activatedAt = new Date();

const savedUnit = existingUnit
  ? await prisma.unit.update({
      where: { id: existingUnit.id },
      data: {
        tierId: selectedTier.id,
        portalActivated: true,
        portalFirstName: firstName,
        portalLastName: lastName,
        tenantPinHash: pinHash,
        activatedAt,
        activationSource: "SELF_SERVICE",
      },
    })
  : await prisma.unit.create({
      data: {
        propertyId: property.id,
        unitNumber,
        tierId: selectedTier.id,
        isActive: true,
        portalActivated: true,
        portalFirstName: firstName,
        portalLastName: lastName,
        tenantPinHash: pinHash,
        activatedAt,
        activationSource: "SELF_SERVICE",
      },
    });


// ---------------- TENANT ----------------

const tenantAssignment = await prisma.tenantAssignment.create({
  data: {
    propertyId: property.id,
    unitId: savedUnit.id,
    firstName,
    lastName,
    isCurrent: true,
    moveInDate: moveInDate ?? activatedAt,
  },
});

// ---------------- RENT LOGIC ----------------

const { getRentDateSummary, resolveEffectiveBillingSettings } =
  await import("@/lib/rentDates");

const propertyWithSettings = await prisma.property.findUnique({
  where: { id: property.id },
  include: { settings: true },
});

if (!propertyWithSettings) {
  throw new Error("Property settings could not be loaded.");
}

const effective = resolveEffectiveBillingSettings({
  tier: selectedTier,
  propertySettings: propertyWithSettings.settings ?? null,
});

const now = new Date();

const rentDates = getRentDateSummary({
  ...effective,
  now,
  billingCycleStartDate: propertyWithSettings.billingCycleStartDate,
});

const billingCycle = rentDates.billingCycle;
const dueDate = new Date(`${rentDates.dueDate}T00:00:00`);

let shouldPostRent = true;

// RENTFRAY MOVE-IN RULES:
// No = owes current cycle.
// Yes + move-in on/before current cycle due date = owes current cycle.
// Yes + move-in after current cycle due date = first bill next cycle.
if (recentMoveIn === true && moveInDate) {
  shouldPostRent = moveInDate <= dueDate;
}

if (shouldPostRent) {
  const existingRentCharge = await prisma.ledgerEntry.findFirst({
    where: {
      propertyId: property.id,
      unitId: savedUnit.id,
      tenantAssignmentId: tenantAssignment.id,
      billingCycle,
      entryType: "CHARGE",
      chargeType: "RENT",
      voidedAt: null,
    },
    select: { id: true },
  });

  if (!existingRentCharge) {
    await prisma.ledgerEntry.create({
      data: {
        propertyId: property.id,
        unitId: savedUnit.id,
        tenantAssignmentId: tenantAssignment.id,
        entryType: "CHARGE",
        chargeType: "RENT",
        amountCents: selectedTier.baseRentCents,
        effectiveDate: dueDate,
        billingCycle,
        memo: "Base Rent",
      },
    });
  }
}

// ---------------- SESSION ----------------

const token = createSessionToken({
  role: "TENANT",
  propertyId: property.id,
  unitId: savedUnit.id,
});

await setSessionCookie(token);

return NextResponse.json({
  ok: true,
  role: "TENANT",
  propertyId: property.id,
  unitId: savedUnit.id,
});

} catch (error) {
console.error("Activation failed", error);
return NextResponse.json({ error: "Activation failed." }, { status: 500 });
}
}
