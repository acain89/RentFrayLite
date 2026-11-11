import { expect, test } from "@playwright/test";

test.describe("Public recurring checkout", () => {
  test("payer can prepare a Tier 2 ACH payment for review", async ({ page }) => {
    let capturedRequest: Record<string, unknown> | null = null;

    // Mock the review destination so this UI test does not require
    // a real CheckoutSession record in the database.
    await page.route(
      "**/AC-1234/review?sessionId=e2e-test-session",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<html><body><h1>E2E Review Page</h1></body></html>",
        });
      }
    );

    // Intercept checkout-session creation so this test cannot create
    // database records or initiate a real Stripe checkout.
    await page.route("**/api/public/checkout/session", async (route) => {
      capturedRequest = route.request().postDataJSON();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          reviewUrl: "/AC-1234/review?sessionId=e2e-test-session",
        }),
      });
    });

    await page.goto("/AC-1234");

    await expect(
      page.getByRole("heading", { name: "Andrew's Pottery" })
    ).toBeVisible();

    await expect(page.getByText("Account code:")).toBeVisible();
    await expect(page.getByText("AC-1234")).toBeVisible();

    const tier2 = page.getByRole("button", { name: /Tier 2/i });

    await expect(tier2).toBeVisible();
    await expect(tier2).toContainText("$3.00");
    await expect(tier2).toContainText("Due on day 1");

    await tier2.click();

    const reviewButton = page.getByRole("button", {
      name: "Review Payment",
    });

    await expect(reviewButton).toBeDisabled();

    await page.getByLabel("Unit / space number").fill("E2E-101");
    await page.getByLabel("First name").fill("Playwright");
    await page.getByLabel("Last name").fill("Test");
    await page.getByLabel("Mobile phone").fill("5555551234");

    await expect(page.getByLabel("Mobile phone")).toHaveValue(
      "(555) 555-1234"
    );

    const ach = page.getByRole("radio", {
      name: "Bank account",
    });

    const card = page.getByRole("radio", {
      name: "Credit or debit card",
    });

    await expect(ach).toBeChecked();
    await expect(card).not.toBeChecked();

    await card.check();

    await expect(card).toBeChecked();
    await expect(ach).not.toBeChecked();

    await ach.check();

    await expect(ach).toBeChecked();
    await expect(reviewButton).toBeEnabled();

    await reviewButton.click();

    await expect.poll(() => capturedRequest).not.toBeNull();

    expect(capturedRequest).toEqual({
      accountCode: "AC-1234",
      planId: "cms590lm6000exk7jvtnc3avw",
      unitNumber: "E2E-101",
      firstName: "Playwright",
      lastName: "Test",
      phone: "5555551234",
      paymentMethod: "ACH",
    });

    await expect(page).toHaveURL(
      /\/AC-1234\/review\?sessionId=e2e-test-session$/
    );

    await expect(
      page.getByRole("heading", { name: "E2E Review Page" })
    ).toBeVisible();
  });

  test("payer cannot continue until required information is complete", async ({
    page,
  }) => {
    await page.goto("/AC-1234");

    await page.getByRole("button", { name: /Tier 2/i }).click();

    const reviewButton = page.getByRole("button", {
      name: "Review Payment",
    });

    await expect(reviewButton).toBeDisabled();

    await page.getByLabel("Unit / space number").fill("E2E-102");
    await page.getByLabel("First name").fill("Playwright");
    await page.getByLabel("Last name").fill("Validation");

    await page.getByLabel("Mobile phone").fill("555123");

    await expect(reviewButton).toBeDisabled();

    await page.getByLabel("Mobile phone").fill("5555551234");

    await expect(reviewButton).toBeEnabled();
  });
});
