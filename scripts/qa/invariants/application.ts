import { getTotalOutstandingCents, type QaAccount } from "../account-model";
import { expect } from "../reporter";
import { getRentFrayLedgerOutstandingCents } from "../ledger-verifier";
import { getUnitFinancialState } from "../../../lib/unitFinancialState";

export async function verifyApplicationInvariants(input: {
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
  const qaOutstanding = getTotalOutstandingCents(input.qaAccount);

  const ledgerOutstanding = await getRentFrayLedgerOutstandingCents({
    propertyId: input.propertyId,
    unitId: input.unitId,
    tenantAssignmentId: input.tenantAssignmentId,
  });

  const financialState = await getUnitFinancialState({
    propertyId: input.propertyId,
    unitId: input.unitId,
    tenantAssignmentId: input.tenantAssignmentId,
    tier: input.tier,
    propertySettings: input.propertySettings,
    billingCycleStartDate: input.billingCycleStartDate,
    now: input.now,
  });

  expect(
    `${input.name} invariant: QA equals ledger`,
    qaOutstanding === ledgerOutstanding,
    `QA ${qaOutstanding}, ledger ${ledgerOutstanding}`
  );

  expect(
    `${input.name} invariant: ledger equals financial state`,
    ledgerOutstanding === financialState.ledgerBalanceCents,
    `ledger ${ledgerOutstanding}, financialState ${financialState.ledgerBalanceCents}`
  );

  expect(
    `${input.name} invariant: tenant total due is not below ledger balance`,
    financialState.tenantTotalDueCents >= financialState.ledgerBalanceCents,
    `totalDue ${financialState.tenantTotalDueCents}, balance ${financialState.ledgerBalanceCents}`
  );

  expect(
    `${input.name} invariant: pending flag agrees with QA model`,
    financialState.hasPendingPayment ===
      (input.qaAccount.pendingPaymentCents > 0),
    `financialState ${financialState.hasPendingPayment}, QA ${
      input.qaAccount.pendingPaymentCents > 0
    }`
  );

  if (financialState.hasPendingPayment) {
    expect(
      `${input.name} invariant: pending unit cannot attempt payment`,
      financialState.status.canAttemptPayment === false,
      `canAttemptPayment ${financialState.status.canAttemptPayment}`
    );
  }

  if (financialState.ledgerBalanceCents === 0) {
    expect(
      `${input.name} invariant: zero balance is not delinquent`,
      financialState.isDelinquent === false,
      `isDelinquent ${financialState.isDelinquent}`
    );
  }
}