"use client";

import { useEffect, useMemo, useState } from "react";

type ManagementUser = {
  id: string;
  email: string | null;
  username: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
};

type PaymentStatus = {
  processorConnected?: boolean;
  bankConnected?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  onboardingComplete?: boolean;
  requirementsDue?: boolean;
  requirementsSummary?: string | null;
  readyForLive?: boolean;
  lastSyncedAt?: string | null;
};

type PaymentStatusResponse = {
  ok?: boolean;
  paymentStatus?: PaymentStatus | null;
  error?: string;
};

type StripeSyncResponse = {
  ok?: boolean;
  paymentStatus?: PaymentStatus | null;
  error?: string;
};

type Props = {
  propertyId: string;
  propertyName: string;
};

function getUserLabel(user: ManagementUser): string {
  const identity = user.email || user.username || user.id;
  const status = user.isActive ? "Active" : "Inactive";
  return `${user.role} — ${identity} — ${status}`;
}

function boolText(value?: boolean): string {
  return value ? "Yes" : "No";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "Never";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString();
}

function statusTone(value?: boolean): string {
  return value
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-red-200 bg-red-50 text-red-700";
}

function StatusPill({ label, value }: { label: string; value?: boolean }) {
  return (
    <div
      className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${statusTone(
        value
      )}`}
    >
      {label}: {boolText(value)}
    </div>
  );
}

export default function AdminSupportTools({
  propertyId,
  propertyName,
}: Props) {
  const [users, setUsers] = useState<ManagementUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [openingManagerView, setOpeningManagerView] = useState(false);

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(
    null
  );
  const [loadingPaymentStatus, setLoadingPaymentStatus] = useState(true);
  const [syncingStripe, setSyncingStripe] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  useEffect(() => {
    let active = true;

    async function loadUsers(): Promise<void> {
      try {
        setLoadingUsers(true);
        setError("");

        const response = await fetch(
          `/api/admin/properties/${propertyId}/management-users/support-list`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const data = (await response.json().catch(() => null)) as
          | { ok?: boolean; users?: ManagementUser[]; error?: string }
          | null;

        if (!active) return;

        if (!response.ok || !data?.ok) {
          setError(data?.error || "Failed to load management users.");
          setUsers([]);
          return;
        }

        const nextUsers = Array.isArray(data.users) ? data.users : [];
        setUsers(nextUsers);

        const firstActive = nextUsers.find((user) => user.isActive);
        setSelectedUserId(firstActive?.id ?? nextUsers[0]?.id ?? "");
      } catch {
        if (!active) return;
        setError("Failed to load management users.");
        setUsers([]);
      } finally {
        if (active) setLoadingUsers(false);
      }
    }

    void loadUsers();

    return () => {
      active = false;
    };
  }, [propertyId]);

  useEffect(() => {
    let active = true;

    async function loadPaymentStatus(): Promise<void> {
      try {
        setLoadingPaymentStatus(true);

        const response = await fetch(
          `/api/admin/properties/${propertyId}/payment-status`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const data = (await response.json().catch(() => null)) as
          | PaymentStatusResponse
          | null;

        if (!active) return;

        if (!response.ok || !data?.ok) {
          setPaymentStatus(null);
          return;
        }

        setPaymentStatus(data.paymentStatus ?? null);
      } catch {
        if (!active) return;
        setPaymentStatus(null);
      } finally {
        if (active) setLoadingPaymentStatus(false);
      }
    }

    void loadPaymentStatus();

    return () => {
      active = false;
    };
  }, [propertyId]);

  async function resetPassword(): Promise<void> {
    if (!selectedUserId) {
      setError("Choose a management user.");
      return;
    }

    if (temporaryPassword.trim().length < 8) {
      setError("Temporary password must be at least 8 characters.");
      return;
    }

    const confirmed = window.confirm(
      "Reset this user's password? Only send the new password to the registered email shown."
    );

    if (!confirmed) return;

    try {
      setResetting(true);
      setMessage("");
      setError("");

      const response = await fetch(
        `/api/admin/properties/${propertyId}/management-users/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            userId: selectedUserId,
            temporaryPassword,
          }),
        }
      );

      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            sendPasswordToEmail?: string;
          }
        | null;

      if (!response.ok || !data?.ok) {
        setError(data?.error || "Password reset failed.");
        return;
      }

      setTemporaryPassword("");
      setMessage(
        `Password reset successful. Send the new password only to ${data.sendPasswordToEmail}.`
      );
    } catch {
      setError("Password reset failed.");
    } finally {
      setResetting(false);
    }
  }

  async function viewAsManager(): Promise<void> {
    if (!selectedUserId) {
      setError("Choose a management user.");
      return;
    }

    const confirmed = window.confirm(
      "Open this property as the selected management user?"
    );

    if (!confirmed) return;

    try {
      setOpeningManagerView(true);
      setMessage("");
      setError("");

      const response = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          propertyId,
          managementUserId: selectedUserId,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; redirectTo?: string; error?: string }
        | null;

      if (!response.ok || !data?.ok || !data.redirectTo) {
        setError(data?.error || "Failed to open manager view.");
        return;
      }

      window.location.href = data.redirectTo;
    } catch {
      setError("Failed to open manager view.");
    } finally {
      setOpeningManagerView(false);
    }
  }

  async function refreshStripeStatus(): Promise<void> {
    const confirmed = window.confirm(
      "Refresh this property's Stripe status directly from Stripe?"
    );

    if (!confirmed) return;

    try {
      setSyncingStripe(true);
      setMessage("");
      setError("");

      const response = await fetch(
        `/api/admin/properties/${propertyId}/stripe-sync`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = (await response.json().catch(() => null)) as
        | StripeSyncResponse
        | null;

      if (!response.ok || !data?.ok) {
        setError(data?.error || "Failed to refresh Stripe status.");
        return;
      }

      setPaymentStatus(data.paymentStatus ?? null);
      setMessage("Stripe status refreshed from Stripe.");
    } catch {
      setError("Failed to refresh Stripe status.");
    } finally {
      setSyncingStripe(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-amber-300 bg-amber-50 p-5 shadow-sm">
      <div className="text-lg font-semibold text-slate-950">
        Admin Support Tools
      </div>

      <div className="mt-1 text-sm text-slate-700">
        Administrative actions for {propertyName}.
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-[24px] border border-amber-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-950">
            Reset Manager Password
          </div>

          <div className="mt-1 text-sm text-slate-600">
            Change a manager, owner, or staff password. Send the new password
            only to the registered email shown below.
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Management user
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={loadingUsers || users.length === 0}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-950"
              >
                {loadingUsers ? (
                  <option>Loading users...</option>
                ) : users.length === 0 ? (
                  <option>No users found</option>
                ) : (
                  users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {getUserLabel(user)}
                    </option>
                  ))
                )}
              </select>
            </label>

            {selectedUser ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Registered email:{" "}
                <span className="font-semibold text-slate-950">
                  {selectedUser.email || selectedUser.username}
                </span>
              </div>
            ) : null}

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              New temporary password
              <input
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="rounded-xl border border-slate-300 px-3 py-2 text-slate-950"
              />
            </label>

            <button
              type="button"
              onClick={resetPassword}
              disabled={resetting || loadingUsers || !selectedUserId}
              className="rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resetting ? "Resetting..." : "Reset Password"}
            </button>

            <button
              type="button"
              onClick={viewAsManager}
              disabled={
                openingManagerView || loadingUsers || !selectedUserId
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {openingManagerView ? "Opening..." : "View As Selected User"}
            </button>
          </div>
        </div>

        <div className="rounded-[24px] border border-sky-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-950">
            Stripe Health
          </div>

          <div className="mt-1 text-sm text-slate-600">
            Current payment account status stored in RentFray. Use refresh to
            pull live status from Stripe.
          </div>

          {loadingPaymentStatus ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Loading Stripe status...
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <StatusPill
                  label="Processor"
                  value={paymentStatus?.processorConnected}
                />
                <StatusPill label="Bank" value={paymentStatus?.bankConnected} />
                <StatusPill
                  label="Charges"
                  value={paymentStatus?.chargesEnabled}
                />
                <StatusPill
                  label="Payouts"
                  value={paymentStatus?.payoutsEnabled}
                />
                <StatusPill
                  label="Onboarding"
                  value={paymentStatus?.onboardingComplete}
                />
                <StatusPill label="Ready" value={paymentStatus?.readyForLive} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Requirements due:{" "}
                <span className="font-semibold text-slate-950">
                  {boolText(paymentStatus?.requirementsDue)}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Last synced:{" "}
                <span className="font-semibold text-slate-950">
                  {formatDateTime(paymentStatus?.lastSyncedAt)}
                </span>
              </div>

              {paymentStatus?.requirementsSummary ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  {paymentStatus.requirementsSummary}
                </div>
              ) : null}

              <button
                type="button"
                onClick={refreshStripeStatus}
                disabled={syncingStripe}
                className="rounded-xl bg-sky-950 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {syncingStripe ? "Refreshing..." : "Refresh Stripe Status"}
              </button>
            </div>
          )}
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
    </section>
  );
}