import { SessionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { getStripeClient } from "@/lib/stripe";

function getApplicationOrigin(request: Request): string {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");

  return configuredOrigin || new URL(request.url).origin;
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  const origin = getApplicationOrigin(request);

  if (
    !session ||
    session.type !== SessionType.MANAGER ||
    !session.business
  ) {
    return NextResponse.redirect(
      new URL("/login/manager", origin)
    );
  }

  const connection = await prisma.stripeConnection.findUnique({
    where: {
      businessId: session.business.id,
    },
  });

  if (!connection) {
    return NextResponse.redirect(
      new URL("/setup/stripe?error=missing-account", origin)
    );
  }

  try {
    const stripe = getStripeClient();

    const accountLink = await stripe.accountLinks.create({
      account: connection.stripeAccountId,
      refresh_url: `${origin}/api/stripe/onboard`,
      return_url: `${origin}/setup/stripe?returned=1`,
      type: "account_onboarding",
    });

    return NextResponse.redirect(accountLink.url);
  } catch (error) {
    console.error("Unable to refresh Stripe onboarding:", error);

    return NextResponse.redirect(
      new URL("/setup/stripe?error=stripe", origin)
    );
  }
}