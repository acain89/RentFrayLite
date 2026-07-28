import {
  CheckoutSessionStatus,
  OneTimeChargeStatus,
  PaymentStatus,
  Prisma,
  SmsReceiptStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

type PaymentLookupData = {
  paymentId?: string;
  checkoutSessionId?: string;
};

function getWebhookSecret(): string {
  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not configured."
    );
  }

  return webhookSecret;
}

function getStringId(
  value:
    | string
    | { id: string }
    | null
    | undefined
): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.id === "string"
  ) {
    return value.id;
  }

  return null;
}

function getPaymentIntentChargeId(
  paymentIntent: Stripe.PaymentIntent
): string | null {
  return getStringId(paymentIntent.latest_charge);
}

function getFailureDetails(
  paymentIntent: Stripe.PaymentIntent
): {
  failureCode: string | null;
  failureMessage: string | null;
} {
  const lastPaymentError =
    paymentIntent.last_payment_error;

  return {
    failureCode:
      lastPaymentError?.code ??
      lastPaymentError?.decline_code ??
      null,
    failureMessage:
      lastPaymentError?.message ??
      "The payment could not be completed.",
  };
}

function getLookupData(
  metadata:
    | Stripe.Metadata
    | Record<string, string>
    | null
    | undefined
): PaymentLookupData {
  return {
    paymentId: metadata?.paymentId?.trim() || undefined,
    checkoutSessionId:
      metadata?.checkoutSessionId?.trim() ||
      undefined,
  };
}

async function findPayment({
  paymentId,
  checkoutSessionId,
  stripeCheckoutSessionId,
  stripePaymentIntentId,
  stripeChargeId,
}: PaymentLookupData & {
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
}) {
  if (paymentId) {
    const payment = await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
    });

    if (payment) {
      return payment;
    }
  }

  if (stripeCheckoutSessionId) {
    const payment = await prisma.payment.findUnique({
      where: {
        stripeCheckoutSessionId,
      },
    });

    if (payment) {
      return payment;
    }
  }

  if (stripePaymentIntentId) {
    const payment = await prisma.payment.findUnique({
      where: {
        stripePaymentIntentId,
      },
    });

    if (payment) {
      return payment;
    }
  }

  if (stripeChargeId) {
    const payment = await prisma.payment.findUnique({
      where: {
        stripeChargeId,
      },
    });

    if (payment) {
      return payment;
    }
  }

  if (checkoutSessionId) {
    const checkoutSession =
      await prisma.checkoutSession.findUnique({
        where: {
          id: checkoutSessionId,
        },
        select: {
          paymentId: true,
        },
      });

    if (checkoutSession?.paymentId) {
      return prisma.payment.findUnique({
        where: {
          id: checkoutSession.paymentId,
        },
      });
    }
  }

  return null;
}

async function writeAuditLog({
  businessId,
  action,
  paymentId,
  summary,
  stripeEventId,
  stripeEventType,
}: {
  businessId: string;
  action: string;
  paymentId: string;
  summary: string;
  stripeEventId: string;
  stripeEventType: string;
}) {
  await prisma.auditLog.create({
    data: {
      businessId,
      actorType: "STRIPE_WEBHOOK",
      action,
      targetType: "PAYMENT",
      targetId: paymentId,
      summary,
      metadata: {
        stripeEventId,
        stripeEventType,
      } satisfies Prisma.InputJsonValue,
    },
  });
}

