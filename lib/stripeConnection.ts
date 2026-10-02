import { withManagerMutation, type ManagerMutationIdentity } from "@/lib/managerMutation";
import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeMode, readStripeReadinessFacts } from "@/lib/businessPaymentReadiness";
import { getStripeReadinessReasons } from "@/lib/paymentReadiness";

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
  stripeAccountId: string,
  authority?: ManagerMutationIdentity,
): Promise<StripeConnectionStatus> {
  const { account, facts } = await readStripeReadinessFacts(stripeAccountId);

  if (Object.hasOwn(account, "deleted")) {
    throw new Error(
      "The connected Stripe account is no longer available."
    );
  }

  const outstandingRequirements = readRequirements(account);

  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;
  const onboardingComplete = account.details_submitted;
  const requirementsDue = facts.restricted;

  const readyForLive = getStripeMode() === "live" &&
    getStripeReadinessReasons(facts, getStripeMode(), process.env.NODE_ENV === "production").length === 0;

  const requirementsSummary =
    outstandingRequirements.length > 0
      ? outstandingRequirements
          .map(formatRequirement)
          .join(", ")
      : null;

  const persist = async (transaction: Prisma.TransactionClient) => {
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

  };
  if (authority) {
    if (authority.businessId !== businessId) throw new Error("Authentication required.");
    await withManagerMutation(authority, persist);
  } else {
    // Internal provider-fact refresh is not a manager command. The manager page
    // always supplies authority; refresh never activates a disabled business.
    await prisma.$transaction(persist);
  }

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