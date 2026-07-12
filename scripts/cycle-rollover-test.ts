import bcrypt from "bcryptjs";
import { PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { runMonthlyRentJob } from "../jobs/monthlyRent";
import { runLateFeesJob } from "../jobs/lateFees";
import { getUnitFinancialState } from "../lib/unitFinancialState";

const PROPERTY_CODE = "9917";
const OWNER_USERNAME = "owner@test.local";
const OWNER_EMAIL = "owner@test.local";
const OWNER_PASSWORD = "test1234";

const TENANT_PIN = "1234";

const billingStart = new Date("2026-06-17T00:00:00");
const oldDueDate = new Date("2026-06-17T00:00:00");
const nextDueDate = new Date("2026-07-17T00:00:00");

const oldCycle = "2026-06";
const nextCycle = "2026-07";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function resetExistingTestProperty() {
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
      stripePaymentIntentId: `test_${input.intentSuffix}_${Date.now()}`,
      stripeSessionId: `test_session_${input.intentSuffix}_${Date.now()}`,
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
        amountCents: -(
          input.amountCents + (input.processingFeeCents ?? 0)
        ),
        effectiveDate: input.effectiveDate,
        memo: `${input.method} payment`,
        referenceNumber: payment.stripePaymentIntentId,
      },
    });
  }

  return payment;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run cycle rollover test in production.");
  }

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

  await prisma.managementUser.create({
    data: {
      propertyId: property.id,
      role: "OWNER",
      username: OWNER_USERNAME,
      email: OWNER_EMAIL,
      displayName: "Test Owner",
      passwordHash: await bcrypt.hash(OWNER_PASSWORD, 10),
      isActive: true,
    },
  });

  const createdUnits: {
    unitId: string;
    assignmentId: string | null;
    unitNumber: string;
  }[] = [];

  for (let i = 1; i <= 10; i++) {
    const unit = await prisma.unit.create({
      data: {
        propertyId: property.id,
        tierId: tier.id,
        unitNumber: String(i).padStart(3, "0"),
        baseRentCents: 100,
        isActive: true,
        portalActivated: i !== 10,
        portalFirstName: i !== 10 ? `Tenant${i}` : null,
        portalLastName: i !== 10 ? "Test" : null,
        tenantPinHash:
  i !== 10
    ? await bcrypt.hash(TENANT_PIN, 10)
    : null,
        activationSource: i !== 10 ? "TEST" : null,
        activatedAt: i !== 10 ? oldDueDate : null,
      },
    });

    let assignmentId: string | null = null;

    if (i !== 10) {
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

  for (const item of createdUnits) {
    if (!item.assignmentId) continue;

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

  console.log("Seeded test property.");
  console.log(`Property code: ${PROPERTY_CODE}`);
  console.log(`Owner login: ${OWNER_USERNAME}`);
  console.log(`Owner password: ${OWNER_PASSWORD}`);

  const monthlyResult = await runMonthlyRentJob(nextDueDate);
  const lateFeeResult = await runLateFeesJob(new Date("2026-07-18T00:00:00"));

  console.log("Monthly rent rollover result:", monthlyResult);
  console.log("Late fee rollover result:", lateFeeResult);

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
      now: new Date("2026-07-18T00:00:00"),
    });

    console.log(
      `Unit ${item.unitNumber}: ${state.status.label} | ${state.status.color} | balance ${dollars(
        state.ledgerBalanceCents
      )} | cycle ${state.billingCycle} | pending ${state.hasPendingPayment}`
    );
  }

  console.log("\nManager login:");
console.log(`Property code: ${PROPERTY_CODE}`);
console.log(`Email: ${OWNER_USERNAME}`);
console.log(`Password: ${OWNER_PASSWORD}`);

console.log("\nTenant logins:");
for (const item of createdUnits) {
  if (!item.assignmentId) continue;
  console.log(`Unit ${item.unitNumber} | PIN: ${TENANT_PIN}`);
}

  console.log("\nDone.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

