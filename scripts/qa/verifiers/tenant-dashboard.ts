import { getTotalOutstandingCents, type QaAccount } from "../account-model";
import { expect } from "../reporter";
import { getUnitFinancialState } from "../../../lib/unitFinancialState";

export async function verifyTenantDashboardEquivalent(input: {
  name: string;
  qaAccount: QaAccount;
  propertyId: string;
  unitId: string;
  tenantAssignmentId: string;
  tier: {
    rentDueDay: number;
    gracePeriodDays: number;
    lateFeeInitialCents: number;
    lateFeeDailyCents: number;
    maxLateFeeDays: number;
  } | null;
  propertySettings: {
    rentDueDay: number;
    gracePeriodDays: number;
    lateFeeEnabled: boolean;
    lateFeeFlatCents: number | null;
  } | null;
  billingCycleStartDate: Date | null;
  now: Date;
}): Promise<void> {
  const state = await getUnitFinancialState({
    propertyId: input.propertyId,
    unitId: input.unitId,
    tenantAssignmentId: input.tenantAssignmentId,
    tier: input.tier,
    propertySettings: input.propertySettings,
    billingCycleStartDate: input.billingCycleStartDate,
    now: input.now,
  });

  const qaOutstanding = getTotalOutstandingCents(input.qaAccount);

  expect(
    `${input.name} tenant balance`,
    state.ledgerBalanceCents === qaOutstanding,
    `Tenant ${state.ledgerBalanceCents}, QA ${qaOutstanding}`
  );

  expect(
    `${input.name} tenant total due is not below balance`,
    state.tenantTotalDueCents >= state.ledgerBalanceCents,
    `totalDue ${state.tenantTotalDueCents}, balance ${state.ledgerBalanceCents}`
  );

  expect(
    `${input.name} tenant pending lock agrees`,
    state.hasPendingPayment === (input.qaAccount.pendingPaymentCents > 0),
    `Tenant pending ${state.hasPendingPayment}, QA pending ${
      input.qaAccount.pendingPaymentCents > 0
    }`
  );
}