/**
 * Decision outcome tracking — closes the prediction loop.
 *
 * The decision engine seeds the queue, the executor pushes the change to
 * Meta, and *this* file checks whether the prediction was right N days
 * later. Without it the engine ships recommendations into the void; with
 * it, every executed row gets paired with a measured outcome and the
 * dashboard can answer "how often is the engine actually right?".
 *
 * Two halves:
 *
 *   captureBaseline(...)   — called from /api/meta-execute-decision right
 *                            after a successful execute. Snapshots whatever
 *                            the ads row reported at that moment and creates
 *                            the decision_outcomes row in
 *                            `awaiting_followup` status.
 *
 *   measureDueOutcomes(...) — called from /api/measure-decision-outcomes
 *                            (a cron-style sweep). Finds outcomes whose
 *                            follow-up window has elapsed, re-reads the
 *                            current ads metrics, computes lift, and
 *                            writes the verdict.
 *
 * The lift math is intentionally crude. CTR and CPM are ratios — we can't
 * just diff lifetime totals — so we read whatever the ads row reports now
 * and compare against what it reported at execute time. That's noisy
 * (especially for budget bumps where impressions surge), but it's a
 * starting signal. Future iterations can replace this with a windowed
 * Meta insights call without changing the schema.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How long to wait after execution before measuring. Long enough that
 * Meta's reporting has settled and the change has had room to breathe;
 * short enough that the verdict is still actionable.
 */
export const FOLLOWUP_WINDOW_DAYS = 7;

/**
 * Lift band for verdicts. Anything inside ±LIFT_NEUTRAL_BAND_PCT is
 * "neutral" — the engine didn't move the needle either way.
 */
export const LIFT_NEUTRAL_BAND_PCT = 5;

/**
 * Minimum impressions on either side for a verdict to count. Below this we
 * call it `inconclusive` because CTR / CPM are too noisy at low volume.
 */
export const MIN_IMPRESSIONS_FOR_VERDICT = 500;

// ---------------------------------------------------------------------------
// Snapshot shape
// ---------------------------------------------------------------------------

type AdMetricsSnapshot = {
  impressions: number | null;
  clicks: number | null;
  spend_cents: number | null;
  ctr: number | null;
  cpm: number | null;
};

/**
 * Read the current ads row and return the metric fields we care about.
 * `spend` is stored as a numeric (dollars) in the ads table, so we coerce
 * to integer cents to match Meta's normal representation. Anything missing
 * comes back as null and is allowed — the verdict step will mark
 * `inconclusive` if there's not enough to compare.
 */
async function readAdMetrics(
  supabase: SupabaseClient,
  adId: number
): Promise<AdMetricsSnapshot | null> {
  const { data, error } = await supabase
    .from("ads")
    .select("impressions, clicks, spend, ctr, cpm")
    .eq("id", adId)
    .single<{
      impressions: number | null;
      clicks: number | null;
      spend: number | null;
      ctr: number | null;
      cpm: number | null;
    }>();

  if (error || !data) return null;

  const spendCents =
    data.spend != null ? Math.round(Number(data.spend) * 100) : null;

  return {
    impressions: data.impressions != null ? Number(data.impressions) : null,
    clicks: data.clicks != null ? Number(data.clicks) : null,
    spend_cents: spendCents,
    ctr: data.ctr != null ? Number(data.ctr) : null,
    cpm: data.cpm != null ? Number(data.cpm) : null,
  };
}

// ---------------------------------------------------------------------------
// captureBaseline — called after a successful execute
// ---------------------------------------------------------------------------

export type CaptureBaselineInput = {
  queueId: number;
  adId: number | null;
  clientId: number | null;
  decisionType: string;
};

/**
 * Snapshot the ad's current metrics into a decision_outcomes row. Best
 * effort — we never want a baseline-capture failure to look like an
 * execute failure, so the caller should swallow errors and log them.
 *
 * If `adId` is null (e.g. an adset-level decision with no local ad
 * binding), we still write a row with all-null baseline metrics so the
 * follow-up sweep at least knows the decision happened. The verdict will
 * land as `inconclusive` in that case.
 */
