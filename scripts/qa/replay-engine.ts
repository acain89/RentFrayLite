import type { QaAccount } from "./account-model";
import {
  addLedgerEntry,
  failCyclePayment,
  postCycleLateFee,
  postCyclePayment,
  postCycleRent,
  startCyclePendingPayment,
} from "./account-model";
import type { QaEvent } from "./events";

export function processEvent(
  account: QaAccount,
  event: QaEvent
): QaAccount {
  switch (event.type) {
    case "POST_RENT":
      return postCycleRent(account, event.cycle, event.amountCents);

    case "POST_LATE_FEE":
      return postCycleLateFee(account, event.cycle, event.amountCents);

    case "POST_RECURRING_CHARGE":
  return addLedgerEntry(account, {
    cycle: event.cycle,
    kind: "RECURRING_CHARGE",
    amountCents: event.amountCents,
    memo: event.memo,
  });

    case "PAYMENT_STARTED":
      return startCyclePendingPayment(account, event.cycle, event.amountCents);

    case "PAYMENT_SETTLED":
    case "MANUAL_PAYMENT":
      return postCyclePayment(account, event.cycle, event.amountCents);

    case "PAYMENT_FAILED":
      return failCyclePayment(account, event.cycle, event.amountCents);

    case "POST_CREDIT":
      return addLedgerEntry(account, {
        cycle: event.cycle,
        kind: "CREDIT",
        amountCents: -Math.abs(event.amountCents),
        memo: event.memo,
      });

    case "POST_ADJUSTMENT":
      return addLedgerEntry(account, {
        cycle: event.cycle,
        kind: "ADJUSTMENT",
        amountCents: event.amountCents,
        memo: event.memo,
      });

    default: {
      const exhaustive: never = event;
      throw new Error(`Unhandled QA event: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function replayEvents(
  startingAccount: QaAccount,
  events: QaEvent[]
): QaAccount {
  return events.reduce<QaAccount>(
    (account, event) => processEvent(account, event),
    startingAccount
  );
}