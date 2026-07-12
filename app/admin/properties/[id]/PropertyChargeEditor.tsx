"use client";

import { useState } from "react";
import styles from "./page.module.css";

type ChargeRow = {
  id: string;
  label: string;
  amount: number | null;
  isActive: boolean;
  displayOrder: number;
};

type UnitRow = {
  id: string;
  unitNumber: string;
  recurringFees: number | null;
  charges: ChargeRow[];
};

type TierRow = {
  id: string;
  name: string;
  units: UnitRow[];
};

type PropertyChargeEditorProps = {
  propertyId: string;
  tiers: TierRow[];
};

type ChargeApiResponse = {
  ok?: boolean;
  error?: string;
  charge?: {
    id: string;
    propertyId: string;
    unitId: string;
    label: string;
    amount: number;
    isActive: boolean;
    displayOrder: number;
    recurringFees: number;
  };
  deleted?: {
    chargeId: string;
    unitId: string;
    recurringFees: number;
  };
};

function sanitizeMoneyInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

export default function PropertyChargeEditor({
  propertyId,
  tiers,
}: PropertyChargeEditorProps) {
  const [newChargeByUnit, setNewChargeByUnit] = useState<
    Record<string, { label: string; amount: string }>
  >(() =>
    Object.fromEntries(
      tiers.flatMap((tier) =>
        tier.units.map((unit) => [
          unit.id,
          {
            label: "",
            amount: "0",
          },
        ])
      )
    )
  );

  const [chargeEdits, setChargeEdits] = useState<
    Record<string, { label: string; amount: string }>
  >(() =>
    Object.fromEntries(
      tiers.flatMap((tier) =>
        tier.units.flatMap((unit) =>
          unit.charges.map((charge) => [
            charge.id,
            {
              label: charge.label,
              amount: String(Number(charge.amount || 0)),
            },
          ])
        )
      )
    )
  );

  const [savingKey, setSavingKey] = useState("");
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});
  const [successByKey, setSuccessByKey] = useState<Record<string, string>>({});

  function setMessage(key: string, kind: "error" | "success", message: string) {
    if (kind === "error") {
      setErrorByKey((prev) => ({ ...prev, [key]: message }));
      setSuccessByKey((prev) => ({ ...prev, [key]: "" }));
    } else {
      setSuccessByKey((prev) => ({ ...prev, [key]: message }));
      setErrorByKey((prev) => ({ ...prev, [key]: "" }));
    }
  }

  function clearMessage(key: string) {
    setErrorByKey((prev) => ({ ...prev, [key]: "" }));
    setSuccessByKey((prev) => ({ ...prev, [key]: "" }));
  }

  async function handleAddCharge(unitId: string) {
    const key = `add-charge-${unitId}`;
    const draft = newChargeByUnit[unitId] || { label: "", amount: "0" };
    const label = draft.label.trim();
    const amount = Number(draft.amount || 0);

    clearMessage(key);

    if (!label) {
      setMessage(key, "error", "Charge label is required.");
      return;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      setMessage(key, "error", "Charge amount must be 0 or greater.");
      return;
    }

    setSavingKey(key);

    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/charges`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          unitId,
          label,
          amount,
        }),
      });

      const result: ChargeApiResponse = await res.json();

      if (!res.ok) {
        setMessage(key, "error", result.error || "Failed to add charge.");
        setSavingKey("");
        return;
      }

      setMessage(key, "success", "Charge added. Refresh page to see it.");
      setNewChargeByUnit((prev) => ({
        ...prev,
        [unitId]: {
          label: "",
          amount: "0",
        },
      }));
    } catch {
      setMessage(key, "error", "Network error.");
    }

    setSavingKey("");
  }

  async function handleSaveCharge(chargeId: string) {
    const key = `charge-${chargeId}`;
    const draft = chargeEdits[chargeId];

    if (!draft) return;

    const label = draft.label.trim();
    const amount = Number(draft.amount || 0);

    clearMessage(key);

    if (!label) {
      setMessage(key, "error", "Charge label is required.");
      return;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      setMessage(key, "error", "Charge amount must be 0 or greater.");
      return;
    }

    setSavingKey(key);

    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/charges`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chargeId,
          label,
          amount,
        }),
      });

      const result: ChargeApiResponse = await res.json();

      if (!res.ok) {
        setMessage(key, "error", result.error || "Failed to update charge.");
        setSavingKey("");
        return;
      }

      setMessage(key, "success", "Charge updated. Refresh page to confirm.");
    } catch {
      setMessage(key, "error", "Network error.");
    }

    setSavingKey("");
  }

  async function handleDeleteCharge(chargeId: string) {
    const key = `charge-${chargeId}`;

    clearMessage(key);
    setSavingKey(key);

    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/charges`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chargeId,
        }),
      });

      const result: ChargeApiResponse = await res.json();

      if (!res.ok) {
        setMessage(key, "error", result.error || "Failed to delete charge.");
        setSavingKey("");
        return;
      }

      setMessage(key, "success", "Charge deleted. Refresh page to confirm.");
    } catch {
      setMessage(key, "error", "Network error.");
    }

    setSavingKey("");
  }

  if (tiers.length === 0) {
    return (
      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Edit recurring charges</h2>
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
          <h2 className={styles.sectionTitle}>Edit recurring charges</h2>
          <p className={styles.sectionSubtitle}>
            Add, update, or remove live recurring charges. These changes affect
            the real account totals used across admin, manager, and tenant views.
          </p>
        </div>
      </div>

      <div className={styles.tierList}>
        {tiers.map((tier) => (
          <div key={tier.id} className={styles.tierCard}>
            <div className={styles.tierHead}>
              <div>
                <h3 className={styles.tierTitle}>{tier.name}</h3>
                <p className={styles.tierSubtitle}>
                  {tier.units.length} units in this tier
                </p>
              </div>
            </div>

            <div className={styles.unitGrid}>
              {tier.units.length === 0 ? (
                <div className={styles.emptyUnitCard}>
                  No units in this tier yet.
                </div>
              ) : (
                tier.units.map((unit) => {
                  const addKey = `add-charge-${unit.id}`;
                  const newDraft = newChargeByUnit[unit.id] || {
                    label: "",
                    amount: "0",
                  };

                  return (
                    <div key={unit.id} className={styles.unitCard}>
                      <div className={styles.unitHeader}>
                        <span className={styles.unitNumber}>
                          Unit {unit.unitNumber}
                        </span>
                        <span className={styles.unitFee}>
                          Current add-ons: $
                          {Number(unit.recurringFees || 0).toFixed(2)}
                        </span>
                      </div>

                      <div className={styles.editorGrid}>
                        <div className={styles.editorField}>
                          <label className={styles.editorLabel}>
                            New Charge Label
                          </label>
                          <input
                            className={styles.editorInput}
                            value={newDraft.label}
                            onChange={(e) =>
                              setNewChargeByUnit((prev) => ({
                                ...prev,
                                [unit.id]: {
                                  ...prev[unit.id],
                                  label: e.target.value,
                                },
                              }))
                            }
                            placeholder="Water"
                          />
                        </div>

                        <div className={styles.editorField}>
                          <label className={styles.editorLabel}>
                            New Charge Amount
                          </label>
                          <input
                            className={styles.editorInput}
                            value={newDraft.amount}
                            onChange={(e) =>
                              setNewChargeByUnit((prev) => ({
                                ...prev,
                                [unit.id]: {
                                  ...prev[unit.id],
                                  amount: sanitizeMoneyInput(e.target.value),
                                },
                              }))
                            }
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {errorByKey[addKey] ? (
                        <div className={styles.editorError}>
                          {errorByKey[addKey]}
                        </div>
                      ) : null}

                      {successByKey[addKey] ? (
                        <div className={styles.editorSuccess}>
                          {successByKey[addKey]}
                        </div>
                      ) : null}

                      <div className={styles.editorActions}>
                        <button
                          type="button"
                          onClick={() => void handleAddCharge(unit.id)}
                          disabled={savingKey === addKey}
                          className={styles.primaryButton}
                        >
                          {savingKey === addKey ? "Adding..." : "Add Charge"}
                        </button>
                      </div>

                      <div className={styles.chargeList}>
                        {unit.charges.length === 0 ? (
                          <div className={styles.emptyUnitCard}>
                            No recurring charges for this unit.
                          </div>
                        ) : (
                          unit.charges.map((charge) => {
                            const chargeKey = `charge-${charge.id}`;
                            const draft = chargeEdits[charge.id] || {
                              label: charge.label,
                              amount: String(Number(charge.amount || 0)),
                            };

                            return (
                              <div key={charge.id} className={styles.chargeCard}>
                                <div className={styles.editorGrid}>
                                  <div className={styles.editorField}>
                                    <label className={styles.editorLabel}>
                                      Charge Label
                                    </label>
                                    <input
                                      className={styles.editorInput}
                                      value={draft.label}
                                      onChange={(e) =>
                                        setChargeEdits((prev) => ({
                                          ...prev,
                                          [charge.id]: {
                                            ...prev[charge.id],
                                            label: e.target.value,
                                          },
                                        }))
                                      }
                                      placeholder="Water"
                                    />
                                  </div>

                                  <div className={styles.editorField}>
                                    <label className={styles.editorLabel}>
                                      Charge Amount
                                    </label>
                                    <input
                                      className={styles.editorInput}
                                      value={draft.amount}
                                      onChange={(e) =>
                                        setChargeEdits((prev) => ({
                                          ...prev,
                                          [charge.id]: {
                                            ...prev[charge.id],
                                            amount: sanitizeMoneyInput(
                                              e.target.value
                                            ),
                                          },
                                        }))
                                      }
                                      inputMode="decimal"
                                      placeholder="0.00"
                                    />
                                  </div>
                                </div>

                                {errorByKey[chargeKey] ? (
                                  <div className={styles.editorError}>
                                    {errorByKey[chargeKey]}
                                  </div>
                                ) : null}

                                {successByKey[chargeKey] ? (
                                  <div className={styles.editorSuccess}>
                                    {successByKey[chargeKey]}
                                  </div>
                                ) : null}

                                <div className={styles.unitActionRow}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleSaveCharge(charge.id)
                                    }
                                    disabled={savingKey === chargeKey}
                                    className={styles.primaryButton}
                                  >
                                    {savingKey === chargeKey
                                      ? "Saving..."
                                      : "Save Charge"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDeleteCharge(charge.id)
                                    }
                                    disabled={savingKey === chargeKey}
                                    className={styles.dangerButton}
                                  >
                                    {savingKey === chargeKey
                                      ? "Working..."
                                      : "Delete Charge"}
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}