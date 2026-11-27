// Local PWA verification only. Never navigates to a provider or submits application forms.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import net from "node:net";
import { chromium } from "@playwright/test";
const pkg = JSON.parse(await readFile("package.json", "utf8")), jf = pkg.name === "jobfray", rf = pkg.name === "rent-platform";
const name = jf ? "JobFray" : rf ? "RentFray" : "RentFrayLite", worker = jf ? "/jobfray-sw.js" : rf ? "/sw.js" : "/manager-sw.js";
const probe = net.createServer(); await new Promise(r => probe.listen(0, "127.0.0.1", r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const origin = `http://127.0.0.1:${port}`, clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => ["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"].includes(k.toUpperCase())));
const env = { ...clean, NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "postgresql://isolated:isolated@127.0.0.1:9/pwa_isolated", SESSION_SECRET: "synthetic-pwa-session-secret-local-tests-only-123", STRIPE_SECRET_KEY: "sk_test_synthetic_pwa_local_not_a_credential", RESEND_API_KEY: "re_synthetic_pwa_local_not_a_credential", JOBFRAY_PUBLIC_ORIGIN: origin, ...(jf ? { JOBFRAY_SANDBOX: "1", JOBFRAY_LOCAL_TEST: "1" } : {}) };
const guard = process.env.PWA_NETWORK_GUARD ?? resolve("scripts/verification-network-guard.mjs");
let logs = "", browser, eligibilityContext;
const server = spawn(process.execPath, ["--import", pathToFileURL(guard).href, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", v => { logs += v; }); server.stderr.on("data", v => { logs += v; });
const results = { platform: name, checks: [], manifestErrors: [], installabilityErrors: [], consoleErrors: [], responsiveIssues: [] };
try {
    let up = false;
    for (let i = 0; i < 120; i++) { try { if ((await fetch(origin + "/manifest.webmanifest")).ok) { up = true; break; } } catch {} if (server.exitCode !== null) throw Error("Local server exited: " + logs); await new Promise(r => setTimeout(r, 250)); }
    assert.ok(up, "Local app ready");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const artifacts = process.env.PWA_ARTIFACT_DIR ?? "artifacts/pwa"; await mkdir(artifacts, { recursive: true });
    const context = await browser.newContext();
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(45000); page.on("pageerror", e => results.consoleErrors.push(e.message));
    await page.goto(origin + "/"); await page.getByRole("button", { name: "Install App", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0); // no automatic dialog
    if (!jf && !rf) {
        assert.equal(await page.getByRole("button", { name: "Install on your phone", exact: true }).count(), 0);
        const legacy = await context.request.get(origin + "/download", { maxRedirects: 0 });
        assert.equal(legacy.status(), 307); assert.equal(legacy.headers().location, "/");
    }
    const prohibited = await context.newPage();
    prohibited.on("pageerror", error => results.consoleErrors.push(error.message));
    for (const route of ["/terms", jf ? "/login" : "/login/manager"]) {
        const response = await prohibited.goto(origin + route); assert.equal(response.status(), 200, route); await prohibited.waitForTimeout(500);
        assert.equal(await prohibited.getByRole("button", { name: "Install App", exact: true }).count(), 0, route);
    }
    if (rf) {
        const guide = await prohibited.goto(origin + "/install"); assert.equal(guide.status(), 200);
        await prohibited.getByRole("heading", { name: "Get RentFray on your phone.", exact: true }).waitFor();
        assert.equal(await prohibited.getByRole("button", { name: "Install App", exact: true }).count(), 0);
    }
    await prohibited.close();
    results.checks.push("explicit allowed landing route; login/legal exclusion; legacy route correction");
    const manifest = await (await context.request.get(origin + "/manifest.webmanifest")).json();
    assert.equal(manifest.display, "standalone"); assert.equal(manifest.scope, "/");
    assert.equal((await context.request.get(origin + worker)).status(), 200);
    assert.match((await context.request.get(origin + worker)).headers()["cache-control"], /no-store|no-cache/);
    assert.ok(await page.locator('link[rel="apple-touch-icon"]').count()); assert.ok(await page.locator('meta[name="mobile-web-app-capable"][content="yes"],meta[name="apple-mobile-web-app-capable"][content="yes"]').count());
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.state === "activated");
    // Installation eligibility must use a fresh non-incognito profile; simulation cases stay isolated below.
    eligibilityContext = await chromium.launchPersistentContext(resolve(artifacts, "eligibility-profile-" + Date.now()), { channel: "chrome", headless: true });
    await eligibilityContext.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const eligibilityPage = await eligibilityContext.newPage(); await eligibilityPage.goto(origin + "/"); await eligibilityPage.waitForFunction(async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.state === "activated");
    // Chromium's installability API evaluates the activated scope; it does not require
    // this instrumentation tab to be controlled. Actual controlled/offline behavior is checked below.
    const cdp = await eligibilityContext.newCDPSession(eligibilityPage); const appManifest = await cdp.send("Page.getAppManifest"); results.manifestErrors = appManifest.errors ?? []; assert.equal(results.manifestErrors.length, 0);
    const eligibility = await cdp.send("Page.getInstallabilityErrors"); results.installabilityErrors = eligibility.installabilityErrors;
    assert.equal(eligibility.installabilityErrors.length, 0, "Chromium installation eligibility: " + JSON.stringify(eligibility));
    await eligibilityContext.close(); eligibilityContext = undefined;
    results.checks.push("manifest, Apple metadata, worker headers and real Chromium eligibility");
    for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 850 }); await page.getByRole("button", { name: "Install App", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Install " + name }); await dialog.waitFor(); const box = await dialog.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1); assert.ok(box.y >= 0 && box.y + box.height <= 851);
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
            results.responsiveIssues.push({ width, elements: await page.evaluate(() => Array.from(document.body.querySelectorAll("*")).map(el => ({ tag: el.tagName, class: typeof el.className === "string" ? el.className : "", right: el.getBoundingClientRect().right })).filter(el => el.right > innerWidth + 1).slice(0, 12)) });
        }
        if (jf || process.env.PWA_AXE_MODULE) {
            const { default: AxeBuilder } = await import(process.env.PWA_AXE_MODULE ?? "@axe-core/playwright");
            const accessibility = await new AxeBuilder({ page }).include(".pwa-install-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
            assert.equal(accessibility.violations.length, 0, JSON.stringify(accessibility.violations));
        }
        if (width === 390) await page.screenshot({ path: resolve(artifacts, "install-mobile.png"), fullPage: true });
        await page.keyboard.press("Tab"); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
        await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
        assert.equal(await page.getByRole("button", { name: "Install App", exact: true }).evaluate(el => el === document.activeElement), true);
    }
    results.checks.push("320/390/768/1280 responsive dialog, Escape and focus restoration");
    await page.evaluate(() => { globalThis.__pwaPromptCalls = 0; const event = new Event("beforeinstallprompt", { cancelable: true }); event.prompt = async () => { globalThis.__pwaPromptCalls++; }; event.userChoice = Promise.resolve({ outcome: "dismissed" }); window.dispatchEvent(event); });
    assert.equal(await page.evaluate(() => globalThis.__pwaPromptCalls), 0);
    await page.getByRole("button", { name: "Install App", exact: true }).click(); await page.getByRole("button", { name: "Install " + name + " on this device" }).click();
    await page.getByText("Installation was dismissed.", { exact: false }).waitFor(); assert.equal(await page.evaluate(() => globalThis.__pwaPromptCalls), 1);
    await page.getByRole("button", { name: "Close installation instructions" }).click();
    await page.getByRole("button", { name: "Install App", exact: true }).click(); assert.equal(await page.getByRole("button", { name: "Install " + name + " on this device" }).count(), 0);
    await page.getByRole("button", { name: "Close installation instructions" }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled"))); await page.getByRole("button", { name: "Install App", exact: true }).waitFor({ state: "hidden" });
    results.checks.push("simulated native event: user-action-only, one-shot dismissal, installed hiding");
    const ios = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", viewport: { width: 390, height: 844 } });
    await ios.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort()); const apple = await ios.newPage();
    await apple.goto(origin + "/"); await apple.getByRole("button", { name: "Install App", exact: true }).click(); await apple.getByText("Tap Share, then Add to Home Screen.", { exact: true }).waitFor();
    results.checks.push("simulated iOS instructions; no physical installation claimed");
    const standalone = await browser.newContext(); await standalone.addInitScript(() => { Object.defineProperty(navigator, "standalone", { value: true }); });
    await standalone.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort()); const installed = await standalone.newPage(); await installed.goto(origin + "/"); await installed.waitForTimeout(500); assert.equal(await installed.getByRole("button", { name: "Install App", exact: true }).count(), 0);
    if (rf) {
        await installed.goto(origin + "/install");
        await installed.getByText("RentFray is already installed. No installation is needed.", { exact: true }).waitFor();
        assert.equal(await installed.getByRole("heading", { name: "Get RentFray on your phone.", exact: true }).count(), 0);
    }
    if (!jf && !rf) {
        await installed.goto(origin + "/download"); assert.equal(new URL(installed.url()).pathname, "/");
        assert.equal(await installed.getByRole("button", { name: "Install App", exact: true }).count(), 0);
        assert.equal(await installed.getByRole("button", { name: "Install on your phone", exact: true }).count(), 0);
    }
    results.checks.push("simulated standalone hiding");
    const unsupported = await browser.newContext(); await unsupported.addInitScript(() => Object.defineProperty(window, "isSecureContext", { value: false }));
    await unsupported.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const fallback = await unsupported.newPage(); await fallback.goto(origin + "/"); await fallback.getByRole("button", { name: "Install App", exact: true }).click();
    await fallback.getByText("App installation is unavailable in this browser.", { exact: false }).waitFor(); results.checks.push("unsupported browser fallback");
    // A fresh client acquires the activated worker without claiming or disrupting the existing page.
    const livePage = await context.newPage(); await livePage.goto(origin + "/");
    try { await livePage.waitForFunction(() => navigator.serviceWorker.controller !== null); }
    catch {
        const state = await livePage.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration("/"); return { scope: registration?.scope, active: registration?.active?.state, script: registration?.active?.scriptURL, url: location.href }; });
        throw new Error("Controlled-client verification failed: " + JSON.stringify(state));
    }
    await context.setOffline(true); await livePage.getByRole("status").filter({ hasText: "You are offline." }).waitFor();
    await context.setOffline(false); await livePage.getByRole("status").filter({ hasText: "Connection restored." }).waitFor();
    await context.setOffline(true);
    if (jf || rf) { await livePage.goto(origin + "/pwa-offline-security-check?token=not-reflected"); await livePage.getByRole("heading", { name: "You are offline" }).waitFor(); assert.ok(!(await livePage.content()).includes("not-reflected")); }
    await context.setOffline(false); results.checks.push("offline warning; no cached private pages or submission queue");
    assert.equal(results.consoleErrors.length, 0, JSON.stringify(results.consoleErrors));
    console.log(JSON.stringify(results));
    assert.equal(results.responsiveIssues.length, 0, "Page horizontal overflow remains: " + JSON.stringify(results.responsiveIssues));
} finally {
    const artifacts = process.env.PWA_ARTIFACT_DIR ?? "artifacts/pwa";
    await mkdir(artifacts, { recursive: true }); await writeFile(resolve(artifacts, "browser.json"), JSON.stringify(results, null, 2));
    await eligibilityContext?.close(); await browser?.close(); if (server.exitCode === null) { const exited = new Promise(r => server.once("exit", r)); server.kill(); await exited; }
}
