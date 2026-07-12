// app/api/stripe/webhook/route.ts

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canMakePayments } from "@/lib/liveGating";
import { emitEvent } from "@/lib/realtime";
import { assertValidTransition } from "@/lib/paymentStatus";
import {
  getBusinessDate,
  getRentDateSummary,
  resolveEffectiveBillingSettings,
} from "@/lib/rentDates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REVERSED";

function parseCents(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function safeString(value: unknown): string {
  return String(value ?? "").trim();
}

async function updatePaymentStatus(
  intentId: string,
  nextStatus: PaymentStatus
): Promise<void> {
  if (!intentId) return;

  const existing = await prisma.payment.findFirst({
    where: {
      OR: [{ stripePaymentIntentId: intentId }, { id: intentId }],
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!existing) return;

  const currentStatus = existing.status as PaymentStatus;

  if (currentStatus === nextStatus) return;

  assertValidTransition(currentStatus, nextStatus);

  await prisma.payment.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      ...(nextStatus === "PAID" && { paidAt: new Date() }),
      ...(nextStatus === "FAILED" && { failedAt: new Date() }),
      ...(nextStatus === "REVERSED" && { reversedAt: new Date() }),
    },
  });
}

async function findCurrentTenantAssignmentId(input: {
  propertyId: string;
  unitId: string;
}): Promise<string | null> {
  const assignment = await prisma.tenantAssignment.findFirst({
    where: {
      propertyId: input.propertyId,
      unitId: input.unitId,
      isCurrent: true,
    },
    orderBy: [{ moveInDate: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  return assignment?.id ?? null;
}

async function ensurePaymentFromIntent(
  intent: Stripe.PaymentIntent,
  stripeSessionId?: string | null
) {
  const metadata = intent.metadata || {};

  const propertyId = safeString(metadata.propertyId);
  const unitId = safeString(metadata.unitId);
  const paymentId = safeString(metadata.paymentId);
  const billingCycle = safeString(metadata.billingCycle);
  const amountCents = parseCents(metadata.ledgerBalanceCents);
  const feeCents = parseCents(metadata.processingFeeCents);

  let tenantAssignmentId =
    safeString(metadata.tenantAssignmentId) !== ""
      ? safeString(metadata.tenantAssignmentId)
      : null;

  if (!tenantAssignmentId && propertyId && unitId) {
    tenantAssignmentId = await findCurrentTenantAssignmentId({
      propertyId,
      unitId,
    });
  }

  if (paymentId) {
    return prisma.payment.update({
      where: { id: paymentId },
      data: {
        stripePaymentIntentId: intent.id,
        stripeSessionId: stripeSessionId ?? undefined,
        ...(billingCycle ? { billingCycle } : {}),
        ...(amountCents > 0 ? { amountCents } : {}),
        processingFeeCents: feeCents,
        paymentMethod: "ACH",
        ...(tenantAssignmentId ? { tenantAssignmentId } : {}),
      },
    });
  }

  if (!propertyId || !unitId || !billingCycle) return null;

  return prisma.payment.upsert({
    where: { stripePaymentIntentId: intent.id },
    update: {
      stripeSessionId: stripeSessionId ?? undefined,
      billingCycle,
      ...(amountCents > 0 ? { amountCents } : {}),
      processingFeeCents: feeCents,
      paymentMethod: "ACH",
      failedAt: null,
      reversedAt: null,
      ...(tenantAssignmentId ? { tenantAssignmentId } : {}),
    },
    create: {
      propertyId,
      unitId,
      tenantAssignmentId: tenantAssignmentId ?? undefined,
      stripePaymentIntentId: intent.id,
      stripeSessionId: stripeSessionId ?? null,
      billingCycle,
      amountCents,
      processingFeeCents: feeCents,
      status: "PENDING",
      paymentMethod: "ACH",
    },
  });
}

async function markPaymentPaidByIntentId(
  tx: Prisma.TransactionClient,
  intentId: string
): Promise<void> {
  const payment = await tx.payment.findFirst({
    where: {
      OR: [{ stripePaymentIntentId: intentId }, { id: intentId }],
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!payment) return;

  const currentStatus = payment.status as PaymentStatus;

  if (currentStatus === "PAID") return;

  assertValidTransition(currentStatus, "PAID");

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      failedAt: null,
      reversedAt: null,
    },
  });
}

async function finalizeSuccessfulIntent(input: {
  intent: Stripe.PaymentIntent;
  stripeSessionId?: string | null;
}): Promise<void> {
  const { intent, stripeSessionId } = input;

  if (intent.payment_method_types?.[0] !== "us_bank_account") {
    return;
  }

  const metadata = intent.metadata || {};

  const stripeAccountId = safeString(metadata.stripeAccountId);
  const propertyId = safeString(metadata.propertyId);
  const unitId = safeString(metadata.unitId);

  const balanceCents = parseCents(metadata.ledgerBalanceCents);
  const feeCents = parseCents(metadata.processingFeeCents);
  const expectedCents =
    parseCents(metadata.totalAmountCents) || balanceCents + feeCents;

  if (!propertyId || !unitId || expectedCents <= 0) {
    console.error("PAYMENT FINALIZATION BLOCKED — MISSING REQUIRED METADATA", {
      intentId: intent.id,
      propertyId,
      unitId,
      expectedCents,
    });
    return;
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      settings: true,
      units: true,
      paymentStatus: true,
    },
  });

  if (!property || !property.isActive || !canMakePayments(property)) {
    console.error("PAYMENT FINALIZATION BLOCKED — PROPERTY NOT PAYMENT READY", {
      intentId: intent.id,
      propertyId,
    });
    return;
  }

  if (stripeAccountId && property.stripeAccountId !== stripeAccountId) {
    console.error("PAYMENT FINALIZATION BLOCKED — STRIPE ACCOUNT MISMATCH", {
      intentId: intent.id,
      metadataAccount: stripeAccountId,
      propertyAccount: property.stripeAccountId,
    });
    return;
  }

  const stripeCents = intent.amount_received ?? intent.amount ?? expectedCents;

  if (stripeCents <= 0 || stripeCents !== expectedCents) {
    console.error("PAYMENT FINALIZATION BLOCKED — AMOUNT MISMATCH", {
      intentId: intent.id,
      stripeCents,
      expectedCents,
      balanceCents,
      feeCents,
    });
    await ensurePaymentFromIntent(intent, stripeSessionId);
    return;
  }

  const payment = await ensurePaymentFromIntent(intent, stripeSessionId);

  if (!payment) {
    console.error("PAYMENT FINALIZATION BLOCKED — PAYMENT RECORD NOT FOUND", {
      intentId: intent.id,
    });
    return;
  }

  const billingCycle =
    safeString(metadata.billingCycle) || safeString(payment.billingCycle);

  if (!billingCycle) {
    console.error("PAYMENT FINALIZATION BLOCKED — MISSING BILLING CYCLE", {
      intentId: intent.id,
      paymentId: payment.id,
    });
    return;
  }

  const tenantAssignmentId =
    safeString(payment.tenantAssignmentId) ||
    safeString(metadata.tenantAssignmentId) ||
    (await findCurrentTenantAssignmentId({ propertyId, unitId }));

  const effectiveDate = getBusinessDate();

  const effective = resolveEffectiveBillingSettings({
    tier: null,
    propertySettings: property.settings,
  });

  getRentDateSummary({
    ...effective,
    now: effectiveDate,
  });

  let didWriteLedgerPayment = false;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await markPaymentPaidByIntentId(tx, intent.id);

    const existingLedgerPayment = await tx.ledgerEntry.findFirst({
      where: {
        referenceNumber: intent.id,
        entryType: "PAYMENT",
        unitId,
      },
      select: { id: true },
    });

    if (existingLedgerPayment) return;

    if (feeCents > 0) {
      const existingFee = await tx.ledgerEntry.findFirst({
        where: {
          referenceNumber: `${intent.id}:fee`,
          entryType: "CHARGE",
          unitId,
        },
        select: { id: true },
      });

      if (!existingFee) {
        await tx.ledgerEntry.create({
          data: {
            propertyId,
            unitId,
            tenantAssignmentId: tenantAssignmentId || null,
            entryType: "CHARGE",
            chargeType: "PROCESSING_FEE",
            amountCents: feeCents,
            effectiveDate,
            billingCycle,
            paymentId: payment.id,
            referenceNumber: `${intent.id}:fee`,
            memo: "Processing fee",
          },
        });
      }
    }

    await tx.ledgerEntry.create({
      data: {
        propertyId,
        unitId,
        tenantAssignmentId: tenantAssignmentId || null,
        entryType: "PAYMENT",
        paymentMethod: "ACH",
        amountCents: -expectedCents,
        effectiveDate,
        billingCycle,
        paymentId: payment.id,
        referenceNumber: intent.id,
        memo: "Stripe payment",
      },
    });

    didWriteLedgerPayment = true;

    await tx.auditLog.create({
      data: {
        propertyId,
        actorType: "SYSTEM",
        action: "PAYMENT_RECORDED",
        targetType: "PAYMENT",
        targetId: intent.id,
        metadataJson: JSON.stringify({
          stripeCents,
          expectedCents,
          feeCents,
          balanceCents,
          billingCycle,
          tenantAssignmentId: tenantAssignmentId || null,
          finalizedFrom: stripeSessionId ? "checkout_session" : "payment_intent",
        }),
      },
    });
  });

  emitEvent("payment:update", { propertyId, unitId });
  emitEvent("ledger:update", { propertyId, unitId });
  emitEvent("tenant:update", { propertyId, unitId });

  if (didWriteLedgerPayment && property.status === "READY") {
    await prisma.property.update({
      where: { id: propertyId },
      data: { status: "LIVE" },
    });
  }
}

