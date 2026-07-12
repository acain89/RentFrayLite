"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
};

const slides: Slide[] = [
  {
    id: "panel1",
    eyebrow: "Start the system",
    title: "Create the account, connect payouts, and hand tenants the sheet.",
    subtitle:
      "The setup is short, self-serve, and built for first-time users. Once tenants begin paying, the system starts doing the work.",
  },
  {
    id: "panel2",
    eyebrow: "Tenants activate themselves",
    title: "Tenants use RentFray directly. You do not have to onboard them one-by-one.",
    subtitle:
      "They enter the property code, unit number, and PIN, then pay from their phone. No spreadsheet import. No office-side data entry.",
  },
  {
    id: "panel3",
    eyebrow: "Run the operation",
    title: "Control the business from your phone.",
    subtitle:
      "Add managers or staff, manage maintenance access, view exports, and keep operations moving without phone-tag or paperwork.",
  },
  {
    id: "panel4",
    eyebrow: "See what matters",
    title: "Know who paid, who has not paid, and what needs attention.",
    subtitle:
      "The dashboard becomes useful immediately as payments come in. No guesswork. No chasing people down.",
  },
];

function SlideDots({
  activeIndex,
  onSelect,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-center gap-2">
      {slides.map((slide, index) => (
        <button
          key={slide.id}
          type="button"
          aria-label={`Go to slide ${index + 1}`}
          onClick={() => onSelect(index)}
          className={`h-2.5 rounded-full transition-all ${
            activeIndex === index ? "w-8 bg-[#0f172a]" : "w-2.5 bg-[#cbd5e1]"
          }`}
        />
      ))}
    </div>
  );
}

