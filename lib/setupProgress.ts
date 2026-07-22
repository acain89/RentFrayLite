import {
  SetupStep,
  type Business,
} from "@prisma/client";

type SetupBusiness = Pick<
  Business,
  "setupStep" | "setupCompletedAt"
>;

export type SetupResumeDetails = {
  stepNumber: number;
  totalSteps: number;
  title: string;
  route: string;
};

const TOTAL_SETUP_STEPS = 7;

export function getSetupRoute(
  business: SetupBusiness
): string {
  if (
    business.setupCompletedAt ||
    business.setupStep === SetupStep.COMPLETE
  ) {
    return "/manager/dashboard";
  }

  switch (business.setupStep) {
    case SetupStep.VERIFY_EMAIL:
      return "/setup/verify-email";

    case SetupStep.CONFIGURE_RECURRING_TIERS:
      return "/setup/recurring/tiers";

    case SetupStep.CONFIGURE_RECURRING_CHARGES:
      return "/setup/recurring/charges";

    case SetupStep.CONFIGURE_RECURRING_BILLING:
      return "/setup/recurring/billing";

    case SetupStep.REVIEW_RECURRING:
      return "/setup/recurring/review";

    case SetupStep.CONNECT_STRIPE:
      return "/setup/stripe";

    case SetupStep.CHOOSE_ACCOUNT_CODE:
      return "/setup/account-code";

    default:
      return "/setup/recurring/tiers";
  }
}

export function getSetupResumeDetails(
  business: SetupBusiness
): SetupResumeDetails {
  const route = getSetupRoute(business);

  switch (business.setupStep) {
    case SetupStep.VERIFY_EMAIL:
      return {
        stepNumber: 1,
        totalSteps: TOTAL_SETUP_STEPS,
        title: "Verify Email",
        route,
      };

    case SetupStep.CONFIGURE_RECURRING_TIERS:
      return {
        stepNumber: 2,
        totalSteps: TOTAL_SETUP_STEPS,
        title: "Rent Tiers",
        route,
      };

    case SetupStep.CONFIGURE_RECURRING_CHARGES:
      return {
        stepNumber: 3,
        totalSteps: TOTAL_SETUP_STEPS,
        title: "Monthly Charges",
        route,
      };

    case SetupStep.CONFIGURE_RECURRING_BILLING:
      return {
        stepNumber: 4,
        totalSteps: TOTAL_SETUP_STEPS,
        title: "Billing Rules",
        route,
      };

    case SetupStep.REVIEW_RECURRING:
      return {
        stepNumber: 5,
        totalSteps: TOTAL_SETUP_STEPS,
        title: "Review",
        route,
      };

    case SetupStep.CONNECT_STRIPE:
      return {
        stepNumber: 6,
        totalSteps: TOTAL_SETUP_STEPS,
        title: "Connect Stripe",
        route,
      };

    case SetupStep.CHOOSE_ACCOUNT_CODE:
      return {
        stepNumber: 7,
        totalSteps: TOTAL_SETUP_STEPS,
        title: "Choose Account Code",
        route,
      };

    case SetupStep.COMPLETE:
      return {
        stepNumber: 7,
        totalSteps: TOTAL_SETUP_STEPS,
        title: "Setup Complete",
        route: "/manager/dashboard",
      };

    default:
      return {
        stepNumber: 2,
        totalSteps: TOTAL_SETUP_STEPS,
        title: "Rent Tiers",
        route: "/setup/recurring/tiers",
      };
  }
}

export function getHighestSetupStage(
  setupStep: SetupStep
): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  switch (setupStep) {
    case SetupStep.VERIFY_EMAIL:
      return 1;

    case SetupStep.CONFIGURE_RECURRING_TIERS:
      return 2;

    case SetupStep.CONFIGURE_RECURRING_CHARGES:
      return 3;

    case SetupStep.CONFIGURE_RECURRING_BILLING:
      return 4;

    case SetupStep.REVIEW_RECURRING:
      return 5;

    case SetupStep.CONNECT_STRIPE:
      return 6;

    case SetupStep.CHOOSE_ACCOUNT_CODE:
    case SetupStep.COMPLETE:
      return 7;

    default:
      return 2;
  }
}