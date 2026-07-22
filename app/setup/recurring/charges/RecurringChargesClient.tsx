"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";import SetupProgress from "@/components/setup/SetupProgress";

type InitialCharge = {
  id: string;
  sharedChargeGroupId: string | null;
  label: string;
  amount: string;
  applyToAllTiers: boolean;
};

type InitialTier = {
  recurringPlanId: string;
  name: string;
  baseAmount: string;
  charges: InitialCharge[];
};

type ChargeDraft = {
  clientKey: string;
  sharedChargeGroupId: string | null;
  label: string;
  amount: string;
  appliesToAllTiers: boolean;
  selectedTierIds: string[];
  existingIdsByTier: Record<string, string>;
};

type SavedCharge = {
  id: string;
  clientKey: string;
  sharedChargeGroupId: string | null;
  label: string;
  amountCents: number;
  applyToAllTiers: boolean;
  sortOrder: number;
};

type SaveResponse = {
  saved?: boolean;
  tiers?: Array<{
    recurringPlanId: string;
    charges: SavedCharge[];
  }>;
  redirectTo?: string;
  error?: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  initialTiers: InitialTier[];
  highestReachedStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

function amountToCents(value: string): number | null {
  const normalized = value.trim();

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function createCharge(initialTiers: InitialTier[]): ChargeDraft {
  return {
    clientKey: crypto.randomUUID(),
    sharedChargeGroupId: null,
    label: "",
    amount: "",
    appliesToAllTiers: true,
    selectedTierIds: initialTiers.map((tier) => tier.recurringPlanId),
    existingIdsByTier: {},
  };
}

function buildInitialCharges(initialTiers: InitialTier[]): ChargeDraft[] {
  const groupedCharges = new Map<string, ChargeDraft>();

  for (const tier of initialTiers) {
    for (const charge of tier.charges) {
      const identity = charge.sharedChargeGroupId
        ? `shared:${charge.sharedChargeGroupId}`
        : `single:${charge.id}`;

      const existing = groupedCharges.get(identity);

      if (existing) {
        existing.selectedTierIds.push(tier.recurringPlanId);
        existing.existingIdsByTier[tier.recurringPlanId] = charge.id;
        continue;
      }

     groupedCharges.set(identity, {
  // Must be deterministic during server and client rendering.
  clientKey: identity,
  sharedChargeGroupId: charge.sharedChargeGroupId,
  label: charge.label,
  amount: charge.amount,
  appliesToAllTiers: charge.applyToAllTiers,
  selectedTierIds: [tier.recurringPlanId],
  existingIdsByTier: {
    [tier.recurringPlanId]: charge.id,
  },
});
    }
  }

  return Array.from(groupedCharges.values()).map((charge) => {
    const appliesToEveryTier =
      initialTiers.length > 0 &&
      initialTiers.every((tier) =>
        charge.selectedTierIds.includes(tier.recurringPlanId),
      );

    return {
      ...charge,
      appliesToAllTiers:
        charge.appliesToAllTiers && appliesToEveryTier,
      selectedTierIds:
        charge.appliesToAllTiers && appliesToEveryTier
          ? initialTiers.map((tier) => tier.recurringPlanId)
          : charge.selectedTierIds,
    };
  });
}

function cloneCharges(charges: ChargeDraft[]): ChargeDraft[] {
  return charges.map((charge) => ({
    ...charge,
    selectedTierIds: [...charge.selectedTierIds],
    existingIdsByTier: {
      ...charge.existingIdsByTier,
    },
  }));
}

function validateCharges(
  charges: ChargeDraft[],
  tiers: InitialTier[],
): string | null {
  for (const charge of charges) {
    if (!charge.label.trim()) {
      return "Enter a name for every monthly charge.";
    }

    if (amountToCents(charge.amount) === null) {
      return `Enter a valid amount for ${charge.label.trim() || "every charge"}.`;
    }

    if (!charge.appliesToAllTiers && charge.selectedTierIds.length === 0) {
      return `Select at least one tier for ${charge.label.trim()}.`;
    }
  }

  for (const tier of tiers) {
    const applicableLabels = charges
      .filter(
        (charge) =>
          charge.appliesToAllTiers ||
          charge.selectedTierIds.includes(tier.recurringPlanId),
      )
      .map((charge) => charge.label.trim().toLowerCase());

    if (new Set(applicableLabels).size !== applicableLabels.length) {
      return `Each monthly charge applied to ${tier.name} must have a unique name.`;
    }
  }

  return null;
}

export default function RecurringChargesClient({
  initialTiers,
  highestReachedStep,
}: Props) {
  const router = useRouter();

const searchParams = useSearchParams();

const settingsMode =
  searchParams.get("mode") === "settings";

  const [charges, setCharges] = useState<ChargeDraft[]>(() =>
    buildInitialCharges(initialTiers),
  );

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const [continuing, setContinuing] = useState(false);

const initialRender = useRef(true);
const skipNextAutosave = useRef(false);
const revision = useRef(0);
const saveChain = useRef<Promise<void>>(Promise.resolve());

  const tierIds = useMemo(
    () => initialTiers.map((tier) => tier.recurringPlanId),
    [initialTiers],
  );

  function markChanged(): void {
    revision.current += 1;
    setError("");
  }

  function addCharge(): void {
    markChanged();

    setCharges((current) => [...current, createCharge(initialTiers)]);
  }

  function removeCharge(clientKey: string): void {
    markChanged();

    setCharges((current) =>
      current.filter((charge) => charge.clientKey !== clientKey),
    );
  }

  function updateCharge(
    clientKey: string,
    field: "label" | "amount",
    value: string,
  ): void {
    markChanged();

    setCharges((current) =>
      current.map((charge) =>
        charge.clientKey === clientKey
          ? {
              ...charge,
              [field]: value,
            }
          : charge,
      ),
    );
  }

  function selectAllTiers(clientKey: string): void {
    markChanged();

    setCharges((current) =>
      current.map((charge) =>
        charge.clientKey === clientKey
          ? {
              ...charge,
              appliesToAllTiers: true,
              selectedTierIds: [...tierIds],
            }
          : charge,
      ),
    );
  }

  function selectSpecificTiers(clientKey: string): void {
    markChanged();

    setCharges((current) =>
      current.map((charge) =>
        charge.clientKey === clientKey
          ? {
              ...charge,
              appliesToAllTiers: false,

              // Intentionally blank.
              // The manager must choose every applicable tier.
              selectedTierIds: [],
            }
          : charge,
      ),
    );
  }

  function toggleTier(
    clientKey: string,
    recurringPlanId: string,
    checked: boolean,
  ): void {
    markChanged();

    setCharges((current) =>
      current.map((charge) => {
        if (charge.clientKey !== clientKey) {
          return charge;
        }

        const selectedTierIds = checked
          ? Array.from(
              new Set([...charge.selectedTierIds, recurringPlanId]),
            )
          : charge.selectedTierIds.filter(
              (tierId) => tierId !== recurringPlanId,
            );

        return {
          ...charge,
          appliesToAllTiers: false,
          selectedTierIds,
        };
      }),
    );
  }

  function buildTierPayload(snapshot: ChargeDraft[]) {
    return initialTiers.map((tier) => ({
      recurringPlanId: tier.recurringPlanId,

      charges: snapshot
        .filter(
          (charge) =>
            charge.appliesToAllTiers ||
            charge.selectedTierIds.includes(tier.recurringPlanId),
        )
        .map((charge) => ({
          id:
            charge.existingIdsByTier[tier.recurringPlanId] ?? null,

          /*
           * The API returns clientKey with each saved charge.
           * Including the tier ID lets us reliably reconnect each
           * database record to its charge card after saving.
           */
          clientKey: `${charge.clientKey}:${tier.recurringPlanId}`,

          sharedChargeGroupId: charge.appliesToAllTiers
            ? charge.sharedChargeGroupId ?? charge.clientKey
            : null,

          label: charge.label.trim(),
          amountCents: amountToCents(charge.amount),
          applyToAllTiers: charge.appliesToAllTiers,
        })),
    }));
  }

  async function saveSnapshot(
    snapshot: ChargeDraft[],
    snapshotRevision: number,
    advance: boolean,
  ): Promise<SaveResponse> {
    const validationError = validateCharges(snapshot, initialTiers);

    if (validationError) {
      if (advance) {
        setError(validationError);
      }

      return {
        error: validationError,
      };
    }

    setSaveStatus("saving");

    const response = await fetch("/api/setup/recurring/charges", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tiers: buildTierPayload(snapshot),
        advance,
      }),
    });

    const data = (await response.json()) as SaveResponse;

    if (!response.ok || !data.saved || !data.tiers) {
      setSaveStatus("error");

      const message =
        data.error ?? "Unable to save the monthly charges.";

      if (advance) {
        setError(message);
      }

      return {
        error: message,
      };
    }

    if (snapshotRevision === revision.current) {
  skipNextAutosave.current = true;

        setCharges((current) =>
        current.map((charge) => {
          const existingIdsByTier: Record<string, string> = {};
          let sharedChargeGroupId =
            charge.sharedChargeGroupId;

          for (const savedTier of data.tiers ?? []) {
            const expectedClientKey = `${charge.clientKey}:${savedTier.recurringPlanId}`;

            const savedCharge = savedTier.charges.find(
              (item) => item.clientKey === expectedClientKey,
            );

            if (!savedCharge) {
              continue;
            }

            existingIdsByTier[savedTier.recurringPlanId] =
              savedCharge.id;

            if (savedCharge.sharedChargeGroupId) {
              sharedChargeGroupId =
                savedCharge.sharedChargeGroupId;
            }
          }

          return {
            ...charge,
            existingIdsByTier,
            sharedChargeGroupId: charge.appliesToAllTiers
              ? sharedChargeGroupId
              : null,
          };
        }),
      );

      setSaveStatus("saved");
    }

    return data;
  }

  function queueSave(
    snapshot: ChargeDraft[],
    snapshotRevision: number,
    advance: boolean,
  ): Promise<SaveResponse> {
    let result: SaveResponse = {};

    saveChain.current = saveChain.current
      .catch(() => undefined)
      .then(async () => {
        result = await saveSnapshot(
          snapshot,
          snapshotRevision,
          advance,
        );
      });

    return saveChain.current.then(() => result);
  }

  useEffect(() => {
  if (initialRender.current) {
    initialRender.current = false;
    return;
  }

  /*
   * A successful save updates database IDs in local state.
   * Do not treat that server reconciliation as a new manager edit.
   */
  if (skipNextAutosave.current) {
    skipNextAutosave.current = false;
    return;
  }

  const validationError = validateCharges(
    charges,
    initialTiers,
  );

    if (validationError) {
      setSaveStatus("idle");
      return;
    }

    const snapshot = cloneCharges(charges);
    const snapshotRevision = revision.current;

    const timer = window.setTimeout(() => {
      void queueSave(snapshot, snapshotRevision, false);
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [charges, initialTiers]);

  async function continueToBilling(): Promise<void> {
    const validationError = validateCharges(
      charges,
      initialTiers,
    );

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setContinuing(true);

    try {
      const snapshot = cloneCharges(charges);

      const result = await queueSave(
        snapshot,
        revision.current,
        true,
      );

      if (result.error || !result.redirectTo) {
        setError(result.error ?? "Unable to continue.");
        return;
      }

      router.push(result.redirectTo);
      router.refresh();
    } catch {
      setSaveStatus("error");
      setError("Unable to connect. Please try again.");
    } finally {
      setContinuing(false);
    }
  }

  const saveLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Couldn’t save"
          : "Changes save automatically";

  return (
    <main className="rfl-setup-page">
      <section className="rfl-setup-card">
        {settingsMode ? null : (
  <SetupProgress
    currentStep={3}
    highestReachedStep={highestReachedStep}
  />
)}

        <div className="flex items-center justify-between gap-4">
<p className="rfl-eyebrow">
  {settingsMode
    ? "Settings"
    : "Step 3 of 7"}
</p>
          <p
            className={`rfl-save-status ${
              saveStatus === "saved"
                ? "rfl-save-status-saved"
                : saveStatus === "error"
                  ? "rfl-save-status-error"
                  : ""
            }`}
            aria-live="polite"
          >
            {saveStatus === "saved" ? (
              <span aria-hidden="true">✓</span>
            ) : null}

            {saveLabel}
          </p>
        </div>

        <header className="rfl-setup-header">
<h1>
  {settingsMode
    ? "Monthly Charges"
    : "Add monthly charges"}
</h1>

<p>
  {settingsMode
    ? "Update your recurring monthly charges."
    : "Add optional charges such as water, trash, parking, or other recurring monthly costs."}
</p>
        </header>

{settingsMode ? (
  <section className="rfl-settings-notice">
    <h2>
      Your monthly charges are already configured.
    </h2>

    <p>
      Only make changes here if a recurring
      charge has been added, removed,
      or changed.
    </p>
  </section>
) : null}

        <div className="space-y-5">
          {charges.map((charge, index) => (
            <article
              key={charge.clientKey}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="m-0 text-lg font-semibold text-slate-900">
                  Monthly Charge {index + 1}
                </h2>

                <button
                  type="button"
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                  onClick={() =>
                    removeCharge(charge.clientKey)
                  }
                >
                  Delete
                </button>
              </div>

              <div className="rfl-setup-grid">
                <div className="rfl-field">
                  <label htmlFor={`charge-label-${charge.clientKey}`}>
                    Charge name
                  </label>

                  <input
                    id={`charge-label-${charge.clientKey}`}
                    type="text"
                    maxLength={80}
                    value={charge.label}
                    placeholder="Water"
                    onChange={(event) =>
                      updateCharge(
                        charge.clientKey,
                        "label",
                        event.target.value,
                      )
                    }
                  />
                </div>

                <div className="rfl-field">
                  <label htmlFor={`charge-amount-${charge.clientKey}`}>
                    Monthly amount
                  </label>

                  <div className="rfl-money-input">
                    <span
                      className="rfl-money-prefix"
                      aria-hidden="true"
                    >
                      $
                    </span>

                    <input
                      id={`charge-amount-${charge.clientKey}`}
                      type="text"
                      inputMode="decimal"
                      value={charge.amount}
                      placeholder="50.00"
                      onChange={(event) =>
                        updateCharge(
                          charge.clientKey,
                          "amount",
                          event.target.value,
                        )
                      }
                    />
                  </div>

                  <p className="rfl-field-help">
                    Enter numbers only. No $ needed.
                  </p>
                </div>
              </div>

              <fieldset className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900">
                  Applies to
                </legend>

                <div className="grid gap-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name={`tier-scope-${charge.clientKey}`}
                      checked={charge.appliesToAllTiers}
                      onChange={() =>
                        selectAllTiers(charge.clientKey)
                      }
                    />

                    <span className="font-medium text-slate-900">
                      All tiers
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name={`tier-scope-${charge.clientKey}`}
                      checked={!charge.appliesToAllTiers}
                      onChange={() =>
                        selectSpecificTiers(charge.clientKey)
                      }
                    />

                    <span className="font-medium text-slate-900">
                      Selected tiers
                    </span>
                  </label>
                </div>

                {!charge.appliesToAllTiers ? (
                  <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4">
                    <p className="m-0 text-sm text-slate-600">
                      Select every tier this charge applies to.
                    </p>

                    {initialTiers.map((tier) => (
                      <label
                        key={tier.recurringPlanId}
                        className="flex cursor-pointer items-center gap-3 rounded-lg bg-white px-3 py-3"
                      >
                        <input
                          type="checkbox"
                          checked={charge.selectedTierIds.includes(
                            tier.recurringPlanId,
                          )}
                          onChange={(event) =>
                            toggleTier(
                              charge.clientKey,
                              tier.recurringPlanId,
                              event.target.checked,
                            )
                          }
                        />

                        <span className="font-medium text-slate-900">
                          {tier.name}
                        </span>

                        <span className="ml-auto text-sm text-slate-500">
                          Base rent: ${tier.baseAmount}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </fieldset>
            </article>
          ))}
        </div>

        <button
          type="button"
          className="mt-5 w-full rounded-xl border border-slate-300 bg-slate-100 px-5 py-3 font-semibold text-slate-800 transition hover:bg-slate-200"
          onClick={addCharge}
        >
          + Add Another Monthly Charge
        </button>

        {error ? (
          <p className="rfl-error mt-5" role="alert">
            {error}
          </p>
        ) : null}

       {settingsMode ? (
  <button
    className="rfl-primary-button mt-6"
    type="button"
    onClick={() => {
      router.push("/manager/settings");
    }}
  >
    Done
  </button>
) : (
  <div className="mt-6 grid gap-3">
    <button
      className="rfl-primary-button"
      type="button"
      disabled={continuing}
      onClick={continueToBilling}
    >
      {continuing
        ? "Saving..."
        : "Continue to Billing Rules"}
    </button>

    <Link
      className="rfl-auth-secondary-link !mt-0"
      href="/setup/recurring/tiers"
    >
      Back to Rent Tiers
    </Link>
  </div>
)}
      </section>
    </main>
  );
}