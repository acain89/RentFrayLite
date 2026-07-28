import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="rfl-site-footer">
      <div className="rfl-site-footer-inner">
        <p>
          Â© {new Date().getFullYear()} RentFrayLite
        </p>

        <nav aria-label="Legal and support">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/security">Security</Link>
          <Link href="/support">Support</Link>
          <Link href="/contact">Contact</Link>
        </nav>
      </div>
    </footer>
  );
}