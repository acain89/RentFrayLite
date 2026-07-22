"use client";

import { useEffect, useRef, useState } from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import SetupProgress from "@/components/setup/SetupProgress";

type TierDraft = {
  id: string | null;
  clientKey: string;
  name: string;
  amount: string;
};

type InitialTier = {
  id: string;
  name: string;
  amount: string;
};

type SavedTier = {
  id: string;
  clientKey: string;
  name: string;
  baseAmountCents: number;
  sortOrder: number;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type SaveResponse = {
  saved?: boolean;
  tiers?: SavedTier[];
  redirectTo?: string;
  error?: string;
};

type RecurringTiersClientProps = {
  initialTiers: InitialTier[];
  highestReachedStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
};


function createEmptyTier(index: number): TierDraft {
  return {
    id: null,
    clientKey: crypto.randomUUID(),
    name: `Tier ${index + 1}`,
    amount: "",
  };
}

function amountToCents(amount: string): number | null {
  const normalized = amount.trim();

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const numericAmount = Number(normalized);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return null;
  }

  return Math.round(numericAmount * 100);
}

function validateTiers(tiers: TierDraft[]): string | null {
  if (tiers.length === 0) {
    return "Add at least one rent tier.";
  }

  const names = tiers.map((tier) =>
    tier.name.trim().toLowerCase()
  );

  if (names.some((name) => name.length === 0)) {
    return "Every tier needs a name.";
  }

  if (new Set(names).size !== names.length) {
    return "Each rent tier must have a unique name.";
  }

  if (
    tiers.some(
      (tier) => amountToCents(tier.amount) === null
    )
  ) {
    return "Enter a valid monthly amount for every tier.";
  }

  return null;
}

