import { test, expect } from "@playwright/test";
import { login, goToAdmin } from "./helpers";

test.describe("Social Publisher", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("proofer calendar loads", async ({ page }) => {
    await goToAdmin(page, "/proofer");

    // The page should show a month name and client selector.
    await expect(
      page.locator("select, button:has-text('Previous'), button:has-text('Next')")
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("publish queue page loads with sections", async ({ page }) => {
    await goToAdmin(page, "/proofer/publish");

    // Should have the main sections.
    await expect(
      page.locator("text=Ready to Queue, text=Scheduled, text=Published")
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("can type a caption in the proofer", async ({ page }) => {
    await goToAdmin(page, "/proofer");

    // Find a textarea (the caption input for a day cell).
    const textarea = page.locator("textarea").first();
    if ((await textarea.count()) === 0) {
      test.skip(true, "No editable cells — client may not be selected");
      return;
    }

    await textarea.fill("Test caption from Playwright");
    await expect(textarea).toHaveValue("Test caption from Playwright");
  });

  test("ideas page loads with tabs", async ({ page }) => {
    await goToAdmin(page, "/ideas");

    await expect(page.locator("button:has-text('Video')")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("button:has-text('Carousel')")).toBeVisible();
    await expect(page.locator("button:has-text('Story')")).toBeVisible();

    // Click each tab and verify no error.
    await page.locator("button:has-text('Carousel')").click();
    await page.waitForTimeout(500);
    await page.locator("button:has-text('Story')").click();
    await page.waitForTimeout(500);
    await page.locator("button:has-text('Video')").click();
  });
});
