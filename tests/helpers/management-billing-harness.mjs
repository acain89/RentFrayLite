import { attachPublicBudgetStorage } from "./public-budget-storage.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");
const jsx = require("react/jsx-runtime");
const react = require("react");
export function managementBillingHarness({ createdAt = new Date("2026-10-15T12:00:00Z"), plans = [] } = {}) {
  let state = { businesses: [], managers: [], plans: structuredClone(plans), audits: [] };
  const writes = [], requests = [], timers = new Map(), pushes = [];
  const session = { id: "session", type: "MANAGER", manager: { id: "manager", businessId: "business" },
    business: { id: "business", createdAt, setupStep: "CONFIGURE_RECURRING_BILLING", setupCompletedAt: null } };
  const copy = value => structuredClone(value);
  const db = {
    business: {
      async create({ data }) { const row = { id: "business", createdAt, propertyTimeZone: null, firstStandardBillingDate: null, ...copy(data) }; state.businesses.push(row); writes.push("business.create"); return copy(row); },
      async update({ where, data }) { const row = state.businesses.find(item => item.id === where.id); if (!row) throw Error("Missing business"); Object.assign(row, copy(data)); writes.push("business.update"); return copy(row); },
    },
    manager: {
      async findUnique() { return null; },
      async create({ data }) { const row = { id: "manager", ...copy(data) }; state.managers.push(row); writes.push("manager.create"); return copy(row); },
    },
    auditLog: { async create({ data }) { state.audits.push(copy(data)); writes.push("audit.create"); return copy(data); } },
    recurringPlan: {
      async findMany({ where = {} } = {}) { return copy(state.plans.filter(plan => (!where.businessId || plan.businessId === where.businessId) && (where.isActive === undefined || plan.isActive === where.isActive) && (!where.id?.in || where.id.in.includes(plan.id)))); },
      async update({ where, data }) { const row = state.plans.find(plan => plan.id === where.id); if (!row) throw Error("Missing plan"); Object.assign(row, copy(data)); writes.push("plan.update"); return copy(row); },
      async updateMany({ where, data }) { let count = 0; for (const row of state.plans) { if (row.businessId === where.businessId && row.isActive && !where.id.notIn.includes(row.id)) { Object.assign(row, copy(data)); count++; } } return { count }; },
      async create({ data }) { const row = { id: `plan-${state.plans.length}`, charges: [], ...copy(data) }; state.plans.push(row); writes.push("plan.create"); return copy(row); },
    },
    async $queryRaw() { return []; },
    async $transaction(fn) { const original = copy(state); try { return await fn(db); } catch (error) { state = original; throw error; } },
  };
  attachPublicBudgetStorage(db);
  class Unauthorized extends Error {}
  let authorized = true;
  const cells = []; let cursor = 0; let effects = [];
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === "function" ? initial() : initial; return [cells[i], value => { cells[i] = typeof value === "function" ? value(cells[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++; if (!cells[i] || deps.some((value, j) => value !== cells[i][j])) effects.push(fn); cells[i] = deps; },
  };
  const mocks = {
    zod: require("zod"), "node:buffer": require("node:buffer"), "node:crypto": require("node:crypto"),
    "@prisma/client": { Prisma: require("@prisma/client").Prisma, SessionType: { MANAGER: "MANAGER" }, SetupStep: { CONFIGURE_RECURRING_TIERS: "CONFIGURE_RECURRING_TIERS", CONFIGURE_RECURRING_CHARGES: "CONFIGURE_RECURRING_CHARGES", REVIEW_RECURRING: "REVIEW_RECURRING" } },
    "@/lib/prisma": { prisma: db },
    "@/lib/password": { hashPassword: async () => "isolated-password-hash" },
    "@/lib/session": { createManagerSession: async () => {}, getCurrentSession: async () => authorized ? session : null },
    "@/lib/auth": { requireManager: async () => ({ business: session.business, session }) },
    "@/lib/managerMutation": { ManagerMutationUnauthorized: Unauthorized, withManagerMutation: async (_identity, fn) => { if (!authorized) throw new Unauthorized(); return db.$transaction(fn); } },
    "@/lib/businessPaymentReadiness": { loadBusinessPaymentReadiness: async () => ({ readiness: { title: "Payment account ready", ready: true, reasons: [] } }) },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "next/navigation": { useRouter: () => ({ push: url => pushes.push(url), replace: url => pushes.push(url), refresh() {} }), useSearchParams: () => new URLSearchParams(), redirect: url => { throw Error(`REDIRECT ${url}`); } },
    "next/link": { __esModule: true, default: props => react.createElement("a", props, props.children) },
    "@/components/setup/SetupProgress": { __esModule: true, default: () => null },
    "@/components/setup/PaginatedRecurringConfiguration": { __esModule: true, default: () => null },
    react: hooks, "react/jsx-runtime": jsx,
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const compiled = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), {
      fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const loaded = { exports: {} }; cache.set(file, loaded.exports);
    const importer = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith("@/lib/")) return load(`${name.slice(2)}.ts`);
      if (name.startsWith(".")) {
        const target = path.posix.join(path.posix.dirname(file), name);
        return load(`${target}.tsx`);
      }
      throw Error(`Forbidden dependency: ${name}`);
    };
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
      process: {env: {NEXT_PUBLIC_BASE_URL:"https://example.test",STRIPE_SECRET_KEY:"sk_test_signup_fixture"}}, setTimeout, clearTimeout, TextDecoder, Uint8Array, Date, Intl, RangeError, TypeError, Response, Request, URL, URLSearchParams, FormData,
      window: { setTimeout: fn => { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) },
      fetch: async (url, options) => { if (!["/api/setup", "/api/setup/recurring/billing"].includes(url)) throw Error("External access forbidden"); requests.push(JSON.parse(options.body)); return Response.json({ saved: true, redirectTo: "/setup/recurring/review" }); },
    })(importer, loaded, loaded.exports);
    cache.set(file, loaded.exports); return loaded.exports;
  }
  return {
    db, session, writes, requests, pushes, load, mocks,
    state: () => copy(state), authorize: value => { authorized = value; },
    request: body => new Request("https://example.test/api", { method: "POST", headers: {"content-type":"application/json",origin:"https://example.test"}, body: JSON.stringify({ ...body,
      ...(Array.isArray(body?.tiers)||Array.isArray(body?.rules)?{expectedVersion:body.expectedVersion??load("lib/recurringConfiguration.ts").configurationFingerprint(state.plans.filter(p=>p.businessId==="business"&&p.isActive))}:{}) }) }),
    renderClient(file, props) { cursor = 0; effects = []; const tree = load(file).default(props); effects.forEach(fn => fn()); return tree; },
    async flushAutosaves() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); },
  };
}