export default function RecurringTiersClient({
  initialTiers,
  highestReachedStep,
}: RecurringTiersClientProps) {
  const router = useRouter();

const searchParams = useSearchParams();

const settingsMode =
  searchParams.get("mode") === "settings";

  const [tiers, setTiers] = useState<TierDraft[]>(
    initialTiers.length > 0
      ? initialTiers.map((tier) => ({
          id: tier.id,
          clientKey: tier.id,
          name: tier.name,
          amount: tier.amount,
        }))
      : [createEmptyTier(0)]
  );

  const [saveStatus, setSaveStatus] =
    useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const [continuing, setContinuing] = useState(false);

  const initialRender = useRef(true);
  const revision = useRef(0);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  function updateTier(
    clientKey: string,
    field: "name" | "amount",
    value: string
  ): void {
    revision.current += 1;

    setTiers((current) =>
      current.map((tier) =>
        tier.clientKey === clientKey
          ? { ...tier, [field]: value }
          : tier
      )
    );

    setError("");
  }

  function addTier(): void {
    revision.current += 1;

    setTiers((current) => [
      ...current,
      createEmptyTier(current.length),
    ]);

    setError("");
  }

  function removeTier(clientKey: string): void {
    revision.current += 1;

    setTiers((current) =>
      current.filter((tier) => tier.clientKey !== clientKey)
    );

    setError("");
  }

  async function saveSnapshot(
    snapshot: TierDraft[],
    snapshotRevision: number,
    advance: boolean
  ): Promise<SaveResponse> {
    const validationError = validateTiers(snapshot);

    if (validationError) {
      if (advance) {
        setError(validationError);
      }

      return { error: validationError };
    }

    setSaveStatus("saving");

    const response = await fetch(
      "/api/setup/recurring/tiers",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tiers: snapshot.map((tier) => ({
            id: tier.id,
            clientKey: tier.clientKey,
            name: tier.name.trim(),
            amountCents: amountToCents(tier.amount),
          })),
          advance,
        }),
      }
    );

    const data = (await response.json()) as SaveResponse;

    if (!response.ok || !data.saved || !data.tiers) {
      setSaveStatus("error");

      if (advance) {
        setError(
          data.error ?? "Unable to save the rent tiers."
        );
      }

      return {
        error:
          data.error ?? "Unable to save the rent tiers.",
      };
    }

    if (snapshotRevision === revision.current) {
  setTiers((current) => {
    let changed = false;

    const next = current.map((tier) => {
      const saved = data.tiers?.find(
        (item) => item.clientKey === tier.clientKey
      );

      if (!saved || tier.id === saved.id) {
        return tier;
      }

      changed = true;

      return {
        ...tier,
        id: saved.id,
      };
    });

    return changed ? next : current;
  });

  setSaveStatus("saved");
}

    return data;
  }

  function queueSave(
    snapshot: TierDraft[],
    snapshotRevision: number,
    advance: boolean
  ): Promise<SaveResponse> {
    let result: SaveResponse = {};

    saveChain.current = saveChain.current
      .catch(() => undefined)
      .then(async () => {
        result = await saveSnapshot(
          snapshot,
          snapshotRevision,
          advance
        );
      });

    return saveChain.current.then(() => result);
  }

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }

    const validationError = validateTiers(tiers);

    if (validationError) {
      setSaveStatus("idle");
      return;
    }

    const snapshot = tiers.map((tier) => ({ ...tier }));
    const snapshotRevision = revision.current;

    const timer = window.setTimeout(() => {
      void queueSave(snapshot, snapshotRevision, false);
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [tiers]);

  async function continueToCharges(): Promise<void> {
    const validationError = validateTiers(tiers);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setContinuing(true);

    try {
      const snapshot = tiers.map((tier) => ({ ...tier }));

      const data = await queueSave(
        snapshot,
        revision.current,
        true
      );

      if (data.error || !data.redirectTo) {
        setError(data.error ?? "Unable to continue.");
        return;
      }

      router.push(data.redirectTo);
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
    : saveStatus === "error"
      ? "Couldn’t save"
      : "Changes save automatically";

  return (
    <main className="rfl-setup-page">
      <section className="rfl-setup-card">
      {settingsMode ? null : (
  <SetupProgress
    currentStep={4}
    highestReachedStep={highestReachedStep}
  />
)}

<div className="flex items-center justify-between gap-4">
  <p className="rfl-eyebrow">
    {settingsMode
      ? "Settings"
      : "Recurring setup · Step 1 of 4"}
  </p>

  <p
    className={`rfl-save-status ${
      saveStatus === "error"
        ? "rfl-save-status-error"
        : ""
    }`}
    aria-live="polite"
  >
    {saveLabel}
  </p>
</div>

<header className="rfl-setup-header">
  <h1>
    {settingsMode
      ? "Rent Tiers"
      : "Add your rent tiers"}
  </h1>

  <p>
    {settingsMode
      ? "Update your tier names or monthly rent amounts."
      : "Create each monthly price option your customers can select."}
  </p>
</header>

{settingsMode ? (
  <section className="rfl-settings-notice">
    <h2>Your rent tiers are already configured.</h2>

    <p>
      Only make changes here if your tier names or base
      rent amounts have actually changed.
    </p>
  </section>
) : null}

        <div className="space-y-4">
          {tiers.map((tier, index) => (
            <article
              key={tier.clientKey}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Tier {index + 1}
                </h2>

                {tiers.length > 1 ? (
                  <button
                     type="button"
                      className="rfl-delete-button"
                      onClick={() => removeTier(tier.clientKey)}
                      >
                   Delete
                  </button>
                ) : null}
              </div>

              <div className="rfl-setup-grid">
                <div className="rfl-field">
                  <label
                    htmlFor={`tier-name-${tier.clientKey}`}
                  >
                    Tier name
                  </label>

                  <input
                    id={`tier-name-${tier.clientKey}`}
                    type="text"
                    value={tier.name}
                    maxLength={80}
                    placeholder="Tier 1"
                    onChange={(event) =>
                      updateTier(
                        tier.clientKey,
                        "name",
                        event.target.value
                      )
                    }
                  />
                 <p
  className="rfl-field-help rfl-field-help-placeholder"
  aria-hidden="true"
/>
                </div>

                <div className="rfl-field rfl-tier-name-field">
                  <label
                    htmlFor={`tier-amount-${tier.clientKey}`}
                  >
                    Monthly amount
                  </label>

                  <div className="rfl-money-input">
  <span className="rfl-money-prefix" aria-hidden="true">
    $
  </span>

  <input
    id={`tier-amount-${tier.clientKey}`}
    type="text"
    inputMode="decimal"
    value={tier.amount}
    placeholder="950.00"
    onChange={(event) =>
      updateTier(
        tier.clientKey,
        "amount",
        event.target.value
      )
    }
  />
</div>

<p className="rfl-field-help">
  Enter numbers only. No $ needed.
</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <button
          type="button"
          className="mt-5 w-full rounded-xl border border-slate-300 bg-slate-100 px-5 py-3 font-semibold text-slate-800 transition hover:bg-slate-200"
          onClick={addTier}
        >
          + Add Tier
        </button>

        {error ? (
          <p className="rfl-error" role="alert">
            {error}
          </p>
        ) : null}

{settingsMode ? (
  <button
    className="rfl-primary-button"
    type="button"
    onClick={() => {
      router.push("/manager/settings");
    }}
  >
    Done
  </button>
) : (
  <button
    className="rfl-primary-button"
    type="button"
    disabled={continuing}
    onClick={continueToCharges}
  >
    {continuing
      ? "Saving..."
      : "Continue to Recurring Charges"}
  </button>
)}
      </section>
    </main>
  );
}