async function markPaymentPending({
  paymentId,
  stripeCheckoutSessionId,
  stripePaymentIntentId,
  stripeChargeId,
  checkoutSessionId,
  stripeEventId,
  stripeEventType,
}: {
  paymentId: string;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  checkoutSessionId?: string;
  stripeEventId: string;
  stripeEventType: string;
}) {
  const existingPayment =
    await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
    });

  if (!existingPayment) {
    return;
  }

  if (
    existingPayment.status === PaymentStatus.PAID ||
    existingPayment.status ===
      PaymentStatus.REFUNDED ||
    existingPayment.status ===
      PaymentStatus.DISPUTED ||
    existingPayment.status === PaymentStatus.RETURNED
  ) {
    return;
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        status: PaymentStatus.PENDING,
        pendingAt:
          existingPayment.pendingAt ?? now,
        stripeCheckoutSessionId:
          stripeCheckoutSessionId ??
          existingPayment.stripeCheckoutSessionId,
        stripePaymentIntentId:
          stripePaymentIntentId ??
          existingPayment.stripePaymentIntentId,
        stripeChargeId:
          stripeChargeId ??
          existingPayment.stripeChargeId,
        failureCode: null,
        failureMessage: null,
      },
    });

    const checkoutSessionWhere =
      checkoutSessionId
        ? {
            id: checkoutSessionId,
          }
        : {
            paymentId,
          };

    await tx.checkoutSession.updateMany({
      where: checkoutSessionWhere,
      data: {
        status:
          CheckoutSessionStatus.CHECKOUT_STARTED,
        stripeCheckoutSessionId:
          stripeCheckoutSessionId ?? undefined,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: existingPayment.businessId,
        actorType: "STRIPE_WEBHOOK",
        action: "PAYMENT_PENDING",
        targetType: "PAYMENT",
        targetId: paymentId,
        summary:
          "Stripe reported that the payment is processing.",
        metadata: {
          stripeEventId,
          stripeEventType,
        } satisfies Prisma.InputJsonValue,
      },
    });
  });
}

async function markPaymentPaid({
  paymentId,
  stripeCheckoutSessionId,
  stripePaymentIntentId,
  stripeChargeId,
  checkoutSessionId,
  stripeEventId,
  stripeEventType,
}: {
  paymentId: string;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  checkoutSessionId?: string;
  stripeEventId: string;
  stripeEventType: string;
}) {

const existingPayment =
  await prisma.payment.findUnique({
    where: {
      id: paymentId,
    },
  });

const checkoutSession =
  checkoutSessionId
    ? await prisma.checkoutSession.findUnique({
        where: {
          id: checkoutSessionId,
        },
        select: {
          oneTimeChargeIds: true,
        },
      })
    : null;

if (!existingPayment) {
  return;
}

  if (existingPayment.status === PaymentStatus.PAID) {
    return;
  }

  if (
    existingPayment.status ===
      PaymentStatus.REFUNDED ||
    existingPayment.status ===
      PaymentStatus.DISPUTED ||
    existingPayment.status === PaymentStatus.RETURNED
  ) {
    return;
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        status: PaymentStatus.PAID,
        paidAt: existingPayment.paidAt ?? now,
        stripeCheckoutSessionId:
          stripeCheckoutSessionId ??
          existingPayment.stripeCheckoutSessionId,
        stripePaymentIntentId:
          stripePaymentIntentId ??
          existingPayment.stripePaymentIntentId,
        stripeChargeId:
          stripeChargeId ??
          existingPayment.stripeChargeId,
        failureCode: null,
        failureMessage: null,
      },
    });

    const checkoutSessionWhere =
      checkoutSessionId
        ? {
            id: checkoutSessionId,
          }
        : {
            paymentId,
          };

    await tx.checkoutSession.updateMany({
      where: checkoutSessionWhere,
      data: {
        status: CheckoutSessionStatus.PAID,
        stripeCheckoutSessionId:
          stripeCheckoutSessionId ?? undefined,
      },
    });

    await tx.smsReceipt.upsert({
      where: {
        paymentId,
      },
      create: {
        paymentId,
        phone: existingPayment.payerPhone,
        status: SmsReceiptStatus.QUEUED,
      },
      update: {},
    });

   const oneTimeChargeIds = Array.isArray(
  checkoutSession?.oneTimeChargeIds
)
  ? checkoutSession.oneTimeChargeIds.filter(
      (id): id is string =>
        typeof id === "string"
    )
  : [];