async function reverseLedgerEntries(intentId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: intentId },
    include: { ledgerEntries: true },
  });

  if (!payment) return;

  const existingReversal = await prisma.ledgerEntry.findFirst({
    where: {
      referenceNumber: `${intentId}:reversal`,
      entryType: "ADJUSTMENT",
    },
    select: { id: true },
  });

  if (existingReversal) return;

  const entries = payment.ledgerEntries as { amountCents: number }[];

  const totalReversal = entries.reduce(
    (sum, entry) => sum + entry.amountCents,
    0
  );

  if (totalReversal === 0) return;

  await prisma.ledgerEntry.create({
    data: {
      propertyId: payment.propertyId,
      unitId: payment.unitId,
      tenantAssignmentId: payment.tenantAssignmentId,
      entryType: "ADJUSTMENT",
      amountCents: -totalReversal,
      effectiveDate: new Date(),
      paymentId: payment.id,
      referenceNumber: `${intentId}:reversal`,
      memo: "Payment reversal (ACH return / dispute)",
    },
  });

  await prisma.auditLog.create({
    data: {
      propertyId: payment.propertyId,
      actorType: "SYSTEM",
      action: "PAYMENT_REVERSED",
      targetType: "PAYMENT",
      targetId: intentId,
    },
  });

  emitEvent("payment:update", {
    propertyId: payment.propertyId,
    unitId: payment.unitId,
  });

  emitEvent("ledger:update", {
    propertyId: payment.propertyId,
    unitId: payment.unitId,
  });

  emitEvent("tenant:update", {
    propertyId: payment.propertyId,
    unitId: payment.unitId,
  });
}

