/** Browser capability checks, independent of notification permission and authentication. */
export function isAppleMobile(userAgent: string, platform: string, touchPoints: number): boolean {
    return /iPad|iPhone|iPod/.test(userAgent) || platform === "MacIntel" && touchPoints > 1;
}
export function isInstalled(standaloneDisplay: boolean, appleStandalone: boolean): boolean {
    return standaloneDisplay || appleStandalone;
}
export interface InstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
/** A deferred browser prompt can only be consumed once, and only after a user action. */
export class InstallPrompt {
    private pending: InstallPromptEvent | null = null;
    capture(event: InstallPromptEvent) { event.preventDefault(); this.pending = event; }
    get available() { return this.pending !== null; }
    clear() { this.pending = null; }
    async request() {
        const event = this.pending;
        this.clear();
        if (!event) return null;
        await event.prompt();
        return (await event.userChoice).outcome;
    }
}
export const WORKER_PATH = "/manager-sw.js";
let registration: Promise<ServiceWorkerRegistration> | undefined;
/** Installation and Web Push share the existing root worker; never replace another worker. */
export function ensureAppWorker(): Promise<ServiceWorkerRegistration> {
    if (!globalThis.isSecureContext || !("serviceWorker" in navigator))
        return Promise.reject(new Error("App installation requires a secure, supported browser."));
    registration ??= (async () => {
        const expected = new URL(WORKER_PATH, location.origin).href;
        const existing = await navigator.serviceWorker.getRegistration("/");
        if (existing && [existing.active, existing.installing, existing.waiting].some(worker => worker && worker.scriptURL !== expected))
            throw new Error("An existing app worker requires operator review.");
        return navigator.serviceWorker.register(WORKER_PATH, { scope: "/", updateViaCache: "none" });
    })().catch(error => { registration = undefined; throw error; });
    return registration;
}
/** Push subscription requires an activated worker, including on a first visit. */
export async function readyAppWorker(): Promise<ServiceWorkerRegistration> {
    await ensureAppWorker();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("App worker is not ready. Please retry.")), 20000); }),
        ]);
    } finally { clearTimeout(timer); }
}
