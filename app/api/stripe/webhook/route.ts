import { boundedRawBody, BoundedBodyError } from "@/lib/boundedRawBody";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { processStripePaymentEvent } from "@/lib/stripePaymentWebhook";
import { logOperationalError } from "@/lib/operationalLogging";

export const runtime = "nodejs";
const STRIPE_WEBHOOK_MAX_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  let stripe: Stripe;
  try {
    const rawBody = await boundedRawBody(request, STRIPE_WEBHOOK_MAX_BYTES);
    stripe = getStripeClient();
    const secrets = [...new Set([process.env.STRIPE_WEBHOOK_SECRET?.trim(), process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim()].filter((value): value is string => !!value))];
    if (!secrets.length) throw new Error("Stripe webhook signing secrets are not configured.");
    let verified: Stripe.Event | undefined;
    for (const secret of secrets) {
      try { verified = stripe.webhooks.constructEvent(rawBody, signature, secret); break; } catch { /* Try the other configured endpoint secret. */ }
    }
    if (!verified) throw new Error("Invalid Stripe webhook signature.");
    event = verified;
  } catch (error) {
    if (error instanceof BoundedBodyError) {
      return NextResponse.json({ error: error.status === 413 ? "Request body is too large." : "Invalid request body." }, { status: error.status });
    }
    logOperationalError("stripe_signature_failed", error);
    return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  try {
    await processStripePaymentEvent(event, stripe);
    return NextResponse.json({ received: true });
  } catch (error) {
    logOperationalError("stripe_processing_failed", error, event.id);
    // A failed transaction has no event marker; Stripe can safely retry it.
    return NextResponse.json({ error: "Stripe webhook processing failed." }, { status: 500 });
  }
}
