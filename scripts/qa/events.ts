export type QaEvent =
  | {
      type: "POST_RENT";
      cycle: string;
      unitNumber: string;
      amountCents: number;
    }
  | {
      type: "POST_LATE_FEE";
      cycle: string;
      unitNumber: string;
      amountCents: number;
    }
  | {
      type: "POST_RECURRING_CHARGE";
      cycle: string;
      unitNumber: string;
      amountCents: number;
      memo: string;
    }
  | {
      type: "PAYMENT_STARTED";
      cycle: string;
      unitNumber: string;
      amountCents: number;
    }
  | {
      type: "PAYMENT_SETTLED";
      cycle: string;
      unitNumber: string;
      amountCents: number;
    }
  | {
      type: "PAYMENT_FAILED";
      cycle: string;
      unitNumber: string;
      amountCents: number;
    }
  | {
      type: "MANUAL_PAYMENT";
      cycle: string;
      unitNumber: string;
      amountCents: number;
    }
  | {
      type: "POST_CREDIT";
      cycle: string;
      unitNumber: string;
      amountCents: number;
      memo: string;
    }
  | {
      type: "POST_ADJUSTMENT";
      cycle: string;
      unitNumber: string;
      amountCents: number;
      memo: string;
    };