import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  emptyStripeConnectionStatus,
  syncStripeConnection,
} from "@/lib/stripeConnection";
import BankSetupClient from "./BankSetupClient";

type BankSetupPageProps = {
  searchParams: Promise<{
    returned?: string;
    error?: string;
  }>;
};

export default async function BankSetupPage({
  searchParams,
}: BankSetupPageProps) {
  const { business } = await requireManager();
  const parameters = await searchParams;

  const connection = await prisma.stripeConnection.findUnique({
    where: {
      businessId: business.id,
    },
  });

  let status = emptyStripeConnectionStatus();
  let synchronizationError: string | null = null;

  if (connection) {
    try {
      status = await syncStripeConnection(
        business.id,
        connection.stripeAccountId
      );
    } catch (error) {
      console.error("Unable to synchronize Stripe account:", error);

      synchronizationError =
        "We couldn’t check your Stripe status. Please try again.";
    }
  }

  const highestReachedStep = status.readyForLive ? 7 : 6;

  return (
    <BankSetupClient
      initialStatus={status}
      highestReachedStep={highestReachedStep}
      returnedFromStripe={parameters.returned === "1"}
      initialError={
        synchronizationError ??
        (parameters.error
          ? "Stripe setup could not be reopened. Please try again."
          : null)
      }
    />
  );
}