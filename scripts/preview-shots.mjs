// Screenshot the dev preview harness (/dev/preview) at a phone viewport and
// report any page that scrolls sideways.
//
//   npm run dev                       # in one shell
//   node scripts/preview-shots.mjs    # in another
//
// Output lands in .preview-shots/ (git-ignored). Add targets via TARGETS below.
// The point is to be able to SEE a layout change without credentials — the
// harness renders the real components with fixture props, so no auth and no
// data. It does need a .env.local with PLACEHOLDER Supabase values, though:
// components like ProoferBoard construct a browser client on mount, which
// throws outright when the vars are missing. Nothing ever calls the URL, so
// anything syntactically valid works:
//
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder-not-a-real-key
//
// Chromium: honours PW_CHROMIUM if set, else falls back to Playwright's own
// lookup. In sandboxes where the bundled browser build doesn't match the
// installed @playwright/test, point PW_CHROMIUM at the browser that IS present
// rather than downloading another one.
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.PREVIEW_BASE ?? "http://localhost:3000";
const OUT = ".preview-shots";

// [name, path]. Harness views render gated components with fixtures; the
// public routes are the real pages, which need no session.
const TARGETS = [
  ["empty", "/dev/preview?view=empty"],
  ["resume", "/dev/preview?view=resume"],
  ["board", "/dev/preview?view=board"],
  ["publish", "/dev/preview?view=publish"],
  ["portal", "/dev/preview?view=portal"],
  ["teams", "/dev/preview?view=teams"],
  ["tour-welcome", "/dev/preview?view=tour&step=welcome"],
  ["tour-connect", "/dev/preview?view=tour&step=connect"],
  ["tour-idea", "/dev/preview?view=tour&step=idea"],
  ["tour-image", "/dev/preview?view=tour&step=image"],
  ["tour-save", "/dev/preview?view=tour&step=save"],
  ["tour-green", "/dev/preview?view=tour&step=green"],
  ["tour-board", "/dev/preview?view=tour&step=board"],
  ["public-welcome", "/welcome"],
  ["public-sign-in", "/sign-in"],
  ["public-sign-up", "/sign-up"],
  ["public-reset", "/reset-password"],
  ["public-privacy", "/privacy"],
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
const context = await browser.newContext({ ...devices["iPhone 13"] }); // 390×844

let overflows = 0;
for (const [name, path] of TARGETS) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  // The tour dims the page for 4.5s on each step; wait it out so the shot shows
  // the resting state rather than the spotlight.
  await page.waitForTimeout(path.includes("tour") ? 5200 : 400);

  // NOT scrollWidth: the app guards html/body with `overflow-x: clip`, which
  // pins scrollWidth to the viewport even when a child runs off the side. The
  // clip stops the whole page dragging sideways, but the content is still
  // unreachable — exactly the bug that has to be caught. So look for elements
  // sticking out past the viewport, ignoring anything inside a scroll container
  // (a date strip scrolling its own children is the intended design).
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scrollable = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      return false;
    };
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= vw + 1 && r.left >= -1) continue;
      if (scrollable(el)) continue;
      // Report the outermost offender only — its children repeat the story.
      if (out.some((o) => o.el.contains(el))) continue;
      out.push({
        el,
        label:
          el.tagName.toLowerCase() +
          (typeof el.className === "string" && el.className
            ? "." + el.className.trim().split(/\s+/).join(".")
            : ""),
        right: Math.round(r.right),
      });
    }
    return { vw, offenders: out.slice(0, 3).map(({ label, right }) => ({ label, right })) };
  });

  const sideways = m.offenders.length > 0;
  if (sideways) overflows++;
  const status = res?.status() ?? 0;
  console.log(
    `${sideways ? "OVERFLOWS" : "ok       "} ${name.padEnd(16)} ${status} vw=${m.vw}` +
      (sideways
        ? "  → " + m.offenders.map((o) => `${o.label} ends at ${o.right}`).join("; ")
        : "") +
      (errors.length ? `  JS ERROR: ${errors[0]}` : "")
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
