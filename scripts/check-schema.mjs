#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Schema drift check.
//
// Connects to Supabase using the same env vars the app uses, then probes
// every (table, columns) tuple the app actively reads to make sure the live
// DB matches the migration files. The trust UI on the per-ad page broke
// silently because `global_learnings` existed in production with a totally
// different shape than the migration file specified — this script catches
// that class of bug before the page renders.
//
// Run via `npm run migrations:check`. Exit codes:
//   0 — all checks passed
//   1 — at least one table or column is missing
//   2 — required env vars not set
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env."
  );
  console.error("Run with: npm run migrations:check");
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Expected schema. Add an entry whenever the app starts reading a new
// (table, column) — the check then enforces the migration is applied.
// Only list columns the app actually reads; this isn't a full mirror of
// the migration files, just the contract the runtime depends on.
// ---------------------------------------------------------------------------
const SCHEMA = {
  // Only the trust-layer creative columns are listed here — the full ads
  // table has dozens of columns and isn't worth mirroring. This entry exists
  // to catch the specific drift the meta_creative_fields migration adds.
  ads: [
    "id",
    "creative_image_url",
    "creative_video_url",
    "creative_body",
    "creative_headline",
    "creative_cta",
    "creative_type",
    "hook_type",
    "format_style",
  ],
  global_learnings: [
    "id",
    "pattern_type",
    "pattern_key",
    "pattern_label",
    "action_summary",
    "times_seen",
    "unique_clients",
    "positive_count",
    "neutral_count",
    "negative_count",
    "consistency_score",
    "avg_ctr_lift",
    "avg_cpc_change",
    "sample_learnings",
    "top_tags",
    "industry",
    "prev_consistency_score",
    "prev_unique_clients",
  ],
  ad_actions: [
    "id",
    "ad_id",
    "problem",
    "action",
    "priority",
    "status",
    "hypothesis",
    "validated_by",
    "validated_pattern_key",
    "outcome",
    "result_summary",
    "operator_note",
    "metric_snapshot_before",
    "metric_snapshot_after",
    "completed_at",
    "created_at",
  ],
  ad_decisions: [
    "id",
    "client_id",
    "ad_id",
    "type",
    "reason",
    "action",
    "confidence",
    "meta_action",
    "status",
    "approved_at",
    "executed_at",
    "execution_result",
    "created_at",
  ],
  reviews: [
    "id",
    "client_id",
    "period_label",
    "period_type",
    "status",
    "share_token",
    "headline",
    "subhead",
    "what_happened",
    "what_improved",
    "what_we_tested",
    "what_we_learned",
    "what_next",
    "generated_at",
    "sent_at",
    "approved_at",
  ],
  review_approvals: [
    "id",
    "review_id",
    "proposal_index",
    "proposal_label",
    "proposal_detail",
    "proposal_type",
    "status",
    "client_note",
    "decided_at",
    "decided_by",
    "resulting_action_id",
    "resulting_decision_id",
  ],
  client_user_links: [
    "id",
    "auth_user_id",
    "client_id",
    "role",
    "created_at",
  ],
  clients: [
    "id",
    "name",
    "industry",
  ],
  meta_execution_queue: [
    "id",
    "client_id",
    "campaign_id",
    "ad_id",
    "adset_meta_id",
    "ad_meta_id",
    "decision_type",
    "proposed_payload",
    "reason",
    "risk_level",
    "status",
    "approved_by",
    "approved_at",
    "executed_at",
    "execution_result",
    "execution_error",
    "last_checked_at",
    "last_checked_state",
    "source_pattern_key",
    "source_pattern_industry",
    "created_at",
  ],
  pattern_feedback: [
    "pattern_key",
    "industry",
    "engine_uses",
    "positive_verdicts",
    "negative_verdicts",
    "neutral_verdicts",
    "inconclusive_verdicts",
    "last_verdict_at",
    "created_at",
    "updated_at",
    "retired_at",
    "retired_reason",
  ],
  pattern_lifecycle_events: [
    "id",
    "pattern_key",
    "industry",
    "event_type",
    "reason",
    "actor",
    "positive_at_event",
    "negative_at_event",
    "occurred_at",
  ],
  decision_outcomes: [
    "id",
    "queue_id",
    "ad_id",
    "client_id",
    "decision_type",
    "baseline_captured_at",
    "baseline_impressions",
    "baseline_clicks",
    "baseline_spend_cents",
    "baseline_ctr",
    "baseline_cpm",
    "followup_due_at",
    "followup_captured_at",
    "followup_impressions",
    "followup_clicks",
    "followup_spend_cents",
    "followup_ctr",
    "followup_cpm",
    "ctr_lift_pct",
    "cpm_change_pct",
    "verdict",
    "verdict_reason",
    "status",
    "measured_at",
    "error",
    "created_at",
  ],
};

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let failed = 0;

for (const [table, cols] of Object.entries(SCHEMA)) {
  // Happy path: SELECT every expected column at once. LIMIT 0 means we never
  // pull rows, just validate that the SELECT itself parses.
  const probe = await supabase.from(table).select(cols.join(",")).limit(0);

  if (!probe.error) {
    console.log(
      `${GREEN}✓${RESET} ${table} ${DIM}(${cols.length} columns)${RESET}`
    );
    continue;
  }

  // PostgREST returns 42P01 when the relation doesn't exist at all.
  if (probe.error.code === "42P01") {
    console.log(`${RED}✗${RESET} ${table} ${YELLOW}(table does not exist)${RESET}`);
    failed += 1;
    continue;
  }

  // Otherwise the table exists but at least one column is missing. Bisect
  // column-by-column so we can tell the operator exactly what to migrate.
  console.log(`${RED}✗${RESET} ${table}`);
  console.log(`  ${DIM}${probe.error.message}${RESET}`);

  const missing = [];
  for (const col of cols) {
    const single = await supabase.from(table).select(col).limit(0);
    if (single.error && single.error.code !== "42P01") {
      missing.push(col);
    }
  }
  if (missing.length > 0) {
    console.log(
      `  ${YELLOW}missing columns:${RESET} ${missing.join(", ")}`
    );
  }
  failed += 1;
}

console.log();
if (failed === 0) {
  console.log(`${GREEN}All schema checks passed.${RESET}`);
  process.exit(0);
}

console.log(
  `${RED}${failed} table${failed === 1 ? "" : "s"} failed schema checks.${RESET}`
);
console.log(
  `${DIM}Apply the matching files from supabase/migrations/, or fix the live DB via the Supabase SQL editor.${RESET}`
);
process.exit(1);
