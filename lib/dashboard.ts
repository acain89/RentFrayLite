import {
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

export type DashboardPaymentStatus =
  | "PAID"
  | "PENDING"
  | "FAILED";

export type DashboardPayment = {
  id: string;
  status: DashboardPaymentStatus;
  customerName: string;
  reference: string;
  amountCents: number;
  lateFeeCents: number;
  paymentMethod: "ACH" | "CARD" | "—";
  timestamp: string;
};

type LineItemRecord = Record<string, unknown>;

export function getCurrentBillingCycle(
  date = new Date()
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  );

  return `${year}-${month}`;
}

export function formatBillingCycleLabel(
  billingCycle: string
): string {
  const match = /^(\d{4})-(\d{2})$/.exec(billingCycle);

  if (!match) {
    return billingCycle;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function asRecord(value: unknown): LineItemRecord | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as LineItemRecord;
}

function readLineItems(
  snapshot: Prisma.JsonValue
): unknown[] {
  if (Array.isArray(snapshot)) {
    return snapshot;
  }

  const record = asRecord(snapshot);

  if (!record) {
    return [];
  }

  const possibleArrays = [
    record.items,
    record.lineItems,
    record.charges,
  ];

  for (const value of possibleArrays) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function readNumber(
  record: LineItemRecord,
  keys: string[]
): number {
  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return Math.round(value);
    }
  }

  return 0;
}

function isLateFeeLineItem(
  record: LineItemRecord
): boolean {
  const searchableValues = [
    record.type,
    record.kind,
    record.category,
    record.code,
    record.label,
    record.name,
    record.description,
  ];

  return searchableValues.some((value) => {
    if (typeof value !== "string") {
      return false;
    }

    const normalized = value
      .trim()
      .toLowerCase()
      .replaceAll("_", " ");

    return (
      normalized.includes("late fee") ||
      normalized.includes("latefee") ||
      normalized === "late"
    );
  });
}

export function getLateFeeCents(
  snapshot: Prisma.JsonValue
): number {
  return readLineItems(snapshot).reduce<number>(
    (total, item) => {
      const record = asRecord(item);

      if (!record || !isLateFeeLineItem(record)) {
        return total;
      }

      const amountCents = readNumber(record, [
        "amountCents",
        "totalCents",
        "subtotalCents",
        "priceCents",
      ]);

      if (amountCents > 0) {
        return total + amountCents;
      }

      const quantity = Math.max(
        1,
        readNumber(record, ["quantity"])
      );

      const unitAmountCents = readNumber(record, [
        "unitAmountCents",
        "unitPriceCents",
      ]);

      return total + unitAmountCents * quantity;
    },
    0
  );
}

export function getDashboardStatus(
  status: PaymentStatus
): DashboardPaymentStatus | null {
  switch (status) {
    case PaymentStatus.PAID:
      return "PAID";

    case PaymentStatus.PENDING:
      return "PENDING";

    case PaymentStatus.FAILED:
      return "FAILED";

    default:
      return null;
  }
}

export function getPaymentTimestamp(input: {
  status: PaymentStatus;
  paidAt: Date | null;
  pendingAt: Date | null;
  failedAt: Date | null;
  checkoutStartedAt: Date | null;
  createdAt: Date;
}): Date {
  switch (input.status) {
    case PaymentStatus.PAID:
      return input.paidAt ?? input.createdAt;

    case PaymentStatus.PENDING:
      return (
        input.pendingAt ??
        input.checkoutStartedAt ??
        input.createdAt
      );

    case PaymentStatus.FAILED:
      return input.failedAt ?? input.createdAt;

    default:
      return input.createdAt;
  }
}

export function getPaymentMethodLabel(
  method: PaymentMethod | null
): "ACH" | "CARD" | "—" {
  switch (method) {
    case PaymentMethod.ACH:
      return "ACH";

    case PaymentMethod.CARD:
      return "CARD";

    default:
      return "—";
  }
}