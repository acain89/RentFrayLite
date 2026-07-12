import type { QaEvent } from "./events";
import { prisma } from "./db";

type LedgerTarget = {
  propertyId: string;
  unitId: string;
  tenantAssignmentId: string;
};

function cycleDate(cycle: string): Date {
  return new Date(`${cycle}-17T00:00:00`);
}

export async function applyEventToLedger(
  target: LedgerTarget,
  event: QaEvent
): Promise<void> {
  const effectiveDate = cycleDate(event.cycle);

  if (event.type === "POST_RENT") {
    await prisma.ledgerEntry.create({
      data: {
        propertyId: target.propertyId,
        unitId: target.unitId,
        tenantAssignmentId: target.tenantAssignmentId,
        billingCycle: event.cycle,
        entryType: "CHARGE",
        chargeType: "RENT",
        amountCents: event.amountCents,
        effectiveDate,
        memo: "QA Rent",
      },
    });
    return;
  }

  if (event.type === "POST_LATE_FEE") {
    await prisma.ledgerEntry.create({
      data: {
        propertyId: target.propertyId,
        unitId: target.unitId,
        tenantAssignmentId: target.tenantAssignmentId,
        billingCycle: event.cycle,
        entryType: "CHARGE",
        chargeType: "LATE_FEE_DAILY",
        amountCents: event.amountCents,
        effectiveDate,
        memo: "QA Late Fee",
      },
    });
    return;
  }

  if (event.type === "POST_RECURRING_CHARGE") {
    await prisma.ledgerEntry.create({
      data: {
        propertyId: target.propertyId,
        unitId: target.unitId,
        tenantAssignmentId: target.tenantAssignmentId,
        billingCycle: event.cycle,
        entryType: "CHARGE",
        chargeType: "RECURRING_FEE",
        amountCents: event.amountCents,
        effectiveDate,
        memo: event.memo,
      },
    });
    return;
  }

  if (event.type === "PAYMENT_SETTLED" || event.type === "MANUAL_PAYMENT") {
    const payment = await prisma.payment.create({
      data: {
        propertyId: target.propertyId,
        unitId: target.unitId,
        tenantAssignmentId: target.tenantAssignmentId,
        billingCycle: event.cycle,
        amountCents: event.amountCents,
        processingFeeCents: 0,
        status: "PAID",
        paymentMethod: event.type === "MANUAL_PAYMENT" ? "MANUAL" : "ACH",
        paidAt: effectiveDate,
        stripePaymentIntentId: `qa_${event.unitNumber}_${event.cycle}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}`,
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        propertyId: target.propertyId,
        unitId: target.unitId,
        tenantAssignmentId: target.tenantAssignmentId,
        billingCycle: event.cycle,
        entryType: "PAYMENT",
        paymentMethod: event.type === "MANUAL_PAYMENT" ? "MANUAL" : "ACH",
        amountCents: -Math.abs(event.amountCents),
        effectiveDate,
        memo: "QA Payment",
        paymentId: payment.id,
        referenceNumber: payment.stripePaymentIntentId,
      },
    });
    return;
  }

  if (event.type === "POST_CREDIT") {
    await prisma.ledgerEntry.create({
      data: {
        propertyId: target.propertyId,
        unitId: target.unitId,
        tenantAssignmentId: target.tenantAssignmentId,
        billingCycle: event.cycle,
        entryType: "CREDIT",
        amountCents: -Math.abs(event.amountCents),
        effectiveDate,
        memo: event.memo,
      },
    });
    return;
  }

  if (event.type === "PAYMENT_STARTED") {
    await prisma.payment.create({
      data: {
        propertyId: target.propertyId,
        unitId: target.unitId,
        tenantAssignmentId: target.tenantAssignmentId,
        billingCycle: event.cycle,
        amountCents: event.amountCents,
        processingFeeCents: 0,
        status: "PENDING",
        paymentMethod: "ACH",
        stripePaymentIntentId: `qa_pending_${event.unitNumber}_${event.cycle}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}`,
      },
    });
    return;
  }

  if (event.type === "PAYMENT_FAILED") {
    await prisma.payment.create({
      data: {
        propertyId: target.propertyId,
        unitId: target.unitId,
        tenantAssignmentId: target.tenantAssignmentId,
        billingCycle: event.cycle,
        amountCents: event.amountCents,
        processingFeeCents: 0,
        status: "FAILED",
        paymentMethod: "ACH",
        failedAt: effectiveDate,
        stripePaymentIntentId: `qa_failed_${event.unitNumber}_${event.cycle}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}`,
      },
    });
    return;
  }
}