import { PrismaClient, PaymentStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hashPin } from "../lib/pin";

const prisma = new PrismaClient();

const PROPERTY_CODE = "9200";
const PROPERTY_NAME = "Scale Test 200 Units";
const UNIT_COUNT = 200;
const TENANT_PIN = "3889";

const OWNER_USERNAME = "scale-owner";
const OWNER_EMAIL = "scale-owner@rentfray.test";
const OWNER_PASSWORD = "1234567?";

const BASE_RENT_CENTS = 100000;
const TRASH_FEE_CENTS = 2500;
const WATER_FEE_CENTS = 3500;

const BILLING_CYCLE = "2026-05";
const DUE_DATE = new Date("2026-05-01T12:00:00.000Z");
const PAID_DATE = new Date("2026-05-02T12:00:00.000Z");

function unitNumber(index: number): string {
  return String(index).padStart(3, "0");
}

function statusForUnit(index: number): PaymentStatus | "GRACE" | "PAST_DUE" {
  const mod = index % 5;

  if (mod === 0) return PaymentStatus.PAID;
  if (mod === 1) return PaymentStatus.PENDING;
  if (mod === 2) return PaymentStatus.FAILED;
  if (mod === 3) return "GRACE";
  return "PAST_DUE";
}

async function main() {
  console.log("Seeding scale-test property...");

  const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 10);
  const tenantPinHash = hashPin(TENANT_PIN);

  const existing = await prisma.property.findUnique({
    where: { propertyCode: PROPERTY_CODE },
    select: { id: true },
  });

  if (existing) {
    console.log("Existing scale-test property found. Deleting old copy...");
    await prisma.property.delete({
      where: { id: existing.id },
    });
  }

  const property = await prisma.property.create({
    data: {
      name: PROPERTY_NAME,
      propertyCode: PROPERTY_CODE,
      status: "READY",
      propertyType: "Apartment",
      ownerDisplayName: "Scale Test Owner",
      contactEmail: OWNER_EMAIL,
      isActive: true,
      unitCount: UNIT_COUNT,
      billingCycleStartDate: DUE_DATE,
      settings: {
        create: {
          rentDueDay: 1,
          gracePeriodDays: 5,
          lateFeeFlatCents: 5000,
          lateFeePercentBps: null,
          lateFeeEnabled: true,
          convenienceFeeEnabled: true,
          convenienceFeeType: "FLAT",
          convenienceFeeAmountCents: 495,
          allowTestMode: true,
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
          requirementsSummary: null,
          readyForLive: true,
          lastSyncedAt: new Date(),
        },
      },
    },
  });

  const owner = await prisma.managementUser.create({
    data: {
      propertyId: property.id,
      role: "OWNER",
      username: OWNER_USERNAME,
      email: OWNER_EMAIL,
      passwordHash,
      displayName: "Scale Test Owner",
      isActive: true,
      mustResetPassword: false,
    },
  });

  const tier = await prisma.propertyTier.create({
    data: {
      propertyId: property.id,
      name: "Scale Tier",
      baseRentCents: BASE_RENT_CENTS,
      unitCount: UNIT_COUNT,
      billingFrequency: "MONTHLY",
      rentDueDay: 1,
      gracePeriodDays: 5,
      lateFeeType: "FLAT",
      lateFeeInitialCents: 5000,
      lateFeeDailyCents: 1000,
      maxLateFeeDays: 10,
      processingFeeCents: 495,
      sortOrder: 1,
      isActive: true,
    },
  });

  let paidCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  let unpaidCount = 0;

  for (let i = 1; i <= UNIT_COUNT; i++) {
    const num = unitNumber(i);
    const simulatedStatus = statusForUnit(i);
    const tenantName = `Tenant ${num}`;

    const unit = await prisma.unit.create({
      data: {
        propertyId: property.id,
        tierId: tier.id,
        unitNumber: num,
        unitType: i % 2 === 0 ? "2BR" : "1BR",
        baseRentCents: BASE_RENT_CENTS,
        isActive: true,
        portalActivated: true,
        portalFirstName: "Tenant",
        portalLastName: num,
        tenantPinHash,
        activatedAt: new Date(),
        activationSource: "SCALE_TEST",
      },
    });

    const assignment = await prisma.tenantAssignment.create({
      data: {
        propertyId: property.id,
        unitId: unit.id,
        firstName: "Tenant",
        lastName: num,
        email: `tenant-${num}@rentfray.test`,
        phone: `555-010-${String(i).padStart(4, "0")}`,
        moveInDate: new Date("2026-04-15T12:00:00.000Z"),
        isCurrent: true,
        createdByManagementUserId: owner.id,
      },
    });

    await prisma.unitRecurringFee.createMany({
      data: [
        {
          propertyId: property.id,
          unitId: unit.id,
          label: "Trash",
          amountCents: TRASH_FEE_CENTS,
          isActive: true,
          displayOrder: 1,
        },
        {
          propertyId: property.id,
          unitId: unit.id,
          label: "Water",
          amountCents: WATER_FEE_CENTS,
          isActive: true,
          displayOrder: 2,
        },
      ],
    });

    const totalChargeCents =
      BASE_RENT_CENTS + TRASH_FEE_CENTS + WATER_FEE_CENTS;

    await prisma.ledgerEntry.createMany({
      data: [
        {
          propertyId: property.id,
          unitId: unit.id,
          tenantAssignmentId: assignment.id,
          billingCycle: BILLING_CYCLE,
          entryType: "CHARGE",
          chargeType: "RENT",
          amountCents: BASE_RENT_CENTS,
          effectiveDate: DUE_DATE,
          memo: "Monthly Rent",
          createdByManagementUserId: owner.id,
        },
        {
          propertyId: property.id,
          unitId: unit.id,
          tenantAssignmentId: assignment.id,
          billingCycle: BILLING_CYCLE,
          entryType: "CHARGE",
          chargeType: "RECURRING_FEE",
          amountCents: TRASH_FEE_CENTS,
          effectiveDate: DUE_DATE,
          memo: "Trash",
          createdByManagementUserId: owner.id,
        },
        {
          propertyId: property.id,
          unitId: unit.id,
          tenantAssignmentId: assignment.id,
          billingCycle: BILLING_CYCLE,
          entryType: "CHARGE",
          chargeType: "RECURRING_FEE",
          amountCents: WATER_FEE_CENTS,
          effectiveDate: DUE_DATE,
          memo: "Water",
          createdByManagementUserId: owner.id,
        },
      ],
    });

    if (simulatedStatus === PaymentStatus.PAID) {
      const payment = await prisma.payment.create({
        data: {
          propertyId: property.id,
          unitId: unit.id,
          tenantAssignmentId: assignment.id,
          billingCycle: BILLING_CYCLE,
          amountCents: totalChargeCents,
          processingFeeCents: 495,
          status: PaymentStatus.PAID,
          paymentMethod: i % 10 === 0 ? "MANUAL" : "ACH",
          paidAt: PAID_DATE,
          stripePaymentIntentId: `scale_pi_paid_${num}`,
          stripeSessionId: `scale_cs_paid_${num}`,
        },
      });

      await prisma.ledgerEntry.create({
        data: {
          propertyId: property.id,
          unitId: unit.id,
          tenantAssignmentId: assignment.id,
          paymentId: payment.id,
          billingCycle: BILLING_CYCLE,
          entryType: "PAYMENT",
          paymentMethod: payment.paymentMethod,
          amountCents: totalChargeCents,
          effectiveDate: PAID_DATE,
          memo: "Scale test payment",
          referenceNumber: payment.stripePaymentIntentId,
        },
      });

      paidCount++;
    } else if (simulatedStatus === PaymentStatus.PENDING) {
      await prisma.payment.create({
        data: {
          propertyId: property.id,
          unitId: unit.id,
          tenantAssignmentId: assignment.id,
          billingCycle: BILLING_CYCLE,
          amountCents: totalChargeCents,
          processingFeeCents: 495,
          status: PaymentStatus.PENDING,
          paymentMethod: "ACH",
          stripePaymentIntentId: `scale_pi_pending_${num}`,
          stripeSessionId: `scale_cs_pending_${num}`,
        },
      });

      pendingCount++;
    } else if (simulatedStatus === PaymentStatus.FAILED) {
      await prisma.payment.create({
        data: {
          propertyId: property.id,
          unitId: unit.id,
          tenantAssignmentId: assignment.id,
          billingCycle: BILLING_CYCLE,
          amountCents: totalChargeCents,
          processingFeeCents: 495,
          status: PaymentStatus.FAILED,
          paymentMethod: "ACH",
          failedAt: new Date("2026-05-03T12:00:00.000Z"),
          stripePaymentIntentId: `scale_pi_failed_${num}`,
          stripeSessionId: `scale_cs_failed_${num}`,
        },
      });

      failedCount++;
    } else {
      unpaidCount++;
    }

    if (i % 25 === 0) {
      console.log(`Seeded ${i}/${UNIT_COUNT} units...`);
    }
  }

  console.log("");
  console.log("Scale test property created.");
  console.log(`Property code: ${PROPERTY_CODE}`);
  console.log(`Manager username: ${OWNER_USERNAME}`);
  console.log(`Manager email: ${OWNER_EMAIL}`);
  console.log(`Manager password: ${OWNER_PASSWORD}`);
  console.log(`Tenant PIN for all units: ${TENANT_PIN}`);
  console.log(`Units: ${UNIT_COUNT}`);
  console.log(`Paid: ${paidCount}`);
  console.log(`Pending: ${pendingCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Unpaid/Grace/Past due: ${unpaidCount}`);
}

main()
  .catch((error: unknown) => {
    console.error("Scale seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });