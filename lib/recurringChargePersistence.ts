import { randomUUID } from "node:crypto";
import type { Prisma, RecurringCharge } from "@prisma/client";
import { isValidBillingCycle } from "@/lib/billingCalendar";
import { validateRecurringPaymentConfiguration } from "@/lib/recurringValidation";

export class InvalidRecurringCharges extends Error {}
export type ChargeSubmission = {
  id: string | null;
  sourceChargeId?: string | null;
  logicalChargeKey?: string;
  clientKey: string;
  sharedChargeGroupId: string | null;
  label: string;
  amountCents: number;
  applyToAllTiers: boolean;
  effectiveBillingCycle?: string | null;
  endsAfterBillingCycle?: string | null;
};
export type TierSubmission = { recurringPlanId: string; charges: ChargeSubmission[] };
function requireValid(value: unknown, message = "One or more recurring charges are invalid."): asserts value {
  if (!value) throw new InvalidRecurringCharges(message);
}
function validateRange(start: string | null, end: string | null) {
  requireValid((start === null || isValidBillingCycle(start)) &&
    (end === null || isValidBillingCycle(end)) && (!start || !end || start <= end), "Enter valid recurring charge billing cycles.");
}

// Called only inside withManagerMutation. Read identity and hidden applicability
// from authoritative rows, never infer financial identity from labels/amounts.
export async function saveRecurringCharges(tx: Prisma.TransactionClient, businessId: string, tiers: TierSubmission[]) {
  const plans = await tx.recurringPlan.findMany({ where: { businessId, isActive: true }, orderBy: { sortOrder: "asc" } });
  const planIds = plans.map(plan => plan.id);
  requireValid(new Set(tiers.map(tier => tier.recurringPlanId)).size === tiers.length &&
    tiers.length === plans.length && tiers.every(tier => planIds.includes(tier.recurringPlanId)), "One or more rent tiers are invalid.");
  const existing = await tx.recurringCharge.findMany({ where: { recurringPlan: { businessId } } });
  const byId = new Map(existing.map(charge => [charge.id, charge]));
  const owned = (id: string) => {
    const row = byId.get(id); requireValid(row && planIds.includes(row.recurringPlanId)); return row;
  };
  type Entry = ChargeSubmission & { recurringPlanId: string };
  const groups = new Map<string, { entries: Entry[]; source?: RecurringCharge }>();
  const submittedIds = new Set<string>(), clientIdentities = new Map<string, string>();
  for (const tier of tiers) {
    const clientKeys = new Set<string>();
    for (const charge of tier.charges) {
      requireValid(!clientKeys.has(charge.clientKey)); clientKeys.add(charge.clientKey);
      const row = charge.id ? owned(charge.id) : undefined;
      if (row) {
        requireValid(row.recurringPlanId === tier.recurringPlanId && !submittedIds.has(row.id)); submittedIds.add(row.id);
      }
      const source = charge.sourceChargeId ? owned(charge.sourceChargeId) : row;
      requireValid(!row || !source || row.id === source.id ||
        (row.sharedChargeGroupId && row.sharedChargeGroupId === source.sharedChargeGroupId));
      requireValid(!charge.sharedChargeGroupId || (source && source.sharedChargeGroupId === charge.sharedChargeGroupId));
      const key = source ? source.sharedChargeGroupId ? `group:${source.sharedChargeGroupId}` : `charge:${source.id}`
        : `new:${charge.logicalChargeKey ?? charge.clientKey}`;
      if (charge.logicalChargeKey) {
        requireValid(!clientIdentities.has(charge.logicalChargeKey) || clientIdentities.get(charge.logicalChargeKey) === key);
        clientIdentities.set(charge.logicalChargeKey, key);
      }
      const group = groups.get(key) ?? { entries: [], source };
      requireValid(!group.entries.some(entry => entry.recurringPlanId === tier.recurringPlanId));
      group.entries.push({ ...charge, recurringPlanId: tier.recurringPlanId }); groups.set(key, group);
    }
  }
  type Desired = { id?: string; clientKey: string; applyToAllTiers: boolean; data: Prisma.RecurringChargeUncheckedCreateInput };
  const desired: Desired[] = [], retained = new Set<string>();
  for (const { entries, source } of groups.values()) {
    const first = entries[0];
    requireValid(entries.every(entry => entry.label === first.label && entry.amountCents === first.amountCents && entry.applyToAllTiers === first.applyToAllTiers));
    const relatives = source ? source.sharedChargeGroupId
      ? existing.filter(row => row.sharedChargeGroupId === source.sharedChargeGroupId)
      : [source] : [];
    const explicit = (field: "effectiveBillingCycle" | "endsAfterBillingCycle") => {
      const values = entries.filter(entry => entry[field] !== undefined).map(entry => entry[field]);
      requireValid(values.every(value => value === values[0])); return values[0];
    };
    const start = explicit("effectiveBillingCycle"), end = explicit("endsAfterBillingCycle");
    const targets = first.applyToAllTiers ? planIds : entries.map(entry => entry.recurringPlanId);
    const sharedChargeGroupId = source?.sharedChargeGroupId ?? (targets.length > 1 || first.applyToAllTiers ? randomUUID() : null);
    for (const planId of targets) {
      const entry = entries.find(item => item.recurringPlanId === planId);
      let original = entry?.id ? owned(entry.id) : relatives.find(row => row.recurringPlanId === planId);
      // Moving a single-tier charge retains its ID where possible. Expanding it
      // keeps the original tier's row and creates only the newly selected rows.
      if (!original && source && !source.sharedChargeGroupId && targets.length === 1) original = source;
      const inherited = original ?? source;
      if (!original && relatives.length > 1) {
        requireValid(relatives.every(row => (start !== undefined || row.effectiveBillingCycle === source!.effectiveBillingCycle) &&
          (end !== undefined || row.endsAfterBillingCycle === source!.endsAfterBillingCycle) && row.isActive === source!.isActive),
        "Shared charge applicability differs across tiers. Cannot safely expand it.");
      }
      const effectiveBillingCycle = start !== undefined ? start : inherited?.effectiveBillingCycle ?? null;
      const endsAfterBillingCycle = end !== undefined ? end : inherited?.endsAfterBillingCycle ?? null;
      validateRange(effectiveBillingCycle, endsAfterBillingCycle);
      if (original) { requireValid(!retained.has(original.id)); retained.add(original.id); }
      desired.push({ id: original?.id, clientKey: entry?.clientKey ?? `${first.clientKey}:${planId}`, applyToAllTiers: first.applyToAllTiers,
        data: { recurringPlanId: planId, sharedChargeGroupId, label: first.label, amountCents: first.amountCents,
          effectiveBillingCycle, endsAfterBillingCycle, isActive: inherited?.isActive ?? true,
          sortOrder: desired.filter(row => row.data.recurringPlanId === planId).length } });
    }
  }
  // Validate the expanded configuration, including shared replicas, before the
  // first write. Inactive records omitted by the UI retain their inactive state.
  for (const plan of plans) {
    const validation = validateRecurringPaymentConfiguration({ ...plan, planName: plan.name,
      recurringChargeCents: desired.filter(row => row.data.recurringPlanId === plan.id && row.data.isActive).reduce((sum, row) => sum + row.data.amountCents, 0) });
    requireValid(validation.ok, validation.ok ? "" : validation.error);
  }
  const saved: (RecurringCharge & { clientKey: string; applyToAllTiers: boolean })[] = [];
  for (const row of desired) {
    const record = row.id ? await tx.recurringCharge.update({ where: { id: row.id }, data: row.data })
      : await tx.recurringCharge.create({ data: row.data });
    saved.push({ ...record, clientKey: row.clientKey, applyToAllTiers: row.applyToAllTiers });
  }
  await tx.recurringCharge.deleteMany({ where: { id: { in: existing.filter(row => row.isActive && planIds.includes(row.recurringPlanId) && !retained.has(row.id)).map(row => row.id) } } });
  return planIds.map(recurringPlanId => ({ recurringPlanId, charges: saved.filter(row => row.recurringPlanId === recurringPlanId) }));
}
