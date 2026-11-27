import { build } from "esbuild";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe("Public recurring checkout", () => {
  let bundle = "";
  test.beforeAll(async () => {
    const result = await build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import Checkout from "./app/[accountCode]/RecurringCheckoutClient";createRoot(document.getElementById("root")!).render(<Checkout businessName="Isolated Test Property" accountCode="AC-1234" plans={[{id:"fixture-tier-1",name:"Tier 1",baseAmountCents:100,dueDay:1,charges:[]},{id:"fixture-tier-2",name:"Tier 2",baseAmountCents:300,dueDay:1,charges:[]}]}/>);',resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":JSON.stringify("production")},plugins:[{name:"mock-link",setup(builder){builder.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"fixture"}));builder.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}',loader:"js",resolveDir:path.resolve(".")}));}}]});
    bundle = result.outputFiles[0].text;
  });
  test.beforeEach(async ({page}) => {
    await page.route("**/*",route => new URL(route.request().url()).origin === "https://rfl-checkout.invalid" && new URL(route.request().url()).pathname === "/AC-1234"
      ? route.fulfill({contentType:"text/html",body:'<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><div id="root"></div><script>'+bundle.replace(/<\/script/gi,"<\\/script")+'</script></body></html>'}) : route.abort());
  });
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
      page.getByRole("heading", { name: "Isolated Test Property" })
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

    // The reviewed production policy is ACH-only; CARD controls were retired.
    await expect(page.getByText("Payment method: ACH bank account.",{exact:true})).toBeVisible();
    await expect(page.getByRole("radio",{name:"Bank account"})).toHaveCount(0);
    await expect(page.getByRole("radio",{name:"Credit or debit card"})).toHaveCount(0);
    await expect(reviewButton).toBeEnabled();

    await reviewButton.click();

    await expect.poll(() => capturedRequest).not.toBeNull();

    expect(capturedRequest).toEqual({
      accountCode: "AC-1234",
      planId: "fixture-tier-2",
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
