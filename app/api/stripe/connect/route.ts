import { logOperationalError } from "@/lib/operationalLogging";
import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import { SessionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getStripeClient } from "@/lib/stripe";
import { provisionStripeConnectedAccount, StripeProvisioningUnverified } from "@/lib/stripeAccountProvisioning";

function getApplicationOrigin(request: Request): string {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");

  return configuredOrigin || new URL(request.url).origin;
}

export async function POST(request: Request) {
  try { requireCredentialOrigin(request); } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
  if (request.body) return NextResponse.json({ error: "This action does not accept a request body." }, { status: 400 });

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
  const origin = getApplicationOrigin(request);

  try {
    const connection = await provisionStripeConnectedAccount(session, stripe);

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
    if (error instanceof StripeProvisioningUnverified) return NextResponse.json({ code: "STRIPE_PROVISIONING_UNVERIFIED", error: error.message }, { status: 409 });
    logOperationalError("stripe_connect_failed", error, session.business.id);

    return NextResponse.json(
      {
        error:
          "Unable to open Stripe setup. Check your Stripe configuration and try again.",
      },
      { status: 500 }
    );
  }
}