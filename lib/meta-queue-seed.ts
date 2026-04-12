/**
 * Meta execution queue — engine-side seeder.
 *
 * The decision engine (and any future automated source) calls these helpers
 * to drop a `pending` row into `meta_execution_queue`. The seeders are
 * deliberately MORE restrictive than the executor — the executor's hard
 * caps are the last line of defence; the seeder is the first.
 *
 * Why have a seeder layer at all instead of inserting straight from the
 * engine?
 *
 *   1. **Dedupe.** We never want two pending rows for the same action on
 *      the same Meta object — that produces duplicate work for the operator
 *      and risks a double-execute race. The seeder checks for an existing
 *      pending/approved row first.
 *
 *   2. **Shape enforcement.** The executor route deserialises whatever JSON
 *      is in `proposed_payload` and trusts the keys. Centralising the
 *      payload construction here means there's exactly one place where
 *      "the queue payload shape for pause_ad" is defined.
 *
 *   3. **Risk classification.** The seeder is the right place to assign
 *      `risk_level` because it has the engine's full context (was this a
 *      first-time trigger? a repeat? etc.). The executor only sees the
 *      queued row and has no idea about reliability.
 *
 * Caller passes a supabase client — we don't construct one here so this
 * file stays usable from both server actions and API routes without
 * dragging in a Next.js-specific helper.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// Conservative defaults. Bumped only by an explicit override on the call
// site, never by changing these constants — they're the "what does the
// engine want by default" baseline.
export const DEFAULT_BUDGET_BUMP_PCT = 15;

export type SeedResult =
  | { ok: true; queueId: number; deduped: false }
  | { ok: true; queueId: number; deduped: true }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Dedupe helper. Returns the id of an existing pending OR approved row that
// already covers the same target+action, or null if there isn't one.
// ---------------------------------------------------------------------------
async function findOpenRow(
  supabase: SupabaseClient,
  decisionType: string,
  targetColumn: "ad_meta_id" | "adset_meta_id",
  targetValue: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("meta_execution_queue")
    .select("id")
    .eq("decision_type", decisionType)
    .eq(targetColumn, targetValue)
    .in("status", ["pending", "approved"])
    .limit(1);

  if (error) {
    // Treat dedupe-check failures as "no existing row" — the worst case is
    // a duplicate queue entry, which is recoverable. Failing the seed
    // outright would silently swallow useful engine output.
    console.error("meta-queue-seed dedupe check failed:", error);
    return null;
  }

  if (data && data.length > 0) {
    return Number(data[0].id);
  }
  return null;
}

// ---------------------------------------------------------------------------
// pause_ad
// ---------------------------------------------------------------------------

/**
 * Provenance fields written onto the queue row when the decision came from
 * a pattern in global_learnings. Both null for rule-engine decisions. The
 * verdict feedback loop reads these from the queue row to attribute outcomes
 * back to the originating pattern.
 */
export type PatternSource = {
  sourcePatternKey?: string | null;
  sourcePatternIndustry?: string | null;
};

export type SeedPauseAdInput = PatternSource & {
  clientId: number | null;
  campaignId: number | null;
  adId: number | null;
  adMetaId: string;
  reason: string;
  /** Defaults to "low" — pausing is the safest write we can do. */
  riskLevel?: "low" | "medium" | "high";
};

