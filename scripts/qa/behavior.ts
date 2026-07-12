import type { QaEvent } from "./events";

export type TenantBehavior =
  | "ALWAYS_PAY"
  | "NEVER_PAY"
  | "PAY_AFTER_3_MONTHS"
  | "PAY_AFTER_4_MONTHS"
  | "PARTIAL_EVERY_MONTH"
  | "FAILED_THEN_RETRY"
  | "PENDING_ACROSS_CYCLE"
  | "MANUAL_ONLY";

export type BehaviorContext = {
  unitNumber: string;
  cycle: string;
  monthIndex: number;
  rentCents: number;
};

export function buildBehaviorEvents(
  behavior: TenantBehavior,
  context: BehaviorContext
): QaEvent[] {
  const base: QaEvent[] = [
    {
      type: "POST_RENT",
      cycle: context.cycle,
      unitNumber: context.unitNumber,
      amountCents: context.rentCents,
    },
  ];

  switch (behavior) {
    case "ALWAYS_PAY":
      return [
        ...base,
        {
          type: "PAYMENT_SETTLED",
          cycle: context.cycle,
          unitNumber: context.unitNumber,
          amountCents: context.rentCents,
        },
      ];

    case "NEVER_PAY":
      return base;

    case "PAY_AFTER_3_MONTHS":
      return context.monthIndex > 0 && context.monthIndex % 3 === 0
        ? [
            ...base,
            {
              type: "PAYMENT_SETTLED",
              cycle: context.cycle,
              unitNumber: context.unitNumber,
              amountCents: context.rentCents * 4,
            },
          ]
        : base;

    case "PAY_AFTER_4_MONTHS":
      return context.monthIndex > 0 && context.monthIndex % 4 === 0
        ? [
            ...base,
            {
              type: "PAYMENT_SETTLED",
              cycle: context.cycle,
              unitNumber: context.unitNumber,
              amountCents: context.rentCents * 5,
            },
          ]
        : base;

    case "PARTIAL_EVERY_MONTH":
      return [
        ...base,
        {
          type: "PAYMENT_SETTLED",
          cycle: context.cycle,
          unitNumber: context.unitNumber,
          amountCents: Math.floor(context.rentCents / 2),
        },
      ];

    case "FAILED_THEN_RETRY":
      return context.monthIndex % 2 === 0
        ? [
            ...base,
            {
              type: "PAYMENT_STARTED",
              cycle: context.cycle,
              unitNumber: context.unitNumber,
              amountCents: context.rentCents,
            },
            {
              type: "PAYMENT_FAILED",
              cycle: context.cycle,
              unitNumber: context.unitNumber,
              amountCents: context.rentCents,
            },
          ]
        : [
            ...base,
            {
              type: "PAYMENT_SETTLED",
              cycle: context.cycle,
              unitNumber: context.unitNumber,
              amountCents: context.rentCents * 2,
            },
          ];

    case "PENDING_ACROSS_CYCLE":
      return context.monthIndex === 0
        ? [
            ...base,
            {
              type: "PAYMENT_STARTED",
              cycle: context.cycle,
              unitNumber: context.unitNumber,
              amountCents: context.rentCents,
            },
          ]
        : base;

    case "MANUAL_ONLY":
      return [
        ...base,
        {
          type: "MANUAL_PAYMENT",
          cycle: context.cycle,
          unitNumber: context.unitNumber,
          amountCents: context.rentCents,
        },
      ];

    default: {
      const exhaustive: never = behavior;
      throw new Error(`Unhandled tenant behavior: ${exhaustive}`);
    }
  }
}