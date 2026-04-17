import { type Page } from "@playwright/test";

/**
 * Log in via the Supabase auth form. Requires TEST_EMAIL and TEST_PASSWORD
 * env vars. If already logged in (cookie present), this is a no-op.
 */
export async function login(page: Page) {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    throw new Error("Set TEST_EMAIL and TEST_PASSWORD env vars for E2E tests.");
  }

  await page.goto("/sign-in");

  // If we're redirected away from login, we're already authenticated.
  if (!page.url().includes("/sign-in")) return;

  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect away from login.
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 15000,
  });
}

/**
 * Navigate to the admin panel. Assumes login() has been called.
 */
export async function goToAdmin(page: Page, path: string) {
  await page.goto(`/app${path}`);
  await page.waitForLoadState("networkidle");
}
