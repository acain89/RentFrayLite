// app/admin/properties/new/page.tsx

"use client";

import "./page.css";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ChargeRow = {
  id: string;
  label: string;
  amount: string;
};

type TierRow = {
  id: string;
  name: string;
  unitLabels: string;
  baseRent: string;
  dueDay: string;
  graceDays: string;
  lateFeeInitial: string;
  lateFeeDaily: string;
  lateFeeMaxDays: string;
  charges: ChargeRow[];
};

type TierEditableField = Exclude<keyof TierRow, "charges">;

type WizardData = {
  account: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

  property: {
    name: string;
    address: string;
    businessType: string;
  };
  tiers: TierRow[];
  applySameRulesToAll: boolean;
  paymentSetupDeferred: boolean;
};

type SuccessData = {
  propertyId: string;
  propertyCode: string;
  propertyName: string;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const TOTAL_STEPS = 6;
const DRAFT_STORAGE_KEY = "rentfray_new_property_wizard_draft";

function createCharge(): ChargeRow {
  return {
    id: uid(),
    label: "",
    amount: "",
  };
}

function createTier(): TierRow {
  return {
    id: uid(),
    name: "",
    unitLabels: "",
    baseRent: "",
    dueDay: "",
    graceDays: "",
    lateFeeInitial: "",
    lateFeeDaily: "",
    lateFeeMaxDays: "5",
    charges: [],
  };
}

function sanitizeMoneyInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

function sanitizeIntegerInput(value: string) {
  return value.replace(/\D/g, "");
}

function parseUnitLabels(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => v.toUpperCase())
    ),
  ];
}

