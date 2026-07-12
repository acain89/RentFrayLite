"use client";

import type React from "react";

type LocalTier = {
  id: string;
  tierName: string;
};

type VisibleTier = {
  id: string;
  tierName: string;
  dueDay: string;
  graceDays: string;
  lateFeeEnabled: boolean;
  lateFeeInitial: string;
  lateFeeDaily: string;
  lateFeeMaxDays: string;
};

type GpLfSettings = {
  dueDay: string;
  graceDays: string;
  lateFeeEnabled: boolean;
  lateFeeInitial: string;
  lateFeeDaily: string;
  lateFeeMaxDays: string;
};

type GpLfComparisonSummary = {
  dueDay: string;
  graceDays: string;
  lateFeeStatus: string;
  lateFeeInitial: string;
  lateFeeDaily: string;
  lateFeeMaxDays: string;
} | null;

type Props = {
  onClose: () => void;
  canEditLateFeeSettings: boolean;
  gpLfTierMode: "all" | "selected";
  setGpLfTierMode: React.Dispatch<React.SetStateAction<"all" | "selected">>;
  localTiers: LocalTier[];
  gpLfSelectedTierIds: string[];
  toggleGpLfTierSelection: (tierId: string) => void;
  gpLfVisibleTiers: VisibleTier[];
  gpLfComparisonSummary: GpLfComparisonSummary;
  formatGpLfMoney: (value: string) => string;
  gpLfSettings: GpLfSettings;
  updateGpLf: (updates: Partial<GpLfSettings>) => void;
  saveGpLfSettings: () => Promise<void>;
  savingGpLf: boolean;
  gpLfSaveMessage: string;
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

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--rf-border)] bg-[rgba(255,255,255,0.6)] px-3 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--rf-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-[var(--rf-text)]">
        {value}
      </div>
    </div>
  );
}

