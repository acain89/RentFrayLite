import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type ApiError = {
  error: string;
};

type ApiSuccess = {
  ok: true;
  url: string;
};

export async function POST() {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:10000";

    if (!secretKey) {
      return NextResponse.json<ApiError>(
        { error: "Stripe is not configured." },
        { status: 500 }
      );
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: "2026-02-25.clover",
    });

    const session = await getSession();

    if (!session || session.role !== "OWNER" || !session.propertyId) {
      return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
    }

    const property = await prisma.property.findUnique({
      where: { id: session.propertyId },
      select: {
        id: true,
        name: true,
        stripeAccountId: true,
      },
    });

    if (!property) {
      return NextResponse.json<ApiError>(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    let accountId = property.stripeAccountId;

    if (accountId) {
      await stripe.accounts.update(accountId, {
        business_profile: {
          name: property.name,
          product_description: `Property management and rent collection for ${property.name}`,
        },
      });
    } else {
      const account = await stripe.accounts.create({
        type: "express",
        business_type: "individual",
        business_profile: {
          name: property.name,
          product_description: `Property management and rent collection for ${property.name}`,
        },
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
          us_bank_account_ach_payments: { requested: true },
        },
      });

      accountId = account.id;

      await prisma.property.update({
        where: { id: property.id },
        data: { stripeAccountId: accountId },
      });
    }

    const stripeAccount = await stripe.accounts.retrieve(accountId);

    const paymentStatusData = {
      processorConnected: true,
      bankConnected: true,
      chargesEnabled: Boolean(stripeAccount.charges_enabled),
      payoutsEnabled: Boolean(stripeAccount.payouts_enabled),
      onboardingComplete: Boolean(stripeAccount.details_submitted),
      requirementsDue: Boolean(stripeAccount.requirements?.currently_due?.length),
      requirementsSummary: stripeAccount.requirements?.disabled_reason ?? null,
      lastSyncedAt: new Date(),
      readyForLive:
        Boolean(stripeAccount.charges_enabled) &&
        Boolean(stripeAccount.payouts_enabled),
    };

    await prisma.property.update({
      where: { id: property.id },
      data: {
        paymentStatus: {
          upsert: {
            create: paymentStatusData,
            update: paymentStatusData,
          },
        },
      },
    });

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/manager/dashboard`,
      return_url: `${baseUrl}/manager/dashboard?propertyId=${property.id}`,
      type: "account_onboarding",
    });

    return NextResponse.json<ApiSuccess>({
      ok: true,
      url: accountLink.url,
    });
  } catch (error: unknown) {
    console.error("POST /api/stripe/connect error:", error);

    const message =
      error instanceof Error && error.message ? error.message : "Stripe error";

    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}