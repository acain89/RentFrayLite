import { normalizeStripeLineItems, isStripeCheckoutTransportWithinLimit, STRIPE_CHECKOUT_PAYMENT_MAX_LINE_ITEMS } from "@/lib/stripeCheckoutTransport";
import {
  CheckoutSessionStatus,
  PaymentMethod,
} from "@prisma/client";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getBusinessPaymentReadiness, readinessBusinessInclude } from "@/lib/businessPaymentReadiness";
import { getConfigurationReasons } from "@/lib/paymentReadiness";
import { getStripeClient } from "@/lib/stripe";
import { grantPaymentResultAccess, getPaymentResultAccessToken, verifyPaymentResultAccessToken } from "@/lib/paymentResultAccess";
import { Prisma } from "@prisma/client";
import { isLinkedCheckoutResume, reserveCheckoutAttempt } from "@/lib/checkoutRetry";
import { expireUnstartedCheckout, writeCheckoutLifecycle } from "@/lib/checkoutLifecycle";

type StartCheckoutRequest = {
  checkoutSessionId?: unknown;
};

function getApplicationOrigin(request: Request): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_BASE_URL
    ?.trim()
    .replace(/\/$/, "");

  return configuredOrigin || new URL(request.url).origin;
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
    include: readinessBusinessInclude,
  });

  if (!business) {
    return NextResponse.json(
      { error: "Business not found." },
      { status: 404 }
    );
  }

  const linkedResume = isLinkedCheckoutResume(checkoutSession);
  // Local review TTL controls unstarted checkouts. For an already linked
  // attempt, only B1's current Stripe observation decides collectibility.
  if (checkoutSession.expiresAt <= new Date() && !linkedResume) {
    await expireUnstartedCheckout(prisma, checkoutSession.id);

    return NextResponse.json(
      { error: "Checkout session expired." },
      { status: 409 }
    );
  }

  if (
    checkoutSession.status !==
    CheckoutSessionStatus.REVIEWED &&
    checkoutSession.status !== CheckoutSessionStatus.CHECKOUT_STARTED && !linkedResume
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
    getConfigurationReasons(business).length > 0
  ) {
    return NextResponse.json(
      {
        error:
          "Business is not accepting payments.",
      },
      { status: 409 }
    );
  }

  const stripeLineItems = normalizeStripeLineItems(checkoutSession.lineItems);
  const stripeLineItemsTotalCents = stripeLineItems?.reduce(
    (total, item) => total + item.quantity * item.price_data.unit_amount,
    0
  ) ?? null;

  if (
    !stripeLineItems ||
    !Number.isSafeInteger(checkoutSession.totalCents) ||
    checkoutSession.totalCents < 0 ||
    !Number.isSafeInteger(stripeLineItemsTotalCents) ||
    stripeLineItemsTotalCents !== checkoutSession.totalCents
  ) {
    console.error("Checkout line-item reconciliation failed:", {
      checkoutSessionId: checkoutSession.id,
      expectedTotalCents: checkoutSession.totalCents,
      stripeLineItemsTotalCents,
    });

    return NextResponse.json(
      { error: "Unable to open secure payment checkout. Please begin a new payment." },
      { status: 500 }
    );
  }

  // Reject unsupported transport BEFORE reserving a Payment or calling Stripe.
  if (!isStripeCheckoutTransportWithinLimit(stripeLineItems)) {
    console.error("Stripe Checkout transport exceeds payment-mode line-item capacity. Review snapshot types/transport projection:", {
      checkoutSessionId: checkoutSession.id, transportRows: stripeLineItems.length,
      maximumRows: STRIPE_CHECKOUT_PAYMENT_MAX_LINE_ITEMS,
    });
    return NextResponse.json({ error: "Unable to prepare secure payment checkout. Please contact the business." }, { status: 500 });
  }
  const readiness = await getBusinessPaymentReadiness(business, checkoutSession.planId);
  if (!readiness.ready) {
    return NextResponse.json({ error: "Business is not accepting payments." }, { status: 409 });
  }

  const stripe = getStripeClient();
  let reservation;
  try {
    reservation = await reserveCheckoutAttempt(
      prisma, stripe, checkoutSession, business.name, stripeConnection.stripeAccountId,
      async (stripeSessionId, originalCheckoutId) => verifyPaymentResultAccessToken(
        (await getPaymentResultAccessToken(stripeSessionId)) ?? "", stripeSessionId, originalCheckoutId
      )
    );
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A payment for this billing cycle already exists." }, { status: 409 });
    }
    console.error("Unable to safely verify or reserve the existing payment:", error);
    return NextResponse.json({ error: "Unable to safely verify the existing payment. Please try again." }, { status: 500 });
  }
  if (reservation.kind === "block") {
    return NextResponse.json({ error: reservation.error }, { status: 409 });
  }
  if (reservation.kind === "resume") {
    await grantPaymentResultAccess(reservation.payment.stripeCheckoutSessionId!, reservation.checkoutId);
    return NextResponse.json({ ok: true, checkoutUrl: reservation.url, paymentId: reservation.payment.id });
  }
  const payment = reservation.payment;

  const origin = getApplicationOrigin(request);

  const metadata: Record<string, string> = {
    product: "RentFrayLite",
    paymentId: payment.id,
    checkoutSessionId: checkoutSession.id,
    businessId: checkoutSession.businessId,
    accountCode: checkoutSession.accountCode,
    billingCycle: checkoutSession.billingCycle,
  };

  let stripeCheckoutSession: Stripe.Checkout.Session;

  try {
    stripeCheckoutSession =
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
            `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}&accountCode=${encodeURIComponent(
              checkoutSession.accountCode
            )}`,
          cancel_url:
            `${origin}/${encodeURIComponent(
              checkoutSession.accountCode
            )}/review?session=${encodeURIComponent(
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
  } catch (error) {
    console.error(
      "Unable to create Stripe Checkout Session:",
      error
    );

    try {
      const result = await writeCheckoutLifecycle(prisma, payment.id, checkoutSession.id, {
        kind: "failed", message: error instanceof Error ? error.message : "Unable to create Stripe Checkout Session.",
      });
      if (result.kind === "advanced") {
        return NextResponse.json({ error: "This payment has already advanced. Please check its payment result.", paymentId: result.payment.id, paymentStatus: result.payment.status }, { status: 409 });
      }
    } catch (persistenceError) {
      console.error("Unable to safely record checkout creation failure:", persistenceError);
    }

    return NextResponse.json(
      {
        error:
          "Unable to open secure payment checkout. Please try again.",
      },
      { status: 500 }
    );
  }

  try {
    const result = await writeCheckoutLifecycle(prisma, payment.id, checkoutSession.id, {
      kind: "started", stripeCheckoutId: stripeCheckoutSession.id,
    });
    if (result.kind !== "started") {
      return NextResponse.json({ error: "This payment has already advanced. Please check its payment result.", paymentId: result.payment.id, paymentStatus: result.payment.status }, { status: 409 });
    }
  } catch (error) {
    console.error(
      `Stripe Checkout Session ${stripeCheckoutSession.id} was created, but RentFrayLite could not persist the checkout state:`,
      error
    );

    return NextResponse.json(
      {
        error:
          "Secure payment checkout was created, but RentFrayLite could not finish preparing it. Please try again.",
      },
      { status: 500 }
    );
  }

  if (!stripeCheckoutSession.url) {
    console.error(
      `Stripe Checkout Session ${stripeCheckoutSession.id} did not include a checkout URL.`
    );

    return NextResponse.json(
      {
        error:
          "Unable to open secure payment checkout. Please try again.",
      },
      { status: 500 }
    );
  }

  await grantPaymentResultAccess(stripeCheckoutSession.id, checkoutSession.id);

  return NextResponse.json({
    ok: true,
    checkoutUrl: stripeCheckoutSession.url,
    paymentId: payment.id,
  });
}
