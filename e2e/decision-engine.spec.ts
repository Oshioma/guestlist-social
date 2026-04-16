import { test, expect } from "@playwright/test";
import { login, goToAdmin } from "./helpers";

test.describe("Decision Engine", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("dashboard loads with engine components", async ({ page }) => {
    await goToAdmin(page, "/dashboard");

    // WhatsWorkingNow or its empty state should render.
    await expect(
      page.locator("text=Agency edge, text=What's working right now").first()
    ).toBeVisible({ timeout: 10000 });

    // DecisionAccuracy or its empty state should render.
    await expect(
      page.locator("text=Engine track record").first()
    ).toBeVisible();
  });

  test("client ads page renders with tabs", async ({ page }) => {
    await goToAdmin(page, "/clients");

    // Click the first client.
    const firstClient = page.locator("a[href*='/clients/']").first();
    await firstClient.click();
    await page.waitForLoadState("networkidle");

    // Navigate to ads.
    const adsLink = page.locator("a[href*='/ads']").first();
    await adsLink.click();
    await page.waitForLoadState("networkidle");

    // Verify tabs are present.
    await expect(page.locator("button:has-text('Ads')")).toBeVisible();
    await expect(
      page.locator("button:has-text('Actions & Decisions')")
    ).toBeVisible();
    await expect(page.locator("button:has-text('Playbook')")).toBeVisible();
    await expect(
      page.locator("button:has-text('Experiments')")
    ).toBeVisible();
  });

  test("score and generate button exists on ads page", async ({ page }) => {
    await goToAdmin(page, "/clients");

    const firstClient = page.locator("a[href*='/clients/']").first();
    if ((await firstClient.count()) === 0) {
      test.skip(true, "No clients to test");
      return;
    }

    await firstClient.click();
    await page.waitForLoadState("networkidle");

    const adsLink = page.locator("a[href*='/ads']").first();
    if ((await adsLink.count()) === 0) {
      test.skip(true, "No ads link found");
      return;
    }

    await adsLink.click();
    await page.waitForLoadState("networkidle");

    // The Score & Generate button should be present.
    await expect(
      page.locator("button:has-text('Score'), button:has-text('Generate')")
        .first()
    ).toBeVisible();
  });
});