export async function seedPauseAd(
  supabase: SupabaseClient,
  input: SeedPauseAdInput
): Promise<SeedResult> {
  if (!input.adMetaId) {
    return { ok: false, error: "seedPauseAd: adMetaId is required" };
  }

  const existing = await findOpenRow(
    supabase,
    "pause_ad",
    "ad_meta_id",
    input.adMetaId
  );
  if (existing) {
    return { ok: true, queueId: existing, deduped: true };
  }

  const { data, error } = await supabase
    .from("meta_execution_queue")
    .insert({
      client_id: input.clientId,
      campaign_id: input.campaignId,
      ad_id: input.adId,
      ad_meta_id: input.adMetaId,
      decision_type: "pause_ad",
      proposed_payload: { status: "PAUSED" },
      reason: input.reason,
      risk_level: input.riskLevel ?? "low",
      status: "pending",
      source_pattern_key: input.sourcePatternKey ?? null,
      source_pattern_industry: input.sourcePatternIndustry ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert returned no row" };
  }
  return { ok: true, queueId: Number(data.id), deduped: false };
}

// ---------------------------------------------------------------------------
// increase_adset_budget
//
// Note we do NOT cache the ad set's current daily_budget on the queue row.
// The reason: between seeding and execution, an operator may have manually
// adjusted the budget in Ads Manager, and we'd rather respect THAT and
// re-derive the proposed cents at execute time than overwrite an
// operator's intentional change. The executor accepts an optional
// `expectedCurrentBudgetCents` for drift detection — we leave that out
// here on purpose so the executor only knows the percent change.
// ---------------------------------------------------------------------------

export type SeedIncreaseAdsetBudgetInput = PatternSource & {
  clientId: number | null;
  campaignId: number | null;
  adId: number | null;
  adsetMetaId: string;
  /** Percent change requested by the engine. Defaults to +15%. */
  percentChange?: number;
  reason: string;
  riskLevel?: "low" | "medium" | "high";
};

export async function seedIncreaseAdsetBudget(
  supabase: SupabaseClient,
  input: SeedIncreaseAdsetBudgetInput
): Promise<SeedResult> {
  if (!input.adsetMetaId) {
    return { ok: false, error: "seedIncreaseAdsetBudget: adsetMetaId is required" };
  }

  const percentChange = input.percentChange ?? DEFAULT_BUDGET_BUMP_PCT;
  if (percentChange <= 0 || percentChange > 20) {
    // Mirror the executor's hard cap at the seed layer too — refuse to
    // even create a queue row that would be guaranteed to fail validation.
    return {
      ok: false,
      error: `percentChange must be in (0, 20] — got ${percentChange}`,
    };
  }

  const existing = await findOpenRow(
    supabase,
    "increase_adset_budget",
    "adset_meta_id",
    input.adsetMetaId
  );
  if (existing) {
    return { ok: true, queueId: existing, deduped: true };
  }

  const { data, error } = await supabase
    .from("meta_execution_queue")
    .insert({
      client_id: input.clientId,
      campaign_id: input.campaignId,
      ad_id: input.adId,
      adset_meta_id: input.adsetMetaId,
      decision_type: "increase_adset_budget",
      proposed_payload: { percent_change: percentChange },
      reason: input.reason,
      risk_level: input.riskLevel ?? "low",
      status: "pending",
      source_pattern_key: input.sourcePatternKey ?? null,
      source_pattern_industry: input.sourcePatternIndustry ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert returned no row" };
  }
  return { ok: true, queueId: Number(data.id), deduped: false };
}

// ---------------------------------------------------------------------------
// duplicate_ad
//
// Not currently called by the engine — the existing decision generator
// doesn't produce a "duplicate" decision type. Exposed here so future
// engine work (or a manual operator action) has a single canonical seeder
// to call. Always copies to PAUSED at execute time (the executor sets
// status_option=PAUSED), so this is safe to expose.
// ---------------------------------------------------------------------------

export type SeedDuplicateAdInput = {
  clientId: number | null;
  campaignId: number | null;
  adId: number | null;
  adMetaId: string;
  newNameSuffix?: string;
  reason: string;
  riskLevel?: "low" | "medium" | "high";
};

export async function seedDuplicateAd(
  supabase: SupabaseClient,
  input: SeedDuplicateAdInput
): Promise<SeedResult> {
  if (!input.adMetaId) {
    return { ok: false, error: "seedDuplicateAd: adMetaId is required" };
  }

  const existing = await findOpenRow(
    supabase,
    "duplicate_ad",
    "ad_meta_id",
    input.adMetaId
  );
  if (existing) {
    return { ok: true, queueId: existing, deduped: true };
  }

  const payload: Record<string, unknown> = {};
  if (input.newNameSuffix) payload.new_name_suffix = input.newNameSuffix;

  const { data, error } = await supabase
    .from("meta_execution_queue")
    .insert({
      client_id: input.clientId,
      campaign_id: input.campaignId,
      ad_id: input.adId,
      ad_meta_id: input.adMetaId,
      decision_type: "duplicate_ad",
      proposed_payload: payload,
      reason: input.reason,
      risk_level: input.riskLevel ?? "medium",
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert returned no row" };
  }
  return { ok: true, queueId: Number(data.id), deduped: false };
}
