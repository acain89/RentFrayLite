"use client";

import { useMemo, useState } from "react";
import styles from "./page.module.css";

type PropertyEditorProps = {
  property: {
    id: string;
    name: string;
    propertyType: string | null;
    addressLine1: string | null;
    isActive: boolean;
    propertySettings: {
      rentDueDay: number | null;
      gracePeriodDays: number | null;
      lateFeeEnabled: boolean | null;
      lateFeeFlat: number | null;
      convenienceFeeEnabled: boolean | null;
      convenienceFeeAmount: number | null;
    } | null;
  };
};

type SaveResponse = {
  ok?: boolean;
  error?: string;
  property?: {
    id: string;
    name: string;
    propertyCode: string;
    propertyType: string;
    addressLine1: string;
    isActive: boolean;
  };
  propertySettings?: {
    propertyId: string;
    rentDueDay: number;
    gracePeriodDays: number;
    lateFeeEnabled: boolean;
    lateFeeFlat: number;
    convenienceFeeEnabled: boolean;
    convenienceFeeAmount: number;
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

export default function PropertyEditor({ property }: PropertyEditorProps) {
  const [name, setName] = useState(property.name || "");
  const [address, setAddress] = useState(property.addressLine1 || "");
  const [propertyType, setPropertyType] = useState(
    property.propertyType || "OTHER"
  );
  const [isActive, setIsActive] = useState(Boolean(property.isActive));

  const [rentDueDay, setRentDueDay] = useState(
    property.propertySettings?.rentDueDay?.toString() || "1"
  );
  const [gracePeriodDays, setGracePeriodDays] = useState(
    property.propertySettings?.gracePeriodDays?.toString() || "0"
  );
  const [lateFeeEnabled, setLateFeeEnabled] = useState(
    property.propertySettings?.lateFeeEnabled ?? true
  );
  const [lateFeeFlat, setLateFeeFlat] = useState(
    property.propertySettings?.lateFeeFlat?.toString() || "0"
  );
  const [convenienceFeeEnabled, setConvenienceFeeEnabled] = useState(
    property.propertySettings?.convenienceFeeEnabled ?? true
  );
  const [convenienceFeeAmount, setConvenienceFeeAmount] = useState(
    property.propertySettings?.convenienceFeeAmount?.toString() || "0"
  );

  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "Property name is required.";
    }

    if (!address.trim()) {
      errors.address = "Property address is required.";
    }

    const dueDay = Number(rentDueDay);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      errors.rentDueDay = "Rent due day must be between 1 and 31.";
    }

    const grace = Number(gracePeriodDays);
    if (!Number.isInteger(grace) || grace < 0 || grace > 31) {
      errors.gracePeriodDays = "Grace period must be between 0 and 31.";
    }

    const lateFee = Number(lateFeeFlat);
    if (!Number.isFinite(lateFee) || lateFee < 0) {
      errors.lateFeeFlat = "Late fee must be 0 or greater.";
    }

    const convenienceFee = Number(convenienceFeeAmount);
    if (!Number.isFinite(convenienceFee) || convenienceFee < 0) {
      errors.convenienceFeeAmount = "Convenience fee must be 0 or greater.";
    }

    return errors;
  }, [name, address, rentDueDay, gracePeriodDays, lateFeeFlat, convenienceFeeAmount]);

  const isValid = Object.keys(validation).length === 0;

  async function handleSave() {
    setSubmitAttempted(true);
    setError("");
    setSuccess("");

    if (!isValid) return;

    setSaving(true);

    try {
      const res = await fetch(`/api/admin/properties/${property.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          propertyType,
          isActive,
          rentDueDay: Number(rentDueDay),
          gracePeriodDays: Number(gracePeriodDays),
          lateFeeEnabled,
          lateFeeFlat: Number(lateFeeFlat || 0),
          convenienceFeeEnabled,
          convenienceFeeAmount: Number(convenienceFeeAmount || 0),
        }),
      });

      const result: SaveResponse = await res.json();

      if (!res.ok) {
        setError(result.error || "Failed to save property.");
        setSaving(false);
        return;
      }

      setSuccess("Property updated successfully.");
    } catch {
      setError("Network error.");
    }

    setSaving(false);
  }

  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>Edit property and rules</h2>
          <p className={styles.sectionSubtitle}>
            Update core property details, active status, due day, grace period,
            and fees.
          </p>
        </div>
      </div>

      {error ? <div className={styles.editorError}>{error}</div> : null}
      {success ? <div className={styles.editorSuccess}>{success}</div> : null}

      <div className={styles.editorGrid}>
        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Property Name</label>
          <input
            className={styles.editorInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Property name"
          />
          {submitAttempted && validation.name ? (
            <p className={styles.editorFieldError}>{validation.name}</p>
          ) : null}
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Business Type</label>
          <select
            className={styles.editorInput}
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
          >
            <option value="MULTIFAMILY">Multifamily</option>
            <option value="MOBILE_HOME">Mobile Home Park</option>
            <option value="RV_PARK">RV Park</option>
            <option value="SELF_STORAGE">Self Storage</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div className={styles.editorFieldFull}>
          <label className={styles.editorLabel}>Address</label>
          <input
            className={styles.editorInput}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St"
          />
          {submitAttempted && validation.address ? (
            <p className={styles.editorFieldError}>{validation.address}</p>
          ) : null}
        </div>

        <div className={styles.editorToggleRow}>
          <label className={styles.editorToggle}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Property is active</span>
          </label>

          <label className={styles.editorToggle}>
            <input
              type="checkbox"
              checked={lateFeeEnabled}
              onChange={(e) => setLateFeeEnabled(e.target.checked)}
            />
            <span>Late fee enabled</span>
          </label>

          <label className={styles.editorToggle}>
            <input
              type="checkbox"
              checked={convenienceFeeEnabled}
              onChange={(e) => setConvenienceFeeEnabled(e.target.checked)}
            />
            <span>Convenience fee enabled</span>
          </label>
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Rent Due Day</label>
          <input
            className={styles.editorInput}
            value={rentDueDay}
            onChange={(e) => setRentDueDay(sanitizeIntegerInput(e.target.value))}
            inputMode="numeric"
            placeholder="1"
          />
          {submitAttempted && validation.rentDueDay ? (
            <p className={styles.editorFieldError}>{validation.rentDueDay}</p>
          ) : null}
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Grace Period (days)</label>
          <input
            className={styles.editorInput}
            value={gracePeriodDays}
            onChange={(e) =>
              setGracePeriodDays(sanitizeIntegerInput(e.target.value))
            }
            inputMode="numeric"
            placeholder="0"
          />
          {submitAttempted && validation.gracePeriodDays ? (
            <p className={styles.editorFieldError}>
              {validation.gracePeriodDays}
            </p>
          ) : null}
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Flat Late Fee</label>
          <input
            className={styles.editorInput}
            value={lateFeeFlat}
            onChange={(e) => setLateFeeFlat(sanitizeMoneyInput(e.target.value))}
            inputMode="decimal"
            placeholder="0.00"
          />
          {submitAttempted && validation.lateFeeFlat ? (
            <p className={styles.editorFieldError}>{validation.lateFeeFlat}</p>
          ) : null}
        </div>

        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Convenience Fee Amount</label>
          <input
            className={styles.editorInput}
            value={convenienceFeeAmount}
            onChange={(e) =>
              setConvenienceFeeAmount(sanitizeMoneyInput(e.target.value))
            }
            inputMode="decimal"
            placeholder="0.00"
          />
          {submitAttempted && validation.convenienceFeeAmount ? (
            <p className={styles.editorFieldError}>
              {validation.convenienceFeeAmount}
            </p>
          ) : null}
        </div>
      </div>

      <div className={styles.editorActions}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={styles.primaryButton}
        >
          {saving ? "Saving..." : "Save Property Changes"}
        </button>
      </div>
    </section>
  );
}