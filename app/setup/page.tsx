"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, HTMLInputTypeAttribute } from "react";

type BillingFrequency = "MONTHLY";
type LateFeeType = "FLAT" | "PERCENT";

type TierDraft = {
  id: string;
  name: string;
  price: string;
  unitCount: string;
  billingFrequency: BillingFrequency;
  dueDay: string;
  gracePeriodDays: string;
  lateFeeType: LateFeeType;
  lateFeeInitial: string;
  lateFeeDaily: string;
  maxLateFeeDays: string;
};

type FormState = {
  email: string;
  password: string;
  confirmPassword: string;
  propertyName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  businessType: string;
  tiers: TierDraft[];
};

type TouchedState = Record<string, boolean>;

type SetupApiSuccess = {
  ok: true;
  propertyId: string;
  propertyCode: string;
  redirectTo?: string;
};

type SetupApiError = {
  ok: false;
  error?: string;
};

type SetupApiResponse = SetupApiSuccess | SetupApiError | null;

type UnitPreviewItem = {
  tierId: string;
  start: number | null;
  end: number | null;
  count: number;
};

type SelectOption = {
  label: string;
  value: string;
};

const STORAGE_KEY = "rentfray_self_serve_setup_v1";

function createTier(index: number): TierDraft {
  return {
    id: `tier-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Tier ${index + 1}`,
    price: "",
    unitCount: "",
    billingFrequency: "MONTHLY",
    dueDay: "",
    gracePeriodDays: "",
    lateFeeType: "FLAT",
    lateFeeInitial: "",
    lateFeeDaily: "",
    maxLateFeeDays: "",
  };
}

