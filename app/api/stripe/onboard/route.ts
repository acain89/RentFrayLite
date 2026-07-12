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
  url: string;
};

export async function POST() {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!secretKey) {
      return NextResponse.json<ApiError>(
        { error: "Stripe is not configured." },
        { status: 500 }
      );
    }

    if (!baseUrl) {
      return NextResponse.json<ApiError>(
        { error: "Base URL is not configured." },
        { status: 500 }
      );
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: "2026-02-25.clover",
    });

    const session = await getSession();

    if (!session || session.role !== "OWNER" || !session.propertyId) {
      return NextResponse.json<ApiError>(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const property = await prisma.property.findUnique({
      where: { id: session.propertyId },
      select: { stripeAccountId: true },
    });

    if (!property?.stripeAccountId) {
      return NextResponse.json<ApiError>(
        { error: "No Stripe account found" },
        { status: 400 }
      );
    }

    const redirectUrl = `${baseUrl}/manager/dashboard`;

    const link = await stripe.accountLinks.create({
      account: property.stripeAccountId,
      refresh_url: redirectUrl,
      return_url: redirectUrl,
      type: "account_onboarding",
    });

    return NextResponse.json<ApiSuccess>({ url: link.url });
  } catch (error: unknown) {
    console.error("POST /api/stripe/onboard error:", error);

    return NextResponse.json<ApiError>(
      { error: "Failed to create onboarding link" },
      { status: 500 }
    );
  }
}