export async function captureBaseline(
  supabase: SupabaseClient,
  input: CaptureBaselineInput
): Promise<{ ok: boolean; outcomeId?: number; error?: string }> {
  const { queueId, adId, clientId, decisionType } = input;

  let snapshot: AdMetricsSnapshot | null = null;
  if (adId != null) {
    snapshot = await readAdMetrics(supabase, adId);
  }

  const followupDue = new Date(
    Date.now() + FOLLOWUP_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("decision_outcomes")
    .insert({
      queue_id: queueId,
      ad_id: adId,
      client_id: clientId,
      decision_type: decisionType,
      baseline_captured_at: new Date().toISOString(),
      baseline_impressions: snapshot?.impressions ?? null,
      baseline_clicks: snapshot?.clicks ?? null,
      baseline_spend_cents: snapshot?.spend_cents ?? null,
      baseline_ctr: snapshot?.ctr ?? null,
      baseline_cpm: snapshot?.cpm ?? null,
      followup_due_at: followupDue,
      status: "awaiting_followup",
    })
    .select("id")
    .single<{ id: number }>();

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, outcomeId: data.id };
}

// ---------------------------------------------------------------------------
// measureDueOutcomes — called from /api/measure-decision-outcomes
// ---------------------------------------------------------------------------

type DueOutcomeRow = {
  id: number;
  queue_id: number;
  ad_id: number | null;
  decision_type: string;
  baseline_impressions: number | null;
  baseline_clicks: number | null;
  baseline_spend_cents: number | null;
  baseline_ctr: number | null;
  baseline_cpm: number | null;
  followup_due_at: string;
};

export type MeasureSweepResult = {
  ok: true;
  scanned: number;
  measured: number;
  inconclusive: number;
  failed: number;
  details: Array<{
    outcomeId: number;
    queueId: number;
    verdict: string | null;
    reason?: string;
  }>;
};

/**
 * Scan for outcomes whose follow-up window has elapsed, then resolve each
 * one. Caller is the cron route — this function holds the supabase client
 * and orchestrates the per-row work.
 */
