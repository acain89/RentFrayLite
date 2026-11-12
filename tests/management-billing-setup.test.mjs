import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { managementBillingHarness } from "./helpers/management-billing-harness.mjs";

const root = path.resolve(import.meta.dirname, "..");
const account = (overrides = {}) => ({ businessName: "Test Property", ownerName: "Test Manager", contactEmail: "property@example.test", managerEmail: "manager@example.test", password: "Isolated-passphrase1", confirmPassword: "Isolated-passphrase1", acceptedTerms: true, propertyTimeZone: "America/Chicago", ...overrides });
const plan = (id = "a", overrides = {}) => ({ id, businessId: "business", isActive: true, name: `Tier ${id}`, baseAmountCents: 100000, dueDay: 1, gracePeriodDays: 5, initialLateFeeCents: 0, dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0, charges: [], ...overrides });
const rule = (id = "a", overrides = {}) => ({ recurringPlanId: id, dueDay: 1, gracePeriodDays: 5, initialLateFeeCents: 0, dailyLateFeeCents: 0, dailyLateFeeMaxDays: 0, ...overrides });
const draft = (id = "a", overrides = {}) => ({ recurringPlanId: id, tierName: `Tier ${id}`, dueDay: "1", gracePeriodDays: "5", initialLateFee: "0.00", dailyLateFee: "0.00", dailyLateFeeMaxDays: "0", ...overrides });
const save = (h, rules, overrides = {}) => h.load("app/api/setup/recurring/billing/route.ts").PUT(h.request({ sameRulesForAll: false, rules, ...overrides }));
function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function find(tree, type, predicate = () => true) { const result = nodes(tree).find(node => node.type === type && predicate(node.props)); assert.ok(result, `Missing ${type}`); return result; }

