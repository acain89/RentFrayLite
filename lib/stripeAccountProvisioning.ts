import { readProvisioningAttempt, provisioningAttemptKey, storeProvisioningAttempt, safeStripeRequestId, STRIPE_CREATE_REPLAY_MS } from "@/lib/stripeProvisioningAttempt";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { StripeAccountProvisioning } from "@prisma/client";
import type Stripe from "stripe";
import { withManagerMutation, type ManagerMutationIdentity } from "@/lib/managerMutation";
import { classifyStripeCredentialMode, validateStripePaymentIdentity, type StripePaymentIdentity } from "@/lib/stripePaymentContext";

const OPTIONS: Stripe.RequestOptions = { timeout: 5000, maxNetworkRetries: 0 };
const SAFE_REPLAY_MS = STRIPE_CREATE_REPLAY_MS;
type Profile = "LEGACY_DESTINATION" | "DIRECT";
export class StripeProvisioningUnverified extends Error {}

export function accountProvisioningParameters(profile: Profile, input: { businessId: string; provisioningId: string; email: string; name: string }): Stripe.AccountCreateParams {
  const common = { country: "US", email: input.email, business_profile: { name: input.name },
    metadata: { rflBusinessId: input.businessId, rflProvisioningId: input.provisioningId, product: "RentFrayLite", rflProvisioningModel: profile } };
  if (profile === "LEGACY_DESTINATION") return { ...common, type: "express", capabilities: { transfers: { requested: true } } };
  if (profile !== "DIRECT") throw new StripeProvisioningUnverified("Unsupported account profile.");
  // Prepared for a separately authorized onboarding rollout. No active route
  // selects this profile; no existing connected account is updated or replaced.
  return { ...common, default_currency: "usd", controller: { fees: { payer: "account" }, losses: { payments: "stripe" },
    requirement_collection: "stripe", stripe_dashboard: { type: "full" } },
    capabilities: { card_payments: { requested: true }, us_bank_account_ach_payments: { requested: true } } };
}

async function readIdentity(stripe: Stripe, expected?: StripePaymentIdentity): Promise<StripePaymentIdentity> {
  const mode = classifyStripeCredentialMode(process.env.STRIPE_SECRET_KEY ?? "");
  if (mode === "unknown" || (process.env.NODE_ENV === "production" && mode !== "live")) throw new StripeProvisioningUnverified("Stripe environment is unverified.");
  const [account, balance] = await Promise.all([stripe.accounts.retrieve(OPTIONS), stripe.balance.retrieve({}, OPTIONS)]);
  const identity = expected ?? { platformAccountId: account.id, mode };
  validateStripePaymentIdentity(identity, { platformAccountId: account.id, livemode: balance.livemode, credentialMode: mode });
  return Object.freeze({ ...identity });
}

function verifyJournal(row: StripeAccountProvisioning, businessId: string, identity: StripePaymentIdentity, profile: Profile) {
  if (row.businessId !== businessId || row.stripePlatformAccountId !== identity.platformAccountId || row.stripeMode !== identity.mode ||
      row.chargeModel !== profile) throw new StripeProvisioningUnverified("Provisioning identity, environment or profile changed. No replacement account was created.");
  const parameters = readProvisioningAttempt(row).request;
  if (!parameters || typeof parameters !== "object" || !parameters.metadata || typeof parameters.metadata !== "object" || parameters.metadata.rflBusinessId !== businessId ||
      parameters.metadata?.rflProvisioningId !== row.id || parameters.metadata?.rflProvisioningModel !== profile ||
      parameters.metadata?.product !== "RentFrayLite") throw new StripeProvisioningUnverified("Provisioning request ownership is unverified.");
  return parameters;
}

function verifyAccount(account: Stripe.Account, row: StripeAccountProvisioning) {
  if (!/^acct_[A-Za-z0-9]+$/.test(account.id) || account.id === row.stripePlatformAccountId ||
      account.metadata?.rflBusinessId !== row.businessId || account.metadata?.rflProvisioningId !== row.id ||
      account.metadata?.product !== "RentFrayLite" || account.metadata?.rflProvisioningModel !== row.chargeModel) {
    throw new StripeProvisioningUnverified("Returned Stripe account ownership is unverified.");
  }
  if (row.chargeModel === "DIRECT" && (account.controller?.fees?.payer !== "account" || account.controller?.losses?.payments !== "stripe" ||
      account.controller?.requirement_collection !== "stripe" || account.controller?.stripe_dashboard?.type !== "full")) {
    throw new StripeProvisioningUnverified("Stripe did not confirm the requested direct-account responsibility configuration.");
  }
}

