// Screenshot the dev preview harness (/dev/preview) at a phone viewport and
// report any page that scrolls sideways.
//
//   npm run dev                       # in one shell
//   node scripts/preview-shots.mjs    # in another
//
// Output lands in .preview-shots/ (git-ignored). Add ?view=/step= targets via
// TARGETS below. The point is to be able to SEE a layout change without
// credentials — the harness renders the real components with fixture props, so
// no Supabase, no auth, no data.
//
// Chromium: honours PW_CHROMIUM if set, else falls back to Playwright's own
// lookup. In sandboxes where the bundled browser build doesn't match the
// installed @playwright/test, point PW_CHROMIUM at the browser that IS present
// rather than downloading another one.
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.PREVIEW_BASE ?? "http://localhost:3000";
const OUT = ".preview-shots";

const TARGETS = [
  ["empty", "?view=empty"],
  ["resume", "?view=resume"],
  ["tour-welcome", "?view=tour&step=welcome"],
  ["tour-connect", "?view=tour&step=connect"],
  ["tour-idea", "?view=tour&step=idea"],
  ["tour-image", "?view=tour&step=image"],
  ["tour-save", "?view=tour&step=save"],
  ["tour-green", "?view=tour&step=green"],
  ["tour-board", "?view=tour&step=board"],
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
const context = await browser.newContext({ ...devices["iPhone 13"] }); // 390×844

let overflows = 0;
for (const [name, query] of TARGETS) {
  const page = await context.newPage();
  await page.goto(`${BASE}/dev/preview${query}`, { waitUntil: "networkidle" });
  // The tour dims the page for 4.5s on each step; wait it out so the shot shows
  // the resting state rather than the spotlight.
  await page.waitForTimeout(query.includes("tour") ? 5200 : 400);

  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  const sideways = m.scrollW > m.clientW;
  if (sideways) overflows++;
  console.log(
    `${sideways ? "OVERFLOWS" : "ok       "} ${name.padEnd(14)} ${m.scrollW}/${m.clientW}`
  );

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await page.close();
}

await browser.close();
console.log(
  overflows === 0
    ? `\nNo horizontal overflow. Shots in ${OUT}/`
    : `\n${overflows} page(s) scroll sideways. Shots in ${OUT}/`
);
