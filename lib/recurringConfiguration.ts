import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Prisma } from "@prisma/client";
import { publicJson, PublicJsonError } from "@/lib/publicJson";

// These bound a page/legacy request, never the number of tiers in a property.
export const CONFIGURATION_PAGE_SIZE = 50;
export const CONFIGURATION_REQUEST_BYTES = 1024 * 1024;
// Existing per-tier charge policy; this is not a tier-count limit.
export const CHARGES_PER_TIER = 250;
export type ConfigurationPlan = Prisma.RecurringPlanGetPayload<{ include: { charges: true } }>;
export class ConfigurationError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export async function readConfigurationJson(request: Request): Promise<unknown> {
  if (Number(request.headers?.get("content-length") ?? 0) > CONFIGURATION_REQUEST_BYTES) throw new ConfigurationError("Configuration request is too large.", 413);
  // The fallback supports the existing in-process request transports. Native
  // requests always use the bounded stream, including chunked bodies.
  if (!request.body) {
    const value = await request.json();
    if (Buffer.byteLength(JSON.stringify(value)) > CONFIGURATION_REQUEST_BYTES) throw new ConfigurationError("Configuration request is too large.", 413);
    return value;
  }
  try { return await publicJson(request, CONFIGURATION_REQUEST_BYTES); }
  catch (error) {
    throw new ConfigurationError("Invalid configuration request body.", error instanceof PublicJsonError ? error.status : 400);
  }
}

export function configurationFingerprint(plans: ConfigurationPlan[]) {
  const fields = ["id", "name", "baseAmountCents", "sortOrder", "isActive", "updatedAt", "dueDay", "gracePeriodDays", "initialLateFeeCents", "dailyLateFeeCents", "dailyLateFeeMaxDays"];
  const chargeFields = ["id", "label", "amountCents", "sharedChargeGroupId", "effectiveBillingCycle", "endsAfterBillingCycle", "sortOrder", "isActive", "updatedAt"];
  const pick = (row: object, names: string[]) => Object.fromEntries(names.map(key => [key, row[key as keyof typeof row]]));
  return createHash("sha256").update(JSON.stringify([...plans].sort((a, b) => a.id.localeCompare(b.id)).map(plan => ({
    ...pick(plan, fields), charges: [...(plan.charges ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map(charge => pick(charge, chargeFields)),
  })))).digest("hex");
}

export async function assertLegacyConfiguration(tx: Prisma.TransactionClient, businessId: string, expectedVersion?: string) {
  const plans = await tx.recurringPlan.findMany({ where: { businessId, isActive: true }, take: CONFIGURATION_PAGE_SIZE + 1, include: { charges: true } });
  if (plans.length > CONFIGURATION_PAGE_SIZE) throw new ConfigurationError("Use paginated tier editing for this property.");
  if (!expectedVersion) throw new ConfigurationError("Reload the configuration before saving.", 428);
  if (configurationFingerprint(plans) !== expectedVersion) throw new ConfigurationError("Configuration changed. Reload before saving; your changes have not been applied.");
  return plans;
}

export async function legacyConfigurationVersion(tx: Prisma.TransactionClient, businessId: string) {
  return configurationFingerprint(await tx.recurringPlan.findMany({ where: { businessId, isActive: true }, take: CONFIGURATION_PAGE_SIZE + 1, include: { charges: true } }));
}
