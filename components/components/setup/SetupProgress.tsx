type SetupProgressProps = {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
};

const steps = [
  "Account",
  "Verify",
  "Model",
  "Configure",
  "Stripe",
  "Code",
] as const;

export default function SetupProgress({
  currentStep,
}: SetupProgressProps) {
  return (
    <nav
      className="rfl-setup-progress"
      aria-label="Account setup progress"
    >
      <ol>
        {steps.map((label, index) => {
          const stepNumber = index + 1;
          const complete = stepNumber < currentStep;
          const active = stepNumber === currentStep;

          return (
            <li
              key={label}
              className={
                active
                  ? "rfl-progress-active"
                  : complete
                    ? "rfl-progress-complete"
                    : ""
              }
              aria-current={active ? "step" : undefined}
            >
              <span className="rfl-progress-marker">
                {complete ? "✓" : stepNumber}
              </span>

              <span className="rfl-progress-label">
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}