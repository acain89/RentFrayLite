// app/admin/properties/[id]/PropertyUnitEditor.tsx

"use client";

import { useState } from "react";
import styles from "./page.module.css";

type UnitRow = {
  id: string;
  unitNumber: string;
  baseRent: number | null;
  recurringFees: number | null;
  isActive: boolean;
};

type TierRow = {
  id: string;
  name: string;
  units: UnitRow[];
};

type Props = {
  propertyId: string;
  tiers: TierRow[];
};

export default function PropertyUnitEditor({ propertyId, tiers }: Props) {
  const [localTiers, setLocalTiers] = useState(tiers);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  async function handleDelete(unitId: string) {
    if (!confirm("Delete this unit?")) return;

    setSavingId(unitId);
    setError("");

    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/units`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to delete.");
        return;
      }

      setLocalTiers((prev) =>
        prev.map((tier) => ({
          ...tier,
          units: tier.units.filter((u) => u.id !== unitId),
        }))
      );
    } catch {
      setError("Network error.");
    }

    setSavingId("");
  }

  if (!localTiers.length) {
    return (
      <section className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>Units</h2>
        <p>No units found.</p>
      </section>
    );
  }

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>Units</h2>
          <p className={styles.sectionSubtitle}>
            Units are auto-generated from your tier setup. You can review them
            here.
          </p>
        </div>
      </div>

      {error && <div className={styles.editorError}>{error}</div>}

      <div className={styles.tierList}>
        {localTiers.map((tier) => (
          <div key={tier.id} className={styles.tierCard}>
            <div className={styles.tierHead}>
              <div>
                <h3 className={styles.tierTitle}>{tier.name}</h3>
                <p className={styles.tierSubtitle}>
                  {tier.units.length} units
                </p>
              </div>
            </div>

            <div className={styles.unitGrid}>
              {tier.units.length === 0 ? (
                <div className={styles.emptyUnitCard}>
                  No units in this tier.
                </div>
              ) : (
                tier.units.map((unit) => (
                  <div key={unit.id} className={styles.unitCard}>
                    <div className={styles.unitNumber}>
                      Unit {unit.unitNumber}
                    </div>

                    <div className={styles.unitMeta}>
                      Rent: ${Number(unit.baseRent ?? 0).toFixed(2)}
                    </div>

                    <div className={styles.unitMeta}>
                      Add-ons: ${Number(unit.recurringFees ?? 0).toFixed(2)}
                    </div>

                    <button
                      onClick={() => handleDelete(unit.id)}
                      disabled={savingId === unit.id}
                      className={styles.dangerButton}
                    >
                      {savingId === unit.id ? "Removing..." : "Remove"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}