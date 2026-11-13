"use client";
import { MAX_DAILY_LATE_FEE_DAYS, DAILY_LATE_FEE_DAYS_ERROR, parseDailyLateFeeDays } from "@/lib/recurringValidation";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import SetupProgress from "@/components/setup/SetupProgress";

type RuleDraft = {
  recurringPlanId: string;
  tierName: string;
  dueDay: string;
  gracePeriodDays: string;
  initialLateFee: string;
  dailyLateFee: string;
  dailyLateFeeMaxDays: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type SaveResponse = {
  version?: string;
  saved?: boolean;
  redirectTo?: string;
  error?: string;
};

type Props = {
  initialVersion?: string;
  initialRules: RuleDraft[];
  highestReachedStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

type EditableField =
  | "gracePeriodDays"
  | "initialLateFee"
  | "dailyLateFee"
  | "dailyLateFeeMaxDays";

function moneyToCents(value: string): number | null {
  const normalized = value.trim() || "0";

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function integerValue(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

function rulesAreIdentical(rules: RuleDraft[]): boolean {
  if (rules.length < 2) {
    return true;
  }

  const first = rules[0];

  return rules.every(
    (rule) =>
      rule.dueDay === first.dueDay &&
      rule.gracePeriodDays === first.gracePeriodDays &&
      rule.initialLateFee === first.initialLateFee &&
      rule.dailyLateFee === first.dailyLateFee &&
      rule.dailyLateFeeMaxDays === first.dailyLateFeeMaxDays,
  );
}

function validateRules(rules: RuleDraft[]): string | null {
  for (const rule of rules) {
    const graceDays = integerValue(rule.gracePeriodDays);
    const initialFee = moneyToCents(rule.initialLateFee);
    const dailyFee = moneyToCents(rule.dailyLateFee);
    const maximumDays = parseDailyLateFeeDays(rule.dailyLateFeeMaxDays);

    if (graceDays !== 3 && graceDays !== 4 && graceDays !== 5) {
      return `Choose a grace period of 3, 4, or 5 days for ${rule.tierName}.`;
    }

    if (initialFee === null) {
      return `Enter a valid initial late fee for ${rule.tierName}.`;
    }

    if (dailyFee === null) {
      return `Enter a valid daily late fee for ${rule.tierName}.`;
    }

    if (maximumDays === null) {
      return DAILY_LATE_FEE_DAYS_ERROR;
    }

    if (dailyFee > 0 && maximumDays < 1) {
      return `Choose how many days the daily late fee may apply for ${rule.tierName}.`;
    }

    if (dailyFee === 0 && maximumDays !== 0) {
      return `Set the daily late-fee limit to 0 when no daily fee is used for ${rule.tierName}.`;
    }
  }

  return null;
}

export default function RecurringBillingClient({
  initialVersion,
  initialRules,
  highestReachedStep,
}: Props) {
  const router = useRouter();
  const serverVersion = useRef(initialVersion);
  const searchParams = useSearchParams();

  const settingsMode =
    searchParams.get("mode") === "settings";

  const [rules, setRules] =
    useState<RuleDraft[]>(() => initialRules.map(rule => ({
      ...rule,
      initialLateFee: Number(rule.initialLateFee) === 0 ? "" : rule.initialLateFee,
      dailyLateFee: Number(rule.dailyLateFee) === 0 ? "" : rule.dailyLateFee,
    })));

  const [sameRulesForAll, setSameRulesForAll] =
    useState(rulesAreIdentical(initialRules));

  const individualRules = useRef<RuleDraft[] | null>(null);
  const needsCalendarConfirmation = initialRules.some(rule =>
    rule.dueDay !== "1" || !["3", "4", "5"].includes(rule.gracePeriodDays));
  const [confirmCalendarChange, setConfirmCalendarChange] = useState(false);

  const [saveStatus, setSaveStatus] =
    useState<SaveStatus>("idle");

  const [error, setError] = useState("");
  const [continuing, setContinuing] = useState(false);

  const initialRender = useRef(true);
  const revision = useRef(0);
  const saveChain = useRef<Promise<void>>(
    Promise.resolve(),
  );

  function updateRule(
    recurringPlanId: string,
    field: EditableField,
    value: string,
  ): void {
    revision.current += 1;

    setRules((current) =>
      current.map((rule) => {
        const shouldUpdate =
          sameRulesForAll ||
          rule.recurringPlanId === recurringPlanId;

        return shouldUpdate
          ? {
              ...rule,
              [field]: value,
            }
          : rule;
      }),
    );

    setError("");
  }

  function toggleSameRules(checked: boolean): void {
    revision.current += 1;
    setSameRulesForAll(checked);

    if (checked) {
      setRules((current) => {
        individualRules.current = current.map(rule => ({ ...rule }));
        const first = current[0];

        return current.map((rule) => ({
          ...rule,
          gracePeriodDays: first.gracePeriodDays,
          initialLateFee: first.initialLateFee,
          dailyLateFee: first.dailyLateFee,
          dailyLateFeeMaxDays:
            first.dailyLateFeeMaxDays,
        }));
      });
    } else if (individualRules.current) {
      setRules(individualRules.current);
      individualRules.current = null;
    }

    setError("");
  }

  async function saveSnapshot(
    snapshot: RuleDraft[],
    snapshotRevision: number,
    shared: boolean,
    advance: boolean,
  ): Promise<SaveResponse> {
    if (needsCalendarConfirmation && !confirmCalendarChange) {
      const message = "Confirm the billing calendar change before saving. Existing settings have not been changed.";
      if (advance) setError(message);
      return { error: message };
    }
    const validationError = validateRules(snapshot);

    if (validationError) {
      if (advance) {
        setError(validationError);
      }

      return {
        error: validationError,
      };
    }

    setSaveStatus("saving");

    const response = await fetch(
      "/api/setup/recurring/billing",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: serverVersion.current,
          sameRulesForAll: shared,
          confirmCalendarChange,
          rules: snapshot.map((rule) => ({
            recurringPlanId: rule.recurringPlanId,
            dueDay: 1,
            gracePeriodDays: integerValue(
              rule.gracePeriodDays,
            ),
            initialLateFeeCents: moneyToCents(
              rule.initialLateFee,
            ),
            dailyLateFeeCents: moneyToCents(
              rule.dailyLateFee,
            ),
            dailyLateFeeMaxDays: integerValue(
              rule.dailyLateFeeMaxDays,
            ),
          })),
          advance,
        }),
      },
    );

    const data = (await response.json()) as SaveResponse;

    if (!response.ok || !data.saved) {
      setSaveStatus("error");

      const message =
        data.error ?? "Unable to save the billing rules.";

      if (advance) {
        setError(message);
      }

      return {
        error: message,
      };
    }

    if (data.version) serverVersion.current = data.version;
    if (snapshotRevision === revision.current) {
      setSaveStatus("saved");
    }

    return data;
  }

  function queueSave(
    snapshot: RuleDraft[],
    snapshotRevision: number,
    shared: boolean,
    advance: boolean,
  ): Promise<SaveResponse> {
    let result: SaveResponse = {};

    saveChain.current = saveChain.current
      .catch(() => undefined)
      .then(async () => {
        result = await saveSnapshot(
          snapshot,
          snapshotRevision,
          shared,
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

    // Conversion of legacy rules always requires an explicit Continue/Done save;
    // viewing the page, editing a fee, or checking consent must not autosave it.
    if (needsCalendarConfirmation) return;

    const validationError = validateRules(rules);

    if (validationError) {
      setSaveStatus("idle");
      return;
    }

    const snapshot = rules.map((rule) => ({
      ...rule,
    }));

    const snapshotRevision = revision.current;

    const timer = window.setTimeout(() => {
      void queueSave(
        snapshot,
        snapshotRevision,
        sameRulesForAll,
        false,
      );
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };

    // queueSave intentionally uses the latest render closure; autosave is serialized by saveChain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, sameRulesForAll]);

  async function continueToReview(): Promise<void> {
    const validationError = validateRules(rules);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setContinuing(true);

    try {
      const result = await queueSave(
        rules.map((rule) => ({
          ...rule,
        })),
        revision.current,
        sameRulesForAll,
        true,
      );

      if (result.error || !result.redirectTo) {
        setError(
          result.error ?? "Unable to continue.",
        );
        return;
      }

      router.push(result.redirectTo);
      router.refresh();
    } catch {
      setSaveStatus("error");
      setError(
        "Unable to connect. Please try again.",
      );
    } finally {
      setContinuing(false);
    }
  }

  async function finishSettings(): Promise<void> {
    const validationError = validateRules(rules);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setContinuing(true);

    try {
      const result = await queueSave(
        rules.map((rule) => ({
          ...rule,
        })),
        revision.current,
        sameRulesForAll,
        false,
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      router.push("/manager/settings");
      router.refresh();
    } catch {
      setSaveStatus("error");
      setError(
        "Unable to connect. Please try again.",
      );
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
          : needsCalendarConfirmation
            ? "Changes save when you select Continue or Done"
            : "Changes save automatically";

  const displayedRules = sameRulesForAll
    ? rules.slice(0, 1)
    : rules;

  return (
    <main className="rfl-setup-page">
      <section className="rfl-setup-card rfl-billing-rules-card">
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
              : "Step 4 of 7"}
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
          <h1>Billing Rules</h1>

          <p>
            Payments are due on the 1st of every month. Choose your grace period and late fees.
          </p>
        </header>

        {settingsMode ? (
          <section className="rfl-settings-notice">
            <h2>
              Your billing rules are already configured.
            </h2>

            <p>
              Only make changes here if your
              grace period or late-fee policy has
              actually changed.
            </p>
          </section>
        ) : null}

        {needsCalendarConfirmation ? (
          <section className="rfl-settings-notice">
            <h2>Review your existing billing calendar</h2>
            {initialRules.map(rule => <p key={rule.recurringPlanId}>{rule.tierName}: due day {rule.dueDay}, grace period {rule.gracePeriodDays} days.</p>)}
            <label className="rfl-checkbox-field">
              <input type="checkbox" checked={confirmCalendarChange} onChange={event => setConfirmCalendarChange(event.target.checked)} />
              <span>I confirm changing rent to the 1st with the selected 3, 4, or 5-day grace period. Changes apply only when I select Continue or Done; historical transactions remain unchanged.</span>
            </label>
          </section>
        ) : null}

        <label className="rfl-checkbox-field rfl-billing-shared-toggle">
          <input
            type="checkbox"
            checked={sameRulesForAll}
            onChange={(event) =>
              toggleSameRules(event.target.checked)
            }
          />

          <span>
            <strong>
              Use the same grace period and late fees for all tiers
            </strong>

            <small>
              Uncheck this only when a tier needs
              different billing or late-fee rules.
            </small>
          </span>
        </label>

        <div className="mt-5 space-y-5">
          {displayedRules.map((rule) => (
            <article
              key={rule.recurringPlanId}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <h2 className="mb-5 mt-0 text-xl font-semibold">
                {sameRulesForAll
                  ? "Billing Rules"
                  : rule.tierName}
              </h2>

              <div className="rfl-setup-grid">
                <div className="rfl-field"><strong>Rent due date</strong><p>1st of every month</p></div>

                <div className="rfl-field">
                  <label
                    htmlFor={`grace-${rule.recurringPlanId}`}
                  >
                    Grace period
                  </label>

                  <select
                    id={`grace-${rule.recurringPlanId}`}
                    value={rule.gracePeriodDays}
                    onChange={(event) =>
                      updateRule(
                        rule.recurringPlanId,
                        "gracePeriodDays",
                        event.target.value,
                      )
                    }
                  >
                    {!["3", "4", "5"].includes(rule.gracePeriodDays) ? <option value={rule.gracePeriodDays} disabled>Existing: {rule.gracePeriodDays} days — choose a new value</option> : null}
                    {[3, 4, 5].map(days => <option key={days} value={String(days)}>{days} days</option>)}
                  </select>

                  <p className="rfl-field-help">
                    {["3", "4", "5"].includes(rule.gracePeriodDays)
                      ? `Includes the 1st. Initial late fee begins on day ${Number(rule.gracePeriodDays) + 1}; daily late fees begin on day ${Number(rule.gracePeriodDays) + 2}, when enabled.`
                      : "Choose 3, 4, or 5 days to see the new late-fee start dates."}
                  </p>
                </div>
              </div>

              <div className="mt-5 rfl-setup-grid">
                <div className="rfl-field">
                  <label
                    htmlFor={`initial-fee-${rule.recurringPlanId}`}
                  >
                    Initial late fee
                  </label>

                  <div className="rfl-money-input">
                    <span
                      className="rfl-money-prefix"
                      aria-hidden="true"
                    >
                      $
                    </span>

                    <input
                      id={`initial-fee-${rule.recurringPlanId}`}
                      type="text"
                      inputMode="decimal"
                      value={rule.initialLateFee}
                      placeholder="0.00"
                      className="placeholder:text-slate-400"
                      onChange={(event) =>
                        updateRule(
                          rule.recurringPlanId,
                          "initialLateFee",
                          event.target.value,
                        )
                      }
                    />
                  </div>

                  <p className="rfl-field-help">
                    Applied once after the grace period
                    ends.
                  </p>
                </div>

                <div className="rfl-field">
                  <label
                    htmlFor={`daily-fee-${rule.recurringPlanId}`}
                  >
                    Daily late fee
                  </label>

                  <div className="rfl-money-input">
                    <span
                      className="rfl-money-prefix"
                      aria-hidden="true"
                    >
                      $
                    </span>

                    <input
                      id={`daily-fee-${rule.recurringPlanId}`}
                      type="text"
                      inputMode="decimal"
                      value={rule.dailyLateFee}
                      placeholder="0.00"
                      className="placeholder:text-slate-400"
                      onChange={(event) =>
                        updateRule(
                          rule.recurringPlanId,
                          "dailyLateFee",
                          event.target.value,
                        )
                      }
                    />
                  </div>

                  <p className="rfl-field-help">
                    Begins the day after the initial late
                    fee.
                  </p>
                </div>
              </div>

              <div className="mt-5 rfl-field">
                <label
                  htmlFor={`daily-days-${rule.recurringPlanId}`}
                >
                  Apply the daily late fee for up to
                </label>

                <div className="rfl-days-input">
                  <input
                    id={`daily-days-${rule.recurringPlanId}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_DAILY_LATE_FEE_DAYS}
                    step={1}
                    aria-invalid={parseDailyLateFeeDays(rule.dailyLateFeeMaxDays) === null}
                    aria-describedby={parseDailyLateFeeDays(rule.dailyLateFeeMaxDays) === null ? `daily-days-error-${rule.recurringPlanId}` : undefined}
                    value={rule.dailyLateFeeMaxDays}
                    onChange={(event) =>
                      updateRule(
                        rule.recurringPlanId,
                        "dailyLateFeeMaxDays",
                        event.target.value,
                      )
                    }
                  />

                  <span>days</span>
                </div>

                {parseDailyLateFeeDays(rule.dailyLateFeeMaxDays) === null ? <p id={`daily-days-error-${rule.recurringPlanId}`} className="rfl-error" role="alert">{DAILY_LATE_FEE_DAYS_ERROR}</p> : null}
                <p className="rfl-field-help">
                  Enter 0 when no daily late fee is used.
                </p>
              </div>
            </article>
          ))}
        </div>

        {error ? (
          <p
            className="rfl-error mt-5"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {settingsMode ? (
          <button
            className="rfl-primary-button mt-6"
            type="button"
            disabled={continuing}
            onClick={finishSettings}
          >
            {continuing ? "Saving..." : "Done"}
          </button>
        ) : (
          <div className="mt-6 grid gap-3">
            <button
              className="rfl-primary-button"
              type="button"
              disabled={continuing}
              onClick={continueToReview}
            >
              {continuing
                ? "Saving..."
                : "Continue to Review"}
            </button>

            <Link
              className="rfl-auth-secondary-link !mt-0"
              href="/setup/recurring/charges"
            >
              Back to Monthly Charges
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
