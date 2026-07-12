"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type TierEditorItem = {
  id: string;
  name: string;
  baseRent: number | null;
  processingFee: number | null;
  rentDueDay: number | null;
  gracePeriodDays: number | null;
  lateFeeInitial: number | null;
  lateFeeDaily: number | null;
  lateFeeMaxDays: number | null;
  units: Array<{
    id: string;
    unitNumber: string;
  }>;
};

type PropertyTierEditorProps = {
  propertyId: string;
  tiers: TierEditorItem[];
};

type TierSaveResponse = {
  ok?: boolean;
  error?: string;
  tier?: {
    id: string;
    propertyId: string;
    name: string;
    baseRent: number;
    processingFee: number;
    rentDueDay: number;
    gracePeriodDays: number;
    lateFeeInitial: number;
    lateFeeDaily: number;
    lateFeeMaxDays: number;
    unitCount: number;
  };
};

function sanitizeMoneyInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

function sanitizeIntegerInput(value: string) {
  return value.replace(/\D/g, "");
}

function formatMoney(value: string) {
  const n = Number(value || 0);
  return `$${n.toFixed(2)}`;
}

function createInitialTierState(tier: TierEditorItem) {
  return {
    name: tier.name || "",
    baseRent: String(Number(tier.baseRent || 0)),
    processingFee: String(Number(tier.processingFee || 0)),
    rentDueDay: String(Number(tier.rentDueDay || 1)),
    gracePeriodDays: String(Number(tier.gracePeriodDays || 0)),
    lateFeeInitial: String(Number(tier.lateFeeInitial || 0)),
    lateFeeDaily: String(Number(tier.lateFeeDaily || 0)),
    lateFeeMaxDays: String(Number(tier.lateFeeMaxDays || 0)),
  };
}

