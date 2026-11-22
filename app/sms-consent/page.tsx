import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Notification information", robots: { index: false, follow: false } };
export default function RetiredSmsPage() { return <main className="rfl-info-page"><section className="rfl-info-card"><h1>Text notifications have ended</h1><p>RentFrayLite no longer sends SMS messages. Managers can enable optional browser notifications from their dashboard. Existing payment and consent records are retained.</p><Link href="/login/manager">Manager login</Link></section></main>; }
