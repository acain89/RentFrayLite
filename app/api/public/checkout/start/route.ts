import {
  CheckoutSessionStatus,
  PaymentMethod,
  PaymentSourceType,
  PaymentStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { Prisma } from "@prisma/client";

const DUPLICATE_PAYMENT_BLOCK_STATUSES: PaymentStatus[] = [
  PaymentStatus.CREATED,
  PaymentStatus.CHECKOUT_STARTED,
  PaymentStatus.PENDING,
  PaymentStatus.PAID,
  PaymentStatus.DISPUTED,
];

const CHECKOUT_LOCK_TIMEOUT_MS = 30 * 60 * 1000;

type StartCheckoutRequest = {
  checkoutSessionId?: unknown;
};

type StoredLineItem = {
  label?: unknown;
  name?: unknown;
  description?: unknown;
  amountCents?: unknown;
  amount?: unknown;
};

function getApplicationOrigin(request: Request): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_BASE_URL
    ?.trim()
    .replace(/\/$/, "");

  return configuredOrigin || new URL(request.url).origin;
}

function normalizeStripeLineItems(
  storedLineItems: unknown,
  fallbackAmountCents: number
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  if (!Array.isArray(storedLineItems)) {
    return [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: fallbackAmountCents,
          product_data: {
            name: "Payment",
          },
        },
      },
    ];
  }

  const lineItems = storedLineItems
    .map((item): Stripe.Checkout.SessionCreateParams.LineItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const storedItem = item as StoredLineItem;

      const name =
        typeof storedItem.label === "string"
          ? storedItem.label.trim()
          : typeof storedItem.name === "string"
            ? storedItem.name.trim()
            : typeof storedItem.description === "string"
              ? storedItem.description.trim()
              : "";

      const amountCents =
        typeof storedItem.amountCents === "number"
          ? Math.round(storedItem.amountCents)
          : typeof storedItem.amount === "number"
            ? Math.round(storedItem.amount * 100)
            : 0;

      if (!name || amountCents <= 0) {
        return null;
      }

      return {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name,
          },
        },
      };
    })
    .filter(
      (
        item
      ): item is Stripe.Checkout.SessionCreateParams.LineItem =>
        item !== null
    );

  if (lineItems.length === 0) {
    return [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: fallbackAmountCents,
          product_data: {
            name: "Payment",
          },
        },
      },
    ];
  }

  return lineItems;
}

