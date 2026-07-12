import bcrypt from "bcryptjs";
import { hashPin } from "../lib/pin";
import { PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { runMonthlyRentJob } from "../jobs/monthlyRent";
import { runLateFeesJob } from "../jobs/lateFees";
import { getUnitFinancialState } from "../lib/unitFinancialState";

const PROPERTY_CODE = "9917";
const OWNER_EMAIL = "owner@test.local";
const OWNER_PASSWORD = "test1234";
const TENANT_PIN = "1234";

const billingStart = new Date("2026-06-17T00:00:00");
const oldDueDate = new Date("2026-06-17T00:00:00");
const nextDueDate = new Date("2026-07-17T00:00:00");
const afterNextDueDate = new Date("2026-07-18T00:00:00");

const oldCycle = "2026-06";
const nextCycle = "2026-07";

type CreatedUnit = {
  unitId: string;
  assignmentId: string | null;
  unitNumber: string;
};

const failures: string[] = [];

function pass(name: string): void {
  console.log(`PASS  ${name}`);
}

function fail(name: string, detail?: string): void {
  const message = detail ? `${name} — ${detail}` : name;
  failures.push(message);
  console.log(`FAIL  ${message}`);
}

function expect(name: string, condition: boolean, detail?: string): void {
  if (condition) pass(name);
  else fail(name, detail);
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function resetExistingTestProperty(): Promise<void> {
  const existing = await prisma.property.findUnique({
    where: { propertyCode: PROPERTY_CODE },
    select: { id: true },
  });

  if (!existing) return;

  await prisma.property.delete({
    where: { id: existing.id },
  });
}

async function createPaymentWithLedger(input: {
  propertyId: string;
  unitId: string;
  tenantAssignmentId: string;
  billingCycle: string;
  amountCents: number;
  processingFeeCents?: number;
  status: PaymentStatus;
  method: "ACH" | "MANUAL";
  intentSuffix: string;
  effectiveDate: Date;
}) {
  const unique = `${input.intentSuffix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;

  const payment = await prisma.payment.create({
    data: {
      propertyId: input.propertyId,
      unitId: input.unitId,
      tenantAssignmentId: input.tenantAssignmentId,
      billingCycle: input.billingCycle,
      amountCents: input.amountCents,
      processingFeeCents: input.processingFeeCents ?? 0,
      status: input.status,
      paymentMethod: input.method,
      stripePaymentIntentId: `test_${unique}`,
      stripeSessionId: `test_session_${unique}`,
      paidAt: input.status === PaymentStatus.PAID ? input.effectiveDate : null,
      failedAt:
        input.status === PaymentStatus.FAILED ? input.effectiveDate : null,
      reversedAt:
        input.status === PaymentStatus.REVERSED ? input.effectiveDate : null,
    },
  });

  if (input.processingFeeCents && input.status === PaymentStatus.PAID) {
    await prisma.ledgerEntry.create({
      data: {
        propertyId: input.propertyId,
        unitId: input.unitId,
        tenantAssignmentId: input.tenantAssignmentId,
        paymentId: payment.id,
        billingCycle: input.billingCycle,
        entryType: "CHARGE",
        chargeType: "PROCESSING_FEE",
        amountCents: input.processingFeeCents,
        effectiveDate: input.effectiveDate,
        memo: "Processing fee",
        referenceNumber: `${payment.stripePaymentIntentId}:fee`,
      },
    });
  }

  if (input.status === PaymentStatus.PAID) {
    await prisma.ledgerEntry.create({
      data: {
        propertyId: input.propertyId,
        unitId: input.unitId,
        tenantAssignmentId: input.tenantAssignmentId,
        paymentId: payment.id,
        billingCycle: input.billingCycle,
        entryType: "PAYMENT",
        paymentMethod: input.method,
        amountCents: -(input.amountCents + (input.processingFeeCents ?? 0)),
        effectiveDate: input.effectiveDate,
        memo: `${input.method} payment`,
        referenceNumber: payment.stripePaymentIntentId,
      },
    });
  }

  return payment;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run QA suite in production.");
  }

  console.log("=====================================================");
  console.log("RentFray QA Suite v1");
  console.log("=====================================================\n");

  await resetExistingTestProperty();

  const property = await prisma.property.create({
    data: {
      name: "Cycle Rollover Test Property",
      propertyCode: PROPERTY_CODE,
      status: "LIVE",
      addressLine1: "123 Test Street",
      propertyType: "OTHER",
      unitCount: 10,
      isActive: true,
      billingCycleStartDate: billingStart,
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

  pass("Created test property");

  const tier = await prisma.propertyTier.create({
    data: {
      propertyId: property.id,
      name: "Test Tier",
      baseRentCents: 100,
      unitCount: 10,
      activeUnitCount: 10,
      rentDueDay: 17,
      gracePeriodDays: 0,
      lateFeeInitialCents: 50,
      lateFeeDailyCents: 25,
      maxLateFeeDays: 3,
      isActive: true,
      sortOrder: 1,
    },
  });

  pass("Created test tier");

  await prisma.managementUser.create({
    data: {
      propertyId: property.id,
      role: "OWNER",
      username: OWNER_EMAIL,
      email: OWNER_EMAIL,
      displayName: "Test Owner",
      passwordHash: await bcrypt.hash(OWNER_PASSWORD, 10),
      isActive: true,
    },
  });

  pass("Created owner login");

  const createdUnits: CreatedUnit[] = [];

  for (let i = 1; i <= 10; i++) {
    const isVacant = i === 10;

    const unit = await prisma.unit.create({
      data: {
        propertyId: property.id,
        tierId: tier.id,
        unitNumber: String(i).padStart(3, "0"),
        baseRentCents: 100,
        isActive: true,
        portalActivated: !isVacant,
        portalFirstName: !isVacant ? `Tenant${i}` : null,
        portalLastName: !isVacant ? "Test" : null,
        tenantPinHash: !isVacant ? await hashPin(TENANT_PIN) : null,
        activationSource: !isVacant ? "TEST" : null,
        activatedAt: !isVacant ? oldDueDate : null,
      },
    });

    let assignmentId: string | null = null;

    if (!isVacant) {
      const assignment = await prisma.tenantAssignment.create({
        data: {
          propertyId: property.id,
          unitId: unit.id,
          firstName: `Tenant${i}`,
          lastName: "Test",
          email: `tenant${i}@test.local`,
          moveInDate:
            i === 6
              ? new Date("2026-06-18T00:00:00")
              : new Date("2026-06-01T00:00:00"),
          isCurrent: true,
        },
      });

      assignmentId = assignment.id;
    }

    createdUnits.push({
      unitId: unit.id,
      assignmentId,
      unitNumber: unit.unitNumber,
    });
  }

  expect("Created 10 units", createdUnits.length === 10);
  expect(
    "Created 9 tenant logins",
    createdUnits.filter((unit) => unit.assignmentId).length === 9
  );

  for (const item of createdUnits) {
    if (!item.assignmentId) continue;

    if (item.unitNumber === "006") {
      continue;
    }

    await prisma.ledgerEntry.create({
      data: {
        propertyId: property.id,
        unitId: item.unitId,
        tenantAssignmentId: item.assignmentId,
        billingCycle: oldCycle,
        entryType: "CHARGE",
        chargeType: "RENT",
        amountCents: 100,
        effectiveDate: oldDueDate,
        memo: "June rent",
      },
    });
  }

  pass("Seeded June rent charges, excluding move-in-after-due unit");

  const u = createdUnits;

  await createPaymentWithLedger({
    propertyId: property.id,
    unitId: u[0].unitId,
    tenantAssignmentId: u[0].assignmentId!,
    billingCycle: oldCycle,
    amountCents: 100,
    processingFeeCents: 295,
    status: PaymentStatus.PAID,
    method: "ACH",
    intentSuffix: "unit001_paid",
    effectiveDate: oldDueDate,
  });

  await createPaymentWithLedger({
    propertyId: property.id,
    unitId: u[1].unitId,
    tenantAssignmentId: u[1].assignmentId!,
    billingCycle: oldCycle,
    amountCents: 100,
    processingFeeCents: 295,
    status: PaymentStatus.PENDING,
    method: "ACH",
    intentSuffix: "unit002_pending",
    effectiveDate: oldDueDate,
  });

  await createPaymentWithLedger({
    propertyId: property.id,
    unitId: u[2].unitId,
    tenantAssignmentId: u[2].assignmentId!,
    billingCycle: oldCycle,
    amountCents: 100,
    status: PaymentStatus.FAILED,
    method: "ACH",
    intentSuffix: "unit003_failed",
    effectiveDate: oldDueDate,
  });

  await prisma.ledgerEntry.create({
    data: {
      propertyId: property.id,
      unitId: u[4].unitId,
      tenantAssignmentId: u[4].assignmentId!,
      billingCycle: oldCycle,
      entryType: "CHARGE",
      chargeType: "LATE_FEE_INITIAL",
      amountCents: 50,
      effectiveDate: new Date("2026-06-18T00:00:00"),
      memo: "Initial late fee - 2026-06",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      propertyId: property.id,
      unitId: u[4].unitId,
      tenantAssignmentId: u[4].assignmentId!,
      billingCycle: oldCycle,
      entryType: "CHARGE",
      chargeType: "LATE_FEE_DAILY",
      amountCents: 25,
      effectiveDate: new Date("2026-06-19T00:00:00"),
      memo: "Daily late fee - 2026-06-19",
    },
  });

  await createPaymentWithLedger({
    propertyId: property.id,
    unitId: u[6].unitId,
    tenantAssignmentId: u[6].assignmentId!,
    billingCycle: oldCycle,
    amountCents: 50,
    status: PaymentStatus.PAID,
    method: "MANUAL",
    intentSuffix: "unit007_partial_manual",
    effectiveDate: oldDueDate,
  });

  await createPaymentWithLedger({
    propertyId: property.id,
    unitId: u[7].unitId,
    tenantAssignmentId: u[7].assignmentId!,
    billingCycle: oldCycle,
    amountCents: 100,
    processingFeeCents: 295,
    status: PaymentStatus.PAID,
    method: "ACH",
    intentSuffix: "unit008_paid_fee",
    effectiveDate: oldDueDate,
  });

  await createPaymentWithLedger({
    propertyId: property.id,
    unitId: u[8].unitId,
    tenantAssignmentId: u[8].assignmentId!,
    billingCycle: oldCycle,
    amountCents: 100,
    processingFeeCents: 295,
    status: PaymentStatus.PENDING,
    method: "ACH",
    intentSuffix: "unit009_old_pending_rollover",
    effectiveDate: oldDueDate,
  });

  pass("Seeded mixed payment states");

  const monthlyResult = await runMonthlyRentJob(nextDueDate);

  expect(
    "Monthly rent job created July rent for 9 occupied units",
    monthlyResult.rentChargesCreated === 9,
    `created ${monthlyResult.rentChargesCreated}`
  );

  const julyRentCount = await prisma.ledgerEntry.count({
    where: {
      propertyId: property.id,
      billingCycle: nextCycle,
      entryType: "CHARGE",
      chargeType: "RENT",
      voidedAt: null,
    },
  });

  expect("July rent ledger count is 9", julyRentCount === 9, `${julyRentCount}`);

  const unit006JuneRent = await prisma.ledgerEntry.count({
    where: {
      propertyId: property.id,
      unitId: u[5].unitId,
      billingCycle: oldCycle,
      entryType: "CHARGE",
      chargeType: "RENT",
      voidedAt: null,
    },
  });

  expect(
    "Move-in-after-due unit has no June rent",
    unit006JuneRent === 0,
    `${unit006JuneRent}`
  );

  const unit006JulyRent = await prisma.ledgerEntry.count({
    where: {
      propertyId: property.id,
      unitId: u[5].unitId,
      billingCycle: nextCycle,
      entryType: "CHARGE",
      chargeType: "RENT",
      voidedAt: null,
    },
  });

  expect(
    "Move-in-after-due unit receives July rent",
    unit006JulyRent === 1,
    `${unit006JulyRent}`
  );

  const lateFeeResult = await runLateFeesJob(afterNextDueDate);

  expect(
    "Late fee job ran",
    lateFeeResult.ok === true,
    JSON.stringify(lateFeeResult)
  );

  console.log("\nUnit state after simulated July cycle:");
  for (const item of createdUnits) {
    if (!item.assignmentId) {
      console.log(`Unit ${item.unitNumber}: VACANT`);
      continue;
    }

    const state = await getUnitFinancialState({
      propertyId: property.id,
      unitId: item.unitId,
      tenantAssignmentId: item.assignmentId,
      tier,
      propertySettings: {
        rentDueDay: 17,
        gracePeriodDays: 0,
        lateFeeEnabled: true,
        lateFeeFlatCents: 50,
      },
      billingCycleStartDate: billingStart,
      now: afterNextDueDate,
    });

    console.log(
      `Unit ${item.unitNumber}: ${state.status.label} | ${state.status.color} | balance ${dollars(
        state.ledgerBalanceCents
      )} | cycle ${state.billingCycle} | pending ${state.hasPendingPayment}`
    );

    if (item.unitNumber === "002") {
      expect(
        "Unit 002 old pending ACH remains pending after rollover",
        state.hasPendingPayment && state.status.color === "yellow"
      );
    }

    if (item.unitNumber === "009") {
      expect(
        "Unit 009 old pending ACH remains pending after rollover",
        state.hasPendingPayment && state.status.color === "yellow"
      );
    }

    if (item.unitNumber === "006") {
      expect(
        "Unit 006 owes July after skipped June move-in",
        state.ledgerBalanceCents > 0 && state.billingCycle === nextCycle
      );
    }
  }

  const processingFeeCount = await prisma.ledgerEntry.count({
    where: {
      propertyId: property.id,
      chargeType: "PROCESSING_FEE",
      voidedAt: null,
    },
  });

  expect(
    "Processing fee ledger entries exist for paid ACH payments",
    processingFeeCount === 2,
    `${processingFeeCount}`
  );

  const julyProcessingFeeCount = await prisma.ledgerEntry.count({
    where: {
      propertyId: property.id,
      billingCycle: nextCycle,
      chargeType: "PROCESSING_FEE",
      voidedAt: null,
    },
  });

  expect(
    "No July processing fees are created by rollover",
    julyProcessingFeeCount === 0,
    `${julyProcessingFeeCount}`
  );

  console.log("\nManager login:");
  console.log(`Property code: ${PROPERTY_CODE}`);
  console.log(`Email: ${OWNER_EMAIL}`);
  console.log(`Password: ${OWNER_PASSWORD}`);

  console.log("\nTenant logins:");
  for (const item of createdUnits) {
    if (!item.assignmentId) continue;
    console.log(`Property ${PROPERTY_CODE} | Unit ${item.unitNumber} | PIN ${TENANT_PIN}`);
  }

  console.log("\n=====================================================");
  if (failures.length === 0) {
    console.log("OVERALL RESULT: PASS");
  } else {
    console.log("OVERALL RESULT: FAIL");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    process.exitCode = 1;
  }
  console.log("=====================================================");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });