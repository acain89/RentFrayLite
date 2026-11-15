import { SessionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { requireCredentialOrigin, PRIVATE_CREDENTIAL_HEADERS } from "@/lib/credentialRequest";
import { publicJson, publicJsonFailure } from "@/lib/publicJson";
import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import { getStripeClient } from "@/lib/stripe";
import { classifyStripeCredentialMode } from "@/lib/stripePaymentContext";
import { logOperationalError } from "@/lib/operationalLogging";

const headers = PRIVATE_CREDENTIAL_HEADERS;
const options = { timeout: 5000, maxNetworkRetries: 0 };
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session || session.type !== SessionType.MANAGER || !session.manager || !session.business) {
    return NextResponse.json({ error: "Sign in as a manager to continue." }, { status: 401, headers });
  }
  try { requireCredentialOrigin(request); }
  catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers }); }
  try {
    const body = await publicJson(request, 256);
    if (Object.keys(body).length) return NextResponse.json({ error: "This request does not accept account details." }, { status: 400, headers });
  } catch (error) {
    const response = publicJsonFailure(error);
    for (const [key,value] of Object.entries(headers)) response.headers.set(key,value);
    return response;
  }
  try {
    const url = await withManagerMutation(session, async tx => {
      // Account selection is exclusively from the currently authorized business.
      const connection = await tx.stripeConnection.findUnique({ where: { businessId: session.business!.id } });
      const journal = await tx.stripeAccountProvisioning.findUnique({ where: { businessId: session.business!.id } });
      if (!connection || !journal || journal.stripeAccountId !== connection.stripeAccountId) throw new Error("Unverified connection.");
      const mode = classifyStripeCredentialMode(process.env.STRIPE_SECRET_KEY ?? "");
      if (mode === "unknown" || journal.stripeMode !== mode || (process.env.NODE_ENV === "production" && mode !== "live")) throw new Error("Unverified mode.");
      const stripe = getStripeClient();
      const platform = await stripe.accounts.retrieve(options);
      const balance = await stripe.balance.retrieve({}, options);
      if (platform.id !== journal.stripePlatformAccountId || balance.livemode !== (mode === "live") || platform.id === connection.stripeAccountId) throw new Error("Unverified platform.");
      const account = await stripe.accounts.retrieve(connection.stripeAccountId, {}, options);
      if (account.id !== connection.stripeAccountId || ("deleted" in account && account.deleted)) throw new Error("Unavailable account.");
      const dashboard = account.controller?.stripe_dashboard?.type ?? (account.type === "express" ? "express" : account.type === "standard" ? "full" : "none");
      if (dashboard === "full") return "https://dashboard.stripe.com/";
      if (dashboard !== "express") throw new Error("Unsupported dashboard.");
      const link = await stripe.accounts.createLoginLink(account.id, {}, options);
      const target = new URL(link.url);
      if (target.protocol !== "https:" || target.hostname !== "connect.stripe.com" || target.username || target.password || target.port) throw new Error("Invalid login link.");
      return target.href;
    });
    return NextResponse.json({ url }, { headers });
  } catch (error) {
    if (error instanceof ManagerMutationUnauthorized) return NextResponse.json({ error: "Your session changed. Please sign in again." }, { status: 401, headers });
    logOperationalError("stripe_refresh_failed", error, session.business.id);
    return NextResponse.json({ error: "Banking access is temporarily unavailable. Please try again or contact support." }, { status: 503, headers });
  }
}
