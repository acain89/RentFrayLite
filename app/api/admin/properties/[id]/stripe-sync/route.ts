import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequirementsSummary(account: {
  requirements?: {
    disabled_reason?: string | null;
    currently_due?: string[] | null;
    eventually_due?: string[] | null;
    past_due?: string[] | null;
  } | null;
}): string | null {
  const requirements = account.requirements;

  if (!requirements) return null;

  const parts: string[] = [];

  if (requirements.disabled_reason) {
    parts.push(`Disabled reason: ${requirements.disabled_reason}`);
  }

  if (requirements.currently_due?.length) {
    parts.push(`Currently due: ${requirements.currently_due.join(", ")}`);
  }

  if (requirements.past_due?.length) {
    parts.push(`Past due: ${requirements.past_due.join(", ")}`);
  }

  if (requirements.eventually_due?.length) {
    parts.push(`Eventually due: ${requirements.eventually_due.join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id: propertyId } = await params;

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        name: true,
        propertyCode: true,
        stripeAccountId: true,
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found." },
        { status: 404 }
      );
    }

    if (!property.stripeAccountId) {
      const paymentStatus = await prisma.paymentConnectionStatus.upsert({
        where: { propertyId },
        update: {
          processorConnected: false,
          bankConnected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          onboardingComplete: false,
          requirementsDue: false,
          requirementsSummary: "No Stripe account is connected.",
          readyForLive: false,
          lastSyncedAt: new Date(),
        },
        create: {
          propertyId,
          processorConnected: false,
          bankConnected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          onboardingComplete: false,
          requirementsDue: false,
          requirementsSummary: "No Stripe account is connected.",
          readyForLive: false,
          lastSyncedAt: new Date(),
        },
      });

      return NextResponse.json({
        ok: true,
        property,
        paymentStatus,
      });
    }

    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve(property.stripeAccountId);

    const requirementsDue = Boolean(
      account.requirements?.currently_due?.length ||
        account.requirements?.past_due?.length ||
        account.requirements?.disabled_reason
    );

    const processorConnected = true;
    const bankConnected = Boolean(account.details_submitted);
    const chargesEnabled = Boolean(account.charges_enabled);
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const onboardingComplete = Boolean(account.details_submitted);
    const readyForLive =
      processorConnected &&
      bankConnected &&
      chargesEnabled &&
      payoutsEnabled &&
      onboardingComplete &&
      !requirementsDue;

    const requirementsSummary = getRequirementsSummary(account);

    const paymentStatus = await prisma.paymentConnectionStatus.upsert({
      where: { propertyId },
      update: {
        processorConnected,
        bankConnected,
        chargesEnabled,
        payoutsEnabled,
        onboardingComplete,
        requirementsDue,
        requirementsSummary,
        readyForLive,
        lastSyncedAt: new Date(),
      },
      create: {
        propertyId,
        processorConnected,
        bankConnected,
        chargesEnabled,
        payoutsEnabled,
        onboardingComplete,
        requirementsDue,
        requirementsSummary,
        readyForLive,
        lastSyncedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        propertyId,
        actorType: "ADMIN",
        actorAdminId: session.adminAccessId ?? null,
        action: "STRIPE_STATUS_SYNCED",
        targetType: "PROPERTY",
        targetId: propertyId,
        summary: "Admin refreshed Stripe account status from Stripe.",
        metadataJson: JSON.stringify({
          stripeAccountId: property.stripeAccountId,
          chargesEnabled,
          payoutsEnabled,
          onboardingComplete,
          requirementsDue,
          readyForLive,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      property,
      paymentStatus,
      stripeAccount: {
        id: account.id,
        chargesEnabled,
        payoutsEnabled,
        onboardingComplete,
        requirementsDue,
        requirementsSummary,
      },
    });
  } catch (error) {
    console.error(
      "POST /api/admin/properties/[id]/stripe-sync failed",
      error
    );

    return NextResponse.json(
      { error: "Failed to refresh Stripe status." },
      { status: 500 }
    );
  }
}