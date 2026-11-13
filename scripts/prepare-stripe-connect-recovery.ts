/** Trusted host only, following recover-original-checkout.ts. No HTTP endpoint.
 * Existing host secret injection and active ADMIN authority are both required.
 * Default preview; --apply prepares an attempt but never calls Stripe.
 */
import { open } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { AdminMutationUnauthorized } from "../lib/adminMutation";
import { prepareConfirmedStripeRejectionRetry, ConnectRecoveryRejected } from "../lib/stripeConnectRecovery";

async function main() {
  const args = process.argv.slice(2), values = new Map<string, string>();
  const allowed = new Set(["--admin-session", "--approval"]);
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--apply" && !apply) { apply = true; continue; }
    const value = args[++index];
    if (!allowed.has(flag) || values.has(flag) || !value || value.startsWith("--")) throw Error("INVALID_INVOCATION");
    values.set(flag, value);
  }
  if (values.size !== allowed.size) throw Error("INVALID_INVOCATION");
  const file = await open(values.get("--approval")!, "r");
  let text: string;
  try {
    const bytes = Buffer.alloc(16385);
    let total = 0;
    while (total < bytes.length) {
      const { bytesRead } = await file.read(bytes, total, bytes.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > 16384) throw Error("INVALID_APPROVAL");
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total));
  } finally { await file.close(); }
  const operator = await prisma.session.findUnique({ where: { id: values.get("--admin-session")! },
    include: { adminAccess: true, business: true, manager: { include: { business: true } } } });
  if (!operator) throw new AdminMutationUnauthorized();
  console.log(JSON.stringify(await prepareConfirmedStripeRejectionRetry(text, operator, apply)));
}
async function run() {
  try { await main(); }
  catch (error) {
    console.error(error instanceof ConnectRecoveryRejected ? error.code :
      error instanceof AdminMutationUnauthorized ? "ADMIN_UNAUTHORIZED" : "CONNECT_RECOVERY_FAILED");
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); }
    catch { console.error("CONNECT_RECOVERY_CLEANUP_FAILED"); process.exitCode = 1; }
  }
}
void run();
