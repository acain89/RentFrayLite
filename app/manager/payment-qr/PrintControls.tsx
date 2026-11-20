"use client";
import Link from "next/link";

export default function PrintControls() {
  return <nav className="rfl-qr-controls" aria-label="Print controls">
    <button className="rfl-primary-button" type="button" onClick={() => window.print()}>Print</button>
    <Link className="rfl-secondary-button" prefetch={false} href="/manager/dashboard">Back to dashboard</Link>
  </nav>;
}
