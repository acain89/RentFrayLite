import { createHash } from "node:crypto";
import { Prisma, SetupStep } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import { MAX_PAYMENT_AMOUNT_CENTS } from "@/lib/platformFees";
import { validateRecurringPaymentConfiguration, isValidDailyLateFeeDays, DAILY_LATE_FEE_DAYS_ERROR } from "@/lib/recurringValidation";
import { isValidBillingCycle } from "@/lib/billingCalendar";
import { ConfigurationError, configurationFingerprint, legacyConfigurationVersion, CONFIGURATION_PAGE_SIZE, CHARGES_PER_TIER, readConfigurationJson, type ConfigurationPlan } from "@/lib/recurringConfiguration";

const id = z.string().min(1).max(100), version = z.string().min(1).max(100);
const cents = z.number().int().min(1).max(MAX_PAYMENT_AMOUNT_CENTS);
const ruleSchema = z.object({ dueDay: z.literal(1).default(1), gracePeriodDays: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  initialLateFeeCents: z.number().int().min(0).max(10_000_000), dailyLateFeeCents: z.number().int().min(0).max(10_000_000), dailyLateFeeMaxDays: z.number().int().refine(isValidDailyLateFeeDays, DAILY_LATE_FEE_DAYS_ERROR) })
  .refine(r => r.dailyLateFeeCents > 0 ? r.dailyLateFeeMaxDays > 0 : r.dailyLateFeeMaxDays === 0, "Choose valid daily late-fee days.");
const chargeSchema = z.object({ id: id.optional(), label: z.string().trim().min(1).max(80), amountCents: cents,
  effectiveBillingCycle: z.string().nullable().optional(), endsAfterBillingCycle: z.string().nullable().optional() });
const requestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("tier"), requestId: z.uuid(), id: id.optional(), version: version.optional(), name: z.string().trim().min(1).max(80), amountCents: cents }),
  z.object({ operation: z.literal("removeTier"), requestId: z.uuid(), id, version }),
  z.object({ operation: z.literal("billing"), requestId: z.uuid(), id: id.optional(), version, shared: z.boolean(), confirmCalendarChange: z.boolean().default(false), rule: ruleSchema }),
  z.object({ operation: z.literal("charge"), requestId: z.uuid(), id, version, shared: z.boolean(), remove: z.boolean().default(false), charge: chargeSchema }),
  z.object({ operation: z.literal("advance"), requestId: z.uuid(), step: z.enum(["tiers", "charges", "billing"]) }),
]);

async function managerSession() {
  const session = await getCurrentSession();
  if (!session || session.type !== "MANAGER" || !session.manager || !session.business || session.manager.businessId !== session.business.id) throw new ManagerMutationUnauthorized();
  return session;
}
function failure(error: unknown) {
  if (error instanceof ManagerMutationUnauthorized) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (error instanceof ConfigurationError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: "Unable to update recurring configuration." }, { status: 500 });
}

// One aggregate result, irrespective of property size. Includes inactive charge
// evidence too, so a hidden applicability edit cannot be overwritten by a stale
// shared action. No tier/charge IDs are sent to the client for global operations.
export async function globalConfigurationVersion(tx: Prisma.TransactionClient, businessId: string) {
  const [row] = await tx.$queryRaw<Array<{ version: string }>>(Prisma.sql`/* recurring-global-version */
    SELECT md5(COALESCE((SELECT string_agg(md5(row_to_json(p)::text), ',' ORDER BY p."id") FROM "RecurringPlan" p WHERE p."businessId"=${businessId}), '') || '|' ||
      COALESCE((SELECT string_agg(md5(row_to_json(c)::text), ',' ORDER BY c."id") FROM "RecurringCharge" c JOIN "RecurringPlan" p ON p."id"=c."recurringPlanId" WHERE p."businessId"=${businessId}), '')) AS version`);
  return row.version;
}

