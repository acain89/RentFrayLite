// Focused browser fixtures: no application server, database, provider or real authentication.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url), { chromium } = require("@playwright/test");
const { build } = createRequire(require.resolve("tsx/package.json"))("esbuild");
const root = process.cwd(), name = require(path.join(root, "package.json")).name;
const rf = name === "rent-platform", jf = name === "jobfray";
const brand = jf ? "JobFray" : rf ? "RentFray" : "RentFrayLite", origin = jf ? "https://jobfray.com" : "https://fixture.invalid";
const allowed = rf ? ["/", "/manager", "/manager/dashboard", "/tenant/dashboard", "/admin", "/maintenance/dashboard", "/r/portal"] : jf ? ["/", "/dashboard", "/admin"] : ["/", "/manager/dashboard", "/admin"];
const denied = ["/login", "/login/manager", "/register", "/setup", "/recover", "/reset-password", "/property-code", "/AB-1234", "/AB-1234/review", "/checkout", "/payment/success", "/confirmation", "/request/business/offering", "/sites/business", "/find", "/directory", "/terms", "/privacy", "/download", "/install", "/admin/requests", "/administrator", "/manager/dashboard/history"];
const worker = jf ? "ensureJobFrayWorker" : "ensureAppWorker";
const source = `import React from 'react';import{createRoot}from'react-dom/client';import{InstallApp}from'./components/InstallApp';${rf ? "import Pay from './app/components/PayNowButton';import{beginPaymentInteraction}from'./lib/pwaPaymentInteraction';import{InstallInstructions}from'./components/InstallInstructions';" : ""}
const identityFor=p=>{const role=p.startsWith('/tenant/')?'TENANT':(p==='/manager'||p.startsWith('/manager/'))?'MANAGER':p.startsWith('/admin')?'ADMIN':p==='/maintenance/dashboard'?'MAINTENANCE':p==='/r/portal'?'REPRESENTATIVE':p==='/dashboard'?'BUSINESS_OWNER':null;return role?{authenticated:true,subject:'pwa-fixture-'+role,role}:{authenticated:false,role:'PUBLIC'};};window.fixture={identity:identityFor(location.pathname),navigate(p){window.fixture.identity=identityFor(p);history.pushState(null,'',p);dispatchEvent(new Event('fixture-route'));},nativeCalls:0,workerRegistrations:0,requests:[],finishes:[]};window.alert=()=>{};
${rf ? "window.fixture.begin=()=>window.fixture.finishes.push(beginPaymentInteraction());window.fixture.end=()=>window.fixture.finishes.pop()?.();window.fetch=async(url,options)=>{window.fixture.requests.push({url,method:options.method,body:options.body});return new Promise(resolve=>{window.fixture.complete=()=>resolve(new Response(JSON.stringify({ok:false,error:'Synthetic request failure'}),{status:409}));window.fixture.completeSuccess=()=>resolve(new Response(JSON.stringify({ok:true,data:{url:location.href+'#checkout-handoff'}}),{status:200}));});};" : ""}
createRoot(document.getElementById('root')).render(<><main><h1>Mock-authenticated visibility fixture</h1>${rf ? "{location.pathname==='/tenant/dashboard'&&<Pay unitId='owned-fixture-unit' amount={103.95}/>} {location.pathname==='/install'&&<InstallInstructions><p>Add to Home Screen fixture guide</p></InstallInstructions>}" : ""}</main><InstallApp ${jf ? 'canonicalHost="jobfray.com"' : ''}/></>);`;
const result = await build({ stdin: { contents: source, resolveDir: root, loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "fixtures", setup(b) {
                b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
                b.onResolve({ filter: /^@\/lib\/pwa$/ }, () => ({ path: "worker", namespace: "fixture" }));
                b.onResolve({ filter: /^@\// }, a => { const base = path.join(root, a.path.slice(2)); return { path: [base + ".ts", base + ".tsx"].find(existsSync) ?? base }; });
                b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ resolveDir: root, loader: "js", contents: a.path === "navigation" ? `import{useSyncExternalStore}from'react';const subscribe=f=>{addEventListener('fixture-route',f);return()=>removeEventListener('fixture-route',f)};export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname,()=>'/');` : `export{InstallPrompt,isInstalled,isAppleMobile${jf ? ',isAppHost' : ''}}from${JSON.stringify(path.join(root, "lib/pwa.ts"))};export function ${worker}(){window.fixture.workerRegistrations++;return Promise.resolve({active:null,installing:null,waiting:null,addEventListener(){},removeEventListener(){}})}` }));
            } }] });
