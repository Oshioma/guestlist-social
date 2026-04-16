// Shared loader for the pattern_feedback ledger. The dashboard's
// PatternFeedbackPanel and the settings-page reaper dry-run both want the
// same thing: every feedback row, joined against global_learnings for the
// fallback label, projected into its English phrasing. Keeping one loader
// stops the two surfaces from drifting on how a row is built.
//
// Returns the union — active AND retired rows. Callers filter locally;
// the server-component wire cost is zero because nothing leaves the
// process before the caller has already narrowed it down.

import type { SupabaseClient } from "@supabase/supabase-js";
import { actionPhrase } from "./pattern-phrases";

export type AnnotatedPatternRow = {
  pattern_key: string;
  industry: string | null;
  positive: number;
  negative: number;
  decisive: number;
  retired_at: string | null;
  retired_reason: string | null;
  label: string | null;
  phrase: string;
};

export async function fetchAnnotatedPatternFeedback(
  supabase: SupabaseClient
): Promise<{ rows: AnnotatedPatternRow[]; error: string | null }> {
  const [feedback, learnings] = await Promise.all([
    supabase
      .from("pattern_feedback")
      .select(
        "pattern_key, industry, positive_verdicts, negative_verdicts, retired_at, retired_reason"
      ),
    supabase.from("global_learnings").select("pattern_key, pattern_label"),
  ]);

  if (feedback.error) {
    return { rows: [], error: feedback.error.message };
  }

  // First label for a key wins — duplicate rows across industry slices
  // carry the same human-readable phrasing, so the tiebreak doesn't matter.
  const labelByKey = new Map<string, string>();
  for (const r of (learnings.data ?? []) as {
    pattern_key: string;
    pattern_label: string | null;
  }[]) {
    if (!labelByKey.has(r.pattern_key) && r.pattern_label) {
      labelByKey.set(r.pattern_key, r.pattern_label);
    }
  }

  const rows: AnnotatedPatternRow[] = [];
  for (const f of (feedback.data ?? []) as {
    pattern_key: string;
    industry: string | null;
    positive_verdicts: number | null;
    negative_verdicts: number | null;
    retired_at: string | null;
    retired_reason: string | null;
  }[]) {
    const positive = Number(f.positive_verdicts ?? 0);
    const negative = Number(f.negative_verdicts ?? 0);
    const label = labelByKey.get(f.pattern_key) ?? null;
    rows.push({
      pattern_key: f.pattern_key,
      industry: f.industry,
      positive,
      negative,
      decisive: positive + negative,
      retired_at: f.retired_at,
      retired_reason: f.retired_reason,
      label,
      phrase: actionPhrase(f.pattern_key, label),
    });
  }

  return { rows, error: null };
}

// Append-only audit log for pattern lifecycle changes. Both the reaper
// cron and the unretire route call this so the history of every state
// change is reconstructible without scraping cron logs. Failures here
// must never roll back the underlying state change — the audit row is
// nice-to-have, the operator-visible flag is the source of truth.
export type PatternLifecycleEvent = {
  patternKey: string;
  industry: string | null;
  eventType: "retired" | "unretired";
  reason: string | null;
  actor: string;
  positiveAtEvent?: number | null;
  negativeAtEvent?: number | null;
};

export async function recordPatternLifecycleEvent(
  supabase: SupabaseClient,
  event: PatternLifecycleEvent
): Promise<void> {
  const { error } = await supabase.from("pattern_lifecycle_events").insert({
    pattern_key: event.patternKey,
    industry: event.industry ?? "",
    event_type: event.eventType,
    reason: event.reason,
    actor: event.actor,
    positive_at_event: event.positiveAtEvent ?? null,
    negative_at_event: event.negativeAtEvent ?? null,
  });
  if (error) {
    // Surface to the cron log without throwing — the caller has already
    // mutated pattern_feedback successfully and we don't want a missing
    // table or transient DB hiccup to fail the user-visible action.
    console.error(
      `[pattern-lifecycle] failed to record ${event.eventType} for ${event.patternKey}|${event.industry ?? ""}: ${error.message}`
    );
  }
}
