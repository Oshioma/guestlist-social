#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Smoke test: stale pattern reaper end-to-end loop.
//
// Drives the full retire → unretire → re-retire round trip against a live
// Supabase instance, using sentinel pattern_feedback rows that can't collide
// with real data. This is the closest thing the project has to an
// integration test for the reaper — the routes themselves are tiny but
// the contract that matters lives in Postgres (the migration is applied,
// the partial index is honored, the threshold semantics behave the same
// in SQL as they do in TypeScript).
//
// Run via:
//   node --env-file=.env.local scripts/smoke-reaper-loop.mjs
//
// Exit codes:
//   0 — every assertion passed, sentinel rows cleaned up
//   1 — at least one assertion failed (sentinel rows still cleaned up)
//   2 — required env vars not set
//
// Sentinel rows use the SENTINEL_PREFIX so they're trivial to identify
// and delete on cleanup. The script always tries to clean up — even on
// failure — so a half-finished run doesn't leave stragglers in the
// ledger.
//
// Threshold constants below MUST stay in sync with
// /api/cron/retire-stale-patterns/route.ts. They're duplicated here
// because the .mjs ↔ .ts boundary makes sharing awkward and the cost
// of duplication is one comment + one file diff to remember.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env."
  );
  console.error(
    "Run with: node --env-file=.env.local scripts/smoke-reaper-loop.mjs"
  );
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Must match /api/cron/retire-stale-patterns/route.ts
const MIN_DECISIVE_VERDICTS = 5;
const RETIRE_NEG_RATIO = 0.6;

// Unique enough that nothing in the real ledger could ever collide. The
// suffix is millisecond-stamped so two simultaneous runs don't trip on
// each other's sentinels either.
const SENTINEL_PREFIX = `smoke_reaper_${Date.now()}_`;

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let failed = 0;

