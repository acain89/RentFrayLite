"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminDashboardData } from "@/lib/adminDashboard";
import { SMS_DELIVERY_STATES, type SmsDeliveryMetric } from "@/lib/smsDeliveryReporting";

type BusinessSearchResult = {
  id: string;
  name: string;
  ownerName: string;
  contactEmail: string;
  contactPhone: string | null;
  accountCode: string | null;
  status: "SETUP" | "ACTIVE" | "DISABLED";
  isActive: boolean;
  setupCompletedAt: string | null;
  createdAt: string;
  manager: {
    email: string;
    displayName: string | null;
    isActive: boolean;
  } | null;
  stripeConnection: {
    readyForLive: boolean;
    onboardingComplete: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  } | null;
};

type SearchResponse = {
  businesses?: BusinessSearchResult[];
  error?: string;
};

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function MetricTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<{
    label: string;
    values: Array<string | number>;
  }>;
}) {
  return (
    <div className="rfl-admin-table-wrap">
      <table className="rfl-admin-table">
        <thead>
          <tr>
            <th scope="col">Period</th>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.values.map((value, index) => (
                <td key={`${row.label}-${columns[index]}`}>
                  {typeof value === "number"
                    ? value.toLocaleString("en-US")
                    : value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboardClient({
  initialData,
}: {
  initialData: AdminDashboardData;
}) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [dashboard, setDashboard] =
    useState<AdminDashboardData>(initialData);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BusinessSearchResult[]>([]);
  const [selected, setSelected] =
    useState<BusinessSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showAdminPasswords, setShowAdminPasswords] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const refreshDashboard = useCallback(async () => {
    const response = await fetch("/api/admin/dashboard", {
      cache: "no-store",
    });

    if (response.ok) {
      setDashboard(
        (await response.json()) as AdminDashboardData
      );
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(refreshDashboard, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshDashboard]);

  useEffect(() => {
    if (credentialMessage !== "Saved successfully.") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCredentialMessage("");
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [credentialMessage]);

  async function searchBusinesses(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setSearchError("Enter at least 2 characters.");
      return;
    }

    setSearching(true);
    setSearchError("");
    setSelected(null);
    setResults([]);

    try {
      const response = await fetch(
        `/api/admin/businesses/search?q=${encodeURIComponent(trimmed)}`,
        { cache: "no-store" }
      );

      const data = (await response.json()) as SearchResponse;

      if (!response.ok) {
        setSearchError(data.error ?? "Search failed.");
        return;
      }

      setResults(data.businesses ?? []);

      if ((data.businesses ?? []).length === 0) {
        setSearchError("No matching businesses found.");
      }
    } catch {
      setSearchError("Unable to search businesses.");
    } finally {
      setSearching(false);
    }
  }

function chooseBusiness(business: BusinessSearchResult): void {
  setSelected(business);
  setNewEmail(business.manager?.email ?? "");
  setNewPassword("");
  setConfirmNewPassword("");
  setCredentialMessage("");
}

  async function saveCredentials(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    if (!selected) return;

    setCredentialMessage("");

    if (newPassword && newPassword !== confirmNewPassword) {
      setCredentialMessage("The new passwords do not match.");
      return;
    }

    setSavingCredentials(true);

    try {
      const response = await fetch(
        `/api/admin/businesses/${selected.id}/credentials`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: newEmail,
            password: newPassword || undefined,
            confirmPassword: newPassword
              ? confirmNewPassword
              : undefined,
          }),
        }
      );

      const data = (await response.json()) as {
        success?: boolean;
        email?: string;
        error?: string;
      };

      if (!response.ok) {
        setCredentialMessage(data.error ?? "Update failed.");
        return;
      }

      const email = data.email ?? newEmail;

      setSelected((current) =>
        current
          ? {
              ...current,
              manager: current.manager
                ? { ...current.manager, email }
                : current.manager,
            }
          : current
      );

      setResults((current) =>
        current.map((business) =>
          business.id === selected.id && business.manager
            ? {
                ...business,
                manager: {
                  ...business.manager,
                  email,
                },
              }
            : business
        )
      );

      setNewPassword("");
      setCredentialMessage("Saved successfully.");
    } catch {
      setCredentialMessage("Unable to update credentials.");
    } finally {
      setSavingCredentials(false);
    }
  }

async function deleteBusiness(): Promise<void> {
  if (!selected) return;

  setDeleting(true);

  try {
    const response = await fetch(
      `/api/admin/businesses/${selected.id}`,
      {
        method: "DELETE",
      }
    );

    const data = (await response.json()) as {
      success?: boolean;
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      window.alert(data.error ?? "Delete failed.");
      return;
    }

    window.alert(data.message ?? "Business removed.");
    setResults([]);
    setSelected(null);
    setQuery("");
    setSearchError("");

    await refreshDashboard();

    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  } catch {
    window.alert("Unable to delete the account.");
  } finally {
    setDeleting(false);
  }
}

  async function logout(): Promise<void> {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Logout failed.");
      }

      router.replace("/login/admin");
      router.refresh();
    } catch {
      window.location.href = "/login/admin";
    }
  }

  return (
    <main className="rfl-admin-page">
      <header className="rfl-admin-header">
        <div>
          <p className="rfl-eyebrow">Administrator</p>
          <h1>RentFrayLite Admin</h1>
        </div>

        <button
          className="rfl-admin-secondary-button"
          type="button"
          onClick={logout}
        >
          Log out
        </button>
      </header>

      <section className="rfl-admin-card">
        <div className="rfl-admin-section-heading">
          <h2>Platform</h2>
        </div>

        <div className="rfl-admin-business-summary">
          <span>Businesses (Stripe Ready)</span>
          <strong>
            {dashboard.connectedBusinesses.toLocaleString("en-US")}
          </strong>
        </div>

        <p>Payment periods use the original recorded payment confirmation date in UTC, not transaction creation, refund or dispute-resolution dates. All Time also includes records without a recorded event date.</p>
        <MetricTable
          columns={["Payments", "Original Gross Tenant Fees", "Observed Customer Refunds", "Pending Customer Refunds"]}
          rows={[
            {
              label: "Today (UTC)",
              values: [
                dashboard.payments.today.count,
                money(dashboard.payments.today.revenueCents),
                dashboard.payments.today.customerRefundCents == null ? "Unknown / unavailable" : money(dashboard.payments.today.customerRefundCents),
                dashboard.payments.today.pendingCustomerRefundCents == null ? "Unknown / unavailable" : money(dashboard.payments.today.pendingCustomerRefundCents),
              ],
            },
            {
              label: "This Month (UTC)",
              values: [
                dashboard.payments.month.count,
                money(dashboard.payments.month.revenueCents),
                dashboard.payments.month.customerRefundCents == null ? "Unknown / unavailable" : money(dashboard.payments.month.customerRefundCents),
                dashboard.payments.month.pendingCustomerRefundCents == null ? "Unknown / unavailable" : money(dashboard.payments.month.pendingCustomerRefundCents),
              ],
            },
            {
              label: "All Time",
              values: [
                dashboard.payments.allTime.count,
                money(dashboard.payments.allTime.revenueCents),
                dashboard.payments.allTime.customerRefundCents == null ? "Unknown / unavailable" : money(dashboard.payments.allTime.customerRefundCents),
                dashboard.payments.allTime.pendingCustomerRefundCents == null ? "Unknown / unavailable" : money(dashboard.payments.allTime.pendingCustomerRefundCents),
              ],
            },
          ]}
        />
        <p>Refunds are observed subtotals for the original payment period, not complete historical totals. Principal and tenant-fee allocation is unknown. Gross tenant fees are not net revenue.</p>
        <p>All-time paid records: {dashboard.payments.allTime.refundUnknownCount} with unknown refund history. Observed application fees: {dashboard.payments.allTime.observedApplicationFeeCents == null ? "Unknown / unavailable" : money(dashboard.payments.allTime.observedApplicationFeeCents)}; application-fee refunds: {dashboard.payments.allTime.observedApplicationFeeRefundCents == null ? "Unknown / unavailable" : money(dashboard.payments.allTime.observedApplicationFeeRefundCents)}; confirmed management corrections: {dashboard.payments.allTime.confirmedManagementCorrectionCents == null ? "Unknown / unavailable" : money(dashboard.payments.allTime.confirmedManagementCorrectionCents)}; observed processing costs: {dashboard.payments.allTime.observedProcessorFeeCents == null ? "Unknown / unavailable" : money(dashboard.payments.allTime.observedProcessorFeeCents)}. These are historical observations with incomplete coverage, not actual net profit.</p>
        <p>Observed retained application fees on paid records: {dashboard.payments.allTime.observedPlatformRevenueCents == null ? "Unknown / unavailable" : money(dashboard.payments.allTime.observedPlatformRevenueCents)} (as of observation; incomplete coverage, not current net profit).</p>
        <p>Disputes on current disputed records: {dashboard.issues.chargebacks.allTime.disputes.active} active, {dashboard.issues.chargebacks.allTime.disputes.lost} closed lost, {dashboard.issues.chargebacks.allTime.disputes.unknown} outcome unknown. Disputes closed won on paid records: {dashboard.payments.allTime.disputes.won}. Closed-lost disputes on ACH returns: {dashboard.issues.achReturns.allTime.disputes.lost}.</p>
      </section>

      <section className="rfl-admin-card">
        <div className="rfl-admin-section-heading">
          <h2>Issues</h2>
        </div>

        <article className="rfl-admin-table-section">
          <h3>SMS Delivery</h3>
          <p>Current recorded outcomes by last update (UTC), not send attempts. Counts show total (tenant / management / legacy tenant / unknown recipient). Legacy aliases are excluded; a different known message remains separate. Unkeyed legacy receipts defer to the payment&apos;s tenant-success outbox. Historical failures without reliable delivery evidence are unknown. Sent means provider accepted, not confirmed delivered.</p>
          <MetricTable
            columns={["Today (UTC)", "This Month (UTC)", "All Time"]}
            rows={SMS_DELIVERY_STATES.map(state => ({
              label: state === "SENT" ? "Sent (provider accepted)" : state.charAt(0) + state.slice(1).toLowerCase(),
              values: [dashboard.issues.smsDelivery.today, dashboard.issues.smsDelivery.month, dashboard.issues.smsDelivery.allTime].map((m: SmsDeliveryMetric) =>
                `${m.total[state]} (${m.tenant[state]} / ${m.management[state]} / ${m.legacy[state]} / ${m.unknownRecipient[state]})`),
            }))}
          />
        </article>

        <article className="rfl-admin-table-section">
          <h3>ACH Returns</h3>
          <p>Periods use the first recorded return date (UTC), not the original transaction date.</p>
          <MetricTable
            columns={["Count", "Original Tenant Fees"]}
            rows={[
              {
                label: "Today (UTC)",
                values: [
                  dashboard.issues.achReturns.today.count,
                  money(
                    dashboard.issues.achReturns.today.revenueCents
                  ),
                ],
              },
              {
                label: "This Month (UTC)",
                values: [
                  dashboard.issues.achReturns.month.count,
                  money(
                    dashboard.issues.achReturns.month.revenueCents
                  ),
                ],
              },
              {
                label: "All Time",
                values: [
                  dashboard.issues.achReturns.allTime.count,
                  money(
                    dashboard.issues.achReturns.allTime.revenueCents
                  ),
                ],
              },
            ]}
          />
        </article>

        <article className="rfl-admin-table-section">
          <h3>Chargebacks</h3>
          <p>Periods use the first recorded dispute date (UTC), not its resolution date.</p>
          <MetricTable
            columns={["Count", "Original Tenant Fees"]}
            rows={[
              {
                label: "Today (UTC)",
                values: [
                  dashboard.issues.chargebacks.today.count,
                  money(
                    dashboard.issues.chargebacks.today.revenueCents
                  ),
                ],
              },
              {
                label: "This Month (UTC)",
                values: [
                  dashboard.issues.chargebacks.month.count,
                  money(
                    dashboard.issues.chargebacks.month.revenueCents
                  ),
                ],
              },
              {
                label: "All Time",
                values: [
                  dashboard.issues.chargebacks.allTime.count,
                  money(
                    dashboard.issues.chargebacks.allTime.revenueCents
                  ),
                ],
              },
            ]}
          />
        </article>
      </section>

      <section className="rfl-admin-card">
        <div className="rfl-admin-section-heading">
          <h2>Business Search</h2>
        </div>

        <form
          className="rfl-admin-search"
          onSubmit={searchBusinesses}
        >
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchError("");
            }}
            placeholder="Business name, owner, email, account code, or phone"
            aria-label="Search businesses"
          />
          <button
            className="rfl-primary-button"
            type="submit"
            disabled={searching}
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </form>

        {searchError ? (
          <p className="rfl-error" role="alert">
            {searchError}
          </p>
        ) : null}

        {results.length > 0 ? (
          <div className="rfl-admin-results">
            {results.map((business) => (
              <button
                key={business.id}
                type="button"
                className={
                  selected?.id === business.id
                    ? "rfl-admin-result rfl-admin-result-selected"
                    : "rfl-admin-result"
                }
                onClick={() => chooseBusiness(business)}
              >
                <strong>{business.name}</strong>
                <span>
                  {business.accountCode ?? "No account code"} ·{" "}
                  {business.manager?.email ?? business.contactEmail}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {selected ? (
          <div className="rfl-admin-selected">
            <section className="rfl-admin-selected-section">
              <div className="rfl-admin-selected-heading">
                <div>
                  <p className="rfl-eyebrow">Selected business</p>
                  <h2>Business Information</h2>
                </div>

                <span
                  className={
                    selected.stripeConnection?.readyForLive
                      ? "rfl-admin-status rfl-admin-status-good"
                      : "rfl-admin-status"
                  }
                >
                  {selected.stripeConnection?.readyForLive
                    ? "Stripe ready"
                    : "Stripe not ready"}
                </span>
              </div>

              <dl className="rfl-admin-details">
                <div>
                  <dt>Business Name</dt>
                  <dd>{selected.name}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{selected.ownerName}</dd>
                </div>
                <div>
                  <dt>Manager Email</dt>
                  <dd>{selected.manager?.email ?? "Not created"}</dd>
                </div>
                <div>
                  <dt>Account Code</dt>
                  <dd>{selected.accountCode ?? "Not assigned"}</dd>
                </div>
                <div>
                  <dt>Stripe Status</dt>
                  <dd>
                    {selected.stripeConnection?.readyForLive
                      ? "Ready"
                      : "Not Ready"}
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>
                    {new Date(selected.createdAt).toLocaleDateString(
                      "en-US"
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rfl-admin-selected-section">
              <h2>Manager Login</h2>

              {selected.manager ? (
                <form
                  className="rfl-admin-credentials"
                  onSubmit={saveCredentials}
                >
                  <label htmlFor="admin-manager-email">
                    Manager Email
                  </label>
                  <input
                    id="admin-manager-email"
                    type="email"
                    value={newEmail}
                    onChange={(event) => {
                      setNewEmail(event.target.value);
                      setCredentialMessage("");
                    }}
                    required
                  />

                  <label htmlFor="admin-manager-password">
                    New Password
                  </label>
                  <input
                    id="admin-manager-password"
                    type={showAdminPasswords ? "text" : "password"}
                    minLength={6}
                    maxLength={128}
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setCredentialMessage("");
                    }}
                    placeholder="Leave blank to keep current password"
                  />

                  <label htmlFor="admin-manager-confirm-password">
                    Confirm New Password
                  </label>
                  <input
                    id="admin-manager-confirm-password"
                    type={showAdminPasswords ? "text" : "password"}
                    minLength={6}
                    maxLength={128}
                    value={confirmNewPassword}
                    onChange={(event) => {
                      setConfirmNewPassword(event.target.value);
                      setCredentialMessage("");
                    }}
                    placeholder="Re-enter the new password"
                    required={Boolean(newPassword)}
                  />

                  <label className="rfl-password-toggle">
                    <input
                      type="checkbox"
                      checked={showAdminPasswords}
                      onChange={(event) => {
                        setShowAdminPasswords(event.target.checked);
                      }}
                    />
                    <span>Show passwords</span>
                  </label>

                  {credentialMessage ? (
                    <p className="rfl-admin-message" role="status">
                      {credentialMessage}
                    </p>
                  ) : null}

                  <button
                    className="rfl-primary-button"
                    type="submit"
                    disabled={savingCredentials}
                  >
                    {savingCredentials
                      ? "Saving..."
                      : "Save Changes"}
                  </button>
                </form>
              ) : (
                <p className="rfl-error">
                  This business does not have a manager account.
                </p>
              )}
            </section>

            <section className="rfl-admin-selected-section rfl-admin-danger-section">
  <h2>Danger Zone</h2>

  <div className="rfl-admin-danger-zone">
    <div>
      <h3>Remove Account</h3>
      <p>Businesses with payment or checkout history are deactivated. Financial history is retained, and existing Stripe payments can still settle. Businesses without that history are deleted.</p>
    </div>

    <button
      className="rfl-admin-danger-button"
      type="button"
      onClick={() => {
        if (!window.confirm("Remove this business? Payment or checkout history requires deactivation instead of deletion. Existing Stripe payments can still settle.")) {
          return;
        }

        void deleteBusiness();
      }}
      disabled={deleting}
    >
      {deleting ? "Removing..." : "Remove Account"}
    </button>
  </div>
</section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