function ordinal(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function getBaseRentAmount(tier: TierRow) {
  return Number(tier.baseRent) || 0;
}

function getRecurringChargeTotal(tier: TierRow) {
  return tier.charges.reduce(
    (sum, charge) => sum + (Number(charge.amount) || 0),
    0
  );
}

function getMonthlySubtotal(tier: TierRow) {
  return getBaseRentAmount(tier) + getRecurringChargeTotal(tier);
}

/**
 * Lowest processing amount available for this tier.
 * Using two common rails here and surfacing the lower one:
 * - Card-like fee: 2.9% + $0.30
 * - ACH-like fee: 1.0%
 *
 * This keeps the preview from landing on suspicious whole-dollar values
 * and gives a realistic "lowest available" estimate.
 */
function getMinimumProcessingFee(monthlySubtotal: number) {
  if (monthlySubtotal <= 0) return 0;

  const cardFee = monthlySubtotal * 0.029 + 0.3;
  const achFee = monthlySubtotal * 0.01;

  return Math.min(cardFee, achFee);
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function isNonEmpty(value: string) {
  return value.trim().length > 0;
}

export default function NewPropertyPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saveExitLoading, setSaveExitLoading] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);

  const [data, setData] = useState<WizardData>({
    account: {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
},
    property: {
      name: "",
      address: "",
      businessType: "MULTIFAMILY",
    },
    tiers: [createTier()],
    applySameRulesToAll: true,
    paymentSetupDeferred: false,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) {
        setDraftLoaded(true);
        return;
      }

      const parsed = JSON.parse(raw) as {
        step?: number;
        data?: WizardData;
      };

      if (parsed?.data) {
        setData(parsed.data);
      }

      if (
        typeof parsed?.step === "number" &&
        parsed.step >= 1 &&
        parsed.step <= TOTAL_STEPS
      ) {
        setStep(parsed.step);
      }
    } catch {
      // Ignore malformed local drafts.
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    if (!data.account.fullName.trim()) {
      errors.fullName = "Enter your name.";
    }

    if (!data.account.email.trim()) {
      errors.email = "Enter your email.";
    }

    if (!data.account.password.trim()) {
  errors.password = "Enter a password.";
} else if (data.account.password.trim().length < 6) {
  errors.password = "Password must be at least 6 characters.";
}

if (data.account.password !== data.account.confirmPassword) {
  errors.confirmPassword = "Passwords do not match.";
}

    if (!data.property.name.trim()) {
      errors.propertyName = "Enter a property name.";
    }

    if (!data.property.address.trim()) {
      errors.propertyAddress = "Enter an address.";
    }

    if (!data.tiers.length) {
      errors.tiers = "Add at least one tier.";
    }

    const allUnits: string[] = [];

    data.tiers.forEach((tier, index) => {
      const parsedUnits = parseUnitLabels(tier.unitLabels);

      if (!tier.name.trim()) {
        errors[`tier-${index}-name`] = "Enter a tier description.";
      }

      if (!tier.unitLabels.trim()) {
        errors[`tier-${index}-unitLabels`] =
          "List the exact unit labels for this tier, separated by a comma.";
      } else if (!parsedUnits.length) {
        errors[`tier-${index}-unitLabels`] =
          "Enter at least one valid unit number.";
      }

      if (tier.baseRent.trim() === "") {
        errors[`tier-${index}-baseRent`] = "Enter monthly rent/price.";
      }

      if (tier.dueDay.trim() === "") {
        errors[`tier-${index}-dueDay`] = "Select a due day.";
      }

      if (tier.graceDays.trim() === "") {
        errors[`tier-${index}-graceDays`] = "Enter grace period.";
      }

      if (tier.lateFeeInitial.trim() === "") {
        errors[`tier-${index}-lateFeeInitial`] = "Enter late fee amount.";
      }

      if (tier.lateFeeDaily.trim() === "") {
        errors[`tier-${index}-lateFeeDaily`] = "Enter daily late fee.";
      }

      if (tier.lateFeeMaxDays.trim() === "") {
        errors[`tier-${index}-lateFeeMaxDays`] = "Enter max late fee days.";
      }

      tier.charges.forEach((charge, chargeIndex) => {
        if (!charge.label.trim()) {
          errors[`tier-${index}-charge-${chargeIndex}-label`] =
            "Enter a charge label.";
        }

        if (charge.amount.trim() === "") {
          errors[`tier-${index}-charge-${chargeIndex}-amount`] =
            "Enter a charge amount.";
        }
      });

      allUnits.push(...parsedUnits);
    });

    const dupes = allUnits.filter(
      (label, index) => allUnits.indexOf(label) !== index
    );

    if (dupes.length) {
      errors.duplicateUnits = `Duplicate unit labels found: ${[
        ...new Set(dupes),
      ].join(", ")}`;
    }

    return errors;
  }, [data]);

  const progressPercent = (step / TOTAL_STEPS) * 100;

 const updateTier = (
  tierId: string,
  field: TierEditableField,
  value: string
) => {
  setData((prev) => ({
    ...prev,
    tiers: prev.tiers.map((tier) =>
      tier.id === tierId ? { ...tier, [field]: value } : tier
    ),
  }));
};

  const addTier = () => {
    setData((prev) => ({
      ...prev,
      tiers: [...prev.tiers, createTier()],
    }));
  };

  const deleteTier = (tierId: string) => {
    setData((prev) => ({
      ...prev,
      tiers:
        prev.tiers.length === 1
          ? prev.tiers
          : prev.tiers.filter((tier) => tier.id !== tierId),
    }));
  };

  const addCharge = (tierId: string) => {
    setData((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier) =>
        tier.id === tierId
          ? { ...tier, charges: [...tier.charges, createCharge()] }
          : tier
      ),
    }));
  };

  const updateCharge = (
    tierId: string,
    chargeId: string,
    field: keyof ChargeRow,
    value: string
  ) => {
    setData((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier) =>
        tier.id === tierId
          ? {
              ...tier,
              charges: tier.charges.map((charge) =>
                charge.id === chargeId ? { ...charge, [field]: value } : charge
              ),
            }
          : tier
      ),
    }));
  };

  const deleteCharge = (tierId: string, chargeId: string) => {
    setData((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier) =>
        tier.id === tierId
          ? {
              ...tier,
              charges: tier.charges.filter((charge) => charge.id !== chargeId),
            }
          : tier
      ),
    }));
  };

  const hasStep1Errors =
  !!validation.fullName ||
  !!validation.email ||
  !!validation.password ||
  !!validation.confirmPassword;

  const hasStep2Errors =
    !!validation.propertyName || !!validation.propertyAddress;

  const hasStep3Errors =
    !!validation.tiers ||
    !!validation.duplicateUnits ||
    Object.keys(validation).some(
      (key) =>
        key.includes("-name") ||
        key.includes("-unitLabels") ||
        key.includes("-baseRent") ||
        key.includes("-charge-")
    );

  const hasStep4Errors = Object.keys(validation).some(
    (key) =>
      key.includes("-dueDay") ||
      key.includes("-graceDays") ||
      key.includes("-lateFeeInitial") ||
      key.includes("-lateFeeDaily") ||
      key.includes("-lateFeeMaxDays")
  );

  const canAdvanceStep = () => {
    if (step === 1) return !hasStep1Errors;
    if (step === 2) return !hasStep2Errors;
    if (step === 3) return !hasStep3Errors;
    if (step === 4) return !hasStep4Errors;
    return true;
  };

  const persistLocalDraft = (currentStep: number, currentData: WizardData) => {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        step: currentStep,
        data: currentData,
        savedAt: new Date().toISOString(),
      })
    );
  };

  const clearLocalDraft = () => {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  };

  const nextStep = () => {
    setSubmitAttempted(true);

    if (!canAdvanceStep()) return;

    setSubmitAttempted(false);
    const nextValue = Math.min(TOTAL_STEPS, step + 1);
    setStep(nextValue);
    try {
      persistLocalDraft(nextValue, data);
    } catch {
      // ignore storage failures
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const prevStep = () => {
    const prevValue = Math.max(1, step - 1);
    setStep(prevValue);
    setSubmitAttempted(false);
    try {
      persistLocalDraft(prevValue, data);
    } catch {
      // ignore storage failures
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSaveExit = async () => {
    try {
      setSaveExitLoading(true);
      setServerError("");
      persistLocalDraft(step, data);
      router.push("/admin?saved=draft");
    } catch {
      setServerError("Unable to save your draft locally.");
      setSaveExitLoading(false);
    }
  };

  const handleGoLive = async () => {
    setSubmitAttempted(true);
    setServerError("");

    if (Object.keys(validation).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = (await res.json()) as {
        error?: string;
        property?: {
          id: string;
          propertyCode: string;
          name: string;
        };
      };

      if (!res.ok || !result.property) {
        setServerError(result.error || "Unable to create property.");
        setLoading(false);
        return;
      }

      clearLocalDraft();

      setSuccessData({
        propertyId: result.property.id,
        propertyCode: result.property.propertyCode,
        propertyName: result.property.name,
      });

      router.replace(`/login/manager?code=${result.property.propertyCode}`);

      setStep(TOTAL_STEPS);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setServerError("Network error.");
    }

    setLoading(false);
  };

  const clientInstructions = successData
    ? `Go to RentFray.com.
Click "Existing Members."
Type in property code ${successData.propertyCode}.
Click "First time log in."
Complete setup.
Click "Tenants" to log in and view balance.`
    : "";

  if (!draftLoaded) {
    return (
      <main className="wizard-page">
        <div className="wizard-shell">
          <section className="wizard-card">
            <div className="wizard-section-head">
              <h1>Loading setup...</h1>
              <p>Please wait while we restore your saved progress.</p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="wizard-page">
      <div className="wizard-shell">
        <div className="wizard-topbar">
          <div className="wizard-brand">RENTFRAY</div>

          {!successData && (
            <button
              type="button"
              onClick={handleSaveExit}
              disabled={saveExitLoading}
              className="wizard-secondary-button wizard-topbar-button"
            >
              {saveExitLoading ? "Saving..." : "Save & Exit"}
            </button>
          )}
        </div>

        {!successData && (
          <div className="wizard-progress-card">
            <div className="wizard-progress-row">
              <span>
                Step {step} of {TOTAL_STEPS}
              </span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="wizard-progress-track">
              <div
                className="wizard-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {serverError && (
          <div className="wizard-alert wizard-alert-error">{serverError}</div>
        )}

        {submitAttempted && validation.duplicateUnits && !successData && (
          <div className="wizard-alert wizard-alert-error">
            {validation.duplicateUnits}
          </div>
        )}

        {!successData && step === 1 && (
          <section className="wizard-card">
            <div className="wizard-section-head">
              <h1>Create account</h1>
              <p>Create your account to get started. This only takes a minute.</p>
            </div>

            <div className="wizard-stack">
              <div>
                <label className="wizard-label">Full Name</label>
                <input
                  className="wizard-input"
                  value={data.account.fullName}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      account: { ...prev.account, fullName: e.target.value },
                    }))
                  }
                  placeholder="John Smith"
                  autoComplete="name"
                />
                {submitAttempted && validation.fullName && (
                  <p className="wizard-error-text">{validation.fullName}</p>
                )}
              </div>

              <div>
                <label className="wizard-label">Email</label>
                <input
                  className="wizard-input"
                  value={data.account.email}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      account: { ...prev.account, email: e.target.value },
                    }))
                  }
                  placeholder="name@email.com"
                  inputMode="email"
                  autoComplete="email"
                />
                {submitAttempted && validation.email && (
                  <p className="wizard-error-text">{validation.email}</p>
                )}
              </div>

              <div>
                <label className="wizard-label">Password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="wizard-input"
                  value={data.account.password}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      account: { ...prev.account, password: e.target.value },
                    }))
                  }
                  placeholder="Minimum 6 characters"
                />
                {submitAttempted && validation.password && (
                  <p className="wizard-error-text">{validation.password}</p>
                )}
              </div>
               <div>
  <label className="wizard-label">Confirm Password</label>
  <input
    type="password"
    autoComplete="new-password"
    className="wizard-input"
    value={data.account.confirmPassword}
    onChange={(e) =>
      setData((prev) => ({
        ...prev,
        account: {
          ...prev.account,
          confirmPassword: e.target.value,
        },
      }))
    }
    placeholder="Re-enter password"
  />
  {submitAttempted && validation.confirmPassword && (
    <p className="wizard-error-text">{validation.confirmPassword}</p>
  )}
