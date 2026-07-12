import { createQaAccount } from "./account-model";
import { prisma } from "./db";
import { skipsThreeMonthsThenPays } from "./event-scenarios";
import { applyEventToLedger } from "./ledger-writer";
import { replayEvents } from "./replay-engine";
import { verifyFinancialStateMatchesQaModel } from "./verifiers/financial-state";
import { verifyLedgerMatchesQaModel } from "./verifiers/ledger";
import { verifyTenantDashboardEquivalent } from "./verifiers/tenant-dashboard";
import { verifyManagerReadonlySnapshot } from "./verifiers/manager-dashboard-readonly";
import { verifyLedgerInvariants } from "./invariants/ledger";
import { verifyApplicationInvariants } from "./invariants/application";

export async function runRentFrayIntegrationTests(): Promise<void> {
  const property = await prisma.property.findFirst({
    where: { propertyCode: "9920" },
    select: { id: true },
  });

  if (!property) {
    throw new Error("QA property 9920 not found. Run the property setup first.");
  }

  const unit103 = await prisma.unit.findFirst({
    where: {
      propertyId: property.id,
      unitNumber: "103",
    },
    include: {
      tier: true,
      tenantAssignments: {
        where: { isCurrent: true },
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!unit103 || !unit103.tenantAssignments[0]) {
    throw new Error("QA unit 103 or assignment not found.");
  }

  await prisma.ledgerEntry.deleteMany({
    where: {
      propertyId: property.id,
      unitId: unit103.id,
    },
  });

  await prisma.payment.deleteMany({
    where: {
      propertyId: property.id,
      unitId: unit103.id,
    },
  });

  const qaUnit103 = replayEvents(
    createQaAccount("103"),
    skipsThreeMonthsThenPays
  );

  for (const event of skipsThreeMonthsThenPays) {
    await applyEventToLedger(
      {
        propertyId: property.id,
        unitId: unit103.id,
        tenantAssignmentId: unit103.tenantAssignments[0].id,
      },
      event
    );
  }

  await verifyLedgerMatchesQaModel({
    name: "RentFray ledger matches QA model for three-month skip",
    qaAccount: qaUnit103,
    propertyId: property.id,
    unitId: unit103.id,
    tenantAssignmentId: unit103.tenantAssignments[0].id,
  });

  await verifyFinancialStateMatchesQaModel({
    name: "Financial state matches QA model for three-month skip",
    qaAccount: qaUnit103,
    propertyId: property.id,
    unitId: unit103.id,
    tenantAssignmentId: unit103.tenantAssignments[0].id,
    tier: unit103.tier,
    propertySettings: {
      rentDueDay: 17,
      gracePeriodDays: 0,
      lateFeeEnabled: true,
      lateFeeFlatCents: 50,
    },
    billingCycleStartDate: new Date("2026-01-17T00:00:00"),
    now: new Date("2026-04-17T00:00:00"),
  });

  await verifyManagerReadonlySnapshot({
    name: "Manager readonly snapshot matches QA model for three-month skip",
    qaAccount: qaUnit103,
    propertyId: property.id,
    unitId: unit103.id,
    tenantAssignmentId: unit103.tenantAssignments[0].id,
    billingCycle: "2026-03",
  });

  await verifyTenantDashboardEquivalent({
    name: "Tenant dashboard equivalent matches QA model for three-month skip",
    qaAccount: qaUnit103,
    propertyId: property.id,
    unitId: unit103.id,
    tenantAssignmentId: unit103.tenantAssignments[0].id,
    tier: unit103.tier,
    propertySettings: {
      rentDueDay: 17,
      gracePeriodDays: 0,
      lateFeeEnabled: true,
      lateFeeFlatCents: 50,
    },
    billingCycleStartDate: new Date("2026-01-17T00:00:00"),
    now: new Date("2026-04-17T00:00:00"),
  });
  await verifyLedgerInvariants({
  name: "QA property",
  propertyId: property.id,
});

await verifyApplicationInvariants({
  name: "Application layers match for three-month skip",
  qaAccount: qaUnit103,
  propertyId: property.id,
  unitId: unit103.id,
  tenantAssignmentId: unit103.tenantAssignments[0].id,
  tier: unit103.tier,
  propertySettings: {
    rentDueDay: 17,
    gracePeriodDays: 0,
    lateFeeEnabled: true,
    lateFeeFlatCents: 50,
  },
  billingCycleStartDate: new Date("2026-01-17T00:00:00"),
  now: new Date("2026-04-17T00:00:00"),
});
}