export async function POST(request: Request) {
  let body: StartCheckoutRequest;

  try {
    body = (await request.json()) as StartCheckoutRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const checkoutSessionId =
    typeof body.checkoutSessionId === "string"
      ? body.checkoutSessionId.trim()
      : "";

  if (!checkoutSessionId) {
    return NextResponse.json(
      { error: "Checkout session is required." },
      { status: 400 }
    );
  }

  const checkoutSession =
    await prisma.checkoutSession.findUnique({
      where: {
        id: checkoutSessionId,
      },
    });

  if (!checkoutSession) {
    return NextResponse.json(
      { error: "Checkout session not found." },
      { status: 404 }
    );
  }

  const business = await prisma.business.findUnique({
    where: {
      id: checkoutSession.businessId,
    },
    select: {
      id: true,
      name: true,
      accountCode: true,
      isActive: true,
      stripeConnection: {
        select: {
          stripeAccountId: true,
          readyForLive: true,
        },
      },
    },
  });

  if (!business) {
    return NextResponse.json(
      { error: "Business not found." },
      { status: 404 }
    );
  }

  if (checkoutSession.expiresAt <= new Date()) {
    if (
      checkoutSession.status !==
      CheckoutSessionStatus.EXPIRED
    ) {
      await prisma.checkoutSession.update({
        where: {
          id: checkoutSession.id,
        },
        data: {
          status: CheckoutSessionStatus.EXPIRED,
        },
      });
    }

    return NextResponse.json(
      { error: "Checkout session expired." },
      { status: 409 }
    );
  }

  if (
    checkoutSession.status !==
    CheckoutSessionStatus.REVIEWED
  ) {
    return NextResponse.json(
      {
        error:
          "Checkout session is no longer available.",
      },
      { status: 409 }
    );
  }

  if (!business.isActive) {
    return NextResponse.json(
      { error: "Business is inactive." },
      { status: 409 }
    );
  }

  if (
    !business.accountCode ||
    business.accountCode !==
      checkoutSession.accountCode
  ) {
    return NextResponse.json(
      { error: "Business account is unavailable." },
      { status: 409 }
    );
  }

  const stripeConnection = business.stripeConnection;

  if (
    !stripeConnection ||
    !stripeConnection.readyForLive
  ) {
    return NextResponse.json(
      {
        error:
          "Business is not accepting payments.",
      },
      { status: 409 }
    );
  }

  let payment =
    checkoutSession.paymentId
      ? await prisma.payment.findUnique({
          where: {
            id: checkoutSession.paymentId,
          },
        })
      : null;

  if (
    payment &&
    payment.stripeCheckoutSessionId
  ) {
    return NextResponse.json(
      {
        error:
          "Stripe Checkout has already been started for this payment.",
      },
      { status: 409 }
    );
  }

   const duplicatePayment = await prisma.payment.findFirst({
  where: {
    businessId: checkoutSession.businessId,
    sourceType: PaymentSourceType.RECURRING_PLAN,
    sourceId: checkoutSession.planId,
    billingCycle: checkoutSession.billingCycle,
    referenceLabel: checkoutSession.unitNumber,
    status: {
      in: DUPLICATE_PAYMENT_BLOCK_STATUSES,
    },
    ...(payment ? { id: { not: payment.id } } : {}),
  },
  orderBy: {
    createdAt: "desc",
  },
});

if (duplicatePayment) {
  switch (duplicatePayment.status) {
    case PaymentStatus.PAID:
      return NextResponse.json(
        {
          error: "This billing cycle has already been paid.",
        },
        { status: 409 }
      );

    case PaymentStatus.PENDING:
      return NextResponse.json(
        {
          error: "A payment for this billing cycle is already processing.",
        },
        { status: 409 }
      );

    case PaymentStatus.DISPUTED:
      return NextResponse.json(
        {
          error: "This payment is currently under dispute.",
        },
        { status: 409 }
      );

    case PaymentStatus.CREATED:
    case PaymentStatus.CHECKOUT_STARTED: {
      const lockStartedAt =
        duplicatePayment.checkoutStartedAt ??
        duplicatePayment.createdAt;

      if (
        Date.now() - lockStartedAt.getTime() <
        CHECKOUT_LOCK_TIMEOUT_MS
      ) {
        return NextResponse.json(
          {
            error:
              "A payment is already being started for this billing cycle.",
          },
          { status: 409 }
        );
      }

      break;
    }
  }
}

  if (!payment) {
    payment = await prisma.payment.create({
      data: {
        businessId: checkoutSession.businessId,
        sourceType:
          PaymentSourceType.RECURRING_PLAN,
        sourceId: checkoutSession.planId,
        status: PaymentStatus.CREATED,
        paymentMethod:
          checkoutSession.paymentMethod,
        payerFirstName:
          checkoutSession.firstName,
        payerLastName:
          checkoutSession.lastName,
        payerPhone: checkoutSession.phone,
        referenceLabel:
          checkoutSession.unitNumber,
        itemDescription: `${business.name} payment`,
        lineItemsSnapshot:
          checkoutSession.lineItems as Prisma.InputJsonValue,
        subtotalCents:
          checkoutSession.subtotalCents,
        platformFeeCents:
          checkoutSession.platformFeeCents,
        totalChargedCents:
          checkoutSession.totalCents,
        businessProceedsCents:
          checkoutSession.subtotalCents,
        billingCycle:
          checkoutSession.billingCycle,
      },
    });

    await prisma.checkoutSession.update({
      where: {
        id: checkoutSession.id,
      },
      data: {
        paymentId: payment.id,
      },
    });
  }

  const origin = getApplicationOrigin(request);
  const stripe = getStripeClient();

  const metadata: Record<string, string> = {
    product: "RentFrayLite",
    paymentId: payment.id,
    checkoutSessionId: checkoutSession.id,
    businessId: checkoutSession.businessId,
    accountCode: checkoutSession.accountCode,
    billingCycle: checkoutSession.billingCycle,
  };

  const stripeLineItems =
    normalizeStripeLineItems(
      checkoutSession.lineItems,
      checkoutSession.subtotalCents
    );

  if (checkoutSession.platformFeeCents > 0) {
    stripeLineItems.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount:
          checkoutSession.platformFeeCents,
        product_data: {
          name: "Platform Service Fee",
        },
      },
    });
  }

  try {
    const stripeCheckoutSession =
      await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types:
            checkoutSession.paymentMethod ===
            PaymentMethod.ACH
              ? ["us_bank_account"]
              : ["card"],
          line_items: stripeLineItems,
          success_url:
            `${origin}/${encodeURIComponent(
              checkoutSession.accountCode
            )}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url:
            `${origin}/${encodeURIComponent(
              checkoutSession.accountCode
            )}/review?id=${encodeURIComponent(
              checkoutSession.id
            )}`,
          client_reference_id: payment.id,
          metadata,
          payment_intent_data: {
            application_fee_amount:
              checkoutSession.platformFeeCents,
            transfer_data: {
              destination:
                stripeConnection.stripeAccountId,
            },
            metadata,
          },
        },
        {
          idempotencyKey: `rfl-payment-${payment.id}`,
        }
      );

    if (!stripeCheckoutSession.url) {
      throw new Error(
        "Stripe did not return a Checkout URL."
      );
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status:
            PaymentStatus.CHECKOUT_STARTED,
          stripeCheckoutSessionId:
            stripeCheckoutSession.id,
          checkoutStartedAt: now,
        },
      }),

      prisma.checkoutSession.update({
        where: {
          id: checkoutSession.id,
        },
        data: {
          status:
            CheckoutSessionStatus.CHECKOUT_STARTED,
          paymentId: payment.id,
          stripeCheckoutSessionId:
            stripeCheckoutSession.id,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      checkoutUrl: stripeCheckoutSession.url,
      paymentId: payment.id,
    });
  } catch (error) {
    console.error(
      "Unable to create Stripe Checkout Session:",
      error
    );

    await prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: PaymentStatus.FAILED,
        failedAt: new Date(),
        failureMessage:
          error instanceof Error
            ? error.message
            : "Unable to create Stripe Checkout Session.",
      },
    });

    return NextResponse.json(
      {
        error:
          "Unable to open secure payment checkout. Please try again.",
      },
      { status: 500 }
    );
  }
}