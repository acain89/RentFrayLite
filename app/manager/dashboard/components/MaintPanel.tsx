"use client";

type MaintenanceRequestRow = {
  id: string;
  unitNumber: string;
  tenantName: string | null;
  category: string;
  urgency: string;
  status: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

type MaintenanceAction = "COMPLETE" | "IN_PROGRESS" | "DELETE";

type Props = {
  onClose: () => void;
  canManageMaintenance: boolean;

  maintenancePin: string;
  setMaintenancePin: React.Dispatch<React.SetStateAction<string>>;
  maintenancePinConfirm: string;
  setMaintenancePinConfirm: React.Dispatch<React.SetStateAction<string>>;
  maintenancePinSet: boolean;
  savingMaintenancePin: boolean;
  maintenancePinError: string;
  maintenancePinSuccess: string;
  saveMaintenancePin: () => Promise<void>;

  maintenanceLoading: boolean;
  maintenanceError: string;
  maintenanceRequests: MaintenanceRequestRow[];
  maintenanceActionId: string;
  maintenanceActionError: string;
  runMaintenanceAction: (
    requestId: string,
    action: MaintenanceAction
  ) => Promise<void>;
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Badge({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}
    >
      {text}
    </span>
  );
}

function urgencyClass(urgency: string) {
  switch (urgency.toUpperCase()) {
    case "URGENT":
      return "border-red-200 bg-red-50 text-red-700";
    case "HIGH":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "LOW":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-blue-200 bg-blue-50 text-blue-700";
  }
}

function statusClass(status: string) {
  switch (status.toUpperCase()) {
    case "COMPLETE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "IN_PROGRESS":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "THIRD_PARTY":
      return "border-orange-200 bg-orange-50 text-orange-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

export default function MaintPanel({
  onClose,
  canManageMaintenance,

  maintenancePin,
  setMaintenancePin,
  maintenancePinConfirm,
  setMaintenancePinConfirm,
  maintenancePinSet,
  savingMaintenancePin,
  maintenancePinError,
  maintenancePinSuccess,
  saveMaintenancePin,

  maintenanceLoading,
  maintenanceError,
  maintenanceRequests,
  maintenanceActionId,
  maintenanceActionError,
  runMaintenanceAction,
}: Props) {
  const sorted = [...maintenanceRequests].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );

  return (
    <OverlayShell
      title="Maintenance"
      subtitle="Maintenance access and request management."
      onClose={onClose}
    >
      <div className="space-y-5">
        {canManageMaintenance ? (
          <SectionCard
            title="Maintenance login PIN"
            subtitle="Set the 4-digit PIN used for maintenance access."
          >
          {maintenancePinSet ? (
  <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
    Maintenance access is configured.
  </div>
) : (
  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
    No maintenance PIN has been set yet.
  </div>
)}
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="password"
                value={maintenancePin}
                onChange={(e) =>
                  setMaintenancePin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="New PIN"
                className="rf-input"
              />

              <input
                type="password"
                value={maintenancePinConfirm}
                onChange={(e) =>
                  setMaintenancePinConfirm(
                    e.target.value.replace(/\D/g, "").slice(0, 4)
                  )
                }
                placeholder="Confirm PIN"
                className="rf-input"
              />
            </div>

            {maintenancePinError && (
              <div className="mt-3 text-sm text-red-600">
                {maintenancePinError}
              </div>
            )}

            {maintenancePinSuccess && (
              <div className="mt-3 text-sm text-[var(--rf-success)]">
                {maintenancePinSuccess}
              </div>
            )}

            <button
              onClick={() => void saveMaintenancePin()}
              disabled={savingMaintenancePin}
              className="rf-btn rf-btn-primary mt-4 px-4"
            >
              {savingMaintenancePin ? "Saving..." : "Save PIN"}
            </button>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Maintenance requests"
          subtitle="Review and update incoming maintenance tickets."
        >
          {maintenanceActionError && (
            <div className="text-sm text-red-600 mb-3">
              {maintenanceActionError}
            </div>
          )}

          {maintenanceLoading ? (
            <div className="text-sm text-[var(--rf-text-soft)]">
              Loading...
            </div>
          ) : maintenanceError ? (
            <div className="text-sm text-red-600">
              {maintenanceError}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-sm text-[var(--rf-text-soft)]">
              No requests found.
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map((r) => {
                const busy = maintenanceActionId === r.id;

                return (
                  <div
                    key={r.id}
                    className="rounded-[20px] border border-[var(--rf-border)] bg-[rgba(255,255,255,0.6)] p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-[var(--rf-text)]">
                            Unit {r.unitNumber}
                          </div>

                          <Badge text={r.urgency} className={urgencyClass(r.urgency)} />
                          <Badge text={r.status} className={statusClass(r.status)} />
                        </div>

                        <div className="mt-2 text-sm text-[var(--rf-text-soft)]">
                          {r.category}
                          {r.tenantName ? ` · ${r.tenantName}` : ""}
                        </div>

                        <div className="mt-1 text-sm text-[var(--rf-text)]">
                          {r.description}
                        </div>

                        <div className="mt-2 text-xs text-[var(--rf-text-muted)]">
                          {formatDate(r.createdAt)}
                        </div>
                      </div>

                      {canManageMaintenance && (
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              void runMaintenanceAction(r.id, "IN_PROGRESS")
                            }
                            disabled={busy}
                            className="rf-btn rf-btn-secondary px-3 text-xs"
                          >
                            In Progress
                          </button>

                          <button
                            onClick={() =>
                              void runMaintenanceAction(r.id, "COMPLETE")
                            }
                            disabled={busy}
                            className="rf-btn rf-btn-primary px-3 text-xs"
                          >
                            Complete
                          </button>

                          <button
                            onClick={() =>
                              void runMaintenanceAction(r.id, "DELETE")
                            }
                            disabled={busy}
                            className="rf-btn rf-btn-danger px-3 text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </OverlayShell>
  );
}