function DemoModal({
  open,
  slideIndex,
  onClose,
  onPrev,
  onNext,
  onSelect,
}: {
  open: boolean;
  slideIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
}) {
  const currentSlide = slides[slideIndex] ?? slides[0];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#0f172a]/70 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-white/15 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.45)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#64748b]">
              Interactive demo
            </div>
            <div className="mt-1 text-xl font-semibold tracking-tight text-[#0f172a] sm:text-2xl">
              {currentSlide.title}
            </div>
            <div className="mt-1 max-w-3xl text-sm text-[#475569]">
              {currentSlide.subtitle}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#eef4f8] px-3 py-3 sm:px-5 sm:py-5">
          <SlidePreview slideId={currentSlide.id} />
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                {currentSlide.eyebrow}
              </div>
              <SlideDots activeIndex={slideIndex} onSelect={onSelect} />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onPrev}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#0f172a] transition hover:bg-slate-50"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={onNext}
                className="rounded-2xl bg-[#0f172a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#162033]"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockGetStartedPanel() {
  return (
    <div className="mx-auto w-full max-w-[980px] rounded-[30px] border border-[#1e293b] bg-[#0f172a] p-3 shadow-[0_30px_90px_rgba(15,23,42,0.32)]">
      <div className="rounded-[26px] border border-[#1f3b62] bg-gradient-to-br from-[#0f172a] via-[#13233a] to-[#1d4ed8] p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-200/80">
              Step 1 — 4-Step Setup
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Complete the 4-Step Setup. Print Tenant Instruction Sheet. Done.
            </div>
            <div className="mt-3 max-w-xl text-sm leading-6 text-sky-100/90">
              Create the property. Set the tiers. Save billing rules. Connect
              payouts. Print the tenant instruction sheet. That is the whole
              handoff.
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20">
            Under 5 minutes
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            {
              step: "1",
              title: "Complete the 4-step setup",
              text: "Create login, property, tiers, and billing rules in one obvious path.",
            },
            {
              step: "2",
              title: "Connect payout account",
              text: "Secure Stripe-based owner payouts with plain-English status visibility.",
            },
            {
              step: "3",
              title: "Print the Tenant Instruction Sheet",
              text: "Write the tier and property code on it. That becomes the tenant handoff.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-[24px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-400 text-sm font-bold text-[#0f172a]">
                {item.step}
              </div>
              <div className="mt-3 text-base font-semibold">{item.title}</div>
              <div className="mt-2 text-sm leading-6 text-sky-100/85">
                {item.text}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-white/10 bg-white p-4 text-[#0f172a]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              4-step setup
            </div>
            <div className="mt-3 space-y-2">
              {[
                "Create login",
                "Add property",
                "Set tiers",
                "Save billing rules",
              ].map((row) => (
                <div
                  key={row}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium"
                >
                  {row}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white p-4 text-[#0f172a]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Accounts
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold">Payout account</div>
              <div className="mt-3 grid gap-2">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  Owner payout status
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  Bank connection
                </div>
                <div className="rounded-xl bg-[#0f172a] px-3 py-2 text-center text-sm font-semibold text-white">
                  Connect account
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white p-4 text-[#0f172a]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Tenant Instruction Sheet
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold">Tenant Instructions</div>
              <div className="mt-2 text-xs text-slate-500">
                Property Code: 4821
              </div>
              <div className="mt-1 text-xs text-slate-500">Tier Number: 2</div>
              <div className="mt-3 space-y-2">
                {[
                  "Enter property code",
                  "Select your unit",
                  "Create PIN",
                  "Pay from your phone",
                ].map((row) => (
                  <div key={row} className="text-sm text-slate-700">
                    • {row}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockActivatePanel() {
  return (
    <div className="mx-auto w-full max-w-[980px] rounded-[30px] border border-[#dbe4ee] bg-[#eef4f8] p-3 shadow-[0_25px_60px_rgba(15,23,42,0.16)]">
      <div className="rounded-[26px] border border-[#d8e4ee] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#64748b]">
              Step 2 — Tenant Activation
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-[#0f172a] sm:text-3xl">
              Tenants activate their unit in minutes.
            </div>
            <div className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">
              The tenant does not need direct manager-side setup. They use the
              property code, unit number, and PIN. Their login starts
              building the live system.
            </div>
          </div>

          <div className="rounded-2xl bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white">
            No manual onboarding
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-[#dbe4ee] bg-[#f8fbfd] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Sheet with code + tier
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-[#0f172a]">
                Tenant Instruction Sheet
              </div>
              <div className="mt-2 text-sm text-[#475569]">
                Property Code: 4821
              </div>
              <div className="text-sm text-[#475569]">Tier Number: 2</div>
              <div className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
                Hand to tenant
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-[#dbe4ee] bg-[#f8fbfd] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              First payment / activation
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-[10px] font-semibold tracking-[0.22em] text-[#64748b]">
                RENTFRAY
              </div>
              <div className="mt-3 text-lg font-semibold text-[#0f172a]">
                Activate unit
              </div>
              <div className="mt-3 space-y-2">
                {[
                  "Property Code",
                  "Unit Number",
                  "Create 4-digit PIN",
                  "Pay Now",
                ].map((row) => (
                  <div
                    key={row}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    {row}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-[#dbe4ee] bg-[#f8fbfd] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Live dashboard starts filling
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-[#0f172a]">
                Oak Grove Apartments
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["Units", "48"],
                  ["Payments", "3"],
                  ["Collected", "$2,285"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      {label}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {[
                  "Unit 102 — Payment posted",
                  "Unit 205 — Payment posted",
                  "Unit 301 — Payment pending",
                ].map((row) => (
                  <div
                    key={row}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {row}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockControlsPanel() {
  return (
    <div className="mx-auto w-full max-w-[980px] rounded-[30px] border border-[#dbe4ee] bg-[#f3f7fb] p-3 shadow-[0_25px_60px_rgba(15,23,42,0.16)]">
      <div className="rounded-[26px] border border-[#d8e4ee] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#64748b]">
              Step 3 — Run the operation
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-[#0f172a] sm:text-3xl">
              Give owners simple controls, not office clutter.
            </div>
            <div className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">
              Add management users, set maintenance access, pull exports, and
              keep the day-to-day operation inside one mobile-friendly system.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {["+", "Rent", "GP&LF", "Mngr", "Accounts", "Info", "Maint"].map(
              (label) => (
                <div
                  key={label}
                  className="rounded-2xl bg-[#0f172a] px-3 py-2 text-xs font-semibold text-white"
                >
                  {label}
                </div>
              )
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-[#dbe4ee] bg-[#f8fbfd] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Top controls
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Rent", "GP&LF", "Mngr", "Maint"].map((label) => (
                <div
                  key={label}
                  className="rounded-xl bg-[#0f172a] px-3 py-2 text-xs font-semibold text-white"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="mt-3 text-sm leading-6 text-slate-600">
              Simple controls for day-to-day operations.
            </div>
          </div>

          <div className="rounded-[22px] border border-[#dbe4ee] bg-[#f8fbfd] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Add manager / staff
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-[#0f172a]">
                Management users
              </div>
              <div className="mt-3 space-y-2">
                {[
                  "Email Address",
                  "Password",
                  "Role: STAFF",
                  "Create User",
                ].map((row) => (
                  <div
                    key={row}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    {row}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-[#dbe4ee] bg-[#f8fbfd] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Maintenance PIN / requests
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-[#0f172a]">
                Maintenance
              </div>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                Set PIN: ****
              </div>
              <div className="mt-3 space-y-2">
                {[
                  "Unit 102 — Leak under sink",
                  "Unit 201 — AC not cooling",
                ].map((row) => (
                  <div
                    key={row}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {row}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockRunBusinessPanel() {
  const units = [
    ["101", "Smith", "$0.00", "Current", "bg-emerald-500"],
    ["102", "Johnson", "$750.00", "Pending", "bg-amber-400"],
    ["103", "Brown", "$780.00", "Past Due", "bg-red-500"],
    ["104", "-", "-", "Vacant", "bg-slate-400"],
    ["201", "Davis", "$0.00", "Current", "bg-emerald-500"],
    ["202", "Miller", "$750.00", "Grace Period", "bg-blue-500"],
  ] as const;

  return (
    <div className="mx-auto w-full max-w-[980px] rounded-[30px] border border-[#dbe4ee] bg-[#eef4f8] p-3 shadow-[0_25px_60px_rgba(15,23,42,0.16)]">
      <div className="rounded-[26px] border border-[#d8e4ee] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#64748b]">
              Step 4 — See what matters
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-[#0f172a] sm:text-3xl">
              Color-coded dots let you see what needs attention instantly. 
            </div>
            <div className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">
              After setup, the system should feel basic, routine, and fast.
              Payments, balances, and status visibility should not require extra
              mental work.
            </div>
          </div>

          <div className="rounded-2xl bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white">
            No manual tracking
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {[
            ["Total Units", "48"],
            ["Occupied", "42"],
            ["Vacant", "6"],
            ["Collected", "$18,640"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-[#dbe4ee] bg-[#f8fbfd] px-4 py-4"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                {label}
              </div>
              <div className="mt-2 text-2xl font-semibold text-[#0f172a]">
                {value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-[24px] border border-[#dbe4ee] bg-white p-3">
            <div className="mb-3 px-1 text-sm font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Unit status
            </div>

            <div className="space-y-2">
              {units.map(([unit, last, balance, status, dot]) => (
                <div
                  key={unit}
                  className="rounded-[20px] border border-[#e2e8f0] bg-[#f8fafc] px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`h-3.5 w-3.5 rounded-full ${dot}`} />
                      <span className="font-bold text-[#00b8e6]">{unit}</span>
                      <span className="min-w-[70px] truncate text-sm text-[#334155]">
                        {last}
                      </span>
                      <span className="min-w-[90px] text-sm font-semibold text-[#0f172a]">
                        {balance}
                      </span>
                      <span className="text-xs text-[#64748b]">{status}</span>
                    </div>

                    <div className="rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-xs font-semibold text-[#334155]">
                      MP
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[24px] border border-[#dbe4ee] bg-white p-4">
              <div className="text-sm font-semibold text-[#0f172a]">
                Revenue snapshot
              </div>
              <div className="mt-3 space-y-2">
                {[
                  ["Expected", "$24,300"],
                  ["Collected", "$18,640"],
                  ["Outstanding", "$5,660"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-semibold text-slate-900">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#dbe4ee] bg-white p-4">
              <div className="text-sm font-semibold text-[#0f172a]">
                Mobile-friendly
              </div>
              <div className="mt-3 rounded-[24px] border border-slate-200 bg-gradient-to-b from-slate-50 via-sky-50 to-slate-100 p-4">
                <div className="text-[10px] font-semibold tracking-[0.22em] text-[#64748b]">
                  RENTFRAY
                </div>
                <div className="mt-3 text-lg font-semibold text-[#0f172a]">
                  Current Balance
                </div>
                <div className="mt-1 text-3xl font-semibold text-[#0f172a]">
                  $1,229.95
                </div>
                <div className="mt-3 rounded-2xl bg-[#0f172a] px-4 py-3 text-center text-sm font-semibold text-white">
                  Pay Now
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlidePreview({ slideId }: { slideId: string }) {
  switch (slideId) {
    case "panel1":
      return <MockGetStartedPanel />;
    case "panel2":
      return <MockActivatePanel />;
    case "panel3":
      return <MockControlsPanel />;
    case "panel4":
      return <MockRunBusinessPanel />;
    default:
      return null;
  }
}

function BenefitCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[28px] border border-[#dbe4ee] bg-white p-5 shadow-sm">
      <div className="text-lg font-semibold tracking-tight text-[#0f172a]">
        {title}
      </div>
      <div className="mt-3 text-sm leading-6 text-[#334155]">{text}</div>
    </div>
  );
}

function ValueCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[28px] border border-[#dbe4ee] bg-white p-5 shadow-sm">
      <div className="text-lg font-semibold tracking-tight text-[#0f172a]">
        {title}
      </div>
      <div className="mt-3 text-sm leading-6 text-[#334155]">{text}</div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [openDemo, setOpenDemo] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);


  const currentSlide = useMemo(
    () => slides[activeSlide] ?? slides[0],
    [activeSlide]
  );

  function nextSlide(): void {
    setActiveSlide((prev) => (prev + 1) % slides.length);
  }

  function prevSlide(): void {
    setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }

  function openAt(index: number): void {
    setActiveSlide(index);
    setOpenDemo(true);
  }

  return (
    <>
      <main className="min-h-screen bg-[#dfe7ee] text-[#0f172a]">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 lg:px-8">
          <div className="mb-8 text-xs font-semibold tracking-[0.2em] text-[#0f172a]/70">
            RENTFRAY
          </div>

          <section className="rounded-[36px] border border-[#d7e3ec] bg-gradient-to-b from-white to-[#eef4f8] px-6 py-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:px-8 sm:py-10 lg:px-10 lg:py-12">
           <div className="max-w-6xl">
  <div className="inline-flex rounded-full border border-[#cfe0ea] bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1e3a5f] shadow-sm">
    Free for businesses • No contracts • No setup fees • No cancellation fees
  </div>

  <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
    Rent collection that runs itself.
  </h1>

  <p className="mt-5 max-w-2xl text-base leading-7 text-[#475569] sm:text-lg">
    Set it up in minutes. Tenants pay through RentFray. You get paid
    automatically.
  </p>

  <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-[#1e3a5f] sm:text-lg">
    Stop chasing payments, tracking spreadsheets, and following up manually.
  </p>

  <p className="mt-5 max-w-3xl text-sm font-semibold leading-6 text-[#0f172a] sm:text-base">
    Built for apartments, mobile home parks, RV parks, self-storage, HOAs,
    and independent landlords.
  </p>

  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
   <button
      type="button"
      onClick={() => router.push("/setup")}
      className="rounded-2xl bg-gradient-to-r from-[#38bdf8] to-[#6366f1] px-6 py-4 text-base font-semibold text-white shadow-[0_15px_35px_rgba(99,102,241,0.28)] transition hover:-translate-y-[1px] hover:shadow-[0_18px_40px_rgba(99,102,241,0.35)]"
    >
      Start 4-step setup →
    </button>

    <button
      type="button"
      onClick={() => openAt(0)}
      className="rounded-2xl border border-[#cbd5e1] bg-white px-6 py-4 text-base font-semibold text-[#0f172a] transition hover:-translate-y-[1px] hover:bg-[#f8fafc]"
    >
      See how it works
    </button>

<button
  type="button"
  onClick={() => {
    window.location.href = "/install";
  }}
  className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4 text-base font-semibold text-emerald-800 transition hover:-translate-y-[1px] hover:bg-emerald-100"
>
  Install App
</button>
  </div>

<div className="mt-8 space-y-3">
  <p className="text-base font-semibold tracking-tight text-slate-900">
    Questions? Call or text me directly.
  </p>

  <div className="space-y-1">
    <a
      href="tel:19363461538"
      className="block text-2xl font-semibold tracking-tight text-emerald-700 transition hover:text-emerald-600"
    >
      (936) 346-1538
    </a>

    <p className="text-sm font-medium text-slate-600">
      — Andrew
    </p>
  </div>

  <div className="space-y-1 text-sm leading-relaxed text-slate-500">
    <p>No sales department.</p>
    <p>No phone directory maze.</p>
    <p>Just real help if you need it.</p>
  </div>
</div>

  <div className="mt-8 grid gap-4 lg:grid-cols-3">
    <div className="relative rounded-[26px] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-[26px] bg-emerald-500" />
      <div className="pl-3">
        <div className="text-lg font-semibold text-emerald-700">Owners</div>
        <div className="mt-4 space-y-2 text-sm leading-6 text-[#334155]">
          <div>• RentFray is completely free for businesses.</div>
          <div>• Complete self-serve setup in less than 5 minutes.</div>
          <div>• No onboarding calls, emails, or manual tenant setup.</div>
          <div>• Saves processing fees you may be paying now.</div>
        </div>
      </div>
    </div>

    <div className="relative rounded-[26px] border border-blue-200 bg-blue-50 p-5 shadow-sm">
      <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-[26px] bg-blue-500" />
      <div className="pl-3">
        <div className="text-lg font-semibold text-blue-700">Managers</div>
        <div className="mt-4 space-y-2 text-sm leading-6 text-[#334155]">
          <div>• See who paid, who has not paid, and what needs attention.</div>
          <div>• Run day-to-day operations from your phone.</div>
          <div>• No spreadsheet chasing or manual tracking.</div>
          <div>• Tenants use RentFray directly instead of calling the office.</div>
          <div>• Faster, cleaner routine rent management.</div>
        </div>
      </div>
    </div>

    <div className="relative rounded-[26px] border border-slate-300 bg-slate-100 p-5 shadow-sm">
      <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-[26px] bg-slate-500" />
      <div className="pl-3">
        <div className="text-lg font-semibold text-slate-700">Tenants</div>
        <div className="mt-4 space-y-2 text-sm leading-6 text-[#334155]">
          <div>• Simple phone-based activation and payment flow.</div>
          <div>• No office visit required to get started.</div>
          <div>• Clear balance visibility in one place.</div>
          <div>• Fast login with property code, unit number, and PIN.</div>
          <div>• Easy recurring routine every month.</div>
        </div>
      </div>
    </div>
  </div>
</div>
</section>


          <section className="mt-10 rounded-[36px] border border-[#d7e3ec] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
            <div className="rounded-[28px] border border-[#dbe4ee] bg-white p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                Interactive demo
              </div>

              <div className="mt-2 text-xl font-semibold text-[#0f172a]">
                View Interactive Demo
              </div>

               <p className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">
  Tap a step to preview the full flow: setup, tenant activation, controls,
  and live dashboard visibility.
</p>

              <div className="mt-4 flex flex-col gap-3">
                {slides.map((slide, index) => {
                  const isActive = index === activeSlide;

                  return (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setActiveSlide(index)}
                      className={`rounded-[18px] border px-4 py-3 text-left transition duration-200 ${
                        isActive
                          ? "border-[#0f172a] bg-[#f1f5f9] shadow-[0_10px_24px_rgba(15,23,42,0.10)]"
                          : "border-[#dbe4ee] bg-[#f8fbfd] shadow-sm hover:-translate-y-[2px] hover:scale-[1.01] hover:shadow-[0_14px_28px_rgba(15,23,42,0.10)]"
                      }`}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                        {slide.eyebrow}
                      </div>

                      <div className="mt-1 text-base font-semibold text-[#0f172a]">
                        {slide.title}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 origin-top scale-[0.9] overflow-hidden rounded-[20px]">
                <div className="max-h-[420px] overflow-hidden rounded-[20px]">
                  <SlidePreview slideId={currentSlide.id} />
                </div>
              </div>

              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => openAt(activeSlide)}
                  className="text-sm font-semibold text-[#0f172a] underline-offset-4 hover:underline"
                >
                  Expand this step →
                </button>
              </div>
            </div>
          </section>

         
          <section className="mt-10 rounded-[36px] border border-[#0f172a] bg-[#0f172a] px-6 py-8 text-white shadow-[0_30px_80px_rgba(15,23,42,0.38)] sm:px-8 sm:py-10">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Stop collecting rent manually.
              </h2>
              <p className="mt-3 max-w-2xl text-base text-[#cbd5f5] sm:mx-auto sm:text-lg">
  Stop wasting time on manual collection, follow-up, and avoidable office work.
</p>
              <p className="mt-3 text-sm text-[#cbd5f5] sm:text-base">
  Complete the setup, connect payouts, hand tenants the sheet, and be live today.
</p>

              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => router.push("/setup")}
                  className="rounded-2xl bg-gradient-to-r from-[#38bdf8] to-[#6366f1] px-6 py-4 text-base font-semibold text-white transition hover:scale-[1.01] hover:shadow-[0_10px_30px_rgba(99,102,241,0.35)]"
                >
                  Start 4-step setup →
                </button>
              </div>
            </div>
          </section>

        <div className="mt-10 rounded-[32px] border border-[#dbe4ee] bg-white px-6 py-6 shadow-sm">
  <div className="max-w-3xl">
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">
      Secure by Design
    </div>

    <div className="mt-2 text-xl font-semibold tracking-tight text-[#0f172a]">
      Payments are securely handled through Stripe.
    </div>

    <div className="mt-3 space-y-2 text-sm leading-6 text-[#475569]">
      <p>
        Stripe uses bank-level encryption and is trusted by millions of
        businesses worldwide.
      </p>

      <p>
        RentFray does not store banking information or hold tenant funds.
      </p>
    </div>
  </div>
</div>

          <section className="mt-6 flex justify-center">
  <div className="rounded-[20px] border border-[#d7e3ec] bg-white px-4 py-4 shadow-sm">
    <div className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">
      Access
    </div>

    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        onClick={() => router.push("/property-code")}
        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        Property Portal
      </button>

      <button
        type="button"
        onClick={() => router.push("/login/admin")}
        className="rounded-xl border border-[#cbd5e1] bg-[#f8fafc] px-5 py-2.5 text-sm font-semibold text-[#0f172a] transition hover:bg-[#eef4f8]"
      >
        Admin Portal
      </button>
    </div>
  </div>
</section>

          <footer className="mt-14 border-t border-[#cbd5e1] px-2 py-8 text-center">
            <div className="space-y-2 text-sm text-[#475569]">
              <div>
                Questions?{" "}
                <a
                  href="mailto:helpdesk@rentfray.com"
                  className="font-semibold text-[#0f172a] hover:underline"
                >
                  helpdesk@rentfray.com
                </a>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => router.push("/faq")}
                  className="font-semibold text-[#0f172a] hover:underline"
                >
                  View FAQ
                </button>
              </div>
            </div>
          </footer>
        </div>
      </main>

      <DemoModal
        open={openDemo}
        slideIndex={activeSlide}
        onClose={() => setOpenDemo(false)}
        onPrev={prevSlide}
        onNext={nextSlide}
        onSelect={setActiveSlide}
      />
    </>
  );
}