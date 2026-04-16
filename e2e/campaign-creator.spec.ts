import { test, expect } from "@playwright/test";
import { login, goToAdmin } from "./helpers";

test.describe("Campaign Creator", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("new campaign page shows form + suggestions sidebar", async ({
    page,
  }) => {
    await goToAdmin(page, "/clients");

    const firstClient = page.locator("a[href*='/clients/']").first();
    if ((await firstClient.count()) === 0) {
      test.skip(true, "No clients to test");
      return;
    }

    await firstClient.click();
    await page.waitForLoadState("networkidle");

    // Find and click the "New campaign" link.
    const newCampaignLink = page.locator(
      "a[href*='/campaigns/new']"
    ).first();
    if ((await newCampaignLink.count()) === 0) {
      test.skip(true, "No new-campaign link found");
      return;
    }

    await newCampaignLink.click();
    await page.waitForLoadState("networkidle");

    // Form should have the campaign name input.
    await expect(
      page.locator("input[name='name']")
    ).toBeVisible({ timeout: 10000 });

    // Suggestions sidebar should be present (even if empty).
    await expect(
      page.locator("text=From the engine, text=Suggestions for this campaign")
        .first()
    ).toBeVisible();
  });

  test("can fill out the campaign form", async ({ page }) => {
    await goToAdmin(page, "/clients");

    const firstClient = page.locator("a[href*='/clients/']").first();
    if ((await firstClient.count()) === 0) {
      test.skip(true, "No clients to test");
      return;
    }

    await firstClient.click();
    await page.waitForLoadState("networkidle");

    const newCampaignLink = page.locator(
      "a[href*='/campaigns/new']"
    ).first();
    if ((await newCampaignLink.count()) === 0) {
      test.skip(true, "No new-campaign link");
      return;
    }

    await newCampaignLink.click();
    await page.waitForLoadState("networkidle");

    // Fill the form.
    await page.fill("input[name='name']", "E2E Test Campaign");
    await page.selectOption("select[name='objective']", "traffic");
    await page.fill("input[name='budget']", "25");
    await page.fill("input[name='audience']", "18-35, London, nightlife");

    // Verify values took.
    await expect(page.locator("input[name='name']")).toHaveValue(
      "E2E Test Campaign"
    );
    await expect(page.locator("input[name='budget']")).toHaveValue("25");
  });

  test("quick launch page loads", async ({ page }) => {
    await goToAdmin(page, "/launch");

    await expect(
      page.locator("text=Launch Centre, text=New Campaign").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("settings page shows engine thresholds + auto-approve", async ({
    page,
  }) => {
    await goToAdmin(page, "/settings");

    await expect(
      page.locator("text=Engine Scoring Thresholds").first()
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.locator("text=Auto-Approve Decisions").first()
    ).toBeVisible();

    await expect(
      page.locator("text=API Keys").first()
    ).toBeVisible();
  });
});
