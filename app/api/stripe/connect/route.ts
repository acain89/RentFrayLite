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
  const origin = getApplicationOrigin(request);

  try {
    let connection = await prisma.stripeConnection.findUnique({
      where: {
        businessId,
      },
    });

    if (!connection) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: session.business.contactEmail,
        business_profile: {
          name: session.business.name,
        },
        capabilities: {
          transfers: {
            requested: true,
          },
        },
        metadata: {
          rflBusinessId: businessId,
          product: "RentFrayLite",
        },
      });

      connection = await prisma.$transaction(async (transaction) => {
        const created = await transaction.stripeConnection.create({
          data: {
            businessId,
            stripeAccountId: account.id,
          },
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
    }

    const accountLink = await stripe.accountLinks.create({
      account: connection.stripeAccountId,
      refresh_url: `${origin}/api/stripe/onboard`,
      return_url: `${origin}/setup/stripe?returned=1`,
      type: "account_onboarding",
    });

    return NextResponse.json({
      redirectTo: accountLink.url,
    });
  } catch (error) {
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