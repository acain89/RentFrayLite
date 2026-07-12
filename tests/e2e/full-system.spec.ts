import { test, expect, Page } from "@playwright/test";

const cfg = {
  baseUrl: process.env.E2E_BASE_URL || "http://localhost:10000",

  propertyCode: must("E2E_PROPERTY_CODE"),
  managerEmail: must("E2E_MANAGER_EMAIL"),
  managerPassword: must("E2E_MANAGER_PASSWORD"),

  tenantUnitOrIdentifier: process.env.E2E_TENANT_UNIT_OR_IDENTIFIER || "",
  tenantPin: must("E2E_TENANT_PIN"),

  maintenancePin: must("E2E_MAINTENANCE_PIN"),
};

function must(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function uniqueRequestText(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `PLAYWRIGHT-MAINT-REQ-${stamp}`;
}

async function ensurePropertyCodeStored(page: Page): Promise<void> {
  // 🔒 BULLETPROOF: only run if property-code page actually exists

  const input = page.locator("input").first();

  if ((await input.count()) === 0) {
    // ✅ No property-code screen → already using ?code flow
    return;
  }

  const button = page.locator("button").first();

  await expect(input).toBeVisible();
  await input.fill(cfg.propertyCode);
  await button.click();
  await page.waitForLoadState("networkidle");
}

async function managerLogin(page: Page): Promise<void> {
  await ensurePropertyCodeStored(page);

  await page.goto(`/login/manager?code=${cfg.propertyCode}`);
  await page.waitForLoadState("networkidle");

  const emailInput = page
    .locator('input[type="email"], input[placeholder*="Email" i]')
    .first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitButton = page
    .getByRole("button", { name: /login|sign in/i })
    .first();

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();

  await emailInput.fill(cfg.managerEmail);
  await passwordInput.fill(cfg.managerPassword);
  await submitButton.click();

  await page.waitForLoadState("networkidle");

  await expect(page).not.toHaveURL(/property-code/i);
  await expect(page).not.toHaveURL(/login\/manager/i);
}

async function maintenanceLogin(page: Page): Promise<void> {
  await ensurePropertyCodeStored(page);

  await page.goto(`/login/maintenance?code=${cfg.propertyCode}`);
  await page.waitForLoadState("networkidle");

  const pinInput = page
    .locator(
      'input[type="password"], input[placeholder*="••••"], input[placeholder*="PIN" i]'
    )
    .first();
  const submitButton = page
    .getByRole("button", { name: /login|sign in/i })
    .first();

  await expect(pinInput).toBeVisible();

  await pinInput.fill(cfg.maintenancePin);
  await submitButton.click();

  await page.waitForLoadState("networkidle");

  await expect(page).not.toHaveURL(/property-code/i);
  await expect(page).not.toHaveURL(/login\/maintenance/i);
}

async function tenantLogin(page: Page): Promise<void> {
  await ensurePropertyCodeStored(page);

  await page.goto(`/login/tenant?code=${cfg.propertyCode}`);
  await page.waitForLoadState("networkidle");

  const pinInput = page.locator('input[type="password"]').first();
  const submitButton = page
    .getByRole("button", { name: /login|sign in/i })
    .first();

  await expect(pinInput).toBeVisible();

  const unitInput = page.locator(
    'input[placeholder*="Unit" i], input[name*="unit" i]'
  );

  if ((await unitInput.count()) > 0 && cfg.tenantUnitOrIdentifier) {
    await unitInput.first().fill(cfg.tenantUnitOrIdentifier);
  }

  await pinInput.fill(cfg.tenantPin);
  await submitButton.click();

  await page.waitForLoadState("networkidle");

  await expect(page).not.toHaveURL(/property-code/i);
  await expect(page).not.toHaveURL(/login\/tenant/i);
}

async function openTenantMaintenance(page: Page): Promise<void> {
  await page.goto(`/tenant/maintenance?code=${cfg.propertyCode}`);
  await page.waitForLoadState("networkidle");

  await expect(page).not.toHaveURL(/property-code/i);
  await expect(page).toHaveURL(/tenant|maintenance/i);
}

async function createTenantMaintenanceRequest(
  page: Page,
  description: string
): Promise<void> {
  const categorySelect = page.locator("select").nth(0);
  const urgencySelect = page.locator("select").nth(1);
  const descriptionBox = page.locator("textarea").first();
  const submitButton = page
    .getByRole("button", { name: /submit request|submit/i })
    .first();

  await expect(descriptionBox).toBeVisible();

  await categorySelect.selectOption("PLUMBING");
  await urgencySelect.selectOption("NORMAL");
  await descriptionBox.fill(description);
  await submitButton.click();

  await page.waitForLoadState("networkidle");
  await expect(page.locator(`text=${description}`)).toBeVisible();
}

async function openMaintenancePortal(page: Page): Promise<void> {
  await page.goto(`/maintenance?code=${cfg.propertyCode}`);
  await page.waitForLoadState("networkidle");

  await expect(page).not.toHaveURL(/property-code/i);
  await expect(page).toHaveURL(/maintenance/i);
}

async function markRequestThirdParty(
  page: Page,
  description: string
): Promise<void> {
  const card = page.locator("div").filter({ hasText: description }).first();
  await expect(card).toBeVisible();

  const thirdPartyButton = card
    .getByRole("button", { name: /3rd party/i })
    .first();
  await expect(thirdPartyButton).toBeVisible();

  await thirdPartyButton.click();
  await expect(card.getByText(/third party/i)).toBeVisible();
}

async function deleteRequestFromMaintenance(
  page: Page,
  description: string
): Promise<void> {
  const card = page.locator("div").filter({ hasText: description }).first();
  await expect(card).toBeVisible();

  const deleteButton = card.getByRole("button", { name: /delete/i }).first();
  await deleteButton.click();

  await expect(page.locator(`text=${description}`)).toHaveCount(0);
}

async function openManagerDashboard(page: Page): Promise<void> {
  await page.goto(`/manager/dashboard?code=${cfg.propertyCode}`);
  await page.waitForLoadState("networkidle");

  await expect(page).not.toHaveURL(/property-code/i);
  await expect(page).toHaveURL(/manager|dashboard/i);
}

async function switchManagerToFullViewIfPresent(page: Page): Promise<void> {
  const fullView = page.getByRole("button", { name: /full view/i }).first();
  if (await fullView.count()) {
    await fullView.click();
    await page.waitForLoadState("networkidle");
  }
}

async function openManagerMaintenanceOverlay(page: Page): Promise<void> {
  const maintButton = page.getByRole("button", { name: /^Maint$/i }).first();
  await expect(maintButton).toBeVisible();
  await maintButton.click();
  await page.waitForLoadState("networkidle");
}

async function managerSeesRequestStatus(
  page: Page,
  description: string,
  expectedStatus: RegExp
): Promise<void> {
  const requestCard = page.locator("div").filter({ hasText: description }).first();
  await expect(requestCard).toBeVisible();
  await expect(requestCard.getByText(expectedStatus)).toBeVisible();
}

async function managerDoesNotSeeRequest(
  page: Page,
  description: string
): Promise<void> {
  await expect(page.locator(`text=${description}`)).toHaveCount(0);
}

async function pageSafeReopenMaintenance(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  const maintButton = page.getByRole("button", { name: /^Maint$/i }).first();
  if (await maintButton.count()) {
    await maintButton.click();
    await page.waitForLoadState("networkidle");
  }
}

test.describe("RentFray full system E2E", () => {
  test("public pages load", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/localhost|127\.0\.0\.1|http/i);

    await page.goto("/setup");
    await expect(page).toHaveURL(/setup/i);

    await page.goto("/property-code");
    await expect(page).toHaveURL(/property-code/i);

    await page.goto(`/login/maintenance?code=${cfg.propertyCode}`);
    await expect(page.locator("form")).toBeVisible();  });

  test("full maintenance workflow across tenant, maintenance, manager", async ({
    browser,
  }) => {
    const requestText = uniqueRequestText();

    const managerContext = await browser.newContext();
    const tenantContext = await browser.newContext();
    const maintenanceContext = await browser.newContext();

    const managerPage = await managerContext.newPage();
    const tenantPage = await tenantContext.newPage();
    const maintenancePage = await maintenanceContext.newPage();

    try {
      await tenantLogin(tenantPage);
      await openTenantMaintenance(tenantPage);
      await createTenantMaintenanceRequest(tenantPage, requestText);

      await maintenanceLogin(maintenancePage);
      await openMaintenancePortal(maintenancePage);
      await expect(
        maintenancePage.locator(`text=${requestText}`)
      ).toBeVisible();
      await markRequestThirdParty(maintenancePage, requestText);

      await managerLogin(managerPage);
      await openManagerDashboard(managerPage);
      await switchManagerToFullViewIfPresent(managerPage);
      await openManagerMaintenanceOverlay(managerPage);
      await managerSeesRequestStatus(managerPage, requestText, /third party/i);

      await openMaintenancePortal(maintenancePage);
      await deleteRequestFromMaintenance(maintenancePage, requestText);

      await managerPage.reload();
      await pageSafeReopenMaintenance(managerPage);
      await managerDoesNotSeeRequest(managerPage, requestText);
    } finally {
      await managerContext.close();
      await tenantContext.close();
      await maintenanceContext.close();
    }
  });

  test("manager login works", async ({ page }) => {
    await managerLogin(page);
    await openManagerDashboard(page);
  });

  test("maintenance login works", async ({ page }) => {
    await maintenanceLogin(page);
    await openMaintenancePortal(page);
  });

  test("tenant login works", async ({ page }) => {
    await tenantLogin(page);
    await page.goto(`/tenant/dashboard?code=${cfg.propertyCode}`);
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/property-code/i);
    await expect(page).toHaveURL(/tenant/i);
  });
});