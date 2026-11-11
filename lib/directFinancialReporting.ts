import { isDeepStrictEqual } from "node:util";
import { resolveStripePaymentContext } from "@/lib/stripePaymentContext";
import type { DirectFinancialReconciliation, Payment } from "@prisma/client";
import { directFinancialSnapshot, type FinancialSnapshotPayment, type DirectEconomics } from "@/lib/directFinancialObservation";

type ObservedPayment = FinancialSnapshotPayment & Pick<Payment, "status" | "stripePaymentIntentId" | "stripeChargeId">;
export type FinancialReportJournal = Pick<DirectFinancialReconciliation, "id" | "paymentId" | "status" | "reasonCode" | "refreshRequested" | "expectedSnapshot" | "latestObservation" | "applicationFeeId" | "actualProcessorFeeCents" | "observedManagementNetCents" | "correctionCents" | "confirmedCorrectionCents" | "unresolvedShortfallCents" | "stripeRefundId" | "reservedAt" | "leaseToken" | "leaseUntil">;
const cents = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const reference = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Strict projection of completed recorded observations, not a provider read or
 * proof of current profit. Customer principal refunds are not inferred as zero. */
export function projectDirectFinancialReport(p: ObservedPayment, row: FinancialReportJournal | null | undefined) {
  const unknown = { financialEvidence: "UNVERIFIED" as const, financialObservationAt: null as string | null,
    observedProcessorFeeCents: null as number | null, observedManagementNetCents: null as number | null,
    observedApplicationFeeCents: null as number | null, observedApplicationFeeRefundCents: null as number | null,
    confirmedManagementCorrectionCents: null as number | null, observedPlatformRevenueCents: null as number | null,
    observedManagementShortfallCents: null as number | null, customerPrincipalRefundCents: null };
  if (p.chargeModel !== "DIRECT" || p.pricingVersion !== "RFL_DIRECT_V1" || p.status !== "PAID" || !row ||
      row.paymentId !== p.id || row.refreshRequested || row.leaseToken || row.leaseUntil ||
      !(row.status === "RECONCILED" || row.status === "CORRECTED" || (row.status === "EXCEPTION" && row.reasonCode === "INSUFFICIENT_RFL_FEE")) ||
      !isDeepStrictEqual(row.expectedSnapshot, directFinancialSnapshot(p))) return unknown;
  try {
    if (p.stripeMode !== "live" && p.stripeMode !== "test") return unknown;
    resolveStripePaymentContext(p, { platformAccountId: p.stripePlatformAccountId ?? "", mode: p.stripeMode });
    if (![p.stripePaymentIntentId, p.stripeChargeId, p.stripeCheckoutSessionId].every(reference) ||
        ![p.subtotalCents, p.platformFeeCents, p.totalChargedCents, p.expectedStripeProcessingFeeCents, p.rflApplicationFeeCents].every(cents) ||
        p.businessProceedsCents !== p.subtotalCents || p.totalChargedCents !== p.subtotalCents + p.platformFeeCents ||
        p.platformFeeCents !== p.expectedStripeProcessingFeeCents! + p.rflApplicationFeeCents!) return unknown;
    const o = row.latestObservation as unknown as DirectEconomics, b = o.base;
    if (typeof o.observedAt !== "string" || !Number.isFinite(Date.parse(o.observedAt)) ||
        b.intentId !== p.stripePaymentIntentId || b.chargeId !== p.stripeChargeId || b.applicationFeeId !== row.applicationFeeId ||
        ![b.chargeTransactionId, b.applicationFeeTransactionId, b.applicationFeeId, b.applicationId].every(reference) ||
        ![b.grossCents, b.processorFeeCents, b.applicationFeeCents, o.refundedCents, o.remainingApplicationFeeCents].every(cents) ||
        !Number.isSafeInteger(b.chargeNetCents) || !Number.isSafeInteger(o.managementNetCents) ||
        b.grossCents !== p.totalChargedCents || b.applicationFeeCents !== p.rflApplicationFeeCents ||
        b.chargeNetCents !== b.grossCents - b.processorFeeCents - b.applicationFeeCents ||
        o.refundedCents > b.applicationFeeCents || o.remainingApplicationFeeCents !== b.applicationFeeCents - o.refundedCents ||
        o.managementNetCents !== b.chargeNetCents + o.refundedCents || row.actualProcessorFeeCents !== b.processorFeeCents ||
        row.observedManagementNetCents !== o.managementNetCents || !Array.isArray(o.refunds) || o.refunds.length > 100) return unknown;
    if (new Set(o.refunds.map(refund => refund.id)).size !== o.refunds.length ||
        o.refunds.some(refund => !reference(refund.id) || !reference(refund.platformDebitId) || !reference(refund.connectedCreditId) || !cents(refund.amountCents) || refund.amountCents === 0) ||
        o.refunds.reduce((sum, refund) => sum + refund.amountCents, 0) !== o.refundedCents) return unknown;
    const owned = o.refunds.filter(refund => refund.operationId === row.id);
    if (!cents(row.confirmedCorrectionCents) || !cents(row.correctionCents) || row.confirmedCorrectionCents > row.correctionCents || owned.length > 1) return unknown;
    if (row.confirmedCorrectionCents > 0 && (!row.reservedAt || owned.length !== 1 || owned[0].id !== row.stripeRefundId ||
        owned[0].amountCents !== row.confirmedCorrectionCents || owned[0].paymentId !== p.id || owned[0].platformId !== p.stripePlatformAccountId ||
        owned[0].connectedId !== p.stripeConnectedAccountId || owned[0].mode !== p.stripeMode)) return unknown;
    if (row.confirmedCorrectionCents === 0 && owned.length) return unknown;
    const shortfall = Math.max(0, p.subtotalCents - o.managementNetCents);
    if (row.unresolvedShortfallCents !== shortfall) return unknown;
    return { financialEvidence: "OBSERVED_AS_OF" as const, financialObservationAt: o.observedAt,
      observedProcessorFeeCents: b.processorFeeCents, observedManagementNetCents: o.managementNetCents,
      observedApplicationFeeCents: b.applicationFeeCents, observedApplicationFeeRefundCents: o.refundedCents,
      confirmedManagementCorrectionCents: row.confirmedCorrectionCents, observedPlatformRevenueCents: b.applicationFeeCents - o.refundedCents,
      observedManagementShortfallCents: shortfall, customerPrincipalRefundCents: null };
  } catch { return unknown; }
}
