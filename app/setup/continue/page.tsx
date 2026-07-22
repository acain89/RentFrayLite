import Link from "next/link";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import {
  getSetupResumeDetails,
  getSetupRoute,
} from "@/lib/setupProgress";

export default async function ContinueSetupPage() {
  const { business } = await requireManager();

  const route = getSetupRoute(business);

  if (route === "/manager/dashboard") {
    redirect("/manager/dashboard");
  }

  const details = getSetupResumeDetails(business);

  return (
    <main className="rfl-setup-page">
      <section className="rfl-resume-card">
        <div className="rfl-resume-icon" aria-hidden="true">
          ↻
        </div>

        <header className="rfl-resume-header">
          <h1>Continue where you left off</h1>
          <p>
            You have setup in progress. Continue where you
            left off to finish setting up your account.
          </p>
        </header>

        <div className="rfl-resume-step">
          <div>
            <strong>
              Step {details.stepNumber} of {details.totalSteps}
            </strong>
            <span>{details.title}</span>
          </div>

          <span className="rfl-resume-arrow" aria-hidden="true">
            ›
          </span>
        </div>

        <Link
          className="rfl-primary-button rfl-link-button"
          href={details.route}
        >
          Continue where you left off
        </Link>

        <form action="/api/auth/logout" method="post">
          <button className="rfl-resume-signout" type="submit">
            Sign in with another account
          </button>
        </form>
      </section>
    </main>
  );
}