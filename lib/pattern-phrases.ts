// Plain-English phrase layer for pattern_keys minted by
// generate-global-learnings. The dashboard's PatternFeedbackPanel and the
// settings-page reaper preview both read from this — extracted into one
// module so the two surfaces can't drift in what they call things.
//
// Adding a new pattern_key in generate-global-learnings is a one-line
// addition here; unknowns fall through to a lowercased version of the
// operator-facing label (or a humanised form of the key itself), so the
// UI never shows a raw snake_case string to a non-engineer.

export const ACTION_PHRASES: Record<string, string> = {
  "budget:scale_up": "spending more on winners",
  "budget:scale_down": "cutting spend on losers",
  "budget:pause": "pausing spend on the worst ads",
  "budget:general": "tweaking budgets",
  "creative:pause_replace": "swapping out tired creatives",
  "creative:test_new": "testing fresh creative",
  "creative:switch_to_video": "switching from images to video",
  "creative:switch_to_image": "switching from video to images",
  "creative:general": "changing the creative",
  "hook:test_new": "trying a new opening hook",
  "hook:rewrite": "rewriting the hook",
  "hook:shorten": "shortening the hook",
  "hook:general": "changing the hook",
  "audience:narrow": "narrowing the audience",
  "audience:broaden": "broadening the audience",
  "audience:exclude": "excluding the wrong people",
  "audience:general": "changing the targeting",
  "failure:low_ctr": "killing low-CTR ads early",
  "failure:high_cpc": "killing expensive-click ads early",
  "failure:no_conversions": "killing zero-conversion ads early",
  "failure:general": "killing failing ads early",
};

// Strip the industry suffix on per-industry slices so they collapse onto
// the base pattern phrase ("creative:test_new:fitness" → "creative:test_new").
export function basePatternKey(key: string): string {
  const parts = key.split(":");
  if (parts.length <= 2) return key;
  return parts.slice(0, 2).join(":");
}

export function actionPhrase(
  patternKey: string,
  fallbackLabel: string | null
): string {
  const base = basePatternKey(patternKey);
  if (ACTION_PHRASES[base]) return ACTION_PHRASES[base];
  if (fallbackLabel) return fallbackLabel.toLowerCase();
  return base.replace(":", " ");
}

export function capitalise(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
