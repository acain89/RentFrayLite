import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { runMonthlyRentJob } from "../jobs/monthlyRent";

const prisma = new PrismaClient();

const QA_PROPERTY_CODE = "9920";

const OWNER_EMAIL = "qa-owner@test.local";
const OWNER_PASSWORD = "test1234";
const TENANT_PIN = "1234";

const BILLING_START_DATE = new Date("2026-01-17T00:00:00");
const BASE_RENT_CENTS = 100;

type QaResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

const results: QaResult[] = [];

function pass(name: string, detail?: string): void {
  results.push({ name, passed: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string): void {
  results.push({ name, passed: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function expect(name: string, condition: boolean, detail?: string): void {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

async function resetQaProperty(): Promise<void> {
  const existing = await prisma.property.findUnique({
    where: { propertyCode: QA_PROPERTY_CODE },
    select: { id: true },
  });

  if (!existing) return;

  await prisma.property.delete({
    where: { id: existing.id },
  });

  pass("Reset previous QA property");
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run financial regression in production.");
  }

  console.log("=====================================================");
  console.log("RentFray Financial Regression Suite");
  console.log("=====================================================");

  await resetQaProperty();

const qa = await createQaProperty();

const unitCount = await prisma.unit.count({
  where: { propertyId: qa.propertyId },
});

const assignmentCount = await prisma.tenantAssignment.count({
  where: { propertyId: qa.propertyId, isCurrent: true },
});

expect("QA property has 20 units", unitCount === 20, `found ${unitCount}`);
expect(
  "QA property has 20 current tenant assignments",
  assignmentCount === 20,
  `found ${assignmentCount}`
);

console.log("\nManager login:");
console.log(`Property code: ${QA_PROPERTY_CODE}`);
console.log(`Email: ${OWNER_EMAIL}`);
console.log(`Password: ${OWNER_PASSWORD}`);

console.log("\nTenant login pattern:");
console.log(`Property code: ${QA_PROPERTY_CODE}`);
console.log("Unit: 101 through 120");
console.log(`PIN: ${TENANT_PIN}`);

await runTwelveMonthlyRentCycles(qa.propertyId);

  console.log("\n=====================================================");
  const failed = results.filter((result) => !result.passed);

  if (failed.length === 0) {
    console.log("OVERALL RESULT: PASS");
  } else {
    console.log("OVERALL RESULT: FAIL");
    for (const item of failed) {
      console.log(`- ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
    }
    process.exitCode = 1;
  }

  console.log("=====================================================");
}

async function createQaProperty(): Promise<{
  propertyId: string;
  tierId: string;
}> {
  const property = await prisma.property.create({
    data: {
      name: "Financial Regression QA Property",
      propertyCode: QA_PROPERTY_CODE,
      status: "LIVE",
      addressLine1: "9920 QA Test Drive",
      propertyType: "OTHER",
      unitCount: 20,
      isActive: true,
      billingCycleStartDate: BILLING_START_DATE,
      settings: {
        create: {
          rentDueDay: 17,
          gracePeriodDays: 0,
          lateFeeEnabled: true,
          lateFeeFlatCents: 50,
          convenienceFeeEnabled: false,
          tenantPortalEnabled: true,
          maintenancePortalEnabled: true,
          onboardingComplete: true,
          setupComplete: true,
        },
      },
      paymentStatus: {
        create: {
          processorConnected: true,
          bankConnected: true,
          chargesEnabled: true,
          payoutsEnabled: true,
          onboardingComplete: true,
          requirementsDue: false,
          readyForLive: true,
          lastSyncedAt: new Date(),
        },
      },
    },
  });

  const tier = await prisma.propertyTier.create({
    data: {
      propertyId: property.id,
      name: "QA Tier",
      baseRentCents: BASE_RENT_CENTS,
      unitCount: 20,
      activeUnitCount: 20,
      rentDueDay: 17,
      gracePeriodDays: 0,
      lateFeeInitialCents: 50,
      lateFeeDailyCents: 25,
      maxLateFeeDays: 3,
      isActive: true,
      sortOrder: 1,
    },
  });

  await prisma.managementUser.create({
    data: {
      propertyId: property.id,
      role: "OWNER",
      username: OWNER_EMAIL,
      email: OWNER_EMAIL,
      displayName: "QA Owner",
      passwordHash: await bcrypt.hash(OWNER_PASSWORD, 10),
      isActive: true,
    },
  });

  for (let i = 1; i <= 20; i++) {
    const unitNumber = String(100 + i);

    const unit = await prisma.unit.create({
      data: {
        propertyId: property.id,
        tierId: tier.id,
        unitNumber,
        baseRentCents: BASE_RENT_CENTS,
        isActive: true,
        portalActivated: true,
        portalFirstName: `Tenant${unitNumber}`,
        portalLastName: "QA",
        tenantPinHash: await bcrypt.hash(TENANT_PIN, 10),
        activationSource: "QA",
        activatedAt: BILLING_START_DATE,
      },
    });

    await prisma.tenantAssignment.create({
      data: {
        propertyId: property.id,
        unitId: unit.id,
        firstName: `Tenant${unitNumber}`,
        lastName: "QA",
        email: `tenant${unitNumber}@test.local`,
        moveInDate: BILLING_START_DATE,
        isCurrent: true,
      },
    });
  }

  pass("Created QA property");
  pass("Created QA owner login");
  pass("Created 20 QA units");
  pass("Created 20 tenant assignments");

  return {
    propertyId: property.id,
    tierId: tier.id,
  };
}

function makeDueDate(year: number, monthIndexZeroBased: number): Date {
  return new Date(year, monthIndexZeroBased, 17, 0, 0, 0, 0);
}

async function runTwelveMonthlyRentCycles(propertyId: string): Promise<void> {
  const dueDates = [
    makeDueDate(2026, 0),
    makeDueDate(2026, 1),
    makeDueDate(2026, 2),
    makeDueDate(2026, 3),
    makeDueDate(2026, 4),
    makeDueDate(2026, 5),
    makeDueDate(2026, 6),
    makeDueDate(2026, 7),
    makeDueDate(2026, 8),
    makeDueDate(2026, 9),
    makeDueDate(2026, 10),
    makeDueDate(2026, 11),
  ];

  for (const dueDate of dueDates) {
  const result = await runMonthlyRentJob(dueDate);

const cycleKey = `${dueDate.getFullYear()}-${String(
  dueDate.getMonth() + 1
).padStart(2, "0")}`;

const rentCountForCycle = await prisma.ledgerEntry.count({
  where: {
    propertyId,
    billingCycle: cycleKey,
    entryType: "CHARGE",
    chargeType: "RENT",
    voidedAt: null,
  },
});

expect(
  `Cycle ${cycleKey} has exactly 20 rent charges`,
  rentCountForCycle === 20,
  `rent charges ${rentCountForCycle}, job created rent ${result.rentChargesCreated}, recurring ${result.recurringFeeChargesCreated}`
);
  }

  const rentChargeCount = await prisma.ledgerEntry.count({
    where: {
      propertyId,
      entryType: "CHARGE",
      chargeType: "RENT",
      voidedAt: null,
    },
  });

  expect(
    "Twelve cycles created exactly 240 rent charges",
    rentChargeCount === 240,
    `found ${rentChargeCount}`
  );

  const duplicateGroups = await prisma.ledgerEntry.groupBy({
    by: ["unitId", "billingCycle", "chargeType"],
    where: {
      propertyId,
      entryType: "CHARGE",
      chargeType: "RENT",
      voidedAt: null,
    },
    _count: {
      id: true,
    },
    having: {
      id: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  expect(
    "No duplicate rent charges per unit/cycle",
    duplicateGroups.length === 0,
    `duplicates ${duplicateGroups.length}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });