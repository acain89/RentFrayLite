import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import { SessionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getStripeClient } from "@/lib/stripe";

function getApplicationOrigin(request: Request): string {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");

  return configuredOrigin || new URL(request.url).origin;
}

export async function POST(request: Request) {
  const session = await getCurrentSession();

  if (
    !session ||
    session.type !== SessionType.MANAGER ||
    !session.manager ||
    !session.business
  ) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const stripe = getStripeClient();
  const businessId = session.business.id;
  const managerId = session.manager.id;
  const business = session.business;
  const origin = getApplicationOrigin(request);

  try {
    const connection = await withManagerMutation(session, async transaction => {
      const existing = await transaction.stripeConnection.findUnique({ where: { businessId } });
      if (existing) return existing;

      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: business.contactEmail,
        business_profile: { name: business.name },
        capabilities: { transfers: { requested: true } },
        metadata: { rflBusinessId: businessId, product: "RentFrayLite" },
      }, { timeout: 5000, maxNetworkRetries: 0 });

      const created = await transaction.stripeConnection.create({
        data: { businessId, stripeAccountId: account.id },
      });
      await transaction.auditLog.create({
        data: {
          businessId,
          actorType: "MANAGER",
          actorId: managerId,
          action: "STRIPE_ACCOUNT_CREATED",
          targetType: "STRIPE_ACCOUNT",
          targetId: account.id,
          summary: "Stripe Express connected account created.",
        },
      });
      return created;
    });

    // Preserve the existing persistence boundary: link failure must not discard
    // an account already created and recorded. Revalidate for the link as well.
    const accountLink = await withManagerMutation(session, async () => stripe.accountLinks.create({
      account: connection.stripeAccountId,
      refresh_url: `${origin}/api/stripe/onboard`,
      return_url: `${origin}/setup/stripe?returned=1`,
      type: "account_onboarding",
    }, { timeout: 5000, maxNetworkRetries: 0 }));

    return NextResponse.json({ redirectTo: accountLink.url });
  } catch (error) {
    if (error instanceof ManagerMutationUnauthorized) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    console.error("Unable to begin Stripe onboarding:", error);

    return NextResponse.json(
      {
        error:
          "Unable to open Stripe setup. Check your Stripe configuration and try again.",
      },
      { status: 500 }
    );
  }
}