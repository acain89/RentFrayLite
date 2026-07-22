import Link from "next/link";

type SetupProgressProps = {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  highestReachedStep: 1 | 2 | 3 | 4 | 5 | 6 | 7;
};

type SetupStage = {
  label: string;
  href: string | null;
};

const steps: SetupStage[] = [
  {
    label: "Account",
    href: null,
  },
  {
    label: "Tiers",
    href: "/setup/recurring/tiers",
  },
  {
    label: "Charges",
    href: "/setup/recurring/charges",
  },
  {
    label: "Billing",
    href: "/setup/recurring/billing",
  },
  {
    label: "Review",
    href: "/setup/recurring/review",
  },
  {
    label: "Stripe",
    href: "/setup/stripe",
  },
  {
    label: "Code",
    href: "/setup/account-code",
  },
];

export default function SetupProgress({
  currentStep,
  highestReachedStep,
}: SetupProgressProps) {
  return (
    <nav
      className="rfl-setup-progress"
      aria-label="Account setup progress"
    >
      <ol>
        {steps.map((step, index) => {
          const stepNumber = (index + 1) as
            | 1
            | 2
            | 3
            | 4
            | 5
            | 6
            | 7;

          const active = stepNumber === currentStep;
          const reached = stepNumber <= highestReachedStep;
          const previouslyCompleted =
            stepNumber < highestReachedStep;

          const clickable =
            step.href !== null && reached;

          const content = (
            <>
              <span className="rfl-progress-marker">
                {previouslyCompleted ? "✓" : stepNumber}
              </span>

              <span className="rfl-progress-label">
                {step.label}
              </span>
            </>
          );

          return (
            <li
              key={step.label}
              className={[
                reached ? "rfl-progress-reached" : "",
                previouslyCompleted
                  ? "rfl-progress-complete"
                  : "",
                active ? "rfl-progress-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={active ? "step" : undefined}
            >
              {clickable && step.href ? (
                <Link
                  className="rfl-progress-link"
                  href={step.href}
                  aria-label={`Go to ${step.label}`}
                >
                  {content}
                </Link>
              ) : (
                <span className="rfl-progress-static">
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}