function pass(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function fail(msg, detail) {
  failed += 1;
  console.log(`${RED}✗${RESET} ${msg}`);
  if (detail) console.log(`  ${DIM}${detail}${RESET}`);
}

// ---------------------------------------------------------------------------
// Reaper sweep — a faithful inline of the route's logic. We don't HTTP
// the route because the smoke script needs to run without a dev server,
// and the route's body is small enough that re-implementing it in 25
// lines is cleaner than a fetch + auth dance.
// ---------------------------------------------------------------------------
async function runReaperSweep() {
  const { data: rows, error } = await supabase
    .from("pattern_feedback")
    .select("pattern_key, industry, positive_verdicts, negative_verdicts")
    .is("retired_at", null);

  if (error) throw new Error(`reaper scan: ${error.message}`);

  const candidates = [];
  for (const row of rows ?? []) {
    const positive = Number(row.positive_verdicts ?? 0);
    const negative = Number(row.negative_verdicts ?? 0);
    const decisive = positive + negative;
    if (decisive < MIN_DECISIVE_VERDICTS) continue;
    const negRatio = negative / decisive;
    if (negRatio < RETIRE_NEG_RATIO) continue;
    const pct = Math.round(negRatio * 100);
    candidates.push({
      pattern_key: row.pattern_key,
      industry: row.industry ?? "",
      reason: `${negative} of ${decisive} verdicts negative (${pct}%)`,
    });
  }

  const retiredAt = new Date().toISOString();
  for (const c of candidates) {
    await supabase
      .from("pattern_feedback")
      .update({
        retired_at: retiredAt,
        retired_reason: c.reason,
        updated_at: retiredAt,
      })
      .eq("pattern_key", c.pattern_key)
      .eq("industry", c.industry);
  }
  return { scanned: rows?.length ?? 0, retired: candidates.length };
}

async function readSentinel(suffix) {
  const { data, error } = await supabase
    .from("pattern_feedback")
    .select("pattern_key, retired_at, retired_reason")
    .eq("pattern_key", SENTINEL_PREFIX + suffix)
    .eq("industry", "")
    .maybeSingle();
  if (error) throw new Error(`read ${suffix}: ${error.message}`);
  return data;
}

async function seedSentinel(suffix, positive, negative) {
  const { error } = await supabase.from("pattern_feedback").upsert(
    {
      pattern_key: SENTINEL_PREFIX + suffix,
      industry: "",
      engine_uses: positive + negative,
      positive_verdicts: positive,
      negative_verdicts: negative,
      neutral_verdicts: 0,
      inconclusive_verdicts: 0,
      last_verdict_at: new Date().toISOString(),
      retired_at: null,
      retired_reason: null,
    },
    { onConflict: "pattern_key,industry" }
  );
  if (error) throw new Error(`seed ${suffix}: ${error.message}`);
}

async function cleanup() {
  const { error } = await supabase
    .from("pattern_feedback")
    .delete()
    .like("pattern_key", `${SENTINEL_PREFIX}%`);
  if (error) {
    console.log(
      `${YELLOW}!${RESET} cleanup failed: ${error.message} ` +
        `${DIM}(sentinels matching ${SENTINEL_PREFIX}* may need manual removal)${RESET}`
    );
  }
}

// ---------------------------------------------------------------------------
// The actual scenarios. Each row's name is its expected behaviour so the
// failure log reads as a sentence.
// ---------------------------------------------------------------------------

try {
  console.log(`${DIM}Sentinel prefix: ${SENTINEL_PREFIX}${RESET}\n`);

  // Seed four cases that exercise every branch of the threshold:
  //   should_retire_clear:      6 decisive, 5 neg (83%) — well above both
  //   should_retire_on_the_nose: 5 decisive, 3 neg (60%) — exact boundary
  //   skip_below_sample:         4 decisive, 3 neg (75%) — fails MIN_DECISIVE
  //   skip_below_ratio:          10 decisive, 5 neg (50%) — fails RATIO
  await seedSentinel("should_retire_clear", 1, 5);
  await seedSentinel("should_retire_on_the_nose", 2, 3);
  await seedSentinel("skip_below_sample", 1, 3);
  await seedSentinel("skip_below_ratio", 5, 5);

  // Round 1: sweep and check.
  const sweep1 = await runReaperSweep();
  console.log(
    `${DIM}sweep 1: scanned=${sweep1.scanned} retired=${sweep1.retired}${RESET}`
  );

  const r1 = await readSentinel("should_retire_clear");
  if (r1?.retired_at) pass("clear-cut bad pattern was retired");
  else fail("clear-cut bad pattern was NOT retired", `row=${JSON.stringify(r1)}`);

  if (r1?.retired_reason && r1.retired_reason.includes("83%")) {
    pass("retired_reason carries the right percentage");
  } else {
    fail(
      "retired_reason missing or wrong",
      `got: ${r1?.retired_reason ?? "(null)"}`
    );
  }

  const r2 = await readSentinel("should_retire_on_the_nose");
  if (r2?.retired_at) pass("on-the-nose threshold pattern was retired (60% counts)");
  else fail("on-the-nose threshold pattern was NOT retired", `row=${JSON.stringify(r2)}`);

  const r3 = await readSentinel("skip_below_sample");
  if (!r3?.retired_at) pass("under-sample pattern was correctly skipped");
  else
    fail(
      "under-sample pattern was wrongly retired",
      `MIN_DECISIVE_VERDICTS=${MIN_DECISIVE_VERDICTS} should have spared 4-decisive row`
    );

  const r4 = await readSentinel("skip_below_ratio");
  if (!r4?.retired_at) pass("50/50 pattern was correctly skipped");
  else
    fail(
      "50/50 pattern was wrongly retired",
      `RETIRE_NEG_RATIO=${RETIRE_NEG_RATIO} should have spared a 50% row`
    );

  // Round 2: idempotency. Re-running the sweep on the same state should
  // be a no-op for the previously-retired rows (they're filtered by the
  // is(retired_at, null) guard) and still skip the safe ones.
  const sweep2 = await runReaperSweep();
  console.log(
    `${DIM}sweep 2 (idempotent re-run): scanned=${sweep2.scanned} retired=${sweep2.retired}${RESET}`
  );
  // Don't assert sweep2.retired === 0 because other real patterns in the
  // ledger may legitimately cross the threshold between sweeps. What we
  // can assert is that our sentinels' state didn't change.
  const r1b = await readSentinel("should_retire_clear");
  const r2b = await readSentinel("should_retire_on_the_nose");
  if (
    r1b?.retired_at === r1?.retired_at &&
    r2b?.retired_at === r2?.retired_at
  ) {
    pass("idempotent re-run didn't disturb already-retired sentinels");
  } else {
    fail(
      "idempotent re-run changed retired sentinels",
      `before=${r1?.retired_at}/${r2?.retired_at} after=${r1b?.retired_at}/${r2b?.retired_at}`
    );
  }

  // Unretire path: clear retired_at via direct UPDATE (mirrors what the
  // /api/unretire-pattern route does on the inside).
  await supabase
    .from("pattern_feedback")
    .update({ retired_at: null, retired_reason: null })
    .eq("pattern_key", SENTINEL_PREFIX + "should_retire_clear")
    .eq("industry", "");

  const r1c = await readSentinel("should_retire_clear");
  if (r1c?.retired_at == null && r1c?.retired_reason == null) {
    pass("unretire cleared both retired_at and retired_reason");
  } else {
    fail(
      "unretire didn't fully clear the row",
      `retired_at=${r1c?.retired_at} retired_reason=${r1c?.retired_reason}`
    );
  }

  // Round 3: the verdict counts are still bad, so the next sweep should
  // re-retire it. This proves the loop is stateless on retired_at — the
  // operator gets one chance, and live verdicts decide whether the
  // pattern survives the next pass.
  await runReaperSweep();
  const r1d = await readSentinel("should_retire_clear");
  if (r1d?.retired_at) {
    pass("re-sweep re-retired the unretired pattern (verdicts still bad)");
  } else {
    fail(
      "re-sweep failed to re-retire — loop is leaking state",
      `row=${JSON.stringify(r1d)}`
    );
  }
} catch (err) {
  fail("smoke run threw", err instanceof Error ? err.message : String(err));
} finally {
  await cleanup();
}

console.log();
if (failed === 0) {
  console.log(`${GREEN}Reaper loop smoke test passed.${RESET}`);
  process.exit(0);
}
console.log(
  `${RED}${failed} assertion${failed === 1 ? "" : "s"} failed.${RESET}`
);
process.exit(1);
