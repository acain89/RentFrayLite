import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const root = process.cwd(), packageName = JSON.parse(readFileSync("package.json", "utf8")).name;
const jf = packageName === "jobfray", rf = packageName === "rent-platform";
const workerPath = jf ? "/jobfray-sw.js" : rf ? "/sw.js" : "/manager-sw.js";
function moduleAt(file, globals = {}) {
    const code = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, URL, setTimeout, clearTimeout, isSecureContext: true, location: { origin: "https://app.example.test" }, ...globals });
    return exports;
}
const pwa = moduleAt("lib/pwa.ts");
test("standalone detection covers browser display and iOS without a stored installed flag", () => {
    assert.equal(pwa.isInstalled(true, false), true); assert.equal(pwa.isInstalled(false, true), true); assert.equal(pwa.isInstalled(false, false), false);
    assert.equal(pwa.isAppleMobile("iPhone", "iPhone", 1), true); assert.equal(pwa.isAppleMobile("desktop", "MacIntel", 5), true);
    assert.equal(pwa.isAppleMobile("desktop", "MacIntel", 0), false); assert.equal(pwa.isAppleMobile("Android", "Linux", 5), false);
});
test("native prompts require a user action, are single-use and cannot be repeated after dismissal", async () => {
    const prompt = new pwa.InstallPrompt(); let prevented = 0, calls = 0;
    prompt.capture({ preventDefault: () => prevented++, prompt: async () => { calls++; }, userChoice: Promise.resolve({ outcome: "dismissed" }) });
    assert.equal(calls, 0); assert.equal(prevented, 1); assert.equal(prompt.available, true);
    const outcomes = await Promise.all([prompt.request(), prompt.request()]);
    assert.equal(outcomes[0], "dismissed"); assert.equal(outcomes[1], null); assert.equal(calls, 1); assert.equal(prompt.available, false);
    prompt.capture({ preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: "accepted" }) });
    assert.equal(await prompt.request(), "accepted"); prompt.clear(); assert.equal(await prompt.request(), null);
});
test("registration is shared, root-scoped, update-cache bypassed, and never replaces another worker", async () => {
    let calls = 0;
    const registration = { active: { scriptURL: "https://app.example.test" + workerPath } };
    const serviceWorker = { getRegistration: async () => registration, register: async (url, options) => { calls++; assert.equal(url, workerPath); assert.equal(options.scope, "/"); assert.equal(options.updateViaCache, "none"); return registration; } };
    const client = moduleAt("lib/pwa.ts", { navigator: { serviceWorker } });
    const ensure = client.ensureJobFrayWorker ?? client.ensureAppWorker;
    const [a, b] = await Promise.all([ensure(), ensure()]); assert.equal(a, b); assert.equal(calls, 1);
    const conflicting = moduleAt("lib/pwa.ts", { navigator: { serviceWorker: { ...serviceWorker, getRegistration: async () => ({ active: { scriptURL: "https://app.example.test/other-sw.js" } }) } } });
    await assert.rejects((conflicting.ensureJobFrayWorker ?? conflicting.ensureAppWorker)(), /operator review/); assert.equal(calls, 1);
    const unsupported = moduleAt("lib/pwa.ts", { navigator: {}, isSecureContext: false });
    await assert.rejects((unsupported.ensureJobFrayWorker ?? unsupported.ensureAppWorker)(), /secure, supported/);
});
test("manifest identity, scope, launch URL and real approved icon dimensions are valid", () => {
    const manifest = jf ? JSON.parse(readFileSync("app/manifest.webmanifest", "utf8")) : moduleAt("app/manifest.ts").default();
    assert.equal(manifest.display, "standalone"); assert.equal(manifest.scope, "/"); assert.ok(manifest.id);
    for (const value of [manifest.start_url, manifest.scope, manifest.id]) {
        const url = new URL(value, "https://app.example.test"); assert.equal(url.origin, "https://app.example.test"); assert.equal(url.search, ""); assert.equal(url.hash, "");
    }
    assert.equal(manifest.start_url, jf ? "/dashboard" : rf ? "/" : "/manager/dashboard");
    assert.ok(/^#[0-9a-f]{6}$/i.test(manifest.theme_color)); assert.ok(/^#[0-9a-f]{6}$/i.test(manifest.background_color));
    for (const dimension of [192, 512]) assert.ok(manifest.icons.some(icon => icon.sizes === `${dimension}x${dimension}`));
    assert.ok(manifest.icons.some(icon => icon.purpose?.includes("maskable")));
    for (const icon of manifest.icons) {
        const png = readFileSync(path.join(root, "public", icon.src)); assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
        const [width, height] = icon.sizes.split("x").map(Number); assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
    }
});
function worker() {
    const listeners = {}, displayed = [], opened = [], deleted = [], markers = new Map(); let networkCalls = 0, authorize = false, offline = false, responseStatus = 200;
    const cache = { match: async key => markers.get(key.url), put: async (key, value) => markers.set(key.url, value), keys: async () => [...markers.keys()].map(url => new Request(url)), delete: async key => markers.delete(key.url) };
    const self = { location: { origin: "https://app.example.test" }, registration: { showNotification: async (...args) => displayed.push(args) }, addEventListener: (name, fn) => { listeners[name] = fn; }, clients: { openWindow: async url => opened.push(url), matchAll: async () => [] }, skipWaiting: () => { throw Error("Forced activation forbidden"); } };
    const caches = { open: async name => { assert.equal(name, "jf-push-dedup-v1"); return cache; }, delete: async name => { deleted.push(name); return true; } };
    vm.runInNewContext(readFileSync(path.join(root, "public", workerPath), "utf8"), { self, clients: self.clients, URL, Request, Response, caches, fetch: async (_request, options) => { networkCalls++; assert.equal(options.cache, "no-store"); if (offline) throw Error("Offline"); return jf || rf ? new Response("fresh", { status: responseStatus }) : Response.json({ authorized: authorize }); } });
    return { listeners, displayed, opened, deleted, markers, setOffline: value => { offline = value; }, setAuthorized: value => { authorize = value; }, setStatus: value => { responseStatus = value; }, get calls() { return networkCalls; } };
}
test("worker updates never force activation or reload; RF removes only its obsolete cache", async () => {
    const w = worker(); assert.equal(w.listeners.install, undefined); let pending;
    if (w.listeners.activate) { w.listeners.activate({ waitUntil: value => { pending = value; } }); await pending; }
    assert.equal(w.deleted.join(","), rf ? "rentfray-pwa-v1" : "");
});
test("private data stays network-only, navigation failures are generic, and writes never queue", async () => {
    const w = worker();
    if (!jf && !rf) { assert.equal(w.listeners.fetch, undefined); return; }
    async function navigate(url) { let pending; w.listeners.fetch({ request: { method: "GET", mode: "navigate", url }, respondWith: value => { pending = value; } }); return pending; }
    for (const route of ["/dashboard", "/tenant/pay", "/payment", "/confirmation#private"]) assert.equal(await (await navigate("https://app.example.test" + route)).text(), "fresh");
    w.setStatus(401); assert.equal((await navigate("https://app.example.test/dashboard")).status, 401);
    const before = w.calls;
    for (const [method, mode] of [["POST", "navigate"], ["GET", "cors"]]) w.listeners.fetch({ request: { method, mode, url: "https://app.example.test/api/payment" }, respondWith: () => assert.fail("API or write intercepted") });
    assert.equal(w.calls, before); w.setOffline(true);
    const response = await navigate("https://app.example.test/confirmation?token=DO_NOT_REFLECT");
    assert.equal(response.status, 503); assert.match(response.headers.get("cache-control"), /no-store/);
    const body = await response.text(); assert.match(body, /offline/); assert.ok(!body.includes("DO_NOT_REFLECT")); assert.equal(w.markers.size, 0);
});
test("existing push handlers retain fixed private messages, deduplication and session checks", async () => {
    const w = worker(); if (rf) { assert.equal(w.listeners.push, undefined); return; }
    async function push(payload) { let pending; w.listeners.push({ data: { json: () => payload }, waitUntil: value => { pending = value; } }); await pending; }
    await push(null); assert.equal(w.displayed.length, 0);
    const payload = jf ? { deliveryKey: "a".repeat(64), url: "https://attacker.test" } : { kind: "PENDING", tag: "rfl-ach-" + "a".repeat(64) };
    if (!jf) { await push(payload); assert.equal(w.displayed.length, 0); w.setAuthorized(true); }
    await push(payload); assert.equal(w.displayed.length, 1);
    if (jf) { await push(payload); assert.equal(w.displayed.length, 1); }
    assert.ok(!JSON.stringify(w.displayed).includes("attacker"));
    let pending; w.listeners.notificationclick({ notification: { close() {} }, waitUntil: value => { pending = value; } }); await pending;
    assert.ok(w.opened[0].endsWith(jf ? "/dashboard" : "/manager/dashboard"));
});
