import { createHash } from "node:crypto";

const operations = new Set([
  "checkout_snapshot_invalid", "checkout_transport_limit", "checkout_reservation_failed",
  "checkout_create_failed", "checkout_persistence_failed", "checkout_recovery_failed", "checkout_url_missing",
  "stripe_signature_failed", "stripe_processing_failed", "stripe_connect_failed",
  "stripe_refresh_failed", "stripe_sync_failed", "setup_failed", "database_failed", "checkout_review_failed", "payment_result_failed",
  "sms_worker_failed", "sms_status_callback_failed", "sms_inbound_callback_failed",
]);
const classifications = new Set([
  "ACCOUNT_MODE_MISMATCH", "UNSUPPORTED_FINANCIAL_EVENT", "UNKNOWN_PAYMENT_OWNERSHIP",
  "CHECKOUT_OWNERSHIP_NOT_PERSISTED", "RETRYABLE_STATE_CHANGED", "SMS_OUTBOX_PERSISTENCE_FAILED",
]);
const stripeTypes = new Set(["StripeAPIError", "StripeConnectionError", "StripeAuthenticationError",
  "StripeInvalidRequestError", "StripeRateLimitError", "StripeCardError", "StripePermissionError", "StripeSignatureVerificationError"]);
const databaseCodes = new Set(["P1000", "P1001", "P1002", "P1017", "P2002", "P2003", "P2024", "P2025", "P2034"]);

// Never serialize an error, message, stack, request, response, headers or body.
// References must be opaque stored IDs or server-generated request references,
// and are hashed instead of printed. Never use incoming headers or customer data.
// Authorized operators can hash a stored ID to correlate a failure;
// original provider/payment IDs and exception classifications remain in the DB.
export function operationalDiagnostic(operation: string, error?: unknown, reference?: unknown) {
  let category = operation === "database_failed" ? "DATABASE_ERROR" : operation === "stripe_signature_failed"
    ? "VERIFICATION_FAILED" : error === undefined ? "CHECK_FAILED" : "UNEXPECTED_ERROR";
  try {
    if (error && typeof error === "object") {
      const e = error as { classification?: unknown; type?: unknown; code?: unknown; constructor?: { name?: string } };
      if (typeof e.classification === "string" && classifications.has(e.classification)) category = e.classification;
      else if (e.constructor?.name === "OwnershipMismatch") category = "OWNERSHIP_MISMATCH";
      else if (typeof e.type === "string" && stripeTypes.has(e.type)) category = e.type;
      else if (typeof e.code === "string" && databaseCodes.has(e.code)) category = `PRISMA_${e.code}`;
      else if (e.code === 21610) category = "TWILIO_OPTED_OUT";
      else if (e.code === 20429) category = "TWILIO_RATE_LIMITED";
      else if (e.code === "ETIMEDOUT") category = "NETWORK_TIMEOUT";
      else if (e.code === "ECONNRESET") category = "NETWORK_UNCONFIRMED";
    }
  } catch { category = "UNEXPECTED_ERROR"; }
  return {
    operation: operations.has(operation) ? operation : "unknown_operation",
    category,
    ...(typeof reference === "string" && reference.length > 0 && reference.length <= 256
      ? { correlation: createHash("sha256").update(reference).digest("hex") } : {}),
  };
}

export function logOperationalError(operation: string, error?: unknown, reference?: unknown) {
  console.error("RFL_OPERATION_FAILED", operationalDiagnostic(operation, error, reference));
}
