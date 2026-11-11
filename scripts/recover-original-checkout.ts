/** Operator-only maintenance command. Default preview; never run by the web app.
 * Credentials come from the approved host's existing secret injection, not args.
 * The host operator must also name an existing active ADMIN session for audit
 * attribution/revocation checks. A session ID alone grants no remote access. */
import { prisma } from "../lib/prisma";
import { getStripeClient } from "../lib/stripe";
import { classifyStripeCredentialMode } from "../lib/stripePaymentContext";
import { recoverOriginalCheckoutSession } from "../lib/originalCheckoutRecovery";

async function main() {
  const args = process.argv.slice(2), values = new Map<string, string>();
  const allowed = new Set(["--admin-session", "--business", "--payment", "--attempt", "--session", "--platform", "--mode"]);
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--apply" && !apply) { apply = true; continue; }
    const value = args[++index];
    if (!allowed.has(flag) || values.has(flag) || !value || value.startsWith("--")) throw Error("Invalid recovery arguments.");
    values.set(flag, value);
  }
  if (values.size !== allowed.size || !["test", "live"].includes(values.get("--mode")!)) throw Error("Invalid recovery arguments.");
  const operator = await prisma.session.findUnique({ where: { id: values.get("--admin-session")! },
    include: { adminAccess: true, business: true, manager: { include: { business: true } } } });
  if (!operator) throw Error("Unauthorized.");
  const result = await recoverOriginalCheckoutSession(getStripeClient(), {
    businessId: values.get("--business")!, paymentId: values.get("--payment")!, checkoutAttemptId: values.get("--attempt")!, stripeSessionId: values.get("--session")!,
  }, operator, { platformAccountId: values.get("--platform")!, mode: values.get("--mode")! as "test" | "live" },
  classifyStripeCredentialMode(process.env.STRIPE_SECRET_KEY ?? ""), apply);
  console.log(JSON.stringify(result));
}

main().catch(() => {
  // Never print provider errors, connection strings, session authority or payer data.
  console.error("Original checkout recovery blocked. Preserve the attempt and escalate; do not create another payment.");
  process.exitCode = 1;
}).finally(async () => {
  try { await prisma.$disconnect(); }
  catch {
    console.error("Recovery cleanup failed. Inspect protected operational status.");
    process.exitCode = 1;
  }
});