function getInitialState(): FormState {
  return {
    email: "",
    password: "",
    confirmPassword: "",
    propertyName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zip: "",
    businessType: "",
    tiers: [createTier(0)],
  };
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function sanitizeMoney(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildUnitPreview(tiers: TierDraft[]): UnitPreviewItem[] {
  let nextUnit = 101;

  return tiers.map((tier: TierDraft) => {
    const count = Math.max(0, Number(tier.unitCount || 0));
    const start = count > 0 ? nextUnit : null;
    const end = count > 0 ? nextUnit + count - 1 : null;
    nextUnit += count;

    return {
      tierId: tier.id,
      start,
      end,
      count,
    };
  });
}

function ordinalDay(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

function getMaxLateWindow(_billingFrequency: BillingFrequency, dueDay: string): number {
  const due = Number(dueDay || 0);
  if (due < 1 || due > 31) return 31;
  return 31 - due;
}

function formatMoney(value: number, lateFeeType: LateFeeType): string {
  if (lateFeeType === "PERCENT") {
    return `${value.toFixed(2)}%`;
  }

  return `$${value.toFixed(2)}`;
}

function buildLateFeeSummary(tier: TierDraft): string {
  const dueDay = Number(tier.dueDay || 0);
  const gracePeriodDays = Number(tier.gracePeriodDays || 0);
  const lateFeeInitial = Number(tier.lateFeeInitial || 0);
  const lateFeeDaily = Number(tier.lateFeeDaily || 0);
  const maxLateFeeDays = Number(tier.maxLateFeeDays || 0);

  const lateStartDay = dueDay > 0 ? dueDay + gracePeriodDays + 1 : 0;
  const dailyStartDay = lateStartDay > 0 ? lateStartDay + 1 : 0;
  const dailyEndDay =
    dailyStartDay > 0 && maxLateFeeDays > 0
      ? dailyStartDay + maxLateFeeDays - 1
      : 0;

  const dueText = ordinalDay(dueDay);
  const lateStartText = ordinalDay(lateStartDay);
  const dailyStartText = ordinalDay(dailyStartDay);
  const dailyEndText = ordinalDay(dailyEndDay);

  return `Payment due on the ${dueText}. Grace period of ${gracePeriodDays} day${
    gracePeriodDays === 1 ? "" : "s"
  }. Late fee of ${formatMoney(
    lateFeeInitial,
    tier.lateFeeType
  )} added on the ${lateStartText}. Daily late fee of ${formatMoney(
    lateFeeDaily,
    tier.lateFeeType
  )} added per day starting on the ${dailyStartText} and ending on the ${dailyEndText}.`;
}

async function readJsonSafely<T>(res: Response): Promise<T | null> {
  try {
    const data: unknown = await res.json();
    return data as T;
  } catch {
    return null;
  }
}

export default function SetupPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(() => getInitialState());
  const [step, setStep] = useState<number>(1);
  const [touched, setTouched] = useState<TouchedState>({});
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>("Progress auto-saves.");
  const [submitError, setSubmitError] = useState<string>("");
  const [sameForAllLoading, setSameForAllLoading] = useState<boolean>(false);
  const [customBillingTierIds, setCustomBillingTierIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (raw) {
        const parsed: Partial<FormState> & { step?: number } = JSON.parse(
          raw ?? "{}"
        );

        setForm({
          ...getInitialState(),
          ...parsed,
          tiers:
            parsed.tiers && parsed.tiers.length
              ? parsed.tiers.map((tier: TierDraft, index: number) => ({
                  ...createTier(index),
                  ...tier,
                  name: tier.name || `Tier ${index + 1}`,
                  billingFrequency: "MONTHLY",
                }))
              : [createTier(0)],
        });

        if (parsed.step && parsed.step >= 1 && parsed.step <= 4) {
          setStep(parsed.step);
        }
      }
    } catch {
      // ignore bad local state
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...form,
          step,
        })
      );

      setSaveMessage("Saved");

      const timeout = window.setTimeout(() => {
        setSaveMessage("Progress auto-saves.");
      }, 1200);

      return () => window.clearTimeout(timeout);
    } catch {
      setSaveMessage("Could not save locally");
      return undefined;
    }
  }, [form, step, hydrated]);

  const unitPreview = useMemo<UnitPreviewItem[]>(
    () => buildUnitPreview(form.tiers),
    [form.tiers]
  );

  const step1Errors = {
    email: touched.email && !isEmail(form.email) ? "Enter a valid email." : "",
    password:
      touched.password && form.password.length < 8
        ? "Password must be at least 8 characters."
        : "",
    confirmPassword:
      touched.confirmPassword && form.password !== form.confirmPassword
        ? "Passwords do not match."
        : "",
  };

  const step2Errors = {
    propertyName:
      touched.propertyName && !form.propertyName.trim()
        ? "Property name is required."
        : "",
    addressLine1:
      touched.addressLine1 && !form.addressLine1.trim()
        ? "Address is required."
        : "",
    city: touched.city && !form.city.trim() ? "City is required." : "",
    state:
      touched.state && form.state.trim().length < 2 ? "State is required." : "",
    zip:
      touched.zip && onlyDigits(form.zip).length < 5 ? "ZIP is required." : "",
    businessType:
      touched.businessType && !form.businessType.trim()
        ? "Business type is required."
        : "",
  };

  function getTierErrors(tier: TierDraft) {
    return {
      price:
        touched[`price-${tier.id}`] &&
        (!(Number(tier.price) > 0) || !tier.price.trim())
          ? "Enter a valid price."
          : "",
      unitCount:
        touched[`unitCount-${tier.id}`] &&
        (!(Number(tier.unitCount) > 0) || !tier.unitCount.trim())
          ? "Enter unit count."
          : "",
      dueDay:
        touched[`dueDay-${tier.id}`] &&
        !(Number(tier.dueDay) >= 1 && Number(tier.dueDay) <= 31)
          ? "Use 1 to 31."
          : "",
      gracePeriodDays:
        touched[`grace-${tier.id}`] && !(Number(tier.gracePeriodDays) >= 0)
          ? "Enter grace period."
          : "",
      lateFeeInitial:
        touched[`lateInitial-${tier.id}`] && !(Number(tier.lateFeeInitial) >= 0)
          ? "Enter initial late fee."
          : "",
      lateFeeDaily:
        touched[`lateDaily-${tier.id}`] && !(Number(tier.lateFeeDaily) >= 0)
          ? "Enter daily late fee."
          : "",
      maxLateFeeDays:
        touched[`lateMax-${tier.id}`] &&
        Number(tier.gracePeriodDays) + Number(tier.maxLateFeeDays) >
          getMaxLateWindow(tier.billingFrequency, tier.dueDay)
          ? `Grace period + max late fee days cannot exceed ${getMaxLateWindow(
              tier.billingFrequency,
              tier.dueDay
            )}.`
          : "",
    };
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev: FormState) => ({ ...prev, [key]: value }));
  }

  function setTierField(id: string, key: keyof TierDraft, value: string) {
    setForm((prev: FormState) => ({
      ...prev,
      tiers: prev.tiers.map((tier: TierDraft) =>
        tier.id === id ? { ...tier, [key]: value } : tier
      ),
    }));
  }

  function addTier() {
    setForm((prev: FormState) => ({
      ...prev,
      tiers: [...prev.tiers, createTier(prev.tiers.length)],
    }));
  }

  function removeTier(id: string) {
    setForm((prev: FormState) => {
      const next = prev.tiers.filter((tier: TierDraft) => tier.id !== id);

      return {
        ...prev,
        tiers: next.length
          ? next.map((tier: TierDraft, index: number) => ({
              ...tier,
              name: `Tier ${index + 1}`,
              billingFrequency: "MONTHLY",
            }))
          : [createTier(0)],
      };
    });
  }

  function copyBillingFromFirstTier() {
    if (!form.tiers.length) return;

    setSameForAllLoading(true);

    const first = form.tiers[0];

    setForm((prev: FormState) => ({
      ...prev,
      tiers: prev.tiers.map((tier: TierDraft, index: number) =>
        index === 0
          ? tier
          : {
              ...tier,
              billingFrequency: "MONTHLY",
              dueDay: first.dueDay,
              gracePeriodDays: first.gracePeriodDays,
              lateFeeType: first.lateFeeType,
              lateFeeInitial: first.lateFeeInitial,
              lateFeeDaily: first.lateFeeDaily,
              maxLateFeeDays: first.maxLateFeeDays,
            }
      ),
    }));

    setCustomBillingTierIds([]);

      window.setTimeout(() => {
      setSameForAllLoading(false);
    }, 250);
  }

  function validateStep1(): boolean {
    const nextTouched: TouchedState = {
      ...touched,
      email: true,
      password: true,
      confirmPassword: true,
    };

    setTouched(nextTouched);

    return (
      isEmail(form.email) &&
      form.password.length >= 8 &&
      form.password === form.confirmPassword
    );
  }

  function validateStep2(): boolean {
    const nextTouched: TouchedState = {
      ...touched,
      propertyName: true,
      addressLine1: true,
      city: true,
      state: true,
      zip: true,
      businessType: true,
    };

    setTouched(nextTouched);

    return Boolean(
      form.propertyName.trim() &&
        form.addressLine1.trim() &&
        form.city.trim() &&
        form.state.trim().length >= 2 &&
        onlyDigits(form.zip).length >= 5 &&
        form.businessType.trim()
    );
  }

  function validateStep3(): boolean {
    const nextTouched: TouchedState = { ...touched };

    form.tiers.forEach((tier: TierDraft) => {
      nextTouched[`price-${tier.id}`] = true;
      nextTouched[`unitCount-${tier.id}`] = true;
    });

    setTouched(nextTouched);

    return form.tiers.every(
      (tier: TierDraft) => Number(tier.price) > 0 && Number(tier.unitCount) > 0
    );
  }

  function validateStep4(): boolean {
  const nextTouched: TouchedState = { ...touched };
  const firstTier = form.tiers[0];

  form.tiers.forEach((tier: TierDraft, index: number) => {
    const billingTier =
      index === 0 || customBillingTierIds.includes(tier.id)
        ? tier
        : firstTier ?? tier;

    nextTouched[`dueDay-${billingTier.id}`] = true;
    nextTouched[`grace-${billingTier.id}`] = true;
    nextTouched[`lateInitial-${billingTier.id}`] = true;
    nextTouched[`lateDaily-${billingTier.id}`] = true;
    nextTouched[`lateMax-${billingTier.id}`] = true;
  });

  setTouched(nextTouched);

  return form.tiers.every((tier: TierDraft, index: number) => {
    const billingTier =
      index === 0 || customBillingTierIds.includes(tier.id)
        ? tier
        : firstTier ?? tier;

    const monthlyDueValid =
      Number(billingTier.dueDay) >= 1 && Number(billingTier.dueDay) <= 31;

    const withinLateWindow =
      Number(billingTier.gracePeriodDays) + Number(billingTier.maxLateFeeDays) <=
      getMaxLateWindow(billingTier.billingFrequency, billingTier.dueDay);

    return (
      monthlyDueValid &&
      Number(billingTier.gracePeriodDays) >= 0 &&
      Number(billingTier.lateFeeInitial) >= 0 &&
      Number(billingTier.lateFeeDaily) >= 0 &&
      Number(billingTier.maxLateFeeDays) >= 0 &&
      withinLateWindow
    );
  });
}

  function nextStep() {
    setSubmitError("");

    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;

    setStep((prev: number) => Math.min(4, prev + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function prevStep() {
    setSubmitError("");
    setStep((prev: number) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    setSubmitError("");

    if (!validateStep4()) return;

    const payload = {
      account: {
        email: form.email.trim(),
        password: form.password,
      },
      property: {
        name: form.propertyName.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: onlyDigits(form.zip),
        businessType: form.businessType.trim(),
      },

      tiers: form.tiers.map((tier: TierDraft, index: number) => {
  const firstTier = form.tiers[0];
  const billingTier =
    index === 0 || customBillingTierIds.includes(tier.id)
      ? tier
      : firstTier ?? tier;

  return {
    name: `Tier ${index + 1}`,
    price: Number(tier.price),
    unitCount: Number(tier.unitCount),
    billingFrequency: "MONTHLY" as const,
    dueDay: Number(billingTier.dueDay || 1),
    gracePeriodDays: Number(billingTier.gracePeriodDays || 0),
    lateFeeType: billingTier.lateFeeType,
    lateFeeInitial: Number(billingTier.lateFeeInitial || 0),
    lateFeeDaily: Number(billingTier.lateFeeDaily || 0),
    maxLateFeeDays: Number(billingTier.maxLateFeeDays || 0),
  };
}),
    };

    setSaving(true);

    try {
      const setupRes = await fetch("/api/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const setupResult = await readJsonSafely<SetupApiResponse>(setupRes);

      if (!setupRes.ok || !setupResult || !setupResult.ok) {
        setSubmitError(
          setupResult && "error" in setupResult && setupResult.error
            ? setupResult.error
            : "Could not complete setup."
        );
        return;
      }

      localStorage.removeItem(STORAGE_KEY);

     const propertyCode =
  "propertyCode" in setupResult ? setupResult.propertyCode : "";

router.push(`/setup/next-steps?code=${propertyCode}`);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) {
    return (
      <main className="min-h-screen bg-[#dfe7ee] px-4 py-8 text-[#0f172a]">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[28px] border border-[#cbd5e1] bg-white p-6 shadow-sm">
            Loading setup...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#dfe7ee] px-4 py-6 text-[#0f172a] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.2em] text-[#0f172a]/70">
              RENTFRAY
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Setup your account in 4 easy steps
            </h1>
            <p className="mt-2 text-sm text-[#475569] sm:text-base">
              No banking required right now.
            </p>
          </div>

          <div className="hidden rounded-2xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm font-medium text-[#334155] sm:block">
            {saveMessage}
          </div>
        </div>

        <div className="mb-6 rounded-[28px] border border-[#334155] bg-[#233143] p-4 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:p-5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
            <span>Step {step} of 4</span>
            <span>{Math.round((step / 4) * 100)}%</span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-white transition-all duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["Account", "Property", "Tiers", "Billing"].map(
              (label: string, index: number) => {
                const active = step === index + 1;
                const done = step > index + 1;

                return (
                  <div
                    key={label}
                    className={`rounded-2xl px-3 py-3 text-center text-sm font-semibold transition ${
                      active
                        ? "bg-white text-[#0f172a]"
                        : done
                          ? "bg-white/20 text-white"
                          : "bg-white/10 text-white/75"
                    }`}
                  >
                    {label}
                  </div>
                );
              }
            )}
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#334155] sm:hidden">
          {saveMessage}
        </div>

        <section className="rounded-[28px] border border-[#cbd5e1] bg-white p-5 shadow-sm sm:p-7">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Create your account
                </h2>
                <p className="mt-1 text-sm text-[#64748b]">
                  Simple email and password.
                </p>
              </div>

              <div className="grid gap-4">
                <Field
                  label="Email"
                  value={form.email}
                  error={step1Errors.email}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  onChange={(value) => setField("email", value)}
                  placeholder="name@example.com"
                  type="email"
                />

                <Field
                  label="Password"
                  value={form.password}
                  error={step1Errors.password}
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, password: true }))
                  }
                  onChange={(value) => setField("password", value)}
                  placeholder="At least 8 characters"
                  type="password"
                />

                <Field
                  label="Confirm Password"
                  value={form.confirmPassword}
                  error={step1Errors.confirmPassword}
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, confirmPassword: true }))
                  }
                  onChange={(value) => setField("confirmPassword", value)}
                  placeholder="Re-enter password"
                  type="password"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Property info
                </h2>
                <p className="mt-1 text-sm text-[#64748b]">
                  Name, address, and property type.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field
                    label="Property name"
                    value={form.propertyName}
                    error={step2Errors.propertyName}
                    onBlur={() =>
                      setTouched((prev) => ({ ...prev, propertyName: true }))
                    }
                    onChange={(value) => setField("propertyName", value)}
                    placeholder="Oak Grove Apartments"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Field
                    label="Address"
                    value={form.addressLine1}
                    error={step2Errors.addressLine1}
                    onBlur={() =>
                      setTouched((prev) => ({ ...prev, addressLine1: true }))
                    }
                    onChange={(value) => setField("addressLine1", value)}
                    placeholder="123 Main St"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Field
                    label="Address line 2"
                    value={form.addressLine2}
                    error=""
                    onBlur={() => {}}
                    onChange={(value) => setField("addressLine2", value)}
                    placeholder="Optional"
                  />
                </div>

                <Field
                  label="City"
                  value={form.city}
                  error={step2Errors.city}
                  onBlur={() => setTouched((prev) => ({ ...prev, city: true }))}
                  onChange={(value) => setField("city", value)}
                  placeholder="Houston"
                />

                <Field
                  label="State"
                  value={form.state}
                  error={step2Errors.state}
                  onBlur={() => setTouched((prev) => ({ ...prev, state: true }))}
                  onChange={(value) => setField("state", value.toUpperCase())}
                  placeholder="TX"
                  maxLength={2}
                />

                <Field
                  label="ZIP"
                  value={form.zip}
                  error={step2Errors.zip}
                  onBlur={() => setTouched((prev) => ({ ...prev, zip: true }))}
                  onChange={(value) =>
                    setField("zip", onlyDigits(value).slice(0, 5))
                  }
                  placeholder="77001"
                  inputMode="numeric"
                />

                <SelectField
                  label="Property type"
                  value={form.businessType}
                  error={step2Errors.businessType}
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, businessType: true }))
                  }
                  onChange={(value) => setField("businessType", value)}
                  options={[
                    { label: "Select one", value: "" },
                    { label: "Apartment", value: "Apartment" },
                    { label: "Mobile Home Park", value: "Mobile Home Park" },
                    { label: "RV Park", value: "RV Park" },
                    { label: "Storage Units", value: "Storage Units" },
                    { label: "BHPH Car Lot", value: "BHPH Car Lot" },
                    { label: "Other", value: "Other" },
                  ]}
                />
              </div>
            </div>
          )}

                    {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Tier setup
                  </h2>
                  <p className="mt-1 text-sm text-[#64748b]">
                    Set the monthly price and unit count for each tier.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {form.tiers.map((tier: TierDraft, index: number) => {
                  const preview = unitPreview.find(
                    (item: UnitPreviewItem) => item.tierId === tier.id
                  );
                  const errors = getTierErrors(tier);

                  return (
                    <div
                      key={tier.id}
                      className="rounded-[24px] border border-[#dbe4ec] bg-[#f8fafc] p-4 sm:p-5"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-[#0f172a]">
                            Tier {index + 1}
                          </div>
                          <div className="text-sm text-[#64748b]">
                            {preview?.count
                              ? `${preview.count} units planned`
                              : "Enter unit count to preview this tier"}
                          </div>
                        </div>

                        {form.tiers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTier(tier.id)}
                            className="rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm font-semibold text-[#0f172a]"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label="Monthly price"
                          value={tier.price}
                          error={errors.price}
                          onBlur={() =>
                            setTouched((prev) => ({
                              ...prev,
                              [`price-${tier.id}`]: true,
                            }))
                          }
                          onChange={(value) =>
                            setTierField(tier.id, "price", sanitizeMoney(value))
                          }
                          placeholder="950.00"
                          inputMode="decimal"
                        />

                        <Field
                          label="Unit count"
                          value={tier.unitCount}
                          error={errors.unitCount}
                          onBlur={() =>
                            setTouched((prev) => ({
                              ...prev,
                              [`unitCount-${tier.id}`]: true,
                            }))
                          }
                          onChange={(value) =>
                            setTierField(
                              tier.id,
                              "unitCount",
                              onlyDigits(value).slice(0, 4)
                            )
                          }
                          placeholder="24"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addTier}
                className="w-full rounded-2xl bg-[#cbd5e1] px-5 py-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#b8c5d6]"
              >
                + Add Another Tier
              </button>
            </div>
          )}

          {step === 4 && (
  <div className="space-y-5">
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">
        Billing rules
      </h2>
      <p className="mt-1 text-sm text-[#64748b]">
        Set the default billing rules. Most properties use the same billing rules for every tier.
      </p>
    </div>

    <div className="space-y-4">
      {form.tiers.map((tier: TierDraft, index: number) => {
        const isDefaultTier = index === 0;
        const isCustom = customBillingTierIds.includes(tier.id);

        if (!isDefaultTier && !isCustom) return null;

        const errors = getTierErrors(tier);

        return (
          <div
            key={tier.id}
            className="rounded-[24px] border border-[#dbe4ec] bg-[#f8fafc] p-4 sm:p-5"
          >
            <div className="mb-4">
              <div className="text-lg font-semibold text-[#0f172a]">
                {isDefaultTier ? "Default billing rules" : `Tier ${index + 1} custom rules`}
              </div>
              <div className="text-sm text-[#64748b]">
                ${Number(tier.price || 0).toFixed(2)} · {tier.unitCount || 0} units
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Billing frequency" value="Monthly" error="" onBlur={() => {}} onChange={() => {}} />

              <Field
                label="Due day"
                value={tier.dueDay}
                error={errors.dueDay}
                onBlur={() => setTouched((prev) => ({ ...prev, [`dueDay-${tier.id}`]: true }))}
                onChange={(value) => setTierField(tier.id, "dueDay", onlyDigits(value).slice(0, 2))}
                placeholder="1 to 31"
                inputMode="numeric"
              />

              <Field
                label="Grace period days"
                value={tier.gracePeriodDays}
                error={errors.gracePeriodDays}
                onBlur={() => setTouched((prev) => ({ ...prev, [`grace-${tier.id}`]: true }))}
                onChange={(value) => setTierField(tier.id, "gracePeriodDays", onlyDigits(value).slice(0, 3))}
                placeholder="5"
                inputMode="numeric"
              />

              <SelectField
                label="Late fee type"
                value={tier.lateFeeType}
                error=""
                onBlur={() => {}}
                onChange={(value) => setTierField(tier.id, "lateFeeType", value as LateFeeType)}
                options={[
                  { label: "Flat amount", value: "FLAT" },
                  { label: "Percent", value: "PERCENT" },
                ]}
              />

              <Field
                label={tier.lateFeeType === "PERCENT" ? "Initial late fee percent" : "Initial late fee amount"}
                value={tier.lateFeeInitial}
                error={errors.lateFeeInitial}
                onBlur={() => setTouched((prev) => ({ ...prev, [`lateInitial-${tier.id}`]: true }))}
                onChange={(value) => setTierField(tier.id, "lateFeeInitial", sanitizeMoney(value))}
                placeholder={tier.lateFeeType === "PERCENT" ? "5.00" : "50.00"}
                inputMode="decimal"
              />

              <Field
                label={tier.lateFeeType === "PERCENT" ? "Daily late fee percent" : "Daily late fee amount"}
                value={tier.lateFeeDaily}
                error={errors.lateFeeDaily}
                onBlur={() => setTouched((prev) => ({ ...prev, [`lateDaily-${tier.id}`]: true }))}
                onChange={(value) => setTierField(tier.id, "lateFeeDaily", sanitizeMoney(value))}
                placeholder={tier.lateFeeType === "PERCENT" ? "1.00" : "10.00"}
                inputMode="decimal"
              />

              <Field
                label="Max late fee days"
                value={tier.maxLateFeeDays}
                error={errors.maxLateFeeDays}
                onBlur={() => setTouched((prev) => ({ ...prev, [`lateMax-${tier.id}`]: true }))}
                onChange={(value) => setTierField(tier.id, "maxLateFeeDays", onlyDigits(value).slice(0, 3))}
                placeholder="30"
                inputMode="numeric"
              />
            </div>

            <div className="mt-4 rounded-[24px] border border-[#334155] bg-[#233143] px-5 py-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.25)]">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                Billing Summary
              </div>
              <p className="text-base font-medium leading-7 text-white sm:text-lg">
                {buildLateFeeSummary(tier)}
              </p>
            </div>

            {!isDefaultTier && (
              <button
                type="button"
                onClick={() =>
                  setCustomBillingTierIds((prev) =>
                    prev.filter((id) => id !== tier.id)
                  )
                }
                className="mt-4 w-full rounded-2xl border border-[#cbd5e1] bg-white px-5 py-4 text-sm font-semibold text-[#0f172a]"
              >
                Remove custom rules for Tier {index + 1}
              </button>
            )}
          </div>
        );
      })}
    </div>

    <button
      type="button"
      onClick={copyBillingFromFirstTier}
      disabled={form.tiers.length < 2 || sameForAllLoading}
      className="w-full rounded-2xl bg-[#cbd5e1] px-5 py-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#b8c5d6] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {sameForAllLoading ? "Applying..." : "Apply these rules to all tiers"}
    </button>

    {form.tiers.length > 1 && (
      <div className="rounded-[24px] border border-[#dbe4ec] bg-white p-4">
        <div className="text-sm font-semibold text-[#0f172a]">
          Need different billing rules?
        </div>
        <div className="mt-3 grid gap-3">
          {form.tiers.slice(1).map((tier: TierDraft, index: number) => {
            const realIndex = index + 1;
            const alreadyCustom = customBillingTierIds.includes(tier.id);

            if (alreadyCustom) return null;

            return (
              <button
                key={tier.id}
                type="button"
                onClick={() =>
                  setCustomBillingTierIds((prev) =>
                    prev.includes(tier.id) ? prev : [...prev, tier.id]
                  )
                }
                className="w-full rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] px-5 py-4 text-left text-sm font-semibold text-[#0f172a] transition hover:bg-[#edf2f7]"
              >
                Customize Tier {realIndex + 1}
              </button>
            );
          })}
        </div>
      </div>
    )}
  </div>
)}

          {submitError ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={prevStep}
              disabled={step === 1 || saving}
              className="rounded-2xl border border-[#cbd5e1] bg-white px-5 py-4 text-sm font-semibold text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={nextStep}
                className="rounded-2xl bg-[#0f172a] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-2xl bg-[#0f172a] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Finishing setup..." : "Create property"}
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

type FieldProps = {
  label: string;
  value: string;
  error: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  placeholder?: string;
  type?: HTMLInputTypeAttribute;
  inputMode?:
    | "text"
    | "search"
    | "email"
    | "tel"
    | "url"
    | "none"
    | "numeric"
    | "decimal";
  maxLength?: number;
};

function Field({
  label,
  value,
  error,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  inputMode,
  maxLength,
}: FieldProps) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-[#334155]">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        className={`w-full rounded-2xl border bg-white px-4 py-4 text-base text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] ${
          error
            ? "border-red-300 ring-2 ring-red-100"
            : "border-[#cbd5e1] focus:border-[#0f172a]"
        }`}
      />
      {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  error: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  options: SelectOption[];
};

function SelectField({
  label,
  value,
  error,
  onChange,
  onBlur,
  options,
}: SelectFieldProps) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-[#334155]">{label}</div>
      <select
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`w-full rounded-2xl border bg-white px-4 py-4 text-base text-[#0f172a] outline-none transition ${
          error
            ? "border-red-300 ring-2 ring-red-100"
            : "border-[#cbd5e1] focus:border-[#0f172a]"
        }`}
      >
        {options.map((option: SelectOption) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
    </label>
  );
}