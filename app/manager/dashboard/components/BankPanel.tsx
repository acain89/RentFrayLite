"use client";

type Props = {
  bankStatus?: "NOT_CONNECTED" | "PENDING" | "CONNECTED" | "RESTRICTED";
  bankMessage?: string;
  isOwner: boolean;
  onConnect: () => void;
  onOnboard: () => void;
  billingCycleStartDate: string;
  setBillingCycleStartDate: (value: string) => void;
  billingCycleStartDateLocked: boolean;
  saveBillingCycleStartDate: () => void;
  savingBillingCycleStartDate: boolean;
};

function getStatusUI(status?: Props["bankStatus"]) {
  switch (status) {
    case "CONNECTED":
      return {
        title: "Payments active",
        description:
          "Your account is ready to receive payments. Payouts will be deposited to your connected bank account.",
        color: "text-emerald-600",
      };
    case "PENDING":
      return {
        title: "Setup in progress",
        description:
          "Your account setup is not complete yet. Finish onboarding to enable payouts.",
        color: "text-amber-600",
      };
    case "RESTRICTED":
      return {
        title: "Action required",
        description:
          "Stripe requires additional information before payouts can continue.",
        color: "text-red-600",
      };
    case "NOT_CONNECTED":
    default:
      return {
        title: "No payout account",
        description:
            "Set up secure Stripe payouts so this property can receive tenant payments.",
        color: "text-slate-600",
      };
  }
}

export default function BankPanel({
  bankStatus,
  bankMessage,
  isOwner,
  onConnect,
  onOnboard,
  billingCycleStartDate,
  setBillingCycleStartDate,
  billingCycleStartDateLocked,
  saveBillingCycleStartDate,
  savingBillingCycleStartDate,
}: Props) {
  const ui = getStatusUI(bankStatus);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-950">
          Billing Cycle Start Date
        </div>

        <div className="mt-2 text-sm text-slate-600">
          Select the date RentFray should begin recording tenant billing cycles
          for this property.
        </div>

        <div className="mt-2 text-xs text-slate-500">
          Charges before this date will not appear in tenant balances unless you
          add them manually.
        </div>

                {billingCycleStartDateLocked ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-sm font-semibold text-emerald-800">
              Locked: {billingCycleStartDate}
            </div>
            <div className="mt-1 text-xs leading-5 text-emerald-700">
              This billing cycle start date is permanent and cannot be changed.
            </div>
          </div>
        ) : (
          <input
            type="date"
            value={billingCycleStartDate}
            onChange={(e) => setBillingCycleStartDate(e.target.value)}
            disabled={!isOwner}
            className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
          />
        )}

        {isOwner && !billingCycleStartDateLocked ? (
  <button
    type="button"
    onClick={saveBillingCycleStartDate}
    disabled={
      savingBillingCycleStartDate ||
      !billingCycleStartDate
    }
    className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
  >
    {savingBillingCycleStartDate ? "Saving..." : "Confirm"}
  </button>
) : !isOwner ? (
  <div className="mt-4 text-sm text-slate-500">
    Only the account owner can manage billing cycle settings.
  </div>
) : (
  <div className="mt-4 text-xs font-medium text-emerald-700">
    Billing cycle start date has been permanently locked.
  </div>
)}
  </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className={`text-lg font-semibold ${ui.color}`}>{ui.title}</div>

        <div className="mt-1 text-sm text-slate-600">
          {bankMessage || ui.description}
        </div>
      </div>

      {isOwner ? (
        <div className="flex flex-wrap gap-3">
          {bankStatus === "NOT_CONNECTED" && (
            <button
              type="button"
              onClick={onConnect}
              className="rf-btn rf-btn-primary px-4 text-sm"
            >
              Connect securely through Stripe
            </button>
          )}

          {(bankStatus === "CONNECTED" ||
            bankStatus === "PENDING" ||
            bankStatus === "RESTRICTED") && (
            <button
              type="button"
              onClick={onOnboard}
              className="rf-btn rf-btn-primary px-4 text-sm"
            >
              {bankStatus === "CONNECTED"
              ? "Manage secure Stripe connection"
              : "Continue secure Stripe setup"}
            </button>
          )}
        </div>
      ) : (
        <div className="text-sm text-slate-500">
          Only the account owner can manage payout settings.
        </div>
      )}
    </div>
  );
}