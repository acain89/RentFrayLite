import { getTotalOutstandingCents, type QaAccount } from "../account-model";
import { expect } from "../reporter";
import { getRentFrayLedgerOutstandingCents } from "../ledger-verifier";

export async function verifyLedgerMatchesQaModel(input: {
  name: string;
  qaAccount: QaAccount;
  propertyId: string;
  unitId: string;
  tenantAssignmentId: string;
}): Promise<void> {
  const rentFrayOutstanding = await getRentFrayLedgerOutstandingCents({
    propertyId: input.propertyId,
    unitId: input.unitId,
    tenantAssignmentId: input.tenantAssignmentId,
  });

  const qaOutstanding = getTotalOutstandingCents(input.qaAccount);

  expect(
    input.name,
    rentFrayOutstanding === qaOutstanding,
    `RentFray ${rentFrayOutstanding}, QA ${qaOutstanding}`
  );
}