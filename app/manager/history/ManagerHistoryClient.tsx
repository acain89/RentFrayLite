"use client";

import Link from "next/link";
import {
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

type PaymentStatus =
  | "CREATED"
  | "CHECKOUT_STARTED"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED"
  | "DISPUTED"
  | "RETURNED";

type PaymentMethod = "ACH" | "CARD" | null;

type PaymentSourceType =
  | "RECURRING_PLAN"
  | "CATALOG_ITEM"
  | "CUSTOM_POSTING";



export type HistoryPayment = {
  id: string;
  sourceType: PaymentSourceType;
  sourceId: string | null;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;

  payerFirstName: string;
  payerLastName: string;
  payerPhone: string;
  payerEmail: string | null;
  referenceLabel: string | null;

  itemDescription: string;
  lineItemsSnapshot: unknown;
  subtotalCents: number;
  platformFeeCents: number;
  processorFeeCents: number | null;
  totalChargedCents: number;
  businessProceedsCents: number | null;

  billingCycle: string | null;

  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;

  checkoutStartedAt: string | null;
  pendingAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  expiredAt: string | null;
  refundedAt: string | null;
  disputedAt: string | null;
  returnedAt: string | null;

  failureCode: string | null;
  failureMessage: string | null;

  createdAt: string;
  updatedAt: string;
  timestamp: string;
};

type ManagerHistoryClientProps = {
  businessName: string;
  accountCode: string;
  managerName: string;
  payments: HistoryPayment[];
};

type StatusFilter = "ALL" | PaymentStatus;
type MethodFilter = "ALL" | "ACH" | "CARD";
type SortOrder = "NEWEST" | "OLDEST";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatMoney(cents: number | null): string {
  if (cents === null) {
    return "Not available";
  }

  return currencyFormatter.format(cents / 100);
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return "Not available";
  }

  return dateFormatter.format(new Date(timestamp));
}

function formatStatus(status: PaymentStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

function formatSourceType(
  sourceType: PaymentSourceType
): string {
  switch (sourceType) {
    case "RECURRING_PLAN":
      return "Recurring plan";
    case "CATALOG_ITEM":
      return "Product or service";
    case "CUSTOM_POSTING":
      return "Custom posting";
  }
}

function csvEscape(value: string | number | null): string {
  const text = value === null ? "" : String(value);

  return `"${text.replaceAll('"', '""')}"`;
}

function getCustomerName(payment: HistoryPayment): string {
  return [
    payment.payerFirstName,
    payment.payerLastName,
  ]
    .filter(Boolean)
    .join(" ");
}

function getReference(payment: HistoryPayment): string {
  return (
    payment.referenceLabel?.trim() ||
    payment.itemDescription
  );
}

function getCopyText(payment: HistoryPayment): string {
  return [
    `Payment ID: ${payment.id}`,
    `Status: ${formatStatus(payment.status)}`,
    `Customer: ${getCustomerName(payment)}`,
    `Phone: ${payment.payerPhone}`,
    `Email: ${payment.payerEmail ?? "Not provided"}`,
    `Reference: ${getReference(payment)}`,
    `Description: ${payment.itemDescription}`,
    `Source: ${formatSourceType(payment.sourceType)}`,
    `Billing cycle: ${payment.billingCycle ?? "Not applicable"}`,
    `Payment method: ${payment.paymentMethod ?? "Not selected"}`,
    `Subtotal: ${formatMoney(payment.subtotalCents)}`,
    `Platform fee: ${formatMoney(payment.platformFeeCents)}`,
    `Processor fee: ${formatMoney(payment.processorFeeCents)}`,
    `Total charged: ${formatMoney(payment.totalChargedCents)}`,
    `Business proceeds: ${formatMoney(
      payment.businessProceedsCents
    )}`,
    `Payment timestamp: ${formatTimestamp(
      payment.timestamp
    )}`,
    `Stripe checkout session: ${
      payment.stripeCheckoutSessionId ?? "Not available"
    }`,
    `Stripe payment intent: ${
      payment.stripePaymentIntentId ?? "Not available"
    }`,
    `Stripe charge: ${
      payment.stripeChargeId ?? "Not available"
    }`,
    `Failure code: ${
      payment.failureCode ?? "Not applicable"
    }`,
    `Failure message: ${
      payment.failureMessage ?? "Not applicable"
    }`,
  ].join("\n");
}

export default function ManagerHistoryClient({
  businessName,
  accountCode,
  managerName,
  payments,
}: ManagerHistoryClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ALL");
  const [methodFilter, setMethodFilter] =
    useState<MethodFilter>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOrder, setSortOrder] =
    useState<SortOrder>("NEWEST");
  const [selectedPayment, setSelectedPayment] =
    useState<HistoryPayment | null>(null);
  const [copyComplete, setCopyComplete] =
    useState(false);

  const filteredPayments = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    const startTimestamp = startDate
      ? new Date(`${startDate}T00:00:00`).getTime()
      : null;

    const endTimestamp = endDate
      ? new Date(`${endDate}T23:59:59.999`).getTime()
      : null;

    return payments
      .filter((payment) => {
        if (
          statusFilter !== "ALL" &&
          payment.status !== statusFilter
        ) {
          return false;
        }

        if (
          methodFilter !== "ALL" &&
          payment.paymentMethod !== methodFilter
        ) {
          return false;
        }

        const paymentTimestamp = new Date(
          payment.timestamp
        ).getTime();

        if (
          startTimestamp !== null &&
          paymentTimestamp < startTimestamp
        ) {
          return false;
        }

        if (
          endTimestamp !== null &&
          paymentTimestamp > endTimestamp
        ) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        const searchableText = [
          payment.id,
          payment.payerFirstName,
          payment.payerLastName,
          getCustomerName(payment),
          payment.payerPhone,
          payment.payerEmail ?? "",
          payment.referenceLabel ?? "",
          payment.itemDescription,
          payment.billingCycle ?? "",
          payment.stripeCheckoutSessionId ?? "",
          payment.stripePaymentIntentId ?? "",
          payment.stripeChargeId ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const aTimestamp = new Date(a.timestamp).getTime();
        const bTimestamp = new Date(b.timestamp).getTime();

        return sortOrder === "NEWEST"
          ? bTimestamp - aTimestamp
          : aTimestamp - bTimestamp;
      });
  }, [
    payments,
    search,
    statusFilter,
    methodFilter,
    startDate,
    endDate,
    sortOrder,
  ]);

  const filteredTotalCents = useMemo(
    () =>
      filteredPayments
        .filter((payment) => payment.status === "PAID")
        .reduce(
          (total, payment) =>
            total + payment.subtotalCents,
          0
        ),
    [filteredPayments]
  );

  function clearFilters() {
    setSearch("");
    setStatusFilter("ALL");
    setMethodFilter("ALL");
    setStartDate("");
    setEndDate("");
    setSortOrder("NEWEST");
  }

  function exportCsv() {
    const headers = [
      "Payment ID",
      "Status",
      "Customer",
      "Phone",
      "Email",
      "Reference",
      "Description",
      "Source",
      "Billing Cycle",
      "Payment Method",
      "Subtotal",
      "Platform Fee",
      "Processor Fee",
      "Total Charged",
      "Business Proceeds",
      "Timestamp",
      "Stripe Checkout Session",
      "Stripe Payment Intent",
      "Stripe Charge",
      "Failure Code",
      "Failure Message",
    ];

    const rows = filteredPayments.map((payment) => [
      payment.id,
      formatStatus(payment.status),
      getCustomerName(payment),
      payment.payerPhone,
      payment.payerEmail ?? "",
      getReference(payment),
      payment.itemDescription,
      formatSourceType(payment.sourceType),
      payment.billingCycle ?? "",
      payment.paymentMethod ?? "",
      (payment.subtotalCents / 100).toFixed(2),
      (payment.platformFeeCents / 100).toFixed(2),
      payment.processorFeeCents === null
        ? ""
        : (payment.processorFeeCents / 100).toFixed(2),
      (payment.totalChargedCents / 100).toFixed(2),
      payment.businessProceedsCents === null
        ? ""
        : (
            payment.businessProceedsCents / 100
          ).toFixed(2),
      payment.timestamp,
      payment.stripeCheckoutSessionId ?? "",
      payment.stripePaymentIntentId ?? "",
      payment.stripeChargeId ?? "",
      payment.failureCode ?? "",
      payment.failureMessage ?? "",
    ]);

    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) =>
        row.map(csvEscape).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `payment-history-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  async function copyPaymentDetails() {
    if (!selectedPayment) {
      return;
    }

    await navigator.clipboard.writeText(
      getCopyText(selectedPayment)
    );

    setCopyComplete(true);

    window.setTimeout(() => {
      setCopyComplete(false);
    }, 2000);
  }

  function closeDrawer() {
    setSelectedPayment(null);
    setCopyComplete(false);
  }

  return (
    <main className="rfl-history-page">
      <header className="rfl-dashboard-header">
  <div>
    <p className="rfl-eyebrow">Payment history</p>

    <h1>{businessName}</h1>

    <div className="rfl-dashboard-business-meta">
      <span className="rfl-dashboard-account-code">
        Account code: <strong>{accountCode}</strong>
      </span>

      <span aria-hidden="true">•</span>

      <span>Signed in as {managerName}</span>
    </div>

    <div className="rfl-history-header-actions">
      <Link
        className="rfl-secondary-button"
        href="/manager/dashboard"
      >
        Dashboard
      </Link>

      <form action="/api/auth/logout" method="post">
        <button
          className="rfl-secondary-button"
          type="submit"
        >
          Sign Out
        </button>
      </form>
    </div>
  </div>
</header>

      <section className="rfl-history-summary">
        <article>
          <p>Matching Transactions</p>
          <strong>{filteredPayments.length}</strong>
        </article>

        <article>
          <p>Paid Subtotal</p>
          <strong>
            {formatMoney(filteredTotalCents)}
          </strong>
        </article>
      </section>

      <section className="rfl-history-controls">
        <div className="rfl-history-search">
          <label htmlFor="history-search">
            Search payment history
          </label>

          <input
            id="history-search"
            type="search"
            value={search}
            placeholder="Name, unit, phone, email, or payment ID"
            onChange={(
              event: ChangeEvent<HTMLInputElement>
            ) => setSearch(event.target.value)}
          />
        </div>

        <div className="rfl-history-filter-grid">
          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as StatusFilter
                )
              }
            >
              <option value="ALL">All statuses</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
              <option value="CREATED">Created</option>
              <option value="CHECKOUT_STARTED">
                Checkout started
              </option>
              <option value="EXPIRED">Expired</option>
              <option value="REFUNDED">Refunded</option>
              <option value="DISPUTED">Disputed</option>
              <option value="RETURNED">Returned</option>
            </select>
          </label>

          <label>
            Payment method
            <select
              value={methodFilter}
              onChange={(event) =>
                setMethodFilter(
                  event.target.value as MethodFilter
                )
              }
            >
              <option value="ALL">All methods</option>
              <option value="ACH">ACH</option>
              <option value="CARD">Card</option>
            </select>
          </label>

          <label>
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(event) =>
                setStartDate(event.target.value)
              }
            />
          </label>

          <label>
            End date
            <input
              type="date"
              value={endDate}
              onChange={(event) =>
                setEndDate(event.target.value)
              }
            />
          </label>

          <label>
            Sort
            <select
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(
                  event.target.value as SortOrder
                )
              }
            >
              <option value="NEWEST">
                Newest first
              </option>
              <option value="OLDEST">
                Oldest first
              </option>
            </select>
          </label>
        </div>

        <div className="rfl-history-control-actions">
          <button
            className="rfl-secondary-button"
            type="button"
            onClick={clearFilters}
          >
            Clear Filters
          </button>

          <button
            className="rfl-primary-button"
            type="button"
            disabled={filteredPayments.length === 0}
            onClick={exportCsv}
          >
            Export CSV
          </button>
        </div>
      </section>

      <section className="rfl-dashboard-payments">
        <header className="rfl-dashboard-payments-header">
          <div>
            <p className="rfl-eyebrow">
              Permanent transaction record
            </p>
            <h2>Payments</h2>
          </div>
        </header>

        {filteredPayments.length === 0 ? (
          <div className="rfl-dashboard-empty">
            <div
              className="rfl-dashboard-empty-icon"
              aria-hidden="true"
            >
              $
            </div>

            <h3>No matching payments</h3>

            <p>
              Try changing the search term, date range,
              status, or payment method.
            </p>
          </div>
        ) : (
          <>
            <div className="rfl-dashboard-table-wrap">
              <table className="rfl-dashboard-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Reference</th>
                    <th>Customer</th>
                    <th>Subtotal</th>
                    <th>Method</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr
                      key={payment.id}
                      tabIndex={0}
                      role="button"
                      className="rfl-history-payment-row"
                      onClick={() =>
                        setSelectedPayment(payment)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" ||
                          event.key === " "
                        ) {
                          event.preventDefault();
                          setSelectedPayment(payment);
                        }
                      }}
                    >
                      <td>
                        <span
                          className={`rfl-payment-status rfl-payment-status-${payment.status.toLowerCase()}`}
                        >
                          <span
                            aria-hidden="true"
                            className="rfl-payment-status-dot"
                          />

                          {formatStatus(payment.status)}
                        </span>
                      </td>

                      <td className="rfl-dashboard-reference">
                        {getReference(payment)}
                      </td>

                      <td>{getCustomerName(payment)}</td>

                      <td className="rfl-dashboard-amount">
                        {formatMoney(payment.subtotalCents)}
                      </td>

                      <td>
                        {payment.paymentMethod ?? "—"}
                      </td>

                      <td>
                        {formatTimestamp(payment.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rfl-dashboard-mobile-payments">
              {filteredPayments.map((payment) => (
                <button
                  key={payment.id}
                  type="button"
                  className="rfl-dashboard-mobile-payment rfl-history-mobile-payment"
                  onClick={() =>
                    setSelectedPayment(payment)
                  }
                >
                  <header>
                    <span
                      className={`rfl-payment-status rfl-payment-status-${payment.status.toLowerCase()}`}
                    >
                      <span
                        aria-hidden="true"
                        className="rfl-payment-status-dot"
                      />

                      {formatStatus(payment.status)}
                    </span>

                    <strong>
                      {formatMoney(payment.subtotalCents)}
                    </strong>
                  </header>

                  <h3>{getReference(payment)}</h3>
                  <p>{getCustomerName(payment)}</p>

                  <dl>
                    <div>
                      <dt>Method</dt>
                      <dd>
                        {payment.paymentMethod ?? "—"}
                      </dd>
                    </div>

                    <div>
                      <dt>Timestamp</dt>
                      <dd>
                        {formatTimestamp(payment.timestamp)}
                      </dd>
                    </div>
                  </dl>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {selectedPayment ? (
        <div
          className="rfl-history-drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeDrawer();
            }
          }}
        >
          <aside
            className="rfl-history-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-detail-title"
          >
            <header className="rfl-history-drawer-header">
              <div>
                <p className="rfl-eyebrow">
                  Payment details
                </p>

                <h2 id="payment-detail-title">
                  {getReference(selectedPayment)}
                </h2>
              </div>

              <button
                type="button"
                className="rfl-history-drawer-close"
                aria-label="Close payment details"
                onClick={closeDrawer}
              >
                ×
              </button>
            </header>

            <div className="rfl-history-drawer-body">
              <section>
                <h3>Customer</h3>

                <dl className="rfl-history-detail-list">
                  <div>
                    <dt>Name</dt>
                    <dd>
                      {getCustomerName(selectedPayment)}
                    </dd>
                  </div>

                  <div>
                    <dt>Phone</dt>
                    <dd>{selectedPayment.payerPhone}</dd>
                  </div>

                  <div>
                    <dt>Email</dt>
                    <dd>
                      {selectedPayment.payerEmail ??
                        "Not provided"}
                    </dd>
                  </div>

                  <div>
                    <dt>Reference</dt>
                    <dd>
                      {getReference(selectedPayment)}
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3>Transaction</h3>

                <dl className="rfl-history-detail-list">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {formatStatus(
                        selectedPayment.status
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Payment method</dt>
                    <dd>
                      {selectedPayment.paymentMethod ??
                        "Not selected"}
                    </dd>
                  </div>

                  <div>
                    <dt>Source</dt>
                    <dd>
                      {formatSourceType(
                        selectedPayment.sourceType
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Billing cycle</dt>
                    <dd>
                      {selectedPayment.billingCycle ??
                        "Not applicable"}
                    </dd>
                  </div>

                  <div>
                    <dt>Description</dt>
                    <dd>
                      {selectedPayment.itemDescription}
                    </dd>
                  </div>

                  <div>
                    <dt>Timestamp</dt>
                    <dd>
                      {formatTimestamp(
                        selectedPayment.timestamp
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3>Financial Details</h3>

                <dl className="rfl-history-detail-list">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>
                      {formatMoney(
                        selectedPayment.subtotalCents
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Platform fee</dt>
                    <dd>
                      {formatMoney(
                        selectedPayment.platformFeeCents
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Processor fee</dt>
                    <dd>
                      {formatMoney(
                        selectedPayment.processorFeeCents
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Total charged</dt>
                    <dd>
                      {formatMoney(
                        selectedPayment.totalChargedCents
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Business proceeds</dt>
                    <dd>
                      {formatMoney(
                        selectedPayment.businessProceedsCents
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3>Stripe References</h3>

                <dl className="rfl-history-detail-list rfl-history-detail-ids">
                  <div>
                    <dt>Payment ID</dt>
                    <dd>{selectedPayment.id}</dd>
                  </div>

                  <div>
                    <dt>Checkout session</dt>
                    <dd>
                      {selectedPayment.stripeCheckoutSessionId ??
                        "Not available"}
                    </dd>
                  </div>

                  <div>
                    <dt>Payment intent</dt>
                    <dd>
                      {selectedPayment.stripePaymentIntentId ??
                        "Not available"}
                    </dd>
                  </div>

                  <div>
                    <dt>Charge</dt>
                    <dd>
                      {selectedPayment.stripeChargeId ??
                        "Not available"}
                    </dd>
                  </div>
                </dl>
              </section>

              {selectedPayment.failureCode ||
              selectedPayment.failureMessage ? (
                <section>
                  <h3>Failure Details</h3>

                  <dl className="rfl-history-detail-list">
                    <div>
                      <dt>Failure code</dt>
                      <dd>
                        {selectedPayment.failureCode ??
                          "Not available"}
                      </dd>
                    </div>

                    <div>
                      <dt>Failure message</dt>
                      <dd>
                        {selectedPayment.failureMessage ??
                          "Not available"}
                      </dd>
                    </div>
                  </dl>
                </section>
              ) : null}
            </div>

            <footer className="rfl-history-drawer-footer">
              <button
                type="button"
                className="rfl-primary-button"
                onClick={copyPaymentDetails}
              >
                {copyComplete
                  ? "Payment Details Copied"
                  : "Copy Payment Details"}
              </button>
            </footer>
          </aside>
        </div>
      ) : null}
    </main>
  );
}