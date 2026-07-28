import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Install on Your Phone",
  description:
    "Add RentFrayLite to your Android, iPhone, or iPad Home Screen.",
};

export default function DownloadPage() {
  return (
    <main className="rfl-info-page">
      <section className="rfl-info-card rfl-download-page">
        <header className="rfl-download-header">
          <p className="rfl-eyebrow">Mobile access</p>
          <h1>Put RentFrayLite on Your Home Screen</h1>
          <p>
            Add RentFrayLite to your phone for quick access without
            searching for the website each time.
          </p>
        </header>

        <div className="rfl-download-grid">
          <article className="rfl-download-card rfl-download-card-android">
            <div className="rfl-download-card-header">
              <div className="rfl-download-icon" aria-hidden="true">
                A
              </div>

              <div>
                <span className="rfl-download-badge">Android</span>
                <h2>Chrome instructions</h2>
              </div>
            </div>

            <ol className="rfl-download-steps">
              <li>
                <span>1</span>
                <p>Open RentFrayLite in Google Chrome.</p>
              </li>
              <li>
                <span>2</span>
                <p>
                  Tap the <strong>three-dot menu</strong> in the
                  upper-right corner.
                </p>
              </li>
              <li>
                <span>3</span>
                <p>
                  Tap <strong>Install app</strong> if shown.
                </p>
              </li>
              <li>
                <span>4</span>
                <p>
                  If Install app is not shown, tap{" "}
                  <strong>Add to Home screen</strong>.
                </p>
              </li>
              <li>
                <span>5</span>
                <p>
                  Confirm by tapping <strong>Install</strong> or{" "}
                  <strong>Add</strong>.
                </p>
              </li>
            </ol>

            <div className="rfl-download-note">
              RentFrayLite will appear with your other apps and will
              always open the current version of the site.
            </div>
          </article>

          <article className="rfl-download-card rfl-download-card-apple">
            <div className="rfl-download-card-header">
              <div className="rfl-download-icon" aria-hidden="true">
                i
              </div>

              <div>
                <span className="rfl-download-badge">iPhone / iPad</span>
                <h2>Safari instructions</h2>
              </div>
            </div>

            <ol className="rfl-download-steps">
              <li>
                <span>1</span>
                <p>Open RentFrayLite in Safari.</p>
              </li>
              <li>
                <span>2</span>
                <p>
                  Tap the <strong>Share</strong> button at the bottom of
                  the screen.
                </p>
              </li>
              <li>
                <span>3</span>
                <p>
                  Scroll down and tap{" "}
                  <strong>Add to Home Screen</strong>.
                </p>
              </li>
              <li>
                <span>4</span>
                <p>
                  Keep the name RentFrayLite and tap{" "}
                  <strong>Add</strong>.
                </p>
              </li>
            </ol>

            <div className="rfl-download-note">
              Apple requires this step to be completed from Safari.
              Chrome on iPhone does not provide the same Home Screen
              option.
            </div>
          </article>
        </div>

        <section className="rfl-download-help">
          <div className="rfl-download-help-icon" aria-hidden="true">
            ?
          </div>

          <div>
            <h2>Need help?</h2>
            <p>
              Email{" "}
              <a href="mailto:helpdesk@rentfray.com">
                helpdesk@rentfray.com
              </a>{" "}
              and we will help you get set up.
            </p>
          </div>
        </section>

        <div className="rfl-download-back">
          <Link href="/">Back to RentFrayLite</Link>
        </div>
      </section>
    </main>
  );
}