</div>
            </div>
          </section>
        )}

        {!successData && step === 2 && (
          <section className="wizard-card">
            <div className="wizard-section-head">
              <h1>Property info</h1>
              <p>
                Enter your property details. We’ll assign your property code
                automatically.
              </p>
            </div>

            <div className="wizard-stack">
              <div>
                <label className="wizard-label">Property Name</label>
                <input
                  className="wizard-input"
                  value={data.property.name}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      property: { ...prev.property, name: e.target.value },
                    }))
                  }
                  placeholder="Sunset Villas"
                  autoComplete="organization"
                />
                {submitAttempted && validation.propertyName && (
                  <p className="wizard-error-text">{validation.propertyName}</p>
                )}
              </div>

              <div>
                <label className="wizard-label">Address</label>
                <input
                  className="wizard-input"
                  value={data.property.address}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      property: { ...prev.property, address: e.target.value },
                    }))
                  }
                  placeholder="123 Main St"
                  autoComplete="street-address"
                />
                {submitAttempted && validation.propertyAddress && (
                  <p className="wizard-error-text">{validation.propertyAddress}</p>
                )}
              </div>

              <div>
                <label className="wizard-label">Business Type</label>
                <select
                  className="wizard-input"
                  value={data.property.businessType}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      property: { ...prev.property, businessType: e.target.value },
                    }))
                  }
                >
                  <option value="MULTIFAMILY">Multifamily</option>
                  <option value="MOBILE_HOME">Mobile Home Park</option>
                  <option value="RV_PARK">RV Park</option>
                  <option value="SELF_STORAGE">Self Storage</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
          </section>
        )}

        {!successData && step === 3 && (
          <section className="wizard-card">
            <div className="wizard-section-head">
              <h1>Units & tiers</h1>
              <p>Tell us how many units you have and group them by pricing.</p>
            </div>

            <div className="wizard-tier-list">
              {data.tiers.map((tier, index) => {
                const parsedUnits = parseUnitLabels(tier.unitLabels);
                const baseRent = getBaseRentAmount(tier);
                const recurringTotal = getRecurringChargeTotal(tier);
                const subtotal = getMonthlySubtotal(tier);
                const processing = getMinimumProcessingFee(subtotal);
                const totalPaidByClient = subtotal + processing;

                return (
                  <div key={tier.id} className="wizard-tier-card">
                    <div className="wizard-tier-card-head">
                      <div>
                        <h3>{tier.name.trim() || `Tier ${index + 1}`}</h3>
                        <p>{parsedUnits.length} mapped units</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteTier(tier.id)}
                        className="wizard-delete-button"
                      >
                        Delete
                      </button>
                    </div>

                    <div className="wizard-stack">
                      <div>
                        <label className="wizard-label">Tier Description</label>
                        <input
                          className="wizard-input"
                          value={tier.name}
                          onChange={(e) =>
                            updateTier(tier.id, "name", e.target.value)
                          }
                          placeholder="Tier A / 2 bed units"
                        />
                        {submitAttempted && validation[`tier-${index}-name`] && (
                          <p className="wizard-error-text">
                            {validation[`tier-${index}-name`]}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="wizard-label">
                          List the exact unit labels for this tier, separated by a
                          comma.
                        </p>
                        <textarea
                          className="wizard-input wizard-textarea"
                          value={tier.unitLabels}
                          onChange={(e) =>
                            updateTier(tier.id, "unitLabels", e.target.value)
                          }
                          placeholder="101, 102, 103"
                        />
                        {submitAttempted &&
                          validation[`tier-${index}-unitLabels`] && (
                            <p className="wizard-error-text">
                              {validation[`tier-${index}-unitLabels`]}
                            </p>
                          )}

                        {!!parsedUnits.length && (
                          <div className="wizard-chip-row">
                            {parsedUnits.map((label) => (
                              <span key={label} className="wizard-chip">
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="wizard-label">Monthly rent/price</label>
                        <div className="wizard-money-input-wrap">
                          <span className="wizard-money-prefix">$</span>
                          <input
                            className="wizard-input wizard-money-input"
                            value={tier.baseRent}
                            onChange={(e) =>
                              updateTier(
                                tier.id,
                                "baseRent",
                                sanitizeMoneyInput(e.target.value)
                              )
                            }
                            placeholder="850.00"
                            inputMode="decimal"
                          />
                        </div>
                        {submitAttempted && validation[`tier-${index}-baseRent`] && (
                          <p className="wizard-error-text">
                            {validation[`tier-${index}-baseRent`]}
                          </p>
                        )}
                      </div>

                      <div className="wizard-subcard wizard-subcard-amber">
                        <div className="wizard-subcard-head">
                          <p className="wizard-subcard-title">Monthly Charges</p>
                          <button
                            type="button"
                            onClick={() => addCharge(tier.id)}
                            className="wizard-primary-button wizard-small-button"
                          >
                            + Charges
                          </button>
                        </div>

                        <p className="wizard-helper-text">
                          Add additional monthly charges such as water, trash,
                          parking, etc.
                        </p>

                        <div className="wizard-stack">
                          {tier.charges.length === 0 && (
                            <div className="wizard-empty-state">
                              No monthly charges added for this tier.
                            </div>
                          )}

                          {tier.charges.map((charge, chargeIndex) => (
                            <div key={charge.id} className="wizard-charge-card">
                              <div className="wizard-two-col">
                                <div>
                                  <label className="wizard-label">Label</label>
                                  <input
                                    className="wizard-input"
                                    value={charge.label}
                                    onChange={(e) =>
                                      updateCharge(
                                        tier.id,
                                        charge.id,
                                        "label",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Water"
                                  />
                                  {submitAttempted &&
                                    validation[
                                      `tier-${index}-charge-${chargeIndex}-label`
                                    ] && (
                                      <p className="wizard-error-text">
                                        {
                                          validation[
                                            `tier-${index}-charge-${chargeIndex}-label`
                                          ]
                                        }
                                      </p>
                                    )}
                                </div>

                                <div>
                                  <label className="wizard-label">Amount</label>
                                  <div className="wizard-money-input-wrap">
                                    <span className="wizard-money-prefix">$</span>
                                    <input
                                      className="wizard-input wizard-money-input"
                                      value={charge.amount}
                                      onChange={(e) =>
                                        updateCharge(
                                          tier.id,
                                          charge.id,
                                          "amount",
                                          sanitizeMoneyInput(e.target.value)
                                        )
                                      }
                                      placeholder="35.00"
                                      inputMode="decimal"
                                    />
                                  </div>
                                  {submitAttempted &&
                                    validation[
                                      `tier-${index}-charge-${chargeIndex}-amount`
                                    ] && (
                                      <p className="wizard-error-text">
                                        {
                                          validation[
                                            `tier-${index}-charge-${chargeIndex}-amount`
                                          ]
                                        }
                                      </p>
                                    )}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => deleteCharge(tier.id, charge.id)}
                                className="wizard-delete-link"
                              >
                                Delete Charge
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="wizard-tier-preview">
                        <p className="wizard-tier-preview-title">Tier Preview</p>

                        <div className="wizard-tier-preview-line">
                          Monthly rent/price: <span>{formatCurrency(baseRent)}</span>
                        </div>

                        {tier.charges.map((charge) => (
                          <div
                            key={charge.id}
                            className="wizard-tier-preview-line"
                          >
                            {isNonEmpty(charge.label)
                              ? `Other charge (${charge.label.trim()}):`
                              : "Other charge:"}{" "}
                            <span>
                              {formatCurrency(Number(charge.amount) || 0)}
                            </span>
                          </div>
                        ))}

                        <div className="wizard-tier-preview-line">
                          Processing fee: <span>{formatCurrency(processing)}</span>
                        </div>

                        <p className="wizard-helper-text wizard-processing-preview-note">
                          This is the lowest processing amount available for this
                          tier.
                        </p>

                        <div className="wizard-tier-preview-line">
                          Total monthly charges:{" "}
                          <span>{formatCurrency(subtotal)}</span>
                        </div>

                        <div className="wizard-tier-preview-line wizard-tier-preview-total">
                          Total paid by client:{" "}
                          <span>{formatCurrency(totalPaidByClient)}</span>
                        </div>

                        {recurringTotal > 0 && (
                          <p className="wizard-helper-text">
                            Monthly charges include rent/price plus all recurring
                            charges shown above.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="wizard-add-tier-wrap">
              <button
                type="button"
                onClick={addTier}
                className="wizard-primary-button"
              >
                + Add Tier
              </button>
            </div>
          </section>
        )}

        {!successData && step === 4 && (
          <section className="wizard-card">
            <div className="wizard-section-head">
              <h1>Late charges and grace period rules</h1>
              <p>Set your due dates and late fee rules for each tier.</p>
            </div>

            <div className="wizard-subcard wizard-subcard-blue">
              <label className="wizard-checkbox-row">
                <input
                  type="checkbox"
                  checked={data.applySameRulesToAll}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      applySameRulesToAll: e.target.checked,
                    }))
                  }
                />
                <span>Apply same rules to all tiers</span>
              </label>
            </div>

            <div className="wizard-tier-list">
              {data.tiers.map((tier, index) => (
                <div key={tier.id} className="wizard-tier-card">
                  <div className="wizard-tier-card-head wizard-tier-card-head-simple">
                    <div>
                      <h3>{tier.name.trim() || `Tier ${index + 1}`}</h3>
                    </div>
                  </div>

                  <div className="wizard-two-col">
                    <div>
                      <label className="wizard-label">Due Day</label>
                      <select
                        className="wizard-input"
                        value={tier.dueDay}
                        onChange={(e) =>
                          updateTier(tier.id, "dueDay", e.target.value)
                        }
                      >
                        <option value="">Select</option>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <option key={day} value={day}>
                            {ordinal(day)}
                          </option>
                        ))}
                      </select>
                      {submitAttempted && validation[`tier-${index}-dueDay`] && (
                        <p className="wizard-error-text">
                          {validation[`tier-${index}-dueDay`]}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="wizard-label">Grace Period (days)</label>
                      <input
                        className="wizard-input"
                        value={tier.graceDays}
                        onChange={(e) =>
                          updateTier(
                            tier.id,
                            "graceDays",
                            sanitizeIntegerInput(e.target.value)
                          )
                        }
                        placeholder="5"
                        inputMode="numeric"
                      />
                      {submitAttempted && validation[`tier-${index}-graceDays`] && (
                        <p className="wizard-error-text">
                          {validation[`tier-${index}-graceDays`]}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="wizard-label">Late Fee Amount</label>
                      <div className="wizard-money-input-wrap">
                        <span className="wizard-money-prefix">$</span>
                        <input
                          className="wizard-input wizard-money-input"
                          value={tier.lateFeeInitial}
                          onChange={(e) =>
                            updateTier(
                              tier.id,
                              "lateFeeInitial",
                              sanitizeMoneyInput(e.target.value)
                            )
                          }
                          placeholder="50.00"
                          inputMode="decimal"
                        />
                      </div>
                      {submitAttempted &&
                        validation[`tier-${index}-lateFeeInitial`] && (
                          <p className="wizard-error-text">
                            {validation[`tier-${index}-lateFeeInitial`]}
                          </p>
                        )}
                    </div>

                    <div>
                      <label className="wizard-label">Daily Late Fee</label>
                      <div className="wizard-money-input-wrap">
                        <span className="wizard-money-prefix">$</span>
                        <input
                          className="wizard-input wizard-money-input"
                          value={tier.lateFeeDaily}
                          onChange={(e) =>
                            updateTier(
                              tier.id,
                              "lateFeeDaily",
                              sanitizeMoneyInput(e.target.value)
                            )
                          }
                          placeholder="5.00"
                          inputMode="decimal"
                        />
                      </div>
                      {submitAttempted &&
                        validation[`tier-${index}-lateFeeDaily`] && (
                          <p className="wizard-error-text">
                            {validation[`tier-${index}-lateFeeDaily`]}
                          </p>
                        )}
                    </div>

                    <div>
                      <label className="wizard-label">
                        Max Daily Late Fee Days
                      </label>
                      <input
                        className="wizard-input"
                        value={tier.lateFeeMaxDays}
                        onChange={(e) =>
                          updateTier(
                            tier.id,
                            "lateFeeMaxDays",
                            sanitizeIntegerInput(e.target.value).slice(0, 2)
                          )
                        }
                        placeholder="5"
                        inputMode="numeric"
                      />
                      {submitAttempted &&
                        validation[`tier-${index}-lateFeeMaxDays`] && (
                          <p className="wizard-error-text">
                            {validation[`tier-${index}-lateFeeMaxDays`]}
                          </p>
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!successData && step === 5 && (
          <section className="wizard-card">
            <div className="wizard-section-head">
              <h1>Payments setup</h1>
              <p>
                Connect your account to start receiving payments. You can finish
                this later if needed.
              </p>
            </div>

            <div className="wizard-stack">
              <div className="wizard-subcard wizard-subcard-blue">
                <p className="wizard-subcard-title">Stripe connection</p>
                <p className="wizard-helper-text">
                  This step will connect your payout account and enable payment
                  collection.
                </p>

                <button
                  type="button"
                  className="wizard-primary-button wizard-connect-button"
                >
                  Connect payments
                </button>
              </div>

              <label className="wizard-checkbox-card">
                <input
                  type="checkbox"
                  checked={data.paymentSetupDeferred}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      paymentSetupDeferred: e.target.checked,
                    }))
                  }
                />
                <span>I’ll finish payment setup later.</span>
              </label>
            </div>
          </section>
        )}

        {!successData && step === 6 && (
          <section className="wizard-card">
            <div className="wizard-section-head">
              <h1>Review + go live</h1>
              <p>Review your setup and go live when you’re ready.</p>
            </div>

            <div className="wizard-stack">
              <div className="wizard-subcard wizard-subcard-blue">
                <p className="wizard-subcard-title">Property</p>
                <p className="wizard-helper-line">{data.property.name}</p>
                <p className="wizard-helper-line">{data.property.address}</p>
              </div>

              <div className="wizard-subcard wizard-subcard-blue">
                <p className="wizard-subcard-title">Summary</p>
                <p className="wizard-helper-line">
                  {data.tiers.length} tier{data.tiers.length === 1 ? "" : "s"} ·{" "}
                  {data.tiers.reduce(
                    (sum, tier) => sum + parseUnitLabels(tier.unitLabels).length,
                    0
                  )}{" "}
                  total units
                </p>
              </div>

              <div className="wizard-stack">
                {data.tiers.map((tier, index) => {
                  const unitCount = parseUnitLabels(tier.unitLabels).length;
                  const baseRent = getBaseRentAmount(tier);
                  const subtotal = getMonthlySubtotal(tier);
                  const processing = getMinimumProcessingFee(subtotal);

                  return (
                    <div key={tier.id} className="wizard-review-tier">
                      <p className="wizard-review-tier-title">
                        {tier.name.trim() || `Tier ${index + 1}`}
                      </p>
                      <p className="wizard-review-line">{unitCount} units</p>
                      <div className="wizard-review-detail">
                        Monthly rent/price:{" "}
                        <span>{formatCurrency(baseRent)}</span>
                      </div>
                      {tier.charges.map((charge) => (
                        <div
                          key={charge.id}
                          className="wizard-review-detail"
                        >
                          {isNonEmpty(charge.label)
                            ? `Other charge (${charge.label.trim()}):`
                            : "Other charge:"}{" "}
                          <span>
                            {formatCurrency(Number(charge.amount) || 0)}
                          </span>
                        </div>
                      ))}
                      <div className="wizard-review-detail">
                        Processing fee: <span>{formatCurrency(processing)}</span>
                      </div>
                      <div className="wizard-review-detail">
                        Total monthly charges:{" "}
                        <span>{formatCurrency(subtotal)}</span>
                      </div>
                      <div className="wizard-review-total">
                        Total paid by client:{" "}
                        {formatCurrency(subtotal + processing)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {successData && (
          <section className="wizard-card">
            <div className="wizard-section-head">
              <h1>You&apos;re live.</h1>
              <p>Your account has been fully set up and is ready to use.</p>
            </div>

            <div className="wizard-stack">
              <div className="wizard-subcard wizard-subcard-green">
                <p className="wizard-subcard-title">Property Code</p>
                <p className="wizard-property-code">{successData.propertyCode}</p>
                <p className="wizard-helper-line">
                  Save this — you’ll need it to log in and share with tenants.
                </p>
              </div>

              <div className="wizard-subcard wizard-subcard-blue">
                <p className="wizard-subcard-title">Next steps</p>
                <ul className="wizard-next-steps">
                  <li>Share instructions with your clients</li>
                  <li>Log in to your manager dashboard</li>
                  <li>Start collecting payments</li>
                </ul>
              </div>

              <div className="wizard-share-card">
                <div className="wizard-share-card-head">
                  <p className="wizard-subcard-title">
                    Share instructions with your clients
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(clientInstructions);
                    }}
                    className="wizard-secondary-button"
                  >
                    Copy
                  </button>
                </div>

                <textarea
                  readOnly
                  value={clientInstructions}
                  className="wizard-share-textarea"
                />
              </div>

              <button
                type="button"
                  onClick={() =>
                   router.replace(`/login/manager?code=${successData.propertyCode}`)
                   }
                  className="wizard-primary-button"
                  >
                 Continue to login
                </button>
            </div>
          </section>
        )}
      </div>

      {!successData && (
        <div className="wizard-footer">
          <div className="wizard-footer-inner">
            {step > 1 && (
              <button
                type="button"
                onClick={prevStep}
                className="wizard-secondary-button wizard-footer-button"
              >
                Back
              </button>
            )}

            {step < 6 && (
              <button
                type="button"
                onClick={nextStep}
                className="wizard-primary-button wizard-footer-button"
              >
                Continue
              </button>
            )}

            {step === 6 && (
              <button
                type="button"
                onClick={handleGoLive}
                disabled={loading}
                className="wizard-primary-button wizard-footer-button"
              >
                {loading ? "Creating..." : "Go Live"}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}