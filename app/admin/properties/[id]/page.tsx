import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AdminSupportTools from "@/components/admin/AdminSupportTools";

export const dynamic = "force-dynamic";

type AssignmentDisplay = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

function formatMoney(value: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatBusinessType(value: string | null | undefined): string {
  if (!value) return "—";

  return value
    .toLowerCase()
    .split("_")
    .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAssignmentDisplayName(assignment: AssignmentDisplay): string {
  const fullName =
    `${assignment.firstName ?? ""} ${assignment.lastName ?? ""}`.trim();

  if (fullName) return fullName;
  if (assignment.email?.trim()) return assignment.email.trim();
  return "Occupied";
}

function getOccupancyTone(hasTenant: boolean): string {
  return hasTenant
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-100 text-slate-600";
}

export default async function PropertyDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!id) {
    throw new Error("Missing property id");
  }

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      settings: true,
      tiers: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          units: {
            orderBy: { unitNumber: "asc" },
            include: {
              recurringFeeItems: {
                where: { isActive: true },
                orderBy: { displayOrder: "asc" },
              },
              tenantAssignments: {
                where: {
                  moveOutDate: null,
                  isCurrent: true,
                },
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      },
    },
  });

  if (!property) {
    notFound();
  }

  type TierRecord = (typeof property.tiers)[number];
  type UnitRecord = TierRecord["units"][number];
  type ChargeRecord = UnitRecord["recurringFeeItems"][number];
  type AssignmentRecord = UnitRecord["tenantAssignments"][number];

  const totalUnits = property.tiers.reduce(
    (sum: number, tier: TierRecord) => sum + tier.units.length,
    0
  );

  const occupiedUnits = property.tiers.reduce(
    (sum: number, tier: TierRecord) =>
      sum +
      tier.units.filter(
        (unit: UnitRecord) => unit.tenantAssignments.length > 0
      ).length,
    0
  );

  const vacantUnits = totalUnits - occupiedUnits;
  const totalTiers = property.tiers.length;

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-900 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  RentFray property
                </div>

                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  {property.name}
                </h1>

                <div className="mt-3 flex flex-col gap-2 text-sm text-slate-600">
                  <div>
                    Property Code:{" "}
                    <span className="font-mono font-semibold text-slate-900">
                      {property.propertyCode}
                    </span>
                  </div>
                  <div>Type: {formatBusinessType(property.propertyType)}</div>
                  <div>Address: {property.addressLine1?.trim() || "—"}</div>
                  <div>Contact: {property.contactEmail?.trim() || "—"}</div>
                  <div>
                    Status:{" "}
                    <span className="font-semibold text-slate-900">
                      {String(property.status ?? "—")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${
                    property.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-100 text-slate-600"
                  }`}
                >
                  {property.isActive ? "Active" : "Inactive"}
                </div>

                <Link
                  href="/admin/properties"
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Back
                </Link>

                <Link
                  href={`/admin/properties/${property.id}/setup`}
                  className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Edit Setup
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Total Units
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              {totalUnits}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Occupied
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              {occupiedUnits}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Vacant
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              {vacantUnits}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Tiers
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">
              {totalTiers}
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">
                  Property Rules
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Current high-level billing and fee settings.
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Rent Due Day
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {property.settings?.rentDueDay ?? "—"}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Grace Period
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {property.settings?.gracePeriodDays ?? "—"} days
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Late Fee Enabled
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {property.settings?.lateFeeEnabled ? "Yes" : "No"}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Flat Late Fee
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {formatMoney(Number(property.settings?.lateFeeFlat || 0))}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Convenience Fee Enabled
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {property.settings?.convenienceFeeEnabled ? "Yes" : "No"}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Convenience Fee Amount
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {formatMoney(
                    Number(property.settings?.convenienceFeeAmount || 0)
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="text-sm font-semibold text-slate-950">
              Quick Snapshot
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Fast property-level summary for setup review.
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Property Type
                </div>
                <div className="mt-2 text-base font-semibold text-slate-950">
                  {formatBusinessType(property.propertyType)}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Address
                </div>
                <div className="mt-2 text-base font-semibold text-slate-950">
                  {property.addressLine1?.trim() || "—"}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Contact Email
                </div>
                <div className="mt-2 text-base font-semibold text-slate-950">
                  {property.contactEmail?.trim() || "—"}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Current Status
                </div>
                <div className="mt-2 text-base font-semibold text-slate-950">
                  {String(property.status ?? "—")}
                </div>
              </div>
            </div>
          </div>
        </section>
  
        <AdminSupportTools
  propertyId={property.id}
  propertyName={property.name}
/>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-950">
                Tiers and Units
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Review tier pricing, rules, charges, and current occupancy.
              </div>
            </div>
          </div>

          {property.tiers.length === 0 ? (
            <div className="mt-4 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No tiers found for this property.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {property.tiers.map((tier: TierRecord) => {
                const tierOccupied = tier.units.filter(
                  (unit: UnitRecord) => unit.tenantAssignments.length > 0
                ).length;

                const tierVacant = tier.units.length - tierOccupied;

                return (
                  <div
                    key={tier.id}
                    className="rounded-[26px] border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold text-slate-950">
                          {tier.name}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {formatMoney(Number(tier.baseRent || 0))} base rent ·{" "}
                          {formatMoney(Number(tier.processingFee || 0))}{" "}
                          processing fee
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                          {tier.units.length} Units
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                          {tierOccupied} Occupied
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                          {tierVacant} Vacant
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Due Day
                        </div>
                        <div className="mt-2 text-base font-semibold text-slate-950">
                          {tier.rentDueDay ?? "—"}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Grace Period
                        </div>
                        <div className="mt-2 text-base font-semibold text-slate-950">
                          {tier.gracePeriodDays ?? "—"} days
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Initial Late Fee
                        </div>
                        <div className="mt-2 text-base font-semibold text-slate-950">
                          {formatMoney(Number(tier.lateFeeInitial || 0))}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Daily Late Fee
                        </div>
                        <div className="mt-2 text-base font-semibold text-slate-950">
                          {formatMoney(Number(tier.lateFeeDaily || 0))}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Max Daily Fee Days
                        </div>
                        <div className="mt-2 text-base font-semibold text-slate-950">
                          {tier.maxLateFeeDays ?? "—"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {tier.units.length === 0 ? (
                        <div className="rounded-[22px] border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                          No units in this tier.
                        </div>
                      ) : (
                        tier.units.map((unit: UnitRecord) => {
                          const activeAssignment: AssignmentRecord | null =
                            unit.tenantAssignments.length > 0
                              ? unit.tenantAssignments[0]
                              : null;

                          const charges: ChargeRecord[] = unit.recurringFeeItems;
                          const hasTenant = Boolean(activeAssignment);

                          return (
                            <div
                              key={unit.id}
                              className="rounded-[22px] border border-slate-200 bg-white p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-base font-semibold text-slate-950">
                                    Unit {unit.unitNumber}
                                  </div>
                                  <div className="mt-1 text-sm text-slate-600">
                                    Base Rent:{" "}
                                    {formatMoney(Number(unit.baseRent || 0))}
                                  </div>
                                  <div className="mt-1 text-sm text-slate-600">
                                    Add-Ons:{" "}
                                    {formatMoney(
                                      Number(unit.recurringFees || 0)
                                    )}
                                  </div>
                                </div>

                                <span
                                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${getOccupancyTone(
                                    hasTenant
                                  )}`}
                                >
                                  {hasTenant ? "Occupied" : "Vacant"}
                                </span>
                              </div>

                              <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Current Resident
                                </div>
                                <div className="mt-2 text-sm font-semibold text-slate-950">
                                  {activeAssignment
                                    ? getAssignmentDisplayName(activeAssignment)
                                    : "Vacant"}
                                </div>
                              </div>

                              <div className="mt-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Recurring Charges
                                </div>

                                {charges.length === 0 ? (
                                  <div className="mt-2 rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                                    No recurring charges.
                                  </div>
                                ) : (
                                  <div className="mt-2 space-y-2">
                                    {charges.map((charge: ChargeRecord) => (
                                      <div
                                        key={charge.id}
                                        className="flex items-center justify-between rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                                      >
                                        <span className="font-medium text-slate-700">
                                          {charge.label}
                                        </span>
                                        <span className="font-semibold text-slate-950">
                                          {formatMoney(
                                            Number(charge.amount || 0)
                                          )}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}