import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import type { StripePaymentIdentity } from "@/lib/stripePaymentContext";
import { reconcileDirectPayment } from "@/lib/directFinancialReconciliation";
import { directFinancialExecutionEnabled } from "@/lib/directFinancialRunnerPolicy";

/** Trusted internal batch only; no route, timer or client-provided callback.
 * Existing worker owns leases, immutable validation and durable correction keys. */
export async function processDirectFinancialQueue(db: PrismaClient, stripe: Stripe, identity: StripePaymentIdentity, limit = 20) {
  if (!directFinancialExecutionEnabled()) return { status: "DISABLED" as const, attempted: 0, busy: 0, failed: 0 };
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw Error("Financial batch limit must be between 1 and 20.");
  if (!/^acct_[A-Za-z0-9]+$/.test(identity.platformAccountId) || !["test", "live"].includes(identity.mode)) throw Error("Financial identity unavailable.");
  const now = new Date();
  const rows = await db.directFinancialReconciliation.findMany({
    where: { AND: [
      { payment: { chargeModel: "DIRECT", pricingVersion: "RFL_DIRECT_V1", status: "PAID", stripePlatformAccountId: identity.platformAccountId, stripeMode: identity.mode } },
      { OR: [{ status: { in: ["WAITING_DATA", "REQUIRED"] } }, { refreshRequested: true }, { status: "EXCEPTION", reasonCode: { in: ["PROVIDER_OR_PERSISTENCE_UNCONFIRMED", "CORRECTION_UNCONFIRMED", "CORRECTION_DATA_PENDING", "FINANCIAL_DATA_PENDING", "FINANCIAL_DATA_MISSING"] } }] },
      { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    ] }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: limit, select: { paymentId: true },
  });
  let failed = 0, busy = 0;
  // De-duplicate defensively and retain the hard bound even for an invalid adapter.
  const ids = [...new Set(rows.map(row => row.paymentId))].slice(0, limit);
  for (const paymentId of ids) {
    try { if ((await reconcileDirectPayment(db, stripe, paymentId, identity)).kind === "BUSY") busy++; }
    catch { failed++; /* Existing durable reservation/lease remains the authority. */ }
  }
  return { status: "PROCESSED" as const, attempted: ids.length, busy, failed };
}