/** Durable prepare/execute boundary. Creation retries use ONLY the same journal,
 * frozen parameters, platform, mode and key. Business/Manager/Session locks are
 * retained across the external create, with auth checked again before commit. */
export async function provisionStripeConnectedAccount(identity: ManagerMutationIdentity, stripe: Stripe,
  profile: Profile = "LEGACY_DESTINATION", expectedIdentity?: StripePaymentIdentity) {
  if (profile === "DIRECT" && !expectedIdentity) throw new StripeProvisioningUnverified("An explicit platform identity is required for future direct provisioning.");
  const prepared = await withManagerMutation(identity, async tx => {
    const existing = await tx.stripeConnection.findUnique({ where: { businessId: identity.businessId! } });
    if (existing) return { existing, journal: null, platform: null, attemptKey: null };
    const platform = await readIdentity(stripe, expectedIdentity);
    let journal = await tx.stripeAccountProvisioning.findUnique({ where: { businessId: identity.businessId! } });
    if (!journal) {
      const business = await tx.business.findUnique({ where: { id: identity.businessId! } });
      if (!business) throw new StripeProvisioningUnverified("Business unavailable.");
      const id = randomUUID();
      journal = await tx.stripeAccountProvisioning.create({ data: { id, businessId: business.id, chargeModel: profile,
        stripePlatformAccountId: platform.platformAccountId, stripeMode: platform.mode,
        parameters: accountProvisioningParameters(profile, { businessId: business.id, provisioningId: id, email: business.contactEmail, name: business.name }) as Prisma.InputJsonValue } });
    }
    verifyJournal(journal, identity.businessId!, platform, profile);
    const state = readProvisioningAttempt(journal);
    if (!journal.stripeAccountId) {
      const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
      const age = now.getTime() - new Date(state.attempt.startedAt).getTime();
      if (!Number.isFinite(age) || age < 0 || age >= SAFE_REPLAY_MS || state.attempt.calls >= 1000000)
        throw new StripeProvisioningUnverified("Unconfirmed creation requires verified recovery; no new account was created.");
      journal = await tx.stripeAccountProvisioning.update({ where: { id: journal.id }, data: {
        parameters: storeProvisioningAttempt(state.request, { ...state.attempt, state: "IN_FLIGHT",
          calls: state.attempt.calls + 1, pendingCalls: state.attempt.pendingCalls + 1 }) as unknown as Prisma.InputJsonValue,
      } });
    }
    return { existing: null, journal, platform, attemptKey: provisioningAttemptKey(journal.id, state.attempt) };
  });
  if (prepared.existing) return prepared.existing;
  const outcome = await withManagerMutation(identity, async tx => {
    const existing = await tx.stripeConnection.findUnique({ where: { businessId: identity.businessId! } });
    if (existing) return { kind: "connected" as const, connection: existing };
    const journal = await tx.stripeAccountProvisioning.findUnique({ where: { id: prepared.journal!.id } });
    if (!journal) throw new StripeProvisioningUnverified("Provisioning reservation disappeared.");
    const parameters = verifyJournal(journal, identity.businessId!, prepared.platform!, profile);
    const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS now`);
    const state = readProvisioningAttempt(journal);
    const attemptKey = provisioningAttemptKey(journal.id, state.attempt);
    if (attemptKey !== prepared.attemptKey) throw new StripeProvisioningUnverified("Provisioning attempt changed. Reload before retrying.");
    const age = now.getTime() - new Date(state.attempt.startedAt).getTime();
    if (!journal.stripeAccountId && (!Number.isFinite(age) || age < 0 || age >= SAFE_REPLAY_MS)) {
      throw new StripeProvisioningUnverified("Stripe account creation is unconfirmed and its safe replay window has ended. Verify the existing account; no replacement was created.");
    }
    let account: Stripe.Account;
    if (journal.stripeAccountId) account = await stripe.accounts.retrieve(journal.stripeAccountId, OPTIONS);
    else {
      try { account = await stripe.accounts.create(structuredClone(parameters), { ...OPTIONS, idempotencyKey: attemptKey }); }
      catch (error) {
        // Every SDK creation failure remains unconfirmed, regardless of HTTP code.
        // Return the error until after commit so evidence is not rolled back.
        const requestId = safeStripeRequestId(error);
        await tx.stripeAccountProvisioning.update({ where: { id: journal.id }, data: {
          parameters: storeProvisioningAttempt(parameters, { ...state.attempt,
            state: state.attempt.pendingCalls > 1 ? "IN_FLIGHT" : "UNCONFIRMED", pendingCalls: state.attempt.pendingCalls - 1,
            ...(requestId ? { lastRequestId: requestId } : {}) }) as unknown as Prisma.InputJsonValue,
        } });
        await tx.auditLog.create({ data: { businessId: journal.businessId, actorType: "MANAGER", actorId: identity.managerId!,
          action: "STRIPE_ACCOUNT_CREATE_UNCONFIRMED", targetType: "STRIPE_ACCOUNT_PROVISIONING", targetId: journal.id,
          summary: "Account creation is unconfirmed; no replacement attempt authorized.",
          metadata: { attemptId: state.attempt.id, ...(requestId ? { requestId } : {}) },
        } });
        return { kind: "failed" as const, error };
      }
    }
    verifyAccount(account, journal);
    await tx.stripeAccountProvisioning.update({ where: { id: journal.id }, data: { stripeAccountId: account.id,
      parameters: storeProvisioningAttempt(parameters, { ...state.attempt, state: "READY", pendingCalls: 0 }) as unknown as Prisma.InputJsonValue } });
    const connection = await tx.stripeConnection.create({ data: { businessId: journal.businessId, stripeAccountId: account.id } });
    await tx.auditLog.create({ data: { businessId: journal.businessId, actorType: "MANAGER", actorId: identity.managerId!, action: "STRIPE_ACCOUNT_CREATED",
      targetType: "STRIPE_ACCOUNT", targetId: account.id, summary: profile === "DIRECT" ? "Direct-compatible connected account provisioned; payment activation remains separate." : "Stripe Express connected account created." } });
    return { kind: "connected" as const, connection };
  });
  if (outcome.kind === "failed") throw outcome.error;
  return outcome.connection;
}

/** Explicit server/operator recovery after the replay window. This does not
 * create accounts. Provider identity and both journal metadata IDs are checked. */
export async function recoverStripeProvisionedAccount(identity: ManagerMutationIdentity, stripe: Stripe, accountId: string, expectedIdentity: StripePaymentIdentity) {
  return withManagerMutation(identity, async tx => {
    if (!/^acct_[A-Za-z0-9]+$/.test(accountId)) throw new StripeProvisioningUnverified("Invalid recovery account identity.");
    const platform = await readIdentity(stripe, expectedIdentity);
    const existing = await tx.stripeConnection.findUnique({ where: { businessId: identity.businessId! } });
    if (existing) {
      if (existing.stripeAccountId !== accountId) throw new StripeProvisioningUnverified("An existing connected account cannot be replaced.");
      return existing;
    }
    const row = await tx.stripeAccountProvisioning.findUnique({ where: { businessId: identity.businessId! } });
    if (!row) throw new StripeProvisioningUnverified("No durable provisioning journal exists.");
    verifyJournal(row, identity.businessId!, platform, row.chargeModel);
    if (row.stripeAccountId && row.stripeAccountId !== accountId) throw new StripeProvisioningUnverified("Provisioned account cannot be replaced.");
    const account = await stripe.accounts.retrieve(accountId, OPTIONS); verifyAccount(account, row);
    await tx.stripeAccountProvisioning.update({ where: { id: row.id }, data: { stripeAccountId: account.id } });
    const connection = await tx.stripeConnection.create({ data: { businessId: row.businessId, stripeAccountId: account.id } });
    await tx.auditLog.create({ data: { businessId: row.businessId, actorType: "MANAGER", actorId: identity.managerId!, action: "STRIPE_ACCOUNT_RECOVERED",
      targetType: "STRIPE_ACCOUNT", targetId: account.id, summary: "Existing Stripe account recovered from independently verified provisioning ownership." } });
    return connection;
  });
}