if (oneTimeChargeIds.length > 0) {
  await tx.oneTimeCharge.updateMany({
    where: {
      id: {
        in: oneTimeChargeIds,
      },
    },
    data: {
      status: OneTimeChargeStatus.PAID,
      paymentId,
      paidAt: now,
    },
  });
}

    await tx.auditLog.create({
      data: {
        businessId: existingPayment.businessId,
        actorType: "STRIPE_WEBHOOK",
        action: "PAYMENT_PAID",
        targetType: "PAYMENT",
        targetId: paymentId,
        summary:
          "Stripe confirmed that the payment succeeded.",
        metadata: {
          stripeEventId,
          stripeEventType,
        } satisfies Prisma.InputJsonValue,
      },
    });
  });
}

async function markPaymentFailed({
  paymentId,
  stripeCheckoutSessionId,
  stripePaymentIntentId,
  stripeChargeId,
  checkoutSessionId,
  failureCode,
  failureMessage,
  stripeEventId,
  stripeEventType,
}: {
  paymentId: string;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  checkoutSessionId?: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  stripeEventId: string;
  stripeEventType: string;
}) {
  const existingPayment =
    await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
    });

  if (!existingPayment) {
    return;
  }

  const wasPreviouslyPaid =
    existingPayment.status === PaymentStatus.PAID;

  const nextStatus = wasPreviouslyPaid
    ? PaymentStatus.RETURNED
    : PaymentStatus.FAILED;

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        status: nextStatus,
        failedAt: wasPreviouslyPaid
          ? existingPayment.failedAt
          : existingPayment.failedAt ?? now,
        returnedAt: wasPreviouslyPaid
          ? existingPayment.returnedAt ?? now
          : existingPayment.returnedAt,
        stripeCheckoutSessionId:
          stripeCheckoutSessionId ??
          existingPayment.stripeCheckoutSessionId,
        stripePaymentIntentId:
          stripePaymentIntentId ??
          existingPayment.stripePaymentIntentId,
        stripeChargeId:
          stripeChargeId ??
          existingPayment.stripeChargeId,
        failureCode:
          failureCode ??
          existingPayment.failureCode,
        failureMessage:
          failureMessage ??
          "The payment could not be completed.",
      },
    });

    if (!wasPreviouslyPaid) {
      const checkoutSessionWhere =
        checkoutSessionId
          ? {
              id: checkoutSessionId,
            }
          : {
              paymentId,
            };

      await tx.checkoutSession.updateMany({
        where: checkoutSessionWhere,
        data: {
          status: CheckoutSessionStatus.FAILED,
          stripeCheckoutSessionId:
            stripeCheckoutSessionId ?? undefined,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        businessId: existingPayment.businessId,
        actorType: "STRIPE_WEBHOOK",
        action: wasPreviouslyPaid
          ? "PAYMENT_RETURNED"
          : "PAYMENT_FAILED",
        targetType: "PAYMENT",
        targetId: paymentId,
        summary: wasPreviouslyPaid
          ? "Stripe reported that the completed payment was returned."
          : "Stripe reported that the payment failed.",
        metadata: {
          stripeEventId,
          stripeEventType,
          failureCode: failureCode ?? null,
          failureMessage: failureMessage ?? null,
        } satisfies Prisma.InputJsonValue,
      },
    });
  });
}

async function markPaymentRefunded({
  paymentId,
  stripeChargeId,
  stripeEventId,
  stripeEventType,
}: {
  paymentId: string;
  stripeChargeId?: string | null;
  stripeEventId: string;
  stripeEventType: string;
}) {
  const existingPayment =
    await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
    });

  if (
    !existingPayment ||
    existingPayment.status ===
      PaymentStatus.REFUNDED
  ) {
    return;
  }

  await prisma.payment.update({
    where: {
      id: paymentId,
    },
    data: {
      status: PaymentStatus.REFUNDED,
      refundedAt:
        existingPayment.refundedAt ?? new Date(),
      stripeChargeId:
        stripeChargeId ??
        existingPayment.stripeChargeId,
    },
  });

  await writeAuditLog({
    businessId: existingPayment.businessId,
    action: "PAYMENT_REFUNDED",
    paymentId,
    summary:
      "Stripe reported that the payment was refunded.",
    stripeEventId,
    stripeEventType,
  });
}