export default function PropertyTierEditor({
  propertyId,
  tiers,
}: PropertyTierEditorProps) {
  const [formState, setFormState] = useState<Record<string, ReturnType<typeof createInitialTierState>>>(
    () =>
      Object.fromEntries(
        tiers.map((tier) => [tier.id, createInitialTierState(tier)])
      )
  );

  const [savingTierId, setSavingTierId] = useState<string>("");
  const [submitAttemptedTierId, setSubmitAttemptedTierId] = useState<string>("");
  const [errorByTier, setErrorByTier] = useState<Record<string, string>>({});
  const [successByTier, setSuccessByTier] = useState<Record<string, string>>({});

  const validationByTier = useMemo(() => {
    const next: Record<string, Record<string, string>> = {};

    for (const tier of tiers) {
      const state = formState[tier.id];
      const errors: Record<string, string> = {};

      if (!state) {
        next[tier.id] = errors;
        continue;
      }

      if (!state.name.trim()) {
        errors.name = "Tier name is required.";
      }

      const baseRent = Number(state.baseRent);
      if (!Number.isFinite(baseRent) || baseRent < 0) {
        errors.baseRent = "Base rent must be 0 or greater.";
      }

      const processingFee = Number(state.processingFee);
      if (!Number.isFinite(processingFee) || processingFee < 0) {
        errors.processingFee = "Processing fee must be 0 or greater.";
      }

      const dueDay = Number(state.rentDueDay);
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
        errors.rentDueDay = "Due day must be between 1 and 31.";
      }

      const grace = Number(state.gracePeriodDays);
      if (!Number.isInteger(grace) || grace < 0 || grace > 31) {
        errors.gracePeriodDays = "Grace period must be between 0 and 31.";
      }

      const lateInitial = Number(state.lateFeeInitial);
      if (!Number.isFinite(lateInitial) || lateInitial < 0) {
        errors.lateFeeInitial = "Initial late fee must be 0 or greater.";
      }

      const lateDaily = Number(state.lateFeeDaily);
      if (!Number.isFinite(lateDaily) || lateDaily < 0) {
        errors.lateFeeDaily = "Daily late fee must be 0 or greater.";
      }

      const lateMaxDays = Number(state.lateFeeMaxDays);
      if (!Number.isInteger(lateMaxDays) || lateMaxDays < 0 || lateMaxDays > 31) {
        errors.lateFeeMaxDays = "Max daily late fee days must be between 0 and 31.";
      }

      next[tier.id] = errors;
    }

    return next;
  }, [formState, tiers]);

  function updateTierField(
    tierId: string,
    field: keyof ReturnType<typeof createInitialTierState>,
    value: string
  ) {
    setFormState((prev) => ({
      ...prev,
      [tierId]: {
        ...prev[tierId],
        [field]: value,
      },
    }));

    setErrorByTier((prev) => ({
      ...prev,
      [tierId]: "",
    }));

    setSuccessByTier((prev) => ({
      ...prev,
      [tierId]: "",
    }));
  }

  async function handleSaveTier(tierId: string) {
    setSubmitAttemptedTierId(tierId);

    const validation = validationByTier[tierId];
    if (validation && Object.keys(validation).length > 0) {
      return;
    }

    const state = formState[tierId];
    if (!state) return;

    setSavingTierId(tierId);

    setErrorByTier((prev) => ({
      ...prev,
      [tierId]: "",
    }));

    setSuccessByTier((prev) => ({
      ...prev,
      [tierId]: "",
    }));

    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/tiers`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tierId,
          name: state.name.trim(),
          baseRent: Number(state.baseRent || 0),
          processingFee: Number(state.processingFee || 0),
          rentDueDay: Number(state.rentDueDay || 1),
          gracePeriodDays: Number(state.gracePeriodDays || 0),
          lateFeeInitial: Number(state.lateFeeInitial || 0),
          lateFeeDaily: Number(state.lateFeeDaily || 0),
          lateFeeMaxDays: Number(state.lateFeeMaxDays || 0),
        }),
      });

      const result: TierSaveResponse = await res.json();

      if (!res.ok) {
        setErrorByTier((prev) => ({
          ...prev,
          [tierId]: result.error || "Failed to save tier.",
        }));
        setSavingTierId("");
        return;
      }

      setSuccessByTier((prev) => ({
        ...prev,
        [tierId]: "Tier updated successfully.",
      }));
    } catch {
      setErrorByTier((prev) => ({
        ...prev,
        [tierId]: "Network error.",
      }));
    }

    setSavingTierId("");
  }

  if (tiers.length === 0) {
    return (
      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Edit tiers</h2>
            <p className={styles.sectionSubtitle}>
              No tiers found for this property.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>Edit tiers</h2>
          <p className={styles.sectionSubtitle}>
            Update live tier settings. These changes affect the actual property,
            manager dashboard, and tenant-facing account behavior.
          </p>
        </div>
      </div>

      <div className={styles.tierList}>
        {tiers.map((tier) => {
          const state = formState[tier.id];
          const errors = validationByTier[tier.id] || {};
          const submitted = submitAttemptedTierId === tier.id;

          if (!state) return null;

          return (
            <div key={tier.id} className={styles.tierCard}>
              <div className={styles.tierHead}>
                <div>
                  <h3 className={styles.tierTitle}>{tier.name}</h3>
                  <p className={styles.tierSubtitle}>
                    {tier.units.length} units · Current rent {formatMoney(state.baseRent)}
                  </p>
                </div>

                <div className={styles.tierStats}>
                  <span>{tier.units.length} units</span>
                </div>
              </div>

              {errorByTier[tier.id] ? (
                <div className={styles.editorError}>{errorByTier[tier.id]}</div>
              ) : null}

              {successByTier[tier.id] ? (
                <div className={styles.editorSuccess}>{successByTier[tier.id]}</div>
              ) : null}

              <div className={styles.editorGrid}>
                <div className={styles.editorField}>
                  <label className={styles.editorLabel}>Tier Name</label>
                  <input
                    className={styles.editorInput}
                    value={state.name}
                    onChange={(e) =>
                      updateTierField(tier.id, "name", e.target.value)
                    }
                    placeholder="Tier name"
                  />
                  {submitted && errors.name ? (
                    <p className={styles.editorFieldError}>{errors.name}</p>
                  ) : null}
                </div>

                <div className={styles.editorField}>
                  <label className={styles.editorLabel}>Base Rent</label>
                  <input
                    className={styles.editorInput}
                    value={state.baseRent}
                    onChange={(e) =>
                      updateTierField(
                        tier.id,
                        "baseRent",
                        sanitizeMoneyInput(e.target.value)
                      )
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  {submitted && errors.baseRent ? (
                    <p className={styles.editorFieldError}>{errors.baseRent}</p>
                  ) : null}
                </div>

                <div className={styles.editorField}>
                  <label className={styles.editorLabel}>Processing Fee</label>
                  <input
                    className={styles.editorInput}
                    value={state.processingFee}
                    onChange={(e) =>
                      updateTierField(
                        tier.id,
                        "processingFee",
                        sanitizeMoneyInput(e.target.value)
                      )
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  {submitted && errors.processingFee ? (
                    <p className={styles.editorFieldError}>
                      {errors.processingFee}
                    </p>
                  ) : null}
                </div>

                <div className={styles.editorField}>
                  <label className={styles.editorLabel}>Due Day</label>
                  <input
                    className={styles.editorInput}
                    value={state.rentDueDay}
                    onChange={(e) =>
                      updateTierField(
                        tier.id,
                        "rentDueDay",
                        sanitizeIntegerInput(e.target.value)
                      )
                    }
                    inputMode="numeric"
                    placeholder="1"
                  />
                  {submitted && errors.rentDueDay ? (
                    <p className={styles.editorFieldError}>
                      {errors.rentDueDay}
                    </p>
                  ) : null}
                </div>

                <div className={styles.editorField}>
                  <label className={styles.editorLabel}>Grace Period (days)</label>
                  <input
                    className={styles.editorInput}
                    value={state.gracePeriodDays}
                    onChange={(e) =>
                      updateTierField(
                        tier.id,
                        "gracePeriodDays",
                        sanitizeIntegerInput(e.target.value)
                      )
                    }
                    inputMode="numeric"
                    placeholder="0"
                  />
                  {submitted && errors.gracePeriodDays ? (
                    <p className={styles.editorFieldError}>
                      {errors.gracePeriodDays}
                    </p>
                  ) : null}
                </div>

                <div className={styles.editorField}>
                  <label className={styles.editorLabel}>Initial Late Fee</label>
                  <input
                    className={styles.editorInput}
                    value={state.lateFeeInitial}
                    onChange={(e) =>
                      updateTierField(
                        tier.id,
                        "lateFeeInitial",
                        sanitizeMoneyInput(e.target.value)
                      )
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  {submitted && errors.lateFeeInitial ? (
                    <p className={styles.editorFieldError}>
                      {errors.lateFeeInitial}
                    </p>
                  ) : null}
                </div>

                <div className={styles.editorField}>
                  <label className={styles.editorLabel}>Daily Late Fee</label>
                  <input
                    className={styles.editorInput}
                    value={state.lateFeeDaily}
                    onChange={(e) =>
                      updateTierField(
                        tier.id,
                        "lateFeeDaily",
                        sanitizeMoneyInput(e.target.value)
                      )
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  {submitted && errors.lateFeeDaily ? (
                    <p className={styles.editorFieldError}>
                      {errors.lateFeeDaily}
                    </p>
                  ) : null}
                </div>

                <div className={styles.editorField}>
                  <label className={styles.editorLabel}>Max Daily Fee Days</label>
                  <input
                    className={styles.editorInput}
                    value={state.lateFeeMaxDays}
                    onChange={(e) =>
                      updateTierField(
                        tier.id,
                        "lateFeeMaxDays",
                        sanitizeIntegerInput(e.target.value)
                      )
                    }
                    inputMode="numeric"
                    placeholder="0"
                  />
                  {submitted && errors.lateFeeMaxDays ? (
                    <p className={styles.editorFieldError}>
                      {errors.lateFeeMaxDays}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className={styles.editorActions}>
                <button
                  type="button"
                  onClick={() => void handleSaveTier(tier.id)}
                  disabled={savingTierId === tier.id}
                  className={styles.primaryButton}
                >
                  {savingTierId === tier.id ? "Saving..." : "Save Tier Changes"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}