const html = '<html><body><div id="root"></div><script>' + result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script></body></html>';
const browser = await chromium.launch({ channel: "chrome", headless: true }), checks = [];
async function fixture(route, standalone = false, host = origin) { const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); if (standalone)
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true })); await context.route('**/*', r => r.fulfill({ contentType: 'text/html', body: html })); const page = await context.newPage(); await page.goto(host + route); await page.waitForTimeout(100); return { context, page }; }
try {
    const f = await fixture('/'), p = f.page, button = p.getByRole('button', { name: 'Install App', exact: true });
    for (const route of [...allowed, ...denied]) {
        await p.evaluate(route => window.fixture.navigate(route), route);
        await p.waitForTimeout(30);
        assert.equal(await button.count(), allowed.includes(route) ? 1 : 0, route);
        assert.equal(await p.locator('dialog[open]').count(), 0);
        if (allowed.includes(route) && route !== '/')
            assert.equal(await p.evaluate(() => window.fixture.identity.authenticated), true, 'protected page uses explicit mock identity');
        checks.push('route ' + route);
    }
    await p.evaluate(() => window.fixture.navigate('/'));
    await button.click();
    await p.getByRole('dialog').waitFor();
    await p.evaluate(() => window.fixture.navigate('/confirmation'));
    assert.equal(await p.locator('dialog[open]').count(), 0);
    checks.push('route change closes dialog');
    await f.context.close();
    for (const route of allowed) {
        const x = await fixture(route, true);
        assert.equal(await x.page.getByRole('button', { name: 'Install App', exact: true }).count(), 0);
        await x.context.close();
        checks.push('standalone ' + route);
    }
    const native = await fixture('/');
    await native.page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => { window.fixture.nativeCalls++; }; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); dispatchEvent(e); });
    assert.equal(await native.page.evaluate(() => window.fixture.nativeCalls), 0);
    await native.page.getByRole('button', { name: 'Install App', exact: true }).click();
    await native.page.getByRole('button', { name: 'Install ' + brand + ' on this device', exact: true }).click();
    await native.page.getByRole('status').filter({ hasText: 'Installation was dismissed.' }).waitFor();
    assert.equal(await native.page.evaluate(() => window.fixture.nativeCalls), 1);
    await native.context.close();
    checks.push('manual one-shot native dismissal');
    const offline = await fixture('/terms');
    await offline.context.setOffline(true);
    await offline.page.getByRole('status').filter({ hasText: 'You are offline.' }).waitFor();
    assert.equal(await offline.page.getByRole('button', { name: 'Install App', exact: true }).count(), 0);
    await offline.context.close();
    checks.push('prohibited route retains offline warning');
    if (jf) {
        const x = await fixture('/', false, 'https://business.jobfray.com');
        assert.equal(await x.page.getByRole('button', { name: 'Install App', exact: true }).count(), 0);
        assert.equal(await x.page.evaluate(() => window.fixture.workerRegistrations), 0);
        await x.context.close();
        checks.push('business hostname denied; no worker registration');
    }
    if (rf) {
        const x = await fixture('/tenant/dashboard'), pay = x.page.getByRole('button', { name: 'Verify Bank & Pay', exact: true });
        await pay.click();
        await x.page.waitForFunction(() => window.fixture.requests.length === 1);
        assert.equal(await x.page.getByRole('button', { name: 'Install App', exact: true }).count(), 0);
        assert.equal(await x.page.getByRole('button', { name: 'Opening secure payment...', exact: true }).isDisabled(), true);
        const requests = await x.page.evaluate(() => window.fixture.requests);
        assert.deepEqual(requests, [{ url: '/api/payments/create-session', method: 'POST', body: JSON.stringify({ unitId: 'owned-fixture-unit' }) }]);
        await x.page.evaluate(() => window.fixture.complete());
        await x.page.getByRole('button', { name: 'Install App', exact: true }).waitFor();
        await x.page.getByRole('button', { name: 'Install App', exact: true }).click();
        await x.page.evaluate(() => { window.fixture.begin(); window.fixture.begin(); });
        assert.equal(await x.page.locator('dialog[open]').count(), 0);
        await x.page.evaluate(() => window.fixture.end());
        assert.equal(await x.page.getByRole('button', { name: 'Install App', exact: true }).count(), 0);
        await x.page.evaluate(() => window.fixture.end());
        await x.page.getByRole('button', { name: 'Install App', exact: true }).waitFor();
        await pay.click();
        await x.page.waitForFunction(() => window.fixture.requests.length === 2);
        await x.page.evaluate(() => window.fixture.completeSuccess());
        await x.page.waitForFunction(() => location.hash === "#checkout-handoff");
        assert.equal(await x.page.getByRole("button", { name: "Install App", exact: true }).count(), 0);
        await x.page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
        await x.page.getByRole("button", { name: "Install App", exact: true }).waitFor();
        assert.equal(await x.page.locator("dialog[open]").count(), 0);
        checks.push("checkout handoff stays suppressed; browser-back restores idle without opening dialog");
        await x.context.close();
        checks.push('real PayNow request suppression/recovery and unchanged payload');
        checks.push('overlapping interaction closes dialog until all finish');
        for (const installed of [false, true]) {
            const g = await fixture('/install', installed);
            assert.equal(await g.page.getByText('Add to Home Screen fixture guide', { exact: true }).count(), installed ? 0 : 1);
            await g.context.close();
        }
        checks.push('dedicated guide hides invitations in standalone');
    }
    console.log(JSON.stringify({ platform: brand, passed: checks.length, failed: 0, fixture: 'mock-authenticated page shells; actual installation and RF payment components', checks }));
}
finally {
    await browser.close();
}
