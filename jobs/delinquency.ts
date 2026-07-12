import { prisma } from "@/lib/prisma";
import { getUnitLedgerSummary } from "@/lib/ledger";
import {
  getBusinessDate,
  resolveEffectiveBillingSettings,
  getRentDateSummary,
} from "@/lib/rentDates";


export async function runDelinquencyJob(asOf = new Date()) {
  const today = getBusinessDate(asOf);

  const units = await prisma.unit.findMany({
    where: { isActive: true },
    include: {
      property: { include: { settings: true } },
      tier: true,
      tenantAssignments: {
        where: { isCurrent: true },
        orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });

  for (const unit of units) {
    const assignment = unit.tenantAssignments[0];
    if (!assignment) continue;

    const effective = resolveEffectiveBillingSettings({
      tier: unit.tier,
      propertySettings: unit.property.settings,
    });

   const rentDates = getRentDateSummary({
  ...effective,
  now: today,
  billingCycleStartDate: unit.property.billingCycleStartDate,
});

    if (!rentDates.isDelinquent) continue;

    const summary = await getUnitLedgerSummary(unit.id);
    if (summary.balanceCents <= 0) continue;

    const existing = await prisma.auditLog.findFirst({
      where: {
        action: "UNIT_DELINQUENT",
        targetId: unit.id,
      },
    });

    if (existing) continue;

    await prisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        propertyId: unit.propertyId,
        action: "UNIT_DELINQUENT",
        targetType: "UNIT",
        targetId: unit.id,
        summary: `Unit ${unit.unitNumber} is delinquent`,
        metadataJson: JSON.stringify({
          balanceCents: summary.balanceCents,
          unitId: unit.id,
          billingCycle: rentDates.billingCycle,
        }),
      },
    });
  }

  return { ok: true };
}