async function markPaymentDisputed({
  paymentId,
  stripeChargeId,
  stripeEventId,
  stripeEventType,
}: {
  paymentId: string;
  stripeChargeId?: string | null;
  stripeEventId: string;
  stripeEventType: string;
}) {
  const existingPayment =
    await prisma.payment.findUnique({
      where: {
        id: paymentId,
      },
    });

  if (
    !existingPayment ||
    existingPayment.status ===
      PaymentStatus.DISPUTED
  ) {
    return;
  }

  await prisma.payment.update({
    where: {
      id: paymentId,
    },
    data: {
      status: PaymentStatus.DISPUTED,
      disputedAt:
        existingPayment.disputedAt ?? new Date(),
      stripeChargeId:
        stripeChargeId ??
        existingPayment.stripeChargeId,
    },
  });

  await writeAuditLog({
    businessId: existingPayment.businessId,
    action: "PAYMENT_DISPUTED",
    paymentId,
    summary:
      "Stripe reported that the payment was disputed.",
    stripeEventId,
    stripeEventType,
  });
}

async function handleCheckoutSession(
  event: Stripe.Event,
  session: Stripe.Checkout.Session
) {
  const lookupData = getLookupData(session.metadata);

  const stripePaymentIntentId = getStringId(
    session.payment_intent
  );

  const payment = await findPayment({
    ...lookupData,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId,
  });

  if (!payment) {
    console.warn(
      `Stripe webhook could not locate a payment for Checkout Session ${session.id}.`
    );

    return;
  }

  if (session.payment_status === "paid") {
    await markPaymentPaid({
      paymentId: payment.id,
      checkoutSessionId:
        lookupData.checkoutSessionId,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId,
      stripeEventId: event.id,
      stripeEventType: event.type,
    });

    return;
  }

  await markPaymentPending({
    paymentId: payment.id,
    checkoutSessionId:
      lookupData.checkoutSessionId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId,
    stripeEventId: event.id,
    stripeEventType: event.type,
  });
}

async function handlePaymentIntentProcessing(
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent
) {
  const lookupData = getLookupData(
    paymentIntent.metadata
  );

  const payment = await findPayment({
    ...lookupData,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId:
      getPaymentIntentChargeId(paymentIntent),
  });

  if (!payment) {
    console.warn(
      `Stripe webhook could not locate a payment for PaymentIntent ${paymentIntent.id}.`
    );

    return;
  }

  await markPaymentPending({
    paymentId: payment.id,
    checkoutSessionId:
      lookupData.checkoutSessionId,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId:
      getPaymentIntentChargeId(paymentIntent),
    stripeEventId: event.id,
    stripeEventType: event.type,
  });
}

async function handlePaymentIntentSucceeded(
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent
) {
  const lookupData = getLookupData(
    paymentIntent.metadata
  );

  const payment = await findPayment({
    ...lookupData,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId:
      getPaymentIntentChargeId(paymentIntent),
  });

  if (!payment) {
    console.warn(
      `Stripe webhook could not locate a payment for PaymentIntent ${paymentIntent.id}.`
    );

    return;
  }

  await markPaymentPaid({
    paymentId: payment.id,
    checkoutSessionId:
      lookupData.checkoutSessionId,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId:
      getPaymentIntentChargeId(paymentIntent),
    stripeEventId: event.id,
    stripeEventType: event.type,
  });
}

async function handlePaymentIntentFailed(
  event: Stripe.Event,
  paymentIntent: Stripe.PaymentIntent
) {
  const lookupData = getLookupData(
    paymentIntent.metadata
  );

  const payment = await findPayment({
    ...lookupData,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId:
      getPaymentIntentChargeId(paymentIntent),
  });

  if (!payment) {
    console.warn(
      `Stripe webhook could not locate a payment for PaymentIntent ${paymentIntent.id}.`
    );

    return;
  }

  const failure = getFailureDetails(paymentIntent);

  await markPaymentFailed({
    paymentId: payment.id,
    checkoutSessionId:
      lookupData.checkoutSessionId,
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId:
      getPaymentIntentChargeId(paymentIntent),
    failureCode: failure.failureCode,
    failureMessage: failure.failureMessage,
    stripeEventId: event.id,
    stripeEventType: event.type,
  });
}