export async function getRecurringConfiguration(request: Request) {
  try {
    const session = await managerSession(), businessId = session.business!.id, url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    if (cursor && cursor.length > 100) throw new ConfigurationError("Invalid tier page.", 400);
    // Repeatable-read gives the page and shared revision one coherent snapshot.
    return await prisma.$transaction(async tx => {
      const prior = cursor ? await tx.recurringPlan.findFirst({ where: { id: cursor, businessId } }) : null;
      if (cursor && !prior) throw new ConfigurationError("Invalid tier page.", 400);
      const rows = await tx.recurringPlan.findMany({ where: { businessId, isActive: true,
        ...(prior ? { OR: [{ sortOrder: { gt: prior.sortOrder } }, { sortOrder: prior.sortOrder, id: { gt: prior.id } }] } : {}) },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: CONFIGURATION_PAGE_SIZE + 1,
        include: { charges: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
      const visible = rows.slice(0, CONFIGURATION_PAGE_SIZE);
      const versions = new Map(visible.map(row => [row.id, configurationFingerprint([row])]));
      const total = await tx.recurringPlan.count({ where: { businessId, isActive: true } });
      const groupIds = [...new Set(visible.flatMap(row => row.charges.map(c => c.sharedChargeGroupId).filter((group): group is string => Boolean(group))))];
      // A group may deliberately cover only a subset of tiers. A group ID alone
      // must never turn a targeted edit into an all-property charge expansion.
      const globalGroups = groupIds.length ? await tx.$queryRaw<Array<{ sharedChargeGroupId: string }>>(Prisma.sql`/* recurring-global-charge-groups */
        SELECT c."sharedChargeGroupId" FROM "RecurringCharge" c JOIN "RecurringPlan" p ON p."id"=c."recurringPlanId"
        WHERE p."businessId"=${businessId} AND p."isActive" AND c."isActive" AND c."sharedChargeGroupId" IN (${Prisma.join(groupIds)})
        GROUP BY c."sharedChargeGroupId" HAVING COUNT(DISTINCT p."id")=${total}`) : [];
      const allTierGroups = new Set(globalGroups.map(group => group.sharedChargeGroupId));
      return Response.json({ tiers: visible.map(row => ({ ...row, version: versions.get(row.id)!,
        charges: row.charges.map(charge => ({ ...charge, applyToAllTiers: !!charge.sharedChargeGroupId && allTierGroups.has(charge.sharedChargeGroupId) })),
      })),
        nextCursor: rows.length > CONFIGURATION_PAGE_SIZE ? visible.at(-1)!.id : null,
        total, version: await globalConfigurationVersion(tx, businessId),
        ...(!prior && rows.length <= CONFIGURATION_PAGE_SIZE ? { legacyVersion: await legacyConfigurationVersion(tx, businessId) } : {}),
      }, { headers: { "Cache-Control": "no-store" } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  } catch (error) { return failure(error); }
}

async function ownedPlan(tx: Prisma.TransactionClient, businessId: string, planId: string, expected?: string) {
  const plan = await tx.recurringPlan.findFirst({ where: { id: planId, businessId, isActive: true }, include: { charges: { where: { isActive: true } } } });
  if (!plan) throw new ConfigurationError("Rent tier not found.", 404);
  if (!expected || configurationFingerprint([plan]) !== expected) throw new ConfigurationError("This tier changed. Reload before saving.");
  return plan;
}
function validatePlan(plan: ConfigurationPlan, baseAmountCents = plan.baseAmountCents) {
  const checked = validateRecurringPaymentConfiguration({ ...plan, baseAmountCents, planName: plan.name,
    recurringChargeCents: plan.charges.filter(c => c.isActive).reduce((sum, c) => sum + c.amountCents, 0) });
  if (!checked.ok) throw new ConfigurationError(checked.error, 400);
}

// Let the existing financial validator decide. SQL selects only the worst
// configured row; it never substitutes a new fee schedule or payment quote.
async function validateProperty(tx: Prisma.TransactionClient, businessId: string) {
  const rows = await tx.$queryRaw<Array<{ name: string; baseAmountCents: number; recurringChargeCents: bigint; initialLateFeeCents: number; dailyLateFeeCents: number; dailyLateFeeMaxDays: number }>>(Prisma.sql`/* recurring-maximum */
    SELECT p."name", p."baseAmountCents", p."initialLateFeeCents", p."dailyLateFeeCents", p."dailyLateFeeMaxDays", COALESCE(c.total,0)::bigint AS "recurringChargeCents"
    FROM "RecurringPlan" p LEFT JOIN LATERAL (SELECT SUM("amountCents") AS total FROM "RecurringCharge" WHERE "recurringPlanId"=p."id" AND "isActive") c ON true
    WHERE p."businessId"=${businessId} AND p."isActive"
    ORDER BY p."baseAmountCents"::bigint+COALESCE(c.total,0)+p."initialLateFeeCents"::bigint+p."dailyLateFeeCents"::bigint*p."dailyLateFeeMaxDays" DESC LIMIT 1`);
  if (rows[0]) {
    const result = validateRecurringPaymentConfiguration({ ...rows[0], planName: rows[0].name, recurringChargeCents: Number(rows[0].recurringChargeCents) });
    if (!result.ok) throw new ConfigurationError(result.error, 400);
  }
}

export async function inheritSharedConfiguration(tx: Prisma.TransactionClient, businessId: string, planId: string) {
  const first = await tx.recurringPlan.findFirst({ where: { businessId, isActive: true, id: { not: planId } } });
  if (first) {
    const different = await tx.recurringPlan.findFirst({ where: { businessId, isActive: true, id: { not: planId }, OR: [
      { dueDay: { not: first.dueDay } }, { gracePeriodDays: { not: first.gracePeriodDays } }, { initialLateFeeCents: { not: first.initialLateFeeCents } },
      { dailyLateFeeCents: { not: first.dailyLateFeeCents } }, { dailyLateFeeMaxDays: { not: first.dailyLateFeeMaxDays } },
    ] } });
    if (!different && first.dueDay === 1 && [3,4,5].includes(first.gracePeriodDays)) await tx.recurringPlan.update({ where: { id: planId }, data: { dueDay: first.dueDay, gracePeriodDays: first.gracePeriodDays,
      initialLateFeeCents: first.initialLateFeeCents, dailyLateFeeCents: first.dailyLateFeeCents, dailyLateFeeMaxDays: first.dailyLateFeeMaxDays } });
    const inconsistent = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`/* recurring-inherit-conflict */
      SELECT s."id" FROM "RecurringCharge" s WHERE s."recurringPlanId"=${first.id} AND s."isActive" AND s."sharedChargeGroupId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "RecurringCharge" r JOIN "RecurringPlan" p ON p."id"=r."recurringPlanId"
        WHERE p."businessId"=${businessId} AND p."isActive" AND p."id"<>${planId} AND r."isActive" AND r."sharedChargeGroupId"=s."sharedChargeGroupId"
        AND (r."label",r."amountCents",r."effectiveBillingCycle",r."endsAfterBillingCycle") IS DISTINCT FROM (s."label",s."amountCents",s."effectiveBillingCycle",s."endsAfterBillingCycle"))
      AND (SELECT COUNT(DISTINCT r."recurringPlanId") FROM "RecurringCharge" r JOIN "RecurringPlan" p ON p."id"=r."recurringPlanId" WHERE p."businessId"=${businessId} AND p."isActive" AND p."id"<>${planId} AND r."isActive" AND r."sharedChargeGroupId"=s."sharedChargeGroupId")
        = (SELECT COUNT(*) FROM "RecurringPlan" p WHERE p."businessId"=${businessId} AND p."isActive" AND p."id"<>${planId}) LIMIT 1`);
    if (inconsistent.length) throw new ConfigurationError("Shared charge evidence differs across tiers. Review it before adding a tier.");
    // Only groups actually present on every previous active tier are global.
    // Subset groups are not silently expanded when a new tier is added.
    await tx.$executeRaw(Prisma.sql`/* recurring-inherit-charges */
      INSERT INTO "RecurringCharge" ("id","recurringPlanId","sharedChargeGroupId","label","amountCents","effectiveBillingCycle","endsAfterBillingCycle","sortOrder","isActive","createdAt","updatedAt")
      SELECT 'rc_'||md5(${planId}||c."sharedChargeGroupId"),${planId},c."sharedChargeGroupId",c."label",c."amountCents",c."effectiveBillingCycle",c."endsAfterBillingCycle",c."sortOrder",true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM "RecurringCharge" c WHERE c."recurringPlanId"=${first.id} AND c."isActive" AND c."sharedChargeGroupId" IS NOT NULL
      AND (SELECT COUNT(DISTINCT r."recurringPlanId") FROM "RecurringCharge" r JOIN "RecurringPlan" p ON p."id"=r."recurringPlanId" WHERE p."businessId"=${businessId} AND p."isActive" AND p."id"<>${planId} AND r."isActive" AND r."sharedChargeGroupId"=c."sharedChargeGroupId")
        = (SELECT COUNT(*) FROM "RecurringPlan" p WHERE p."businessId"=${businessId} AND p."isActive" AND p."id"<>${planId})
      ON CONFLICT ("id") DO NOTHING`);
  }
  const created = await tx.recurringPlan.findUniqueOrThrow({ where: { id: planId }, include: { charges: true } });
  validatePlan(created);
}

export async function patchRecurringConfiguration(request: Request, section: "tiers" | "charges" | "billing") {
  try {
    const session = await managerSession();
    try { requireCredentialOrigin(request); } catch { throw new ConfigurationError("Invalid request origin.", 403); }
    let raw: unknown;
    try { raw = await readConfigurationJson(request); } catch (error) { if (error instanceof ConfigurationError) throw error; throw new ConfigurationError("Invalid request body.", 400); }
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) throw new ConfigurationError(parsed.error.issues[0]?.message ?? "Invalid configuration.", 400);
    const input = parsed.data;
    if ((input.operation === "tier" || input.operation === "removeTier" || input.operation === "advance") && section !== "tiers" || input.operation === "charge" && section !== "charges" || input.operation === "billing" && section !== "billing") throw new ConfigurationError("Invalid configuration operation.", 400);
    return await withManagerMutation(session, async tx => {
      const businessId = session.business!.id;
      const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      const operationId = "tier_op_"+createHash("sha256").update(businessId+":"+input.requestId).digest("hex");
      const previous = await tx.auditLog.findUnique({ where: { id: operationId } });
      if (previous) {
        const metadata = previous.metadata as { requestHash?: string; id?: string };
        if (previous.businessId !== businessId || metadata.requestHash !== requestHash) throw new ConfigurationError("This request ID was already used for different changes.");
        return Response.json({ saved: true, replayed: true, id: metadata.id });
      }
      let savedId: string | undefined;
      if (input.operation === "tier") {
        savedId = input.id ?? "tier_"+createHash("sha256").update(businessId+":"+input.requestId).digest("hex").slice(0, 48);
        if (await tx.recurringPlan.findFirst({ where: { businessId, name: { equals: input.name, mode: "insensitive" }, id: { not: savedId } } })) throw new ConfigurationError("Each rent tier must have a unique name.");
        if (input.id) {
          const plan = await ownedPlan(tx, businessId, input.id, input.version); validatePlan(plan, input.amountCents);
          await tx.recurringPlan.update({ where: { id: plan.id }, data: { name: input.name, baseAmountCents: input.amountCents } });
        } else {
          const last = await tx.recurringPlan.findFirst({ where: { businessId }, orderBy: { sortOrder: "desc" } });
          await tx.recurringPlan.create({ data: { id: savedId, businessId, name: input.name, baseAmountCents: input.amountCents,
            dueDay: 1, gracePeriodDays: 5, sortOrder: (last?.sortOrder ?? -1)+1 } });
          await inheritSharedConfiguration(tx, businessId, savedId);
        }
      } else if (input.operation === "removeTier") {
        const plan = await ownedPlan(tx, businessId, input.id, input.version);
        if (!await tx.recurringPlan.findFirst({ where: { businessId, isActive: true, id: { not: plan.id } } })) throw new ConfigurationError("Keep at least one active rent tier.", 400);
        await tx.recurringPlan.update({ where: { id: plan.id }, data: { isActive: false } }); savedId = plan.id;
      } else if (input.operation === "advance") {
        if (!await tx.recurringPlan.findFirst({ where: { businessId, isActive: true } })) throw new ConfigurationError("Add at least one rent tier.", 400);
        if (!session.business!.setupCompletedAt) await tx.business.update({ where: { id: businessId }, data: { setupStep:
          input.step === "tiers" ? SetupStep.CONFIGURE_RECURRING_CHARGES : input.step === "charges" ? SetupStep.CONFIGURE_RECURRING_BILLING : SetupStep.REVIEW_RECURRING } });
      } else if (input.operation === "billing") {
        if (input.shared) {
          if (await globalConfigurationVersion(tx, businessId) !== input.version) throw new ConfigurationError("Configuration changed. Reload before applying shared rules.");
          const legacy = await tx.recurringPlan.findFirst({ where: { businessId, isActive: true, OR: [{ dueDay: { not: 1 } }, { gracePeriodDays: { notIn: [3, 4, 5] } }] } });
          if (legacy && !input.confirmCalendarChange) throw new ConfigurationError("Confirm changing the existing billing calendar.");
          await tx.recurringPlan.updateMany({ where: { businessId, isActive: true }, data: input.rule }); await validateProperty(tx, businessId);
        } else {
          if (!input.id) throw new ConfigurationError("Select a rent tier.", 400);
          const plan = await ownedPlan(tx, businessId, input.id, input.version);
          if ((plan.dueDay !== 1 || ![3,4,5].includes(plan.gracePeriodDays)) && !input.confirmCalendarChange) throw new ConfigurationError("Confirm changing the existing billing calendar.");
          validatePlan({ ...plan, ...input.rule }); await tx.recurringPlan.update({ where: { id: plan.id }, data: input.rule }); savedId = plan.id;
        }
      } else {
        savedId = await saveCharge(tx, businessId, input);
      }
      await tx.auditLog.create({ data: { id: operationId, businessId, actorType: "MANAGER", actorId: session.manager!.id,
        action: "RECURRING_CONFIGURATION_UPDATED", targetType: "BUSINESS", targetId: businessId,
        metadata: { requestHash, operation: input.operation, ...(savedId ? { id: savedId } : {}) } } });
      return Response.json({ saved: true, id: savedId });
    });
  } catch (error) { return failure(error); }
}

async function saveCharge(tx: Prisma.TransactionClient, businessId: string, input: Extract<z.infer<typeof requestSchema>, { operation: "charge" }>) {
  const source = input.charge.id ? await tx.recurringCharge.findFirst({ where: { id: input.charge.id, isActive: true, recurringPlan: { businessId, isActive: true } } }) : null;
  if (input.charge.id && !source) throw new ConfigurationError("Recurring charge not found.", 404);
  if (source && source.recurringPlanId !== input.id) throw new ConfigurationError("Recurring charge belongs to another tier.", 400);
  const start = input.charge.effectiveBillingCycle !== undefined ? input.charge.effectiveBillingCycle : source?.effectiveBillingCycle ?? null;
  const end = input.charge.endsAfterBillingCycle !== undefined ? input.charge.endsAfterBillingCycle : source?.endsAfterBillingCycle ?? null;
  if (start && !isValidBillingCycle(start) || end && !isValidBillingCycle(end) || start && end && start > end) throw new ConfigurationError("Enter valid recurring charge billing cycles.", 400);
  const data = { label: input.charge.label, amountCents: input.charge.amountCents, effectiveBillingCycle: start, endsAfterBillingCycle: end };
  if (!input.shared) {
    const plan = await ownedPlan(tx, businessId, input.id, input.version);
    if (!source && !input.remove && plan.charges.length >= CHARGES_PER_TIER) throw new ConfigurationError("A tier cannot contain more than 250 active recurring charges.", 400);
    if (input.remove) { if (!source) throw new ConfigurationError("Select a recurring charge.", 400); await tx.recurringCharge.update({ where: { id: source.id }, data: { isActive: false } }); }
    else if (source) await tx.recurringCharge.update({ where: { id: source.id }, data: { ...data, sharedChargeGroupId: null } });
    else await tx.recurringCharge.create({ data: { id: "rc_"+createHash("sha256").update(businessId+input.requestId).digest("hex"), recurringPlanId: plan.id, ...data, sortOrder: plan.charges.length } });
    const fresh = await tx.recurringPlan.findUniqueOrThrow({ where: { id: plan.id }, include: { charges: true } }); validatePlan(fresh);
    return plan.id;
  }
  if (!await tx.recurringPlan.findFirst({ where: { id: input.id, businessId, isActive: true } })) throw new ConfigurationError("Rent tier not found.", 404);
  if (await globalConfigurationVersion(tx, businessId) !== input.version) throw new ConfigurationError("Configuration changed. Reload before applying a shared charge.");
  const group = source?.sharedChargeGroupId ?? "shared_"+createHash("sha256").update(businessId+input.requestId).digest("hex");
  if (source?.sharedChargeGroupId && !input.remove) {
    const different = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`/* recurring-shared-range */
      SELECT c."id" FROM "RecurringCharge" c JOIN "RecurringPlan" p ON p."id"=c."recurringPlanId"
      WHERE p."businessId"=${businessId} AND p."isActive" AND c."sharedChargeGroupId"=${group}
      AND (NOT c."isActive" OR c."effectiveBillingCycle" IS DISTINCT FROM ${start} OR c."endsAfterBillingCycle" IS DISTINCT FROM ${end}) LIMIT 1`);
    if (different.length) throw new ConfigurationError("Shared charge applicability differs across tiers. Review it before applying to all tiers.");
  }
  if (input.remove) {
    if (!source) throw new ConfigurationError("Select a recurring charge.", 400);
    if (source.sharedChargeGroupId) await tx.recurringCharge.updateMany({ where: { sharedChargeGroupId: group, recurringPlan: { businessId, isActive: true } }, data: { isActive: false } });
    else await tx.recurringCharge.update({ where: { id: source.id }, data: { isActive: false } });
  } else {
    if (source && !source.sharedChargeGroupId) await tx.recurringCharge.update({ where: { id: source.id }, data: { sharedChargeGroupId: group } });
    await tx.recurringCharge.updateMany({ where: { sharedChargeGroupId: group, recurringPlan: { businessId, isActive: true } }, data });
    await tx.$executeRaw(Prisma.sql`/* recurring-shared-charge */
      INSERT INTO "RecurringCharge" ("id","recurringPlanId","sharedChargeGroupId","label","amountCents","effectiveBillingCycle","endsAfterBillingCycle","sortOrder","isActive","createdAt","updatedAt")
      SELECT 'rc_'||md5(${group}||p."id"),p."id",${group},${data.label},${data.amountCents},${start},${end},
        COALESCE((SELECT MAX("sortOrder")+1 FROM "RecurringCharge" WHERE "recurringPlanId"=p."id"),0),true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      FROM "RecurringPlan" p WHERE p."businessId"=${businessId} AND p."isActive"
      AND NOT EXISTS (SELECT 1 FROM "RecurringCharge" c WHERE c."recurringPlanId"=p."id" AND c."sharedChargeGroupId"=${group}) ON CONFLICT ("id") DO NOTHING`);
    const excess = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`/* recurring-charge-count */ SELECT p."id" FROM "RecurringPlan" p JOIN "RecurringCharge" c ON c."recurringPlanId"=p."id"
      WHERE p."businessId"=${businessId} AND p."isActive" AND c."isActive" GROUP BY p."id" HAVING COUNT(*)>${CHARGES_PER_TIER} LIMIT 1`);
    if (excess.length) throw new ConfigurationError("A tier cannot contain more than 250 active recurring charges.", 400);
    await validateProperty(tx, businessId);
  }
  return input.id;
}
