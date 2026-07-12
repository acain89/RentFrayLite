"use client";

import type React from "react";

type ManagerRole = "MANAGER" | "STAFF";

type ManagerUser = {
  id: string;
  username: string;
  role: string;
  email: string | null;
  displayName: string | null;
};

type InactiveUnitRow = {
  id: string;
  unitNumber: string;
  tierName: string;
  lastActiveAt: string;
};

type Props = {
  onClose: () => void;
  sessionRole: "OWNER" | "MANAGER" | "STAFF";
  canManageManagers: boolean;

  managers: ManagerUser[];
  managersLoading: boolean;
  managersError: string;

  newEmail: string;
  setNewEmail: React.Dispatch<React.SetStateAction<string>>;
  newPassword: string;
  setNewPassword: React.Dispatch<React.SetStateAction<string>>;
  newRole: ManagerRole;
  setNewRole: React.Dispatch<React.SetStateAction<ManagerRole>>;
  creatingUser: boolean;
  createManager: () => Promise<void>;
  updateManager: (
    userId: string,
    updates: { role?: ManagerRole; isActive?: boolean }
  ) => Promise<void>;

  showChangeLogin: boolean;
  setShowChangeLogin: React.Dispatch<React.SetStateAction<boolean>>;
  changeCurrentLogin: string;
  setChangeCurrentLogin: React.Dispatch<React.SetStateAction<string>>;
  changeCurrentPassword: string;
  setChangeCurrentPassword: React.Dispatch<React.SetStateAction<string>>;
  changeNewEmail: string;
  setChangeNewEmail: React.Dispatch<React.SetStateAction<string>>;
  changeNewPassword: string;
  setChangeNewPassword: React.Dispatch<React.SetStateAction<string>>;
  changeConfirmPassword: string;
  setChangeConfirmPassword: React.Dispatch<React.SetStateAction<string>>;
  submitChangeLogin: () => Promise<void>;

  showInactiveUnits: boolean;
  setShowInactiveUnits: React.Dispatch<React.SetStateAction<boolean>>;
  inactiveUnits: InactiveUnitRow[];
  inactiveUnitsLoading: boolean;
  inactiveUnitsError: string;
  inactiveActionUnitId: string;
  confirmReactivateUnitId: string;
  setConfirmReactivateUnitId: React.Dispatch<React.SetStateAction<string>>;
  confirmDeleteUnitId: string;
  setConfirmDeleteUnitId: React.Dispatch<React.SetStateAction<string>>;
  reactivateInactiveUnit: (unitId: string) => Promise<void>;
  deleteInactiveUnit: (unitId: string) => Promise<void>;
};

function OverlayShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#173024]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[28px] border border-[var(--rf-border)] bg-[var(--rf-bg-panel)] shadow-[var(--rf-shadow-lg)] sm:h-auto sm:max-h-[90vh] sm:rounded-[32px]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--rf-border)] bg-[rgba(255,255,255,0.28)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--rf-text)]">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-[var(--rf-text-soft)]">
                {subtitle}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rf-btn rf-btn-secondary px-3 text-sm"
          >
            Close
          </button>
        </div>

        <div className="rf-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </div>

        <div className="border-t border-[var(--rf-border)] bg-[rgba(255,255,255,0.18)] px-4 py-4 sm:px-6" />
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--rf-border)] bg-[var(--rf-bg-card)] p-4 shadow-[var(--rf-shadow-sm)]">
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--rf-text-muted)]">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-1 text-sm text-[var(--rf-text-soft)]">
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export default function ManagerPanel({
  onClose,
  sessionRole,
  canManageManagers,

  managers,
  managersLoading,
  managersError,

  newEmail,
  setNewEmail,
  newPassword,
  setNewPassword,
  newRole,
  setNewRole,
  creatingUser,
  createManager,
  updateManager,

  showChangeLogin,
  setShowChangeLogin,
  changeCurrentLogin,
  setChangeCurrentLogin,
  changeCurrentPassword,
  setChangeCurrentPassword,
  changeNewEmail,
  setChangeNewEmail,
  changeNewPassword,
  setChangeNewPassword,
  changeConfirmPassword,
  setChangeConfirmPassword,
  submitChangeLogin,

  showInactiveUnits,
  setShowInactiveUnits,
  inactiveUnits,
  inactiveUnitsLoading,
  inactiveUnitsError,
  inactiveActionUnitId,
  confirmReactivateUnitId,
  setConfirmReactivateUnitId,
  confirmDeleteUnitId,
  setConfirmDeleteUnitId,
  reactivateInactiveUnit,
  deleteInactiveUnit,
}: Props) {
  return (
    <OverlayShell
      title="Manager Controls"
      subtitle="Manage property users, owner login access, and inactive units."
      onClose={onClose}
    >
      <div className="space-y-5">

                 {canManageManagers ? (
  <SectionCard
    title="Add manager or staff"
    subtitle="Create a new property account and assign the correct role."
  >
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="rf-label">Email</label>
        <input
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="manager@email.com"
          className="rf-input"
        />
      </div>

      <div>
        <label className="rf-label">Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Create password"
          className="rf-input"
        />
      </div>

      <div>
        <label className="rf-label">Role</label>
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as ManagerRole)}
          className="rf-input"
        >
          <option value="MANAGER">Manager</option>
          <option value="STAFF">Staff</option>
        </select>
      </div>
    </div>

    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        onClick={() => void createManager()}
        disabled={creatingUser}
        className="rf-btn rf-btn-primary px-4"
      >
        {creatingUser ? "Creating..." : "Create User"}
      </button>
    </div>
  </SectionCard>
) : null}       
                      
        <SectionCard
          title="Logged In Account"
        >
          {managersLoading ? (
            <div className="rounded-2xl border border-[var(--rf-border)] bg-[rgba(255,255,255,0.55)] px-4 py-3 text-sm text-[var(--rf-text-soft)]">
              Loading users...
            </div>
          ) : managersError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {managersError}
            </div>
          ) : managers.length === 0 ? (
            <div className="rounded-2xl border border-[var(--rf-border)] bg-[var(--rf-bg-soft)] px-4 py-3 text-sm text-[var(--rf-text-soft)]">
              No manager or staff accounts found.
            </div>
          ) : (
            <div className="space-y-3">
              {managers.map((user) => (
                <div
                  key={user.id}
                  className="rounded-[20px] border border-[var(--rf-border)] bg-[rgba(255,255,255,0.6)] p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--rf-text)]">
                       {user.email || user.username}
                      </div>
                    </div>

                   <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
  {user.role === "OWNER" ? (
   <div className="rf-input min-w-[150px] flex items-center justify-between">
  <span>Owner</span>
  <span className="text-[10px] text-[var(--rf-text-muted)]">(Primary)</span>
</div>
  ) : (
    <>
      <select
        value={user.role}
        onChange={(e) =>
          void updateManager(user.id, {
            role: e.target.value as ManagerRole,
          })
        }
        disabled={!canManageManagers}
        className="rf-input min-w-[150px]"
      >
        <option value="MANAGER">Manager</option>
        <option value="STAFF">Staff</option>
      </select>

      {canManageManagers ? (
        <button
          type="button"
          onClick={() =>
            void updateManager(user.id, {
              role: user.role === "MANAGER" ? "STAFF" : "MANAGER",
            })
          }
          className="rf-btn rf-btn-secondary px-4 text-xs"
        >
          {user.role === "MANAGER" ? "Make Staff" : "Make Manager"}
        </button>
      ) : null}
    </>
  )}
</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {sessionRole === "OWNER" ? (
          <SectionCard
            title="Owner login"
            subtitle="Change the owner login email or password."
          >
            <button
              type="button"
              onClick={() => setShowChangeLogin((prev) => !prev)}
              className="rf-btn rf-btn-secondary px-4"
            >
              {showChangeLogin ? "Cancel Change Login" : "Change Login"}
            </button>

            {showChangeLogin ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="rf-label">Current login</label>
                  <input
                    value={changeCurrentLogin}
                    onChange={(e) => setChangeCurrentLogin(e.target.value)}
                    placeholder="Current login"
                    className="rf-input"
                  />
                </div>

                <div>
                  <label className="rf-label">Current password</label>
                  <input
                    type="password"
                    value={changeCurrentPassword}
                    onChange={(e) => setChangeCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="rf-input"
                  />
                </div>

                <div>
                  <label className="rf-label">New email</label>
                  <input
                    value={changeNewEmail}
                    onChange={(e) => setChangeNewEmail(e.target.value)}
                    placeholder="New email"
                    className="rf-input"
                  />
                </div>

                <div>
                  <label className="rf-label">New password</label>
                  <input
                    type="password"
                    value={changeNewPassword}
                    onChange={(e) => setChangeNewPassword(e.target.value)}
                    placeholder="New password"
                    className="rf-input"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="rf-label">Confirm new password</label>
                  <input
                    type="password"
                    value={changeConfirmPassword}
                    onChange={(e) => setChangeConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="rf-input"
                  />
                </div>
              </div>
            ) : null}

            {showChangeLogin ? (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void submitChangeLogin()}
                  className="rf-btn rf-btn-primary px-4"
                >
                  Save Login Change
                </button>
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        {sessionRole === "OWNER" || sessionRole === "MANAGER" ? (
          <SectionCard
            title="Inactive units"
            subtitle="Review inactive units and reactivate or delete them."
          >
            <button
              type="button"
              onClick={() => setShowInactiveUnits((prev) => !prev)}
              className="rf-btn rf-btn-secondary px-4"
            >
              {showInactiveUnits ? "Hide Inactive Units" : "Inactive Units"}
            </button>

            {showInactiveUnits ? (
              <div className="mt-4 space-y-3">
                {inactiveUnitsLoading ? (
                  <div className="rounded-2xl border border-[var(--rf-border)] bg-[rgba(255,255,255,0.55)] px-4 py-3 text-sm text-[var(--rf-text-soft)]">
                    Loading inactive units...
                  </div>
                ) : inactiveUnitsError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {inactiveUnitsError}
                  </div>
                ) : inactiveUnits.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--rf-border)] bg-[var(--rf-bg-soft)] px-4 py-3 text-sm text-[var(--rf-text-soft)]">
                    No inactive units found.
                  </div>
                ) : (
                  inactiveUnits.map((unit) => {
                    const confirmingReactivate =
                      confirmReactivateUnitId === unit.id;
                    const confirmingDelete = confirmDeleteUnitId === unit.id;
                    const isBusy = inactiveActionUnitId === unit.id;

                    return (
                      <div
                        key={unit.id}
                        className="rounded-[20px] border border-[var(--rf-border)] bg-[rgba(255,255,255,0.6)] p-4"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-[var(--rf-text)]">
                              Unit {unit.unitNumber}
                            </div>
                            <div className="mt-1 text-xs text-[var(--rf-text-soft)]">
                              Tier: {unit.tierName}
                            </div>
                            <div className="mt-1 text-xs text-[var(--rf-text-soft)]">
                              Last active {formatDate(unit.lastActiveAt)}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {!confirmingReactivate ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteUnitId("");
                                  setConfirmReactivateUnitId(unit.id);
                                }}
                                disabled={isBusy}
                                className="rf-btn rf-btn-secondary px-3 text-xs"
                              >
                                Reactivate
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void reactivateInactiveUnit(unit.id)
                                  }
                                  disabled={isBusy}
                                  className="rf-btn rf-btn-primary px-3 text-xs"
                                >
                                  {isBusy ? "Saving..." : "Confirm Reactivate"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmReactivateUnitId("")}
                                  disabled={isBusy}
                                  className="rf-btn rf-btn-secondary px-3 text-xs"
                                >
                                  Cancel
                                </button>
                              </>
                            )}

                            {!confirmingDelete ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmReactivateUnitId("");
                                  setConfirmDeleteUnitId(unit.id);
                                }}
                                disabled={isBusy}
                                className="rf-btn rf-btn-secondary px-3 text-xs"
                              >
                                Delete
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void deleteInactiveUnit(unit.id)}
                                  disabled={isBusy}
                                  className="rf-btn rf-btn-danger px-3 text-xs"
                                >
                                  {isBusy ? "Deleting..." : "Confirm Delete"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUnitId("")}
                                  disabled={isBusy}
                                  className="rf-btn rf-btn-secondary px-3 text-xs"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}
          </SectionCard>
        ) : null}
      </div>
    </OverlayShell>
  );
}