async function handleAsyncPaymentFailed(
  event: Stripe.Event,
  session: Stripe.Checkout.Session
) {
  const lookupData = getLookupData(session.metadata);

  const stripePaymentIntentId = getStringId(
    session.payment_intent
  );

  const payment = await findPayment({
    ...lookupData,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId,
  });

  if (!payment) {
    console.warn(
      `Stripe webhook could not locate a payment for failed Checkout Session ${session.id}.`
    );

    return;
  }

  await markPaymentFailed({
    paymentId: payment.id,
    checkoutSessionId:
      lookupData.checkoutSessionId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId,
    failureMessage:
      "The bank payment was not completed.",
    stripeEventId: event.id,
    stripeEventType: event.type,
  });
}

async function handleChargeRefunded(
  event: Stripe.Event,
  charge: Stripe.Charge
) {
  const stripePaymentIntentId = getStringId(
    charge.payment_intent
  );

  const payment = await findPayment({
    stripePaymentIntentId,
    stripeChargeId: charge.id,
  });

  if (!payment) {
    console.warn(
      `Stripe webhook could not locate a payment for refunded Charge ${charge.id}.`
    );

    return;
  }

  await markPaymentRefunded({
    paymentId: payment.id,
    stripeChargeId: charge.id,
    stripeEventId: event.id,
    stripeEventType: event.type,
  });
}

async function handleDisputeCreated(
  event: Stripe.Event,
  dispute: Stripe.Dispute
) {
  const stripeChargeId = getStringId(
    dispute.charge
  );

  const stripePaymentIntentId = getStringId(
    dispute.payment_intent
  );

  const payment = await findPayment({
    stripePaymentIntentId,
    stripeChargeId,
  });

  if (!payment) {
    console.warn(
      `Stripe webhook could not locate a payment for Dispute ${dispute.id}.`
    );

    return;
  }

  await markPaymentDisputed({
    paymentId: payment.id,
    stripeChargeId,
    stripeEventId: event.id,
    stripeEventType: event.type,
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get(
    "stripe-signature"
  );

  if (!signature) {
    return NextResponse.json(
      {
        error:
          "Missing Stripe signature header.",
      },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const rawBody = await request.text();
    const stripe = getStripeClient();

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      getWebhookSecret()
    );
  } catch (error) {
    console.error(
      "Stripe webhook signature verification failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Invalid Stripe webhook signature.",
      },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await handleCheckoutSession(
          event,
          event.data.object as Stripe.Checkout.Session
        );

        break;
      }

      case "checkout.session.async_payment_failed": {
        await handleAsyncPaymentFailed(
          event,
          event.data.object as Stripe.Checkout.Session
        );

        break;
      }

      case "payment_intent.processing": {
        await handlePaymentIntentProcessing(
          event,
          event.data.object as Stripe.PaymentIntent
        );

        break;
      }

      case "payment_intent.succeeded": {
        await handlePaymentIntentSucceeded(
          event,
          event.data.object as Stripe.PaymentIntent
        );

        break;
      }

      case "payment_intent.payment_failed": {
        await handlePaymentIntentFailed(
          event,
          event.data.object as Stripe.PaymentIntent
        );

        break;
      }

      case "charge.refunded": {
        await handleChargeRefunded(
          event,
          event.data.object as Stripe.Charge
        );

        break;
      }

      case "charge.dispute.created": {
        await handleDisputeCreated(
          event,
          event.data.object as Stripe.Dispute
        );

        break;
      }

      default: {
        console.info(
          `Unhandled Stripe webhook event: ${event.type}`
        );
      }
    }

    return NextResponse.json({
      received: true,
    });
  } catch (error) {
    console.error(
      `Stripe webhook processing failed for event ${event.id}:`,
      error
    );

    return NextResponse.json(
      {
        error:
          "Stripe webhook processing failed.",
      },
      { status: 500 }
    );
  }
}