export default function GpLfPanel({
  onClose,
  canEditLateFeeSettings,
  gpLfTierMode,
  setGpLfTierMode,
  localTiers,
  gpLfSelectedTierIds,
  toggleGpLfTierSelection,
  gpLfVisibleTiers,
  gpLfComparisonSummary,
  formatGpLfMoney,
  gpLfSettings,
  updateGpLf,
  saveGpLfSettings,
  savingGpLf,
  gpLfSaveMessage,
}: Props) {
  const selectedTierCount =
    gpLfTierMode === "all" ? localTiers.length : gpLfSelectedTierIds.length;

  const selectedTierNames =
    gpLfTierMode === "all"
      ? localTiers.map((t) => t.tierName).join(", ")
      : localTiers
          .filter((t) => gpLfSelectedTierIds.includes(t.id))
          .map((t) => t.tierName)
          .join(", ");

  return (
    <OverlayShell
      title="Grace Period & Late Fees"
      subtitle="Set due day, grace period, and late fee rules by tier."
      onClose={onClose}
    >
      <div className="space-y-5">
        {!canEditLateFeeSettings ? (
          <div className="rounded-[24px] border border-[var(--rf-border)] bg-[var(--rf-bg-soft)] px-4 py-3 text-sm text-[var(--rf-text-soft)]">
            View only. Only owner and manager can change grace period and late
            fee settings.
          </div>
        ) : null}

        <div className="rounded-[24px] border border-[var(--rf-border)] bg-[var(--rf-bg-card)] p-4 shadow-[var(--rf-shadow-sm)]">
          <div className="space-y-4">
            <div>
              <label className="rf-label">Apply settings to</label>
              <select
                value={gpLfTierMode}
                onChange={(e) =>
                  setGpLfTierMode(e.target.value as "all" | "selected")
                }
                disabled={!canEditLateFeeSettings}
                className="rf-input max-w-xs"
              >
                <option value="all">All tiers</option>
                <option value="selected">Selected tiers</option>
              </select>
            </div>

            {gpLfTierMode === "selected" ? (
              <div>
                <div className="rf-label">Choose tiers</div>
                <div className="flex flex-wrap gap-2">
                  {localTiers.map((tier) => {
                    const isSelected = gpLfSelectedTierIds.includes(tier.id);

                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => toggleGpLfTierSelection(tier.id)}
                        disabled={!canEditLateFeeSettings}
                        className={`rf-btn min-h-[36px] px-3 text-xs ${
                          isSelected ? "rf-btn-primary" : "rf-btn-secondary"
                        }`}
                      >
                        {tier.tierName}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-[var(--rf-border)] bg-[rgba(255,255,255,0.5)] px-3 py-3 text-sm text-[var(--rf-text-soft)]">
              {gpLfTierMode === "all" ? (
                <div className="text-sm font-semibold text-red-600">
                  Applying to ALL tiers ({localTiers.length})
                </div>
              ) : (
                <div className="text-sm font-semibold text-amber-600">
                  Applying to {selectedTierCount} selected tier
                  {selectedTierCount === 1 ? "" : "s"}
                </div>
              )}

              <div className="mt-1 text-xs text-[var(--rf-text-muted)]">
                {selectedTierNames || "No tiers selected."}
              </div>
            </div>
          </div>
        </div>

        {gpLfVisibleTiers.length > 0 ? (
          <div className="rounded-[24px] border border-[var(--rf-border)] bg-[var(--rf-bg-card)] p-4 shadow-[var(--rf-shadow-sm)]">
            <div className="mb-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--rf-text-muted)]">
                Current comparison
              </div>
              <div className="mt-1 text-sm text-[var(--rf-text-soft)]">
                Quick view of the tiers currently in scope.
              </div>
            </div>

            {gpLfComparisonSummary ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryCard
                  label="Due day"
                  value={gpLfComparisonSummary.dueDay || "—"}
                />
                <SummaryCard
                  label="Grace days"
                  value={gpLfComparisonSummary.graceDays || "—"}
                />
                <SummaryCard
                  label="Late fees"
                  value={gpLfComparisonSummary.lateFeeStatus || "—"}
                />
                <SummaryCard
                  label="Initial fee"
                  value={
                    gpLfComparisonSummary.lateFeeInitial === "Mixed"
                      ? "Mixed"
                      : formatGpLfMoney(
                          gpLfComparisonSummary.lateFeeInitial || "0"
                        )
                  }
                />
                <SummaryCard
                  label="Daily fee"
                  value={
                    gpLfComparisonSummary.lateFeeDaily === "Mixed"
                      ? "Mixed"
                      : formatGpLfMoney(
                          gpLfComparisonSummary.lateFeeDaily || "0"
                        )
                  }
                />
                <SummaryCard
                  label="Max days"
                  value={gpLfComparisonSummary.lateFeeMaxDays || "—"}
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--rf-border)] bg-[var(--rf-bg-soft)] px-4 py-3 text-sm text-[var(--rf-text-soft)]">
                No tiers selected.
              </div>
            )}
          </div>
        ) : null}

        <div className="rounded-[24px] border border-[var(--rf-border)] bg-[var(--rf-bg-card)] p-4 shadow-[var(--rf-shadow-sm)]">
          <div className="mb-4">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--rf-text-muted)]">
              Settings
            </div>
            <div className="mt-1 text-sm text-[var(--rf-text-soft)]">
              These values will be applied to the selected tiers.
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="rf-label">Due day</label>
              <input
                value={gpLfSettings.dueDay}
                onChange={(e) =>
                  updateGpLf({
                    dueDay: e.target.value.replace(/\D/g, ""),
                  })
                }
                disabled={!canEditLateFeeSettings}
                className="rf-input"
                placeholder="1"
              />
            </div>

            <div>
              <label className="rf-label">Grace days</label>
              <input
                value={gpLfSettings.graceDays}
                onChange={(e) =>
                  updateGpLf({
                    graceDays: e.target.value.replace(/\D/g, ""),
                  })
                }
                disabled={!canEditLateFeeSettings}
                className="rf-input"
                placeholder="5"
              />
            </div>
          </div>

          <div className="mt-5 rounded-[20px] border border-[var(--rf-border)] bg-[rgba(255,255,255,0.58)] p-4">
            <div className="flex items-center gap-3">
              <input
                id="gplf-late-fee-enabled"
                type="checkbox"
                checked={gpLfSettings.lateFeeEnabled}
                onChange={(e) =>
                  updateGpLf({ lateFeeEnabled: e.target.checked })
                }
                disabled={!canEditLateFeeSettings}
                className="h-4 w-4"
              />
              <label
                htmlFor="gplf-late-fee-enabled"
                className="text-sm font-semibold text-[var(--rf-text)]"
              >
                Enable late fees
              </label>
            </div>

            {gpLfSettings.lateFeeEnabled ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="rf-label">Initial fee</label>
                  <input
                    value={gpLfSettings.lateFeeInitial}
                    onChange={(e) =>
                      updateGpLf({
                        lateFeeInitial: e.target.value.replace(/[^0-9.]/g, ""),
                      })
                    }
                    disabled={!canEditLateFeeSettings}
                    className="rf-input"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="rf-label">Daily fee</label>
                  <input
                    value={gpLfSettings.lateFeeDaily}
                    onChange={(e) =>
                      updateGpLf({
                        lateFeeDaily: e.target.value.replace(/[^0-9.]/g, ""),
                      })
                    }
                    disabled={!canEditLateFeeSettings}
                    className="rf-input"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="rf-label">Max days</label>
                  <input
                    value={gpLfSettings.lateFeeMaxDays}
                    onChange={(e) =>
                      updateGpLf({
                        lateFeeMaxDays: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    disabled={!canEditLateFeeSettings}
                    className="rf-input"
                    placeholder="0"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-[var(--rf-text-soft)]">
                Late fees are currently disabled.
              </div>
            )}
          </div>
        </div>

        {selectedTierCount > 1 ? (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            This will overwrite existing settings for {selectedTierCount} tiers.
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="rf-btn rf-btn-secondary px-4"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => void saveGpLfSettings()}
            disabled={!canEditLateFeeSettings || savingGpLf}
            className="rf-btn rf-btn-primary flex-1 px-4"
          >
            {savingGpLf
              ? "Saving..."
              : gpLfTierMode === "all"
              ? "Apply to All Tiers"
              : selectedTierCount === 1
              ? "Save Tier"
              : "Apply to Selected Tiers"}
          </button>
        </div>

        {gpLfSaveMessage ? (
          <div className="text-sm text-[var(--rf-text-soft)]">
            {gpLfSaveMessage}
          </div>
        ) : null}
      </div>
    </OverlayShell>
  );
}