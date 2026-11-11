// Phase 4.1 does not introduce an environment flag capable of activating DIRECT.
// Source-controlled decisions stay OFF pending provider and integration evidence.
// No runtime configuration is accepted. Financial execution is approved separately.
const DIRECT_CHECKOUT_ACTIVATED = false;
const DIRECT_FINANCIAL_EXECUTION_ACTIVATED = false;

export function selectedCheckoutChargeModel(): "LEGACY_DESTINATION" | "DIRECT" {
  return DIRECT_CHECKOUT_ACTIVATED ? "DIRECT" : "LEGACY_DESTINATION";
}

export function directPaymentCreationEnabled(): boolean {
  return DIRECT_CHECKOUT_ACTIVATED;
}

export function directQuoteIssuanceEnabled(): boolean {
  return DIRECT_CHECKOUT_ACTIVATED;
}

export function directReservationEnabled(): boolean {
  return DIRECT_CHECKOUT_ACTIVATED;
}

export function directFinancialExecutionEnabled(): boolean {
  return DIRECT_FINANCIAL_EXECUTION_ACTIVATED;
}
