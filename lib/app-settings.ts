/**
 * Tunable runtime settings for the agency.
 *
 * Reads from the `app_settings` key/value store and falls back to the
 * compile-time defaults when a key is missing or malformed. The defaults
 * are the source of truth for "what does the engine do out of the box"
 * — the table only matters once an operator has opened Settings and
 * dialed something in.
 *
 * First and only customer right now is the stale pattern reaper, which
 * needs two knobs: how many decisive verdicts a pattern needs before it's
 * eligible for retirement, and what fraction of those verdicts have to
 * be negative to actually retire it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReaperSettings = {
  // Minimum (positive + negative) verdicts a pattern needs before the
  // reaper is allowed to retire it. Below this, the sample is too small
  // to act on regardless of how lopsided the ratio looks.
  minDecisiveVerdicts: number;
  // Fraction of decisive verdicts that have to be negative for the
  // reaper to retire a pattern. 0.6 means "60% or more of measured
  // outcomes were bad".
  negRatio: number;
};

// Source-of-truth defaults — cron, helper, and settings UI all read
// from here so "default" means the same thing in every surface.
export const DEFAULT_REAPER_SETTINGS: ReaperSettings = {
  minDecisiveVerdicts: 5,
  negRatio: 0.6,
};

// Validation bounds. Operators can pick anything inside these; the
// settings page enforces the same range with HTML5 min/max attributes
// so the failure mode in the UI is "you can't enter that" rather than
// "you saved it and it silently didn't take".
export const REAPER_BOUNDS = {
  minDecisiveVerdicts: { min: 3, max: 50 },
  // Below 0.5 we'd retire patterns that are net positive — incoherent.
  // Above 0.95 we'd basically never retire anything.
  negRatio: { min: 0.5, max: 0.95 },
} as const;

const REAPER_KEY = "reaper_thresholds";

export async function getReaperSettings(
  supabase: SupabaseClient
): Promise<ReaperSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", REAPER_KEY)
    .maybeSingle<{ value: { minDecisiveVerdicts?: unknown; negRatio?: unknown } }>();

  // Fall back silently on read errors — the reaper running with default
  // thresholds is strictly better than failing the cron because someone
  // hasn't applied the migration yet.
  if (error || !data?.value) return DEFAULT_REAPER_SETTINGS;

  const raw = data.value;
  const minDecisive = Number(raw.minDecisiveVerdicts);
  const ratio = Number(raw.negRatio);

  // Defensive defaults per-field, not all-or-nothing. A row that has only
  // one valid field is more useful than a row that gets thrown out wholesale.
  return {
    minDecisiveVerdicts:
      Number.isFinite(minDecisive) &&
      minDecisive >= REAPER_BOUNDS.minDecisiveVerdicts.min &&
      minDecisive <= REAPER_BOUNDS.minDecisiveVerdicts.max
        ? Math.round(minDecisive)
        : DEFAULT_REAPER_SETTINGS.minDecisiveVerdicts,
    negRatio:
      Number.isFinite(ratio) &&
      ratio >= REAPER_BOUNDS.negRatio.min &&
      ratio <= REAPER_BOUNDS.negRatio.max
        ? ratio
        : DEFAULT_REAPER_SETTINGS.negRatio,
  };
}

export async function setReaperSettings(
  supabase: SupabaseClient,
  next: ReaperSettings
): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: REAPER_KEY,
      value: {
        minDecisiveVerdicts: next.minDecisiveVerdicts,
        negRatio: next.negRatio,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(`save reaper settings: ${error.message}`);
}