export async function POST(req: Request) {
  if (!stripeSecretKey || !stripeWebhookSecret) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2026-02-25.clover",
  });

  let event: Stripe.Event;

  try {
    const body = await req.text();
    const sig = (await headers()).get("stripe-signature");

    if (!sig) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    event = stripe.webhooks.constructEvent(body, sig, stripeWebhookSecret);
  } catch (error) {
    console.error("Stripe signature error:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = safeString(session.metadata?.paymentId);
      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : null;

      if (paymentId) {
        const payment = await prisma.payment.update({
          where: { id: paymentId },
          data: {
            stripeSessionId: session.id,
            ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
            status: "PENDING",
            paymentMethod: "ACH",
          },
        });

        emitEvent("payment:update", {
          propertyId: payment.propertyId,
          unitId: payment.unitId,
        });

        return NextResponse.json({ received: true });
      }

      if (paymentIntentId) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const payment = await ensurePaymentFromIntent(intent, session.id);

        if (payment) {
          emitEvent("payment:update", {
            propertyId: payment.propertyId,
            unitId: payment.unitId,
          });
        }
      }

      return NextResponse.json({ received: true });
    }

    if (event.type === "payment_intent.processing") {
      const processingIntent = event.data.object as Stripe.PaymentIntent;

      if (
        processingIntent.status !== "processing" ||
        processingIntent.payment_method_types?.[0] !== "us_bank_account" ||
        !processingIntent.payment_method ||
        typeof processingIntent.payment_method !== "string"
      ) {
        return NextResponse.json({ received: true });
      }

      const paymentMethod = await stripe.paymentMethods.retrieve(
        processingIntent.payment_method
      );

      if (!paymentMethod || paymentMethod.type !== "us_bank_account") {
        return NextResponse.json({ received: true });
      }

      const payment = await ensurePaymentFromIntent(processingIntent);

      if (payment) {
        await updatePaymentStatus(processingIntent.id, "PENDING");

        emitEvent("payment:update", {
          propertyId: payment.propertyId,
          unitId: payment.unitId,
        });
      }

      return NextResponse.json({ received: true });
    }

    if (event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (typeof session.payment_intent === "string") {
        const intent = await stripe.paymentIntents.retrieve(session.payment_intent);
        await finalizeSuccessfulIntent({
          intent,
          stripeSessionId: session.id,
        });
      }

      return NextResponse.json({ received: true });
    }

    if (event.type === "payment_intent.succeeded") {
      const succeededIntent = event.data.object as Stripe.PaymentIntent;

      await finalizeSuccessfulIntent({
        intent: succeededIntent,
      });

      return NextResponse.json({ received: true });
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (typeof session.payment_intent === "string") {
        const intent = await stripe.paymentIntents.retrieve(session.payment_intent);

        await ensurePaymentFromIntent(intent, session.id);
        await updatePaymentStatus(session.payment_intent, "FAILED");
      }

      return NextResponse.json({ received: true });
    }

    if (event.type === "payment_intent.payment_failed") {
      const failedIntent = event.data.object as Stripe.PaymentIntent;

      await ensurePaymentFromIntent(failedIntent);
      await updatePaymentStatus(failedIntent.id, "FAILED");

      return NextResponse.json({ received: true });
    }

    if (event.type === "payment_intent.canceled") {
      const canceledIntent = event.data.object as Stripe.PaymentIntent;

      await ensurePaymentFromIntent(canceledIntent);
      await updatePaymentStatus(canceledIntent.id, "REVERSED");
      await reverseLedgerEntries(canceledIntent.id);

      return NextResponse.json({ received: true });
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;

      if (typeof charge.payment_intent === "string") {
        await updatePaymentStatus(charge.payment_intent, "REVERSED");
        await reverseLedgerEntries(charge.payment_intent);
      }

      return NextResponse.json({ received: true });
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;

      if (typeof dispute.payment_intent === "string") {
        await updatePaymentStatus(dispute.payment_intent, "REVERSED");
        await reverseLedgerEntries(dispute.payment_intent);
      }

      return NextResponse.json({ received: true });
    }

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;

      if (!account.id) {
        return NextResponse.json({ received: true });
      }

      const property = await prisma.property.findFirst({
        where: { stripeAccountId: account.id },
        include: { paymentStatus: true },
      });

      if (!property) {
        return NextResponse.json({ received: true });
      }

      const requirementsDue = Boolean(
        account.requirements?.currently_due?.length ?? 0
      );

      await prisma.property.update({
        where: { id: property.id },
        data: {
          paymentStatus: {
            upsert: {
              create: {
                processorConnected: true,
                bankConnected: true,
                chargesEnabled: Boolean(account.charges_enabled),
                payoutsEnabled: Boolean(account.payouts_enabled),
                onboardingComplete: Boolean(account.details_submitted),
                requirementsDue,
                requirementsSummary: account.requirements?.disabled_reason ?? null,
                lastSyncedAt: new Date(),
                readyForLive:
                  Boolean(account.charges_enabled) &&
                  Boolean(account.payouts_enabled),
              },
              update: {
                processorConnected: true,
                bankConnected: true,
                chargesEnabled: Boolean(account.charges_enabled),
                payoutsEnabled: Boolean(account.payouts_enabled),
                onboardingComplete: Boolean(account.details_submitted),
                requirementsDue,
                requirementsSummary: account.requirements?.disabled_reason ?? null,
                lastSyncedAt: new Date(),
                readyForLive:
                  Boolean(account.charges_enabled) &&
                  Boolean(account.payouts_enabled),
              },
            },
          },
        },
      });

      emitEvent("payment:update", { propertyId: property.id });

      return NextResponse.json({ received: true });
    }
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}