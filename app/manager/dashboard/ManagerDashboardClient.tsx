"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DashboardPayment,
  DashboardPaymentStatus,
} from "@/lib/dashboard";
import Link from "next/link";

type PaymentFilter =
  | "ALL"
  | DashboardPaymentStatus;

type ManagerDashboardClientProps = {
  businessName: string;
  accountCode: string;
  managerName: string;
  billingCycleLabel: string;
  payments: DashboardPayment[];
};

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

const emptyStateSymbols = ["$", "▤", "▣", "✓", "▥"] as const;

function formatMoney(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

function formatTimestamp(timestamp: string): string {
  return dateFormatter.format(new Date(timestamp));
}

function statusLabel(
  status: DashboardPaymentStatus
): string {
  switch (status) {
    case "PAID":
      return "Paid";

    case "PENDING":
      return "Pending";

    case "FAILED":
      return "Failed";
  }
}

export default function ManagerDashboardClient({
  businessName,
  accountCode,
  managerName,
  billingCycleLabel,
  payments,
}: ManagerDashboardClientProps) {
  const [filter, setFilter] =
    useState<PaymentFilter>("ALL");

  const [emptySymbolIndex, setEmptySymbolIndex] = useState(0);

useEffect(() => {
  if (payments.length > 0) {
    return;
  }

  const interval = window.setInterval(() => {
    setEmptySymbolIndex(
      (current) =>
        (current + 1) % emptyStateSymbols.length
    );
  }, 2500);

  return () => {
    window.clearInterval(interval);
  };
}, [payments.length]);

  const paidPayments = useMemo(
    () =>
      payments.filter(
        (payment) => payment.status === "PAID"
      ),
    [payments]
  );

  const collectedCents = useMemo(
    () =>
      paidPayments.reduce(
        (total, payment) =>
          total + payment.amountCents,
        0
      ),
    [paidPayments]
  );

  const lateFeesCollectedCents = useMemo(
    () =>
      paidPayments.reduce(
        (total, payment) =>
          total + payment.lateFeeCents,
        0
      ),
    [paidPayments]
  );

  const pendingCount = useMemo(
    () =>
      payments.filter(
        (payment) => payment.status === "PENDING"
      ).length,
    [payments]
  );

  const failedCount = useMemo(
    () =>
      payments.filter(
        (payment) => payment.status === "FAILED"
      ).length,
    [payments]
  );

  const filteredPayments = useMemo(
    () =>
      filter === "ALL"
        ? payments
        : payments.filter(
            (payment) => payment.status === filter
          ),
    [filter, payments]
  );

  const filters: Array<{
    value: PaymentFilter;
    label: string;
  }> = [
    {
      value: "ALL",
      label: "All",
    },
    {
      value: "PAID",
      label: "Paid",
    },
    {
      value: "PENDING",
      label: "Pending",
    },
    {
      value: "FAILED",
      label: "Failed",
    },
  ];

  return (
    <main className="rfl-dashboard-page">
      <header className="rfl-dashboard-header">
        <div>
          <p className="rfl-eyebrow">
            Manager dashboard
          </p>

          <h1>{businessName}</h1>

          <div className="rfl-dashboard-business-meta">
            <span className="rfl-dashboard-account-code">
             Account code:{" "}
            <strong>{accountCode}</strong>
            </span>

            <span aria-hidden="true">•</span>

            <span>
              Signed in as {managerName}
            </span>
          </div>
        </div>

        <div className="rfl-history-header-actions">
  <Link
    className="rfl-secondary-button"
    href="/manager/settings"
  >
    Settings
  </Link>

  <Link
    className="rfl-secondary-button"
    href="/manager/history"
  >
    History
  </Link>

  <button
  className="rfl-secondary-button rfl-dashboard-signout"
  type="button"
  onClick={async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Logout failed.");
      }
    } finally {
      window.location.assign("/");
    }
  }}
>
  Sign Out
</button>
</div>
      </header>

      <section className="rfl-dashboard-cycle-header">
        <div>
          <p>Current Billing Cycle</p>
          <h2>{billingCycleLabel}</h2>
        </div>
      </section>

      <section
        className="rfl-dashboard-stats"
        aria-label="Current billing cycle summary"
      >
        <article className="rfl-dashboard-stat rfl-dashboard-stat-primary">
          <p>Collected</p>
          <strong>{formatMoney(collectedCents)}</strong>
          <span>Current billing cycle</span>
        </article>

        <article className="rfl-dashboard-stat">
          <p>Late Fees Collected</p>
          <strong>
            {formatMoney(lateFeesCollectedCents)}
          </strong>
          <span>Included in Collected</span>
        </article>

        <article className="rfl-dashboard-stat">
          <p>Pending</p>
          <strong>{pendingCount}</strong>
          <span>Payments processing</span>
        </article>

        <article className="rfl-dashboard-stat">
          <p>Failed</p>
          <strong>{failedCount}</strong>
          <span>Payments requiring attention</span>
        </article>

        <article className="rfl-dashboard-stat">
          <p>Transactions</p>
          <strong>{payments.length}</strong>
          <span>Paid, pending, and failed</span>
        </article>
      </section>

      <section className="rfl-dashboard-payments">
        <header className="rfl-dashboard-payments-header">
          <div>
            <p className="rfl-eyebrow">
              Current cycle activity
            </p>
            <h2>Payments</h2>
          </div>

          <div
            className="rfl-dashboard-filters"
            role="group"
            aria-label="Filter payments"
          >
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                className={
                  filter === item.value
                    ? "rfl-dashboard-filter rfl-dashboard-filter-active"
                    : "rfl-dashboard-filter"
                }
                aria-pressed={
                  filter === item.value
                }
                onClick={() =>
                  setFilter(item.value)
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        {filteredPayments.length === 0 ? (
  <div className="rfl-dashboard-empty">
    <div
      className="rfl-dashboard-empty-icon"
      aria-hidden="true"
      key={emptySymbolIndex}
    >
      {emptyStateSymbols[emptySymbolIndex]}
    </div>

    <h3>
      {payments.length === 0
        ? "No payments yet"
        : `No ${filter.toLowerCase()} payments`}
    </h3>

    <p>
      {payments.length === 0
        ? "Payments received during this billing cycle will appear here automatically."
        : "There are no payments matching this filter in the current billing cycle."}
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
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <span
                          className={`rfl-payment-status rfl-payment-status-${payment.status.toLowerCase()}`}
                        >
                          <span
                            aria-hidden="true"
                            className="rfl-payment-status-dot"
                          />

                          {statusLabel(
                            payment.status
                          )}
                        </span>
                      </td>

                      <td className="rfl-dashboard-reference">
                        {payment.reference}
                      </td>

                      <td>{payment.customerName}</td>

                      <td className="rfl-dashboard-amount">
                        {formatMoney(
                          payment.amountCents
                        )}

                        {payment.lateFeeCents > 0 ? (
                          <small>
                            Includes{" "}
                            {formatMoney(
                              payment.lateFeeCents
                            )}{" "}
                            late fee
                          </small>
                        ) : null}
                      </td>

                      <td>{payment.paymentMethod}</td>

                      <td>
                        {formatTimestamp(
                          payment.timestamp
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rfl-dashboard-mobile-payments">
              {filteredPayments.map((payment) => (
                <article
                  key={payment.id}
                  className="rfl-dashboard-mobile-payment"
                >
                  <header>
                    <span
                      className={`rfl-payment-status rfl-payment-status-${payment.status.toLowerCase()}`}
                    >
                      <span
                        aria-hidden="true"
                        className="rfl-payment-status-dot"
                      />

                      {statusLabel(payment.status)}
                    </span>

                    <strong>
                      {formatMoney(
                        payment.amountCents
                      )}
                    </strong>
                  </header>

                  <h3>{payment.reference}</h3>

                  <p>{payment.customerName}</p>

                  <dl>
                    <div>
                      <dt>Method</dt>
                      <dd>{payment.paymentMethod}</dd>
                    </div>

                    <div>
                      <dt>Timestamp</dt>
                      <dd>
                        {formatTimestamp(
                          payment.timestamp
                        )}
                      </dd>
                    </div>

                    {payment.lateFeeCents > 0 ? (
                      <div>
                        <dt>Late fee included</dt>
                        <dd>
                          {formatMoney(
                            payment.lateFeeCents
                          )}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}