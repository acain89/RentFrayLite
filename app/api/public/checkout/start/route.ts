import { checkoutDispatchModel, reserveLegacyCheckoutDispatch } from "@/lib/checkoutDispatch";
import { logOperationalError } from "@/lib/operationalLogging";
import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { publicJson, publicJsonFailure } from "@/lib/publicJson";
import { hasCheckoutQuoteAccess } from "@/lib/checkoutConsent";
import { publicRequestGuard } from "@/lib/publicRequestBudget";
import { normalizeStripeLineItems, isStripeCheckoutTransportWithinLimit } from "@/lib/stripeCheckoutTransport";
import {
  CheckoutSessionStatus,
  PaymentMethod,
} from "@prisma/client";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getLegacyBusinessPaymentReadiness, readinessBusinessInclude } from "@/lib/businessPaymentReadiness";
import { getConfigurationReasons } from "@/lib/paymentReadiness";
import { getStripeClient } from "@/lib/stripe";
import { grantPaymentResultAccess, getPaymentResultAccessToken, verifyPaymentResultAccessToken } from "@/lib/paymentResultAccess";
import { Prisma } from "@prisma/client";
import { isLinkedCheckoutResume, reserveCheckoutAttempt } from "@/lib/checkoutRetry";
import { expireUnstartedCheckout, writeCheckoutLifecycle } from "@/lib/checkoutLifecycle";
import { CheckoutCalendarError, getCheckoutCalendar } from "@/lib/checkoutCalendar";
import { assertCheckoutSource, assertCustomPaymentQuote } from "@/lib/customPayment";

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
  try { requireCredentialOrigin(request); } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }

  let body: StartCheckoutRequest;

  try {
    body = (await publicJson(request, 1024)) as StartCheckoutRequest;
  } catch (error) {
    return publicJsonFailure(error);
  }

  const checkoutSessionId =
    typeof body.checkoutSessionId === "string"
      ? body.checkoutSessionId.trim()
      : "";

  if (!checkoutSessionId || checkoutSessionId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(checkoutSessionId)) {
    return NextResponse.json(
      { error: "Checkout session is required." },
      { status: 400 }
    );
  }

  const denied = await publicRequestGuard(prisma, "START", checkoutSessionId);
  if (denied) return denied;

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

  if (!checkoutSession.paymentId && !checkoutSession.stripeCheckoutSessionId &&
      !await hasCheckoutQuoteAccess(checkoutSession.id)) {
    return NextResponse.json({ error: "Checkout authorization unavailable. Please begin again." }, {
      status: 403, headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" },
    });
  }

  if (checkoutDispatchModel(checkoutSession) !== "LEGACY_DESTINATION") {
    return NextResponse.json({ error: "Checkout architecture is unavailable.", code: "CHECKOUT_ARCHITECTURE_UNAVAILABLE" }, {
      status: 409, headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" },
    });
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

  try {
    assertCheckoutSource(checkoutSession);
    if (checkoutSession.sourceType === "RECURRING_PLAN") getCheckoutCalendar(business, new Date());
    else if (!checkoutSession.paymentId) assertCustomPaymentQuote(checkoutSession);
  } catch (error) {
    if (error instanceof CheckoutCalendarError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    return NextResponse.json({ error: "Invalid payment quote. Begin a new checkout." }, { status: 409 });
  }

  const linkedResume = isLinkedCheckoutResume(checkoutSession);
  // Reservation precedes the external call. Missing provider ownership can
  // mean an in-flight request or a successful create whose response was lost.
  // Never call Stripe again for this attempt, regardless of its age/status.
  if (checkoutSession.paymentId && !checkoutSession.stripeCheckoutSessionId) {
    return NextResponse.json({ code: "CHECKOUT_CREATION_UNCONFIRMED", error:
      "This checkout is already being prepared or its payment-provider result is unconfirmed. Check its result or contact management; this attempt will not be recreated." }, { status: 409 });
  }
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
    (checkoutSession.sourceType === "RECURRING_PLAN" && getConfigurationReasons(business).length > 0)
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
    logOperationalError("checkout_snapshot_invalid", undefined, checkoutSession.id);

    return NextResponse.json(
      { error: "Unable to open secure payment checkout. Please begin a new payment." },
      { status: 500 }
    );
  }

  // Reject unsupported transport BEFORE reserving a Payment or calling Stripe.
  if (!isStripeCheckoutTransportWithinLimit(stripeLineItems)) {
    logOperationalError("checkout_transport_limit", undefined, checkoutSession.id);
    return NextResponse.json({ error: "Unable to prepare secure payment checkout. Please contact the business." }, { status: 500 });
  }
  // Check the account captured for this checkout, not a replacement connection.
  // Unknown historical snapshots remain readable but cannot authorize retries.
  const readinessBusiness = checkoutSession.stripeConnectedAccountId
    ? { ...business, stripeConnection: { ...stripeConnection, stripeAccountId: checkoutSession.stripeConnectedAccountId } }
    : business;
  const readiness = await getLegacyBusinessPaymentReadiness(readinessBusiness, checkoutSession.planId ?? undefined, checkoutSession.sourceType);
  if (!readiness.ready) {
    return NextResponse.json({ error: "Business is not accepting payments." }, { status: 409 });
  }

  const stripe = getStripeClient();
  let reservation;
  try {
    reservation = await reserveLegacyCheckoutDispatch(checkoutSession, () => reserveCheckoutAttempt(
      prisma, stripe, checkoutSession, business.name,
      async (stripeSessionId, originalCheckoutId) => verifyPaymentResultAccessToken(
        (await getPaymentResultAccessToken(stripeSessionId)) ?? "", stripeSessionId, originalCheckoutId
      ),
      hasCheckoutQuoteAccess
    ));
  } catch (error: unknown) {
    if (error instanceof CheckoutCalendarError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This checkout attempt already has a payment. Please check its result." }, { status: 409 });
    }
    logOperationalError("checkout_reservation_failed", error, checkoutSession.id);
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
    ...(checkoutSession.billingCycle ? { billingCycle: checkoutSession.billingCycle } : {}),
  };
  if (checkoutSession.sourceType === "CUSTOM_PAYMENT") metadata.sourceType = "CUSTOM_PAYMENT";

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
                payment.stripeConnectedAccountId!,
            },
            metadata,
          },
        },
        {
          idempotencyKey: `rfl-payment-${payment.id}`,
        }
      );
  } catch (error) {
    logOperationalError("checkout_create_failed", error, payment.id);

    try {
      const result = await writeCheckoutLifecycle(prisma, payment.id, checkoutSession.id, {
        kind: "failed", message: error instanceof Error ? error.message : "Unable to create Stripe Checkout Session.",
      });
      if (result.kind === "advanced") {
        return NextResponse.json({ error: "This payment has already advanced. Please check its payment result.", paymentId: result.payment.id, paymentStatus: result.payment.status }, { status: 409 });
      }
    } catch (persistenceError) {
      logOperationalError("checkout_persistence_failed", persistenceError, payment.id);
    }

    return NextResponse.json(
      {
        code: "CHECKOUT_CREATION_UNCONFIRMED",
        error:
          "The payment-provider result is unconfirmed. This checkout will not be recreated automatically. Please check its result or contact management.",
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
    logOperationalError("checkout_persistence_failed", error, payment.id);

    // Retry only the atomic local write with the ID already returned by Stripe.
    // Never repeat external creation to recover a local persistence failure.
    try {
      const recovered = await writeCheckoutLifecycle(prisma, payment.id, checkoutSession.id, {
        kind: "started", stripeCheckoutId: stripeCheckoutSession.id,
      });
      if (recovered.kind === "started" && stripeCheckoutSession.url) {
        await grantPaymentResultAccess(stripeCheckoutSession.id, checkoutSession.id);
        return NextResponse.json({ ok: true, checkoutUrl: stripeCheckoutSession.url, paymentId: payment.id });
      }
      if (recovered.kind === "advanced") return NextResponse.json({ error: "This payment has already advanced. Please check its payment result.", paymentId: recovered.payment.id, paymentStatus: recovered.payment.status }, { status: 409 });
    } catch (recoveryError) {
      logOperationalError("checkout_recovery_failed", recoveryError, payment.id);
    }

    return NextResponse.json(
      {
        error:
          "Secure payment checkout was created, but RentFrayLite could not finish preparing it. Please try again.",
      },
      { status: 500 }
    );
  }

  if (!stripeCheckoutSession.url) {
    logOperationalError("checkout_url_missing", undefined, payment.id);

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