export async function measureDueOutcomes(
  supabase: SupabaseClient,
  options: { limit?: number } = {}
): Promise<MeasureSweepResult> {
  const limit = options.limit ?? 50;
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("decision_outcomes")
    .select(
      "id, queue_id, ad_id, decision_type, baseline_impressions, baseline_clicks, baseline_spend_cents, baseline_ctr, baseline_cpm, followup_due_at"
    )
    .eq("status", "awaiting_followup")
    .lte("followup_due_at", nowIso)
    .order("followup_due_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`measureDueOutcomes load failed: ${error.message}`);
  }

  const result: MeasureSweepResult = {
    ok: true,
    scanned: due?.length ?? 0,
    measured: 0,
    inconclusive: 0,
    failed: 0,
    details: [],
  };

  for (const row of (due ?? []) as DueOutcomeRow[]) {
    try {
      const outcome = await measureOne(supabase, row);
      result.details.push(outcome);
      if (outcome.verdict === "inconclusive") result.inconclusive += 1;
      else if (outcome.verdict) result.measured += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      result.failed += 1;
      result.details.push({
        outcomeId: row.id,
        queueId: row.queue_id,
        verdict: null,
        reason: message,
      });
      // Mark the row failed so the sweep doesn't keep retrying it forever.
      // The operator can re-queue manually if they want another shot.
      await supabase
        .from("decision_outcomes")
        .update({
          status: "failed",
          error: message,
          measured_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }

  return result;
}

/**
 * Measure a single decision_outcomes row. Pulls fresh metrics from the
 * ads table (whatever meta-sync last wrote), computes lift, classifies
 * the verdict, and writes the row. Throws on a database error so the
 * sweep loop can mark the row failed.
 */
async function measureOne(
  supabase: SupabaseClient,
  row: DueOutcomeRow
): Promise<{
  outcomeId: number;
  queueId: number;
  verdict: string;
  reason?: string;
}> {
  // No local ad binding → can't measure. Mark inconclusive immediately.
  if (row.ad_id == null) {
    await markVerdict(supabase, row.id, row.queue_id, {
      followup: emptyMetrics(),
      ctr_lift_pct: null,
      cpm_change_pct: null,
      verdict: "inconclusive",
      verdict_reason: "No local ad_id on the queue row — nothing to measure.",
    });
    return {
      outcomeId: row.id,
      queueId: row.queue_id,
      verdict: "inconclusive",
      reason: "no ad_id",
    };
  }

  const followup = await readAdMetrics(supabase, row.ad_id);
  if (!followup) {
    await markVerdict(supabase, row.id, row.queue_id, {
      followup: emptyMetrics(),
      ctr_lift_pct: null,
      cpm_change_pct: null,
      verdict: "inconclusive",
      verdict_reason: "Ad row no longer present (deleted or unsynced).",
    });
    return {
      outcomeId: row.id,
      queueId: row.queue_id,
      verdict: "inconclusive",
      reason: "ad gone",
    };
  }

  const verdict = classifyVerdict({
    decisionType: row.decision_type,
    baselineCtr: row.baseline_ctr,
    baselineCpm: row.baseline_cpm,
    baselineImpressions: row.baseline_impressions,
    followup,
  });

  await markVerdict(supabase, row.id, row.queue_id, {
    followup,
    ctr_lift_pct: verdict.ctrLiftPct,
    cpm_change_pct: verdict.cpmChangePct,
    verdict: verdict.label,
    verdict_reason: verdict.reason,
  });

  return {
    outcomeId: row.id,
    queueId: row.queue_id,
    verdict: verdict.label,
    reason: verdict.reason,
  };
}

function emptyMetrics(): AdMetricsSnapshot {
  return {
    impressions: null,
    clicks: null,
    spend_cents: null,
    ctr: null,
    cpm: null,
  };
}

async function markVerdict(
  supabase: SupabaseClient,
  outcomeId: number,
  queueId: number,
  patch: {
    followup: AdMetricsSnapshot;
    ctr_lift_pct: number | null;
    cpm_change_pct: number | null;
    verdict: string;
    verdict_reason: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from("decision_outcomes")
    .update({
      followup_captured_at: new Date().toISOString(),
      followup_impressions: patch.followup.impressions,
      followup_clicks: patch.followup.clicks,
      followup_spend_cents: patch.followup.spend_cents,
      followup_ctr: patch.followup.ctr,
      followup_cpm: patch.followup.cpm,
      ctr_lift_pct: patch.ctr_lift_pct,
      cpm_change_pct: patch.cpm_change_pct,
      verdict: patch.verdict,
      verdict_reason: patch.verdict_reason,
      status: "measured",
      measured_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", outcomeId);

  if (error) {
    throw new Error(`markVerdict update failed: ${error.message}`);
  }

  // Feedback loop: if the originating queue row was a pattern-backed
  // decision, nudge pattern_feedback. Failures here are best-effort and
  // do NOT throw — the verdict has already been written and we don't want
  // a feedback ledger blip to mark the outcome row failed.
  try {
    await applyVerdictToPattern(supabase, queueId, patch.verdict);
  } catch (err) {
    console.error("applyVerdictToPattern failed:", err);
  }
}

/**
 * Read the originating queue row's source_pattern_key/industry. If both are
 * present, increment the matching pattern_feedback row's verdict counter.
 * No-op for rule-engine decisions (source_pattern_key=null).
 *
 * This is the durable side of the feedback loop. The next time
 * /api/generate-global-learnings rebuilds global_learnings, it reads
 * pattern_feedback and folds these counts into the new consistency_score.
 */
async function applyVerdictToPattern(
  supabase: SupabaseClient,
  queueId: number,
  verdict: string
): Promise<void> {
  const { data: queueRow, error: queueErr } = await supabase
    .from("meta_execution_queue")
    .select("source_pattern_key, source_pattern_industry")
    .eq("id", queueId)
    .single<{
      source_pattern_key: string | null;
      source_pattern_industry: string | null;
    }>();

  if (queueErr || !queueRow) return;
  if (!queueRow.source_pattern_key) return;

  // Empty string is the agency-wide sentinel — keeps the (pattern_key,
  // industry) primary key clean without COALESCE expression indexes.
  const industry = queueRow.source_pattern_industry ?? "";
  const patternKey = queueRow.source_pattern_key;

  // Read-modify-write rather than a SQL increment because the supabase-js
  // client doesn't expose raw SQL increments without an RPC. Race-condition
  // wise: this runs once per outcome row from the cron sweep, so the
  // contention window is effectively zero.
  const { data: existing } = await supabase
    .from("pattern_feedback")
    .select(
      "engine_uses, positive_verdicts, negative_verdicts, neutral_verdicts, inconclusive_verdicts"
    )
    .eq("pattern_key", patternKey)
    .eq("industry", industry)
    .maybeSingle<{
      engine_uses: number;
      positive_verdicts: number;
      negative_verdicts: number;
      neutral_verdicts: number;
      inconclusive_verdicts: number;
    }>();

  // Bump the matching counter. Anything we don't recognise lands in
  // inconclusive_verdicts so we don't silently lose the signal.
  let positive = existing?.positive_verdicts ?? 0;
  let negative = existing?.negative_verdicts ?? 0;
  let neutral = existing?.neutral_verdicts ?? 0;
  let inconclusive = existing?.inconclusive_verdicts ?? 0;
  switch (verdict) {
    case "positive":
      positive += 1;
      break;
    case "negative":
      negative += 1;
      break;
    case "neutral":
      neutral += 1;
      break;
    default:
      inconclusive += 1;
      break;
  }

  const { error: upsertErr } = await supabase
    .from("pattern_feedback")
    .upsert(
      {
        pattern_key: patternKey,
        industry,
        engine_uses: (existing?.engine_uses ?? 0) + 1,
        positive_verdicts: positive,
        negative_verdicts: negative,
        neutral_verdicts: neutral,
        inconclusive_verdicts: inconclusive,
        last_verdict_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pattern_key,industry" }
    );

  if (upsertErr) {
    throw new Error(`pattern_feedback upsert failed: ${upsertErr.message}`);
  }
}

// ---------------------------------------------------------------------------
// Verdict classifier
// ---------------------------------------------------------------------------

type ClassifyInput = {
  decisionType: string;
  baselineCtr: number | null;
  baselineCpm: number | null;
  baselineImpressions: number | null;
  followup: AdMetricsSnapshot;
};

type ClassifiedVerdict = {
  label: "positive" | "neutral" | "negative" | "inconclusive";
  reason: string;
  ctrLiftPct: number | null;
  cpmChangePct: number | null;
};

/**
 * Classification rules:
 *
 *   pause_ad        — success means we paused something that was already
 *                     underperforming. We don't expect the paused ad's
 *                     metrics to improve (no new impressions). Verdict
 *                     just confirms the action stuck — `positive` if the
 *                     follow-up impressions are flat (Δ < 5%), neutral
 *                     otherwise. Negative would mean the ad somehow
 *                     received a flood of new impressions despite being
 *                     paused, which is weird but possible if reporting
 *                     lagged.
 *
 *   increase_adset_budget — success means CTR did NOT degrade (volume
 *                     test). We compare follow-up CTR to baseline CTR and
 *                     classify by ±5% band.
 *
 *   duplicate_ad   — the duplicate is a different ad row, so measuring
 *                     against the source isn't meaningful here. Mark
 *                     inconclusive — a future iteration should look up
 *                     the new ad and measure it on its own track.
 *
 * Anything below MIN_IMPRESSIONS_FOR_VERDICT on either snapshot is
 * inconclusive — small samples are too noisy to ride.
 */
function classifyVerdict(input: ClassifyInput): ClassifiedVerdict {
  const { decisionType, baselineCtr, baselineImpressions, followup } = input;

  const ctrLiftPct =
    baselineCtr != null && baselineCtr > 0 && followup.ctr != null
      ? ((followup.ctr - baselineCtr) / baselineCtr) * 100
      : null;
  const cpmChangePct =
    input.baselineCpm != null && input.baselineCpm > 0 && followup.cpm != null
      ? ((followup.cpm - input.baselineCpm) / input.baselineCpm) * 100
      : null;

  if (decisionType === "duplicate_ad") {
    return {
      label: "inconclusive",
      reason:
        "Duplicate creates a separate ad — measure the new ad's own outcome instead.",
      ctrLiftPct,
      cpmChangePct,
    };
  }

  // Sample-size guard: if either side has fewer than the floor, the
  // numbers are too noisy to trust.
  if (
    (baselineImpressions ?? 0) < MIN_IMPRESSIONS_FOR_VERDICT ||
    (followup.impressions ?? 0) < MIN_IMPRESSIONS_FOR_VERDICT
  ) {
    return {
      label: "inconclusive",
      reason: `Below ${MIN_IMPRESSIONS_FOR_VERDICT}-impression floor on at least one snapshot.`,
      ctrLiftPct,
      cpmChangePct,
    };
  }

  if (decisionType === "pause_ad") {
    // After a real pause, follow-up impressions should be ~equal to
    // baseline (paused ads stop accumulating). A big jump means the
    // pause didn't take.
    const baseImpr = baselineImpressions ?? 0;
    const followImpr = followup.impressions ?? 0;
    const imprDelta = baseImpr > 0 ? ((followImpr - baseImpr) / baseImpr) * 100 : 0;
    if (imprDelta > LIFT_NEUTRAL_BAND_PCT * 2) {
      return {
        label: "negative",
        reason: `Paused ad still accumulated +${imprDelta.toFixed(0)}% impressions — pause may not have taken.`,
        ctrLiftPct,
        cpmChangePct,
      };
    }
    return {
      label: "positive",
      reason: "Pause held — ad stopped delivering as intended.",
      ctrLiftPct,
      cpmChangePct,
    };
  }

  if (decisionType === "increase_adset_budget") {
    if (ctrLiftPct == null) {
      return {
        label: "inconclusive",
        reason: "Missing CTR on baseline or follow-up snapshot.",
        ctrLiftPct,
        cpmChangePct,
      };
    }
    if (ctrLiftPct > LIFT_NEUTRAL_BAND_PCT) {
      return {
        label: "positive",
        reason: `CTR +${ctrLiftPct.toFixed(1)}% after budget bump — volume increase did not degrade quality.`,
        ctrLiftPct,
        cpmChangePct,
      };
    }
    if (ctrLiftPct < -LIFT_NEUTRAL_BAND_PCT) {
      return {
        label: "negative",
        reason: `CTR ${ctrLiftPct.toFixed(1)}% after budget bump — extra spend bought worse traffic.`,
        ctrLiftPct,
        cpmChangePct,
      };
    }
    return {
      label: "neutral",
      reason: `CTR ${ctrLiftPct.toFixed(1)}% — within ±${LIFT_NEUTRAL_BAND_PCT}% band.`,
      ctrLiftPct,
      cpmChangePct,
    };
  }

  if (decisionType === "decrease_adset_budget") {
    // Pullback verdict mirrors the bump verdict by design: if cutting spend
    // didn't tank CTR, the cut was a clean save. If CTR collapsed, the cut
    // killed the ad set. Symmetric with the increase path so the engine
    // feedback ledger reads them the same way.
    if (ctrLiftPct == null) {
      return {
        label: "inconclusive",
        reason: "Missing CTR on baseline or follow-up snapshot.",
        ctrLiftPct,
        cpmChangePct,
      };
    }
    if (ctrLiftPct > LIFT_NEUTRAL_BAND_PCT) {
      return {
        label: "positive",
        reason: `CTR +${ctrLiftPct.toFixed(1)}% after pullback — cutting spend trimmed the worst traffic.`,
        ctrLiftPct,
        cpmChangePct,
      };
    }
    if (ctrLiftPct < -LIFT_NEUTRAL_BAND_PCT) {
      return {
        label: "negative",
        reason: `CTR ${ctrLiftPct.toFixed(1)}% after pullback — the cut starved the ad set.`,
        ctrLiftPct,
        cpmChangePct,
      };
    }
    return {
      label: "neutral",
      reason: `CTR ${ctrLiftPct.toFixed(1)}% — within ±${LIFT_NEUTRAL_BAND_PCT}% band.`,
      ctrLiftPct,
      cpmChangePct,
    };
  }

  return {
    label: "inconclusive",
    reason: `Unknown decision_type ${decisionType}.`,
    ctrLiftPct,
    cpmChangePct,
  };
}
