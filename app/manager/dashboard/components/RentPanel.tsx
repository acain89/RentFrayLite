"use client";

import type React from "react";

type RentTierDraft = {
  id: string;
  tierName: string;

  // configured max capacity
  unitCount: string;

  // actual assigned units
  activeUnitCount: number;

  // remaining open slots
  availableUnitCount: number;
  isNew?: boolean;
  markedForDelete?: boolean;
  baseRent: string;
  dueDay: string;
  graceDays: string;
  lateFeeEnabled: boolean;
  lateFeeAmount: string;
  lateFeeDaily: string;
  lateFeeMaxDays: string;
};

type Props = {
  onClose: () => void;
  canEditRentSettings: boolean;
  localTiers: RentTierDraft[];
  editingTierId: string | null;
  setEditingTierId: React.Dispatch<React.SetStateAction<string | null>>;
  updateLocalTier: (tierId: string, updates: Partial<RentTierDraft>) => void;
  addLocalTier: () => void;
  removeLocalTier: (tierId: string) => void;
  saveLocalRentSettings: () => Promise<void>;
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

        <div className="rf-scroll min-h-0 flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--rf-border)] bg-[rgba(255,255,255,0.45)] px-3 py-3 ${className}`}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--rf-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-[var(--rf-text)]">
        {value}
      </div>
    </div>
  );
}

export default function RentPanel({
  onClose,
  canEditRentSettings,
  localTiers,
  editingTierId,
  setEditingTierId,
  updateLocalTier,
  addLocalTier,
  removeLocalTier,
  saveLocalRentSettings,
}: Props) {
  return (
    <OverlayShell
      title="Rent Panel"
      subtitle="Configure rent amounts, max units, due dates, grace periods, and late fee settings."
      onClose={onClose}
    >
      <div className="space-y-4">
        {!canEditRentSettings ? (
          <div className="rounded-[24px] border border-[var(--rf-border)] bg-[var(--rf-bg-soft)] px-4 py-3 text-sm text-[var(--rf-text-soft)]">
            View only. Only owner and manager can change rent settings.
          </div>
        ) : null}

        {localTiers
  .filter((tier) => !tier.markedForDelete)
  .map((tier) => {
          const isEditing = editingTierId === tier.id;

          return (
            <div
              key={tier.id}
              className="rounded-[24px] border border-[var(--rf-border)] bg-[var(--rf-bg-card)] p-4 shadow-[var(--rf-shadow-sm)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--rf-text-muted)]">
                    Tier
                  </div>
                  <div className="mt-1 text-base font-semibold text-[var(--rf-text)]">
                    {tier.tierName || "Untitled Tier"}
                  </div>
                </div>

                <div className="flex gap-2">
  <button
    type="button"
    onClick={() => setEditingTierId(isEditing ? null : tier.id)}
    disabled={!canEditRentSettings}
    className="rf-btn rf-btn-secondary min-h-[36px] px-3 text-xs"
  >
    {isEditing ? "Done" : "Change"}
  </button>

  <button
    type="button"
    onClick={() => {
      const confirmed = window.confirm(
        `Delete ${tier.tierName || "this tier"}?`
      );

      if (confirmed) {
        removeLocalTier(tier.id);
      }
    }}
    disabled={!canEditRentSettings}
    className="rf-btn min-h-[36px] border border-red-200 bg-red-50 px-3 text-xs text-red-700 hover:bg-red-100"
  >
    Delete
  </button>
</div>
</div>

              {isEditing ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="rf-label">Tier name</label>
                    <input
                      value={tier.tierName}
                      onChange={(e) =>
                        updateLocalTier(tier.id, {
                          tierName: e.target.value,
                        })
                      }
                      placeholder="Tier name"
                      className="rf-input"
                    />
                  </div>

                  <div>
                    <label className="rf-label">Base rent</label>
                    <input
                      value={tier.baseRent}
                      onChange={(e) =>
                        updateLocalTier(tier.id, {
                          baseRent: e.target.value.replace(/[^0-9.]/g, ""),
                        })
                      }
                      placeholder="0.00"
                      className="rf-input"
                    />
                  </div>

                   <div>
  <label className="rf-label">Max units</label>
  <input
    value={tier.unitCount}
    onChange={(e) =>
      updateLocalTier(tier.id, {
        unitCount: e.target.value.replace(/\D/g, ""),
      })
    }
    placeholder="0"
    className="rf-input"
  />
</div>

                  <div>
                    <label className="rf-label">Due day</label>
                    <input
                      value={tier.dueDay}
                      onChange={(e) =>
                        updateLocalTier(tier.id, {
                          dueDay: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      placeholder="1"
                      className="rf-input"
                    />
                  </div>

                  <div>
                    <label className="rf-label">Grace days</label>
                    <input
                      value={tier.graceDays}
                      onChange={(e) =>
                        updateLocalTier(tier.id, {
                          graceDays: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      placeholder="5"
                      className="rf-input"
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryStat
                    label="Base rent"
                    value={`$${tier.baseRent || "—"}`}
                  />

                   <SummaryStat
                  label="Max units"
                  value={tier.unitCount || "0"}
                   />
    
                  <SummaryStat
                   label="Active units"
                   value={String(tier.activeUnitCount ?? 0)}
                   />

                  <SummaryStat label="Due day" value={tier.dueDay || "—"} />
                  <SummaryStat
                    label="Grace days"
                    value={tier.graceDays || "—"}
                    className="col-span-2 sm:col-span-1"
                  />
                </div>
              )}
            </div>
          );
        })}

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button
            type="button"
            onClick={addLocalTier}
            disabled={!canEditRentSettings}
            className="rf-btn rf-btn-secondary px-4"
          >
            Add Tier
          </button>

          <button
            type="button"
            onClick={() => void saveLocalRentSettings()}
            disabled={!canEditRentSettings}
            className="rf-btn rf-btn-primary flex-1 px-4"
          >
            Save Changes
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}