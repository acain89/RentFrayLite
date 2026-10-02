import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { processStripePaymentEvent } from "@/lib/stripePaymentWebhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  let stripe: Stripe;
  try {
    const rawBody = await request.text();
    stripe = getStripeClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  try {
    await processStripePaymentEvent(event, stripe);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Stripe webhook processing failed for event ${event.id}:`, error);
    // A failed transaction has no event marker; Stripe can safely retry it.
    return NextResponse.json({ error: "Stripe webhook processing failed." }, { status: 500 });
  }
}