for (const zone of ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "America/Adak", "Pacific/Honolulu"]) {
  test(`new management account validates and stores ${zone}`, async () => {
    const h = managementBillingHarness(); const response = await h.load("app/api/setup/route.ts").POST(h.request(account({ propertyTimeZone: zone })));
    assert.equal(response.status, 201); const [business] = h.state().businesses;
    assert.equal(business.propertyTimeZone, zone); assert.equal(business.firstStandardBillingDate.toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(h.state().managers[0].businessId, business.id);
  });
}
for (const value of [undefined, null, "", "Not/AZone", "Europe/London", "+05:00"]) test(`signup rejects unsupported timezone ${String(value)} without writes`, async () => {
  const h = managementBillingHarness(); const response = await h.load("app/api/setup/route.ts").POST(h.request(account({ propertyTimeZone: value })));
  assert.equal(response.status, 400); assert.deepEqual(h.writes, []);
});
for (const [createdAt, expected] of [["2026-10-01T05:00:00Z", "2026-11-01"], ["2026-10-15T12:00:00Z", "2026-11-01"], ["2026-11-01T04:59:59Z", "2026-11-01"], ["2026-12-31T23:00:00Z", "2027-01-01"]]) {
  test(`API derives first cycle from original createdAt ${createdAt}`, async () => {
    const h = managementBillingHarness({ createdAt: new Date(createdAt) });
    await h.load("app/api/setup/route.ts").POST(h.request(account({ firstStandardBillingDate: "2099-01-01", createdAt: "2098-12-01" })));
    assert.equal(h.state().businesses[0].firstStandardBillingDate.toISOString(), `${expected}T00:00:00.000Z`);
    assert.equal(h.state().businesses[0].createdAt.toISOString(), new Date(createdAt).toISOString());
  });
}
test("account creation rolls back if calendar persistence fails", async () => {
  const h = managementBillingHarness(); h.db.business.update = async () => { throw Error("Injected failure"); };
  await assert.rejects(() => h.load("app/api/setup/route.ts").POST(h.request(account())), /Injected failure/);
  assert.deepEqual(h.state().businesses, []); assert.deepEqual(h.state().managers, []);
});
test("signup for an existing manager never assigns calendar facts", async () => {
  const h = managementBillingHarness(); h.db.manager.findUnique = async () => ({ id: "existing-manager" });
  assert.equal((await h.load("app/api/setup/route.ts").POST(h.request(account()))).status, 409);
  assert.deepEqual(h.writes, []);
});
test("timezone selector displays Chicago without a hidden server default", () => {
  const h = managementBillingHarness(); const tree = h.renderClient("app/setup/SetupAccountClient.tsx", {});
  const select = find(tree, "select"); assert.equal(select.props.defaultValue, "America/Chicago"); assert.equal(select.props.name, "propertyTimeZone");
  assert.equal(nodes(select).filter(node => node.type === "option").length, 8);
  assert.doesNotMatch(renderToStaticMarkup(tree), /Start accepting payments in just/);
});

for (const grace of [3, 4, 5]) test(`billing API accepts ${grace} grace days and fixes due day`, async () => {
  const h = managementBillingHarness({ plans: [plan()] });
  const response = await save(h, [rule("a", { gracePeriodDays: grace, dueDay: undefined })]);
  assert.equal(response.status, 200); assert.equal(h.state().plans[0].dueDay, 1); assert.equal(h.state().plans[0].gracePeriodDays, grace);
});
for (const dueDay of [0, 2, 15, 31, "1", null]) test(`billing API rejects due day ${String(dueDay)}`, async () => {
  const h = managementBillingHarness({ plans: [plan()] }); assert.equal((await save(h, [rule("a", { dueDay })])).status, 400); assert.deepEqual(h.writes, []);
});
for (const grace of [0, 1, 2, 6, 60, 3.5, "5", null]) test(`billing API rejects grace ${String(grace)}`, async () => {
  const h = managementBillingHarness({ plans: [plan()] }); assert.equal((await save(h, [rule("a", { gracePeriodDays: grace })])).status, 400); assert.deepEqual(h.writes, []);
});
test("new tiers default to due day 1 and grace 5", async () => {
  const h = managementBillingHarness(); const response = await h.load("app/api/setup/recurring/tiers/route.ts").PUT(h.request({ tiers: [{ id: null, clientKey: "new", name: "Rent", amountCents: 100000 }] }));
  assert.equal(response.status, 200); assert.equal(h.state().plans[0].dueDay, 1); assert.equal(h.state().plans[0].gracePeriodDays, 5);
});
test("editing a legacy tier's name/price does not rewrite its calendar", async () => {
  const h = managementBillingHarness({ plans: [plan("a", { dueDay: 15, gracePeriodDays: 1 })] });
  const response = await h.load("app/api/setup/recurring/tiers/route.ts").PUT(h.request({ tiers: [{ id: "a", clientKey: "a", name: "Renamed", amountCents: 100000 }] }));
  assert.equal(response.status, 200); assert.equal(h.state().plans[0].dueDay, 15); assert.equal(h.state().plans[0].gracePeriodDays, 1);
});
test("legacy calendar conversion requires explicit confirmation and preserves Business facts", async () => {
  const h = managementBillingHarness({ plans: [plan("a", { dueDay: 15, gracePeriodDays: 1 })] }); const before = h.state();
  assert.equal((await save(h, [rule()])).status, 409); assert.deepEqual(h.state(), before);
  assert.equal((await save(h, [rule()], { confirmCalendarChange: true })).status, 200);
  assert.equal(h.state().plans[0].dueDay, 1); assert.equal(h.state().plans[0].gracePeriodDays, 5);
  assert.deepEqual(h.state().businesses, before.businesses); assert.equal(h.session.business.propertyTimeZone, undefined);
});
test("calendar consent is revalidated inside the management mutation boundary", async () => {
  const h = managementBillingHarness({ plans: [plan()] });
  h.mocks["@/lib/managerMutation"].withManagerMutation = async (_identity, fn) => {
    await h.db.recurringPlan.update({ where: { id: "a" }, data: { dueDay: 15 } });
    return h.db.$transaction(fn);
  };
  assert.equal((await save(h, [rule()])).status, 409);
  assert.equal(h.state().plans[0].dueDay, 15);
});
test("a failed tier update rolls back the entire billing save", async () => {
  const h = managementBillingHarness({ plans: [plan("a"), plan("b")] }); const before = h.state();
  const update = h.db.recurringPlan.update;
  h.db.recurringPlan.update = async args => { if (args.where.id === "b") throw Error("Injected update failure"); return update(args); };
  assert.equal((await save(h, [rule("a", { gracePeriodDays: 3 }), rule("b", { gracePeriodDays: 4 })])).status, 500);
  assert.deepEqual(h.state(), before);
});
test("shared settings must be identical; tier-specific settings remain independent", async () => {
  const h = managementBillingHarness({ plans: [plan("a"), plan("b")] });
  const rules = [rule("a", { gracePeriodDays: 3, initialLateFeeCents: 100 }), rule("b", { gracePeriodDays: 4 })];
  assert.equal((await save(h, rules, { sameRulesForAll: true })).status, 400); assert.deepEqual(h.writes, []);
  assert.equal((await save(h, rules)).status, 200); assert.equal(h.state().plans[0].gracePeriodDays, 3); assert.equal(h.state().plans[1].gracePeriodDays, 4);
  const shared = [rule("a", { gracePeriodDays: 5, initialLateFeeCents: 200, dailyLateFeeCents: 50, dailyLateFeeMaxDays: 2 }), rule("b", { gracePeriodDays: 5, initialLateFeeCents: 200, dailyLateFeeCents: 50, dailyLateFeeMaxDays: 2 })];
  assert.equal((await save(h, shared, { sameRulesForAll: true })).status, 200);
  for (const tier of h.state().plans) { assert.equal(tier.gracePeriodDays, 5); assert.equal(tier.initialLateFeeCents, 200); assert.equal(tier.dailyLateFeeCents, 50); assert.equal(tier.dailyLateFeeMaxDays, 2); }
});
test("foreign tier, duplicate tier and unauthenticated changes are rejected", async () => {
  const h = managementBillingHarness({ plans: [plan()] });
  assert.equal((await save(h, [rule("foreign")])).status, 400);
  assert.equal((await save(h, [rule(), rule()])).status, 400);
  h.authorize(false); assert.equal((await save(h, [rule()])).status, 401); assert.deepEqual(h.writes, []);
});
test("invalid daily fee configuration and excessive obligation are rejected", async () => {
  const h = managementBillingHarness({ plans: [plan()] });
  assert.equal((await save(h, [rule("a", { dailyLateFeeCents: 100, dailyLateFeeMaxDays: 0 })])).status, 400);
  assert.equal((await save(h, [rule("a", { initialLateFeeCents: 500000 })])).status, 400); assert.deepEqual(h.writes, []);
});

test("UI removes editable due day, offers only 3/4/5 and restores individual settings after shared mode", async () => {
  const h = managementBillingHarness(); const file = "app/setup/recurring/billing/RecurringBillingClient.tsx";
  const props = { initialRules: [draft("a", { gracePeriodDays: "3", initialLateFee: "10.00" }), draft("b", { gracePeriodDays: "4", initialLateFee: "20.00" })], highestReachedStep: 4 };
  let tree = h.renderClient(file, props); assert.equal(nodes(tree).some(n => n.props?.id?.startsWith("due-day-")), false);
  assert.deepEqual(nodes(find(tree, "select")).filter(n => n.type === "option").map(n => n.props.value), ["3", "4", "5"]);
  find(tree, "input", p => p.type === "checkbox").props.onChange({ target: { checked: true } }); tree = h.renderClient(file, props);
  find(tree, "select").props.onChange({ target: { value: "5" } }); tree = h.renderClient(file, props);
  await find(tree, "button", p => !!p.onClick).props.onClick(); assert.deepEqual(h.requests[0].rules.map(r => r.gracePeriodDays), [5, 5]);
  assert.deepEqual(h.requests[0].rules.map(r => r.initialLateFeeCents), [1000, 1000]);
  find(tree, "input", p => p.type === "checkbox").props.onChange({ target: { checked: false } }); tree = h.renderClient(file, props);
  await find(tree, "button", p => !!p.onClick).props.onClick(); assert.deepEqual(h.requests[1].rules.map(r => r.gracePeriodDays), [3, 4]);
  assert.deepEqual(h.requests[1].rules.map(r => r.initialLateFeeCents), [1000, 2000]);
});
test("viewing/editing legacy rules never autosaves or silently normalizes them", async () => {
  const h = managementBillingHarness(); const file = "app/setup/recurring/billing/RecurringBillingClient.tsx";
  const props = { initialRules: [draft("a", { dueDay: "15", gracePeriodDays: "1" })], highestReachedStep: 4 };
  let tree = h.renderClient(file, props); await h.flushAutosaves(); assert.equal(h.requests.length, 0);
  assert.match(renderToStaticMarkup(tree), /due day 15, grace period 1 days/);
  find(tree, "select").props.onChange({ target: { value: "5" } }); tree = h.renderClient(file, props); await h.flushAutosaves();
  await find(tree, "button", p => !!p.onClick).props.onClick(); assert.equal(h.requests.length, 0);
  find(tree, "input", p => p.type === "checkbox").props.onChange({ target: { checked: true } }); tree = h.renderClient(file, props); await h.flushAutosaves(); assert.equal(h.requests.length, 0);
  await find(tree, "button", p => !!p.onClick).props.onClick(); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].confirmCalendarChange, true); assert.equal(h.requests[0].rules[0].dueDay, 1);
});
test("billing page renders original legacy grace without clamping it", async () => {
  const h = managementBillingHarness({ plans: [plan("a", { gracePeriodDays: 0 })] });
  const tree = await h.load("app/setup/recurring/billing/page.tsx").default(); assert.equal(tree.props.initialRules[0].gracePeriodDays, "0"); assert.deepEqual(h.writes, []);
});
test("completion displays the stored date without timezone date-shift or immediate payment promise", async () => {
  const h = managementBillingHarness(); Object.assign(h.session.business, { setupCompletedAt: new Date(), propertyTimeZone: "America/Chicago", firstStandardBillingDate: new Date("2026-11-01T00:00:00Z") });
  const html = renderToStaticMarkup(await h.load("app/setup/complete/page.tsx").default());
  assert.match(html, /<h1>Account setup complete<\/h1>/);
  assert.match(html, /Your account is ready\. Your first standard billing cycle begins November 1, 2026\. Standard rent payments become available on that date\./);
  assert.doesNotMatch(html, /October 31|Start accepting payments/); assert.deepEqual(h.writes, []);
});
test("legacy completion neither assigns nor invents calendar facts", async () => {
  const h = managementBillingHarness(); h.session.business.setupCompletedAt = new Date();
  const html = renderToStaticMarkup(await h.load("app/setup/complete/page.tsx").default());
  assert.match(html, /existing billing settings remain unchanged/); assert.doesNotMatch(html, /first standard billing cycle begins/); assert.deepEqual(h.writes, []);
});
test("checkout calendar activation preserves Stripe architecture, fee schedules, sessions and legacy calendar", () => {
  const baseline = {
    "lib/platformFees.ts": "edfce7ee5ade6e926d1493b95a23ed9152a0448ec8cc3d42abc337aa8d968289",
    "lib/billingCalendar.ts": "5fff054e54879e5608f0c43c095ec9782d0a6e213325e14a524834afc2ee4538",
    "lib/session.ts": "2567b100872ce07a0b63fa4fefc8693a5f8dcddf4700e274d80acec7240b297e",
  };
  for (const [file, expected] of Object.entries(baseline)) {
    assert.equal(createHash("sha256").update(readFileSync(path.join(root, file), "utf8").replaceAll("\r\n", "\n")).digest("hex"), expected, file);
  }
});
