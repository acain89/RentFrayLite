"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ensureAppWorker, InstallPrompt, isAppleMobile, isInstalled, type InstallPromptEvent } from "@/lib/pwa";

export function InstallApp() {
    const [available, setAvailable] = useState(false), [installed, setInstalled] = useState(false);
    const [ready, setReady] = useState(false), [apple, setApple] = useState(false), [supported, setSupported] = useState(false);
    const [needsRefresh, setNeedsRefresh] = useState(false);
    const [message, setMessage] = useState(""), [offline, setOffline] = useState(false), [busy, setBusy] = useState(false);
    const prompt = useRef(new InstallPrompt()), requesting = useRef(false), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null), title = useId();
    useEffect(() => {
        const display = window.matchMedia("(display-mode: standalone)");
        let observedInstall = false, disposed = false, wentOffline = !navigator.onLine, releaseWorkerListeners = () => {};
        const sync = () => {
            const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
            const done = observedInstall || isInstalled(display.matches, standalone);
            if (done) dialog.current?.close();
            if (!navigator.onLine) wentOffline = true;
            setInstalled(done); setReady(true); setOffline(!navigator.onLine); setNeedsRefresh(navigator.onLine && wentOffline);
            setApple(isAppleMobile(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
            setSupported(window.isSecureContext && "serviceWorker" in navigator);
        };
        const capture = (event: Event) => { prompt.current.capture(event as InstallPromptEvent); setAvailable(true); };
        const completed = () => { observedInstall = true; prompt.current.clear(); setAvailable(false); sync(); };
        const timer = window.setTimeout(sync, 0);
        window.addEventListener("beforeinstallprompt", capture);
        window.addEventListener("appinstalled", completed);
        window.addEventListener("online", sync); window.addEventListener("offline", sync); window.addEventListener("pageshow", sync);
        display.addEventListener("change", sync);
        if (window.isSecureContext && "serviceWorker" in navigator) {
            void ensureAppWorker().then(registration => {
                if (disposed) return;
                const waiting = () => { if (registration.waiting) setMessage("An app update is ready. Finish your work, close all RentFrayLite tabs and reopen the app to update safely."); };
                let installing: ServiceWorker | null = null;
                const changed = () => { if (installing?.state === "installed" && registration.active) waiting(); };
                const found = () => { installing?.removeEventListener("statechange", changed); installing = registration.installing; installing?.addEventListener("statechange", changed); };
                waiting(); found(); registration.addEventListener("updatefound", found);
                releaseWorkerListeners = () => { registration.removeEventListener("updatefound", found); installing?.removeEventListener("statechange", changed); };
            }).catch(() => { if (!disposed) setMessage("App setup is unavailable right now. You can continue using RentFrayLite online and retry later."); });
        }
        return () => {
            disposed = true; clearTimeout(timer); releaseWorkerListeners();
            window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", completed);
            window.removeEventListener("online", sync); window.removeEventListener("offline", sync); window.removeEventListener("pageshow", sync);
            display.removeEventListener("change", sync);
        };
    }, []);
    const install = async () => {
        if (requesting.current || !prompt.current.available) return;
        requesting.current = true; setBusy(true); setAvailable(false);
        try {
            const result = await prompt.current.request();
            setMessage(result === "accepted" ? "Installation requested. Your browser will confirm when it is complete." : "Installation was dismissed. You can keep using RentFrayLite in your browser.");
        } catch { setMessage("Installation could not be opened. Try your browser's install menu instead."); }
        finally { requesting.current = false; setBusy(false); close.current?.focus(); }
    };
    if (!ready) return null;
    return <>
        {offline && <p className="pwa-offline" role="status">You are offline. Displayed information may be out of date. Reconnect before submitting changes or making payments.</p>}
        {needsRefresh && <p className="pwa-offline" role="status">Connection restored. Refresh to load current information before submitting changes or payments. <button type="button" onClick={() => location.reload()}>Reload current information</button></p>}
        {!installed && <div className="pwa-install-control">
            <button ref={trigger} type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>Install App</button>
            <dialog ref={dialog} className="pwa-install-dialog" aria-labelledby={title} onClose={() => trigger.current?.focus()} onKeyDown={event => {
                if (event.key !== "Tab") return;
                const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
                const first = buttons[0], last = buttons[buttons.length - 1];
                if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); return; }
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }}>
                <h2 id={title}>Install RentFrayLite</h2>
                <p>Add RentFrayLite to your device for quick access to your dashboard. An internet connection is required for current information and all submissions.</p>
                {!supported ? <p>App installation is unavailable in this browser. Use RentFrayLite online, or open this site in a supported browser over HTTPS.</p>
                    : apple ? <ol><li>Open RentFrayLite in Safari on your iPhone or iPad.</li><li>Tap Share, then Add to Home Screen.</li><li>Keep Open as Web App enabled if offered, then tap Add.</li><li>Open RentFrayLite from your Home Screen and sign in there if asked.</li></ol>
                    : available ? <button type="button" disabled={busy} onClick={() => void install()}>Install RentFrayLite on this device</button>
                    : <p>If your browser offers Install App or Add to Home Screen, choose it from the browser menu. On supported desktop Safari, use File → Add to Dock. If no installation option is available, keep using RentFrayLite in your browser.</p>}
                <p>Installation does not enable notifications. Enable optional ACH notifications separately in your manager dashboard.</p>
                <p role="status">{message}</p>
                <button ref={close} type="button" onClick={() => dialog.current?.close()}>Close installation instructions</button>
            </dialog>
        </div>}
    </>;
}
