"use client";

import { useId, useRef, useState } from "react";

type Props = { href: string; label: string; className?: string };

export default function LogoutButton({ href, label, className }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const errorId = useId();

  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed.");
      window.location.assign(href);
    } catch {
      setError("Unable to sign out. Your session may still be active. Please try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <div>
    <button type="button" className={className} onClick={logout} disabled={pending}
      aria-describedby={error ? errorId : undefined} aria-busy={pending}>
      {pending ? "Signing out?" : label}
    </button>
    {error && <p id={errorId} role="alert">{error}</p>}
  </div>;
}
