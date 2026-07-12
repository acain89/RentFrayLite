
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clean slate
  await prisma.auditLog.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.maintenanceRequest.deleteMany();
  await prisma.maintenanceUser.deleteMany();
  await prisma.tenantAssignment.deleteMany();
  await prisma.unitRecurringFee.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.managementUser.deleteMany();
  await prisma.paymentConnectionStatus.deleteMany();
  await prisma.propertySettings.deleteMany();
  await prisma.property.deleteMany();
  await prisma.adminAccess.deleteMany();

  const adminCodeHash = await bcrypt.hash("123456", 10);
  const ownerPasswordHash = await bcrypt.hash("1234", 10);
  const managerPasswordHash = await bcrypt.hash("1234", 10);
  const staffPasswordHash = await bcrypt.hash("1234", 10);
  const maintenancePinHash = await bcrypt.hash("2222", 10);

  await prisma.adminAccess.create({
    data: {
      codeHash: adminCodeHash,
      isActive: true,
    },
  });

  const property = await prisma.property.create({
    data: {
      name: "Test Property",
      propertyCode: "1234",
      status: "TEST",
      addressLine1: "123 Test St",
      city: "Houston",
      state: "TX",
      zip: "77001",
      propertyType: "APARTMENT",
      ownerDisplayName: "Test Owner",
      contactPhone: "555-111-2222",
      contactEmail: "owner@testproperty.com",
      isActive: true,

      // ✅ FIXED SETTINGS (CENTS + BPS)
      settings: {
        create: {
          rentDueDay: 1,
          gracePeriodDays: 5,
          lateFeeFlatCents: 5000, // $50
          lateFeePercentBps: null,
          lateFeeEnabled: true,
          convenienceFeeEnabled: true,
          convenienceFeeType: "FLAT",
          convenienceFeeAmountCents: 495, // $4.95
          allowTestMode: true,
          tenantPortalEnabled: true,
          maintenancePortalEnabled: true,
        },
      },

      paymentStatus: {
        create: {
          processorConnected: false,
          bankConnected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          onboardingComplete: false,
          requirementsDue: false,
          requirementsSummary: null,
          readyForLive: false,
        },
      },
    },
  });

  const owner = await prisma.managementUser.create({
    data: {
      propertyId: property.id,
      role: "OWNER",
      username: "owner",
      passwordHash: ownerPasswordHash,
      displayName: "Owner User",
      isActive: true,
    },
  });

  const manager = await prisma.managementUser.create({
    data: {
      propertyId: property.id,
      role: "MANAGER",
      username: "manager",
      passwordHash: managerPasswordHash,
      displayName: "Manager User",
      isActive: true,
      createdByUserId: owner.id,
    },
  });

  await prisma.managementUser.create({
    data: {
      propertyId: property.id,
      role: "STAFF",
      username: "staff",
      passwordHash: staffPasswordHash,
      displayName: "Staff User",
      isActive: true,
      createdByUserId: owner.id,
    },
  });

  // ✅ UNITS (CENTS)
  const unit101 = await prisma.unit.create({
    data: {
      propertyId: property.id,
      unitNumber: "101",
      unitType: "1BR",
      baseRentCents: 100000, // $1000
      isActive: true,
    },
  });

  const unit102 = await prisma.unit.create({
    data: {
      propertyId: property.id,
      unitNumber: "102",
      unitType: "2BR",
      baseRentCents: 125000, // $1250
      isActive: true,
    },
  });

  // ✅ RECURRING FEES (CENTS)
  await prisma.unitRecurringFee.createMany({
    data: [
      {
        propertyId: property.id,
        unitId: unit101.id,
        label: "Trash",
        amountCents: 2500,
        isActive: true,
        displayOrder: 1,
      },
      {
        propertyId: property.id,
        unitId: unit101.id,
        label: "Water",
        amountCents: 3500,
        isActive: true,
        displayOrder: 2,
      },
      {
        propertyId: property.id,
        unitId: unit102.id,
        label: "Trash",
        amountCents: 2500,
        isActive: true,
        displayOrder: 1,
      },
    ],
  });

  const assignment101 = await prisma.tenantAssignment.create({
    data: {
      propertyId: property.id,
      unitId: unit101.id,
      firstName: "John",
      lastName: "Doe",
      phone: "555-222-3333",
      email: "john@example.com",
      moveInDate: new Date("2026-03-01"),
      isCurrent: true,
      createdByManagementUserId: manager.id,
    },
  });

  await prisma.maintenanceUser.create({
    data: {
      propertyId: property.id,
      displayName: "Mike Maintenance",
      pinHash: maintenancePinHash,
      isActive: true,
      createdByManagementUserId: manager.id,
    },
  });

  await prisma.maintenanceRequest.create({
    data: {
      propertyId: property.id,
      unitId: unit101.id,
      category: "PLUMBING",
      urgency: "NORMAL",
      status: "OPEN",
      description: "Kitchen sink is dripping.",
      tenantVisibleName: "John Doe",
      createdByTenant: true,
    },
  });

  // ✅ LEDGER (CENTS — CRITICAL)
  await prisma.ledgerEntry.createMany({
    data: [
      {
        propertyId: property.id,
        unitId: unit101.id,
        tenantAssignmentId: assignment101.id,
        entryType: "CHARGE",
        chargeType: "RENT",
        amountCents: 100000,
        effectiveDate: new Date("2026-03-01"),
        memo: "March rent",
      },
      {
        propertyId: property.id,
        unitId: unit101.id,
        tenantAssignmentId: assignment101.id,
        entryType: "CHARGE",
        chargeType: "RECURRING_FEE",
        amountCents: 2500,
        effectiveDate: new Date("2026-03-01"),
        memo: "Trash fee",
      },
      {
        propertyId: property.id,
        unitId: unit101.id,
        tenantAssignmentId: assignment101.id,
        entryType: "PAYMENT",
        paymentMethod: "ACH",
        amountCents: -50000,
        effectiveDate: new Date("2026-03-05"),
        memo: "Partial ACH payment",
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      propertyId: property.id,
      actorType: "SYSTEM",
      action: "SEED_COMPLETED",
      targetType: "Property",
      targetId: property.id,
      summary: "Initial development seed completed.",
    },
  });

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
