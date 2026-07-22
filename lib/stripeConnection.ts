import type Stripe from "stripe";
import { SetupStep } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

export type StripeConnectionStatus = {
  exists: boolean;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
  requirementsDue: boolean;
  requirementsSummary: string | null;
  readyForLive: boolean;
};

function formatRequirement(requirement: string): string {
  return requirement
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function readRequirements(account: Stripe.Account): string[] {
  return Array.from(
    new Set([
      ...(account.requirements?.past_due ?? []),
      ...(account.requirements?.currently_due ?? []),
    ])
  );
}

export async function syncStripeConnection(
  businessId: string,
  stripeAccountId: string
): Promise<StripeConnectionStatus> {
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(stripeAccountId);

  if (account.deleted) {
    throw new Error(
      "The connected Stripe account is no longer available."
    );
  }

  const outstandingRequirements = readRequirements(account);

  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;
  const onboardingComplete = account.details_submitted;
  const requirementsDue = outstandingRequirements.length > 0;

  const readyForLive =
    chargesEnabled &&
    payoutsEnabled &&
    onboardingComplete &&
    !requirementsDue;

  const requirementsSummary =
    outstandingRequirements.length > 0
      ? outstandingRequirements
          .map(formatRequirement)
          .join(", ")
      : null;

  await prisma.$transaction(async (transaction) => {
    await transaction.stripeConnection.upsert({
      where: {
        businessId,
      },
      create: {
        businessId,
        stripeAccountId,
        chargesEnabled,
        payoutsEnabled,
        onboardingComplete,
        requirementsDue,
        requirementsSummary,
        readyForLive,
        lastSyncedAt: new Date(),
      },
      update: {
        stripeAccountId,
        chargesEnabled,
        payoutsEnabled,
        onboardingComplete,
        requirementsDue,
        requirementsSummary,
        readyForLive,
        lastSyncedAt: new Date(),
      },
    });

    if (readyForLive) {
      await transaction.business.update({
        where: {
          id: businessId,
        },
        data: {
          setupStep: SetupStep.CHOOSE_ACCOUNT_CODE,
        },
      });
    }
  });

  return {
    exists: true,
    stripeAccountId,
    chargesEnabled,
    payoutsEnabled,
    onboardingComplete,
    requirementsDue,
    requirementsSummary,
    readyForLive,
  };
}

export function emptyStripeConnectionStatus(): StripeConnectionStatus {
  return {
    exists: false,
    stripeAccountId: null,
    chargesEnabled: false,
    payoutsEnabled: false,
    onboardingComplete: false,
    requirementsDue: false,
    requirementsSummary: null,
    readyForLive: false,
  };
}