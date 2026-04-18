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

// ── AI suggestion source settings ────────────────────────────────────────

export type AiSourceSettings = {
  internalData: boolean;
  metaAdLibrary: boolean;
  clientWebsite: boolean;
  clientWebsiteUrl: string;
  imageGeneration: boolean;
  customInstructions: string;
};

export const DEFAULT_AI_SOURCES: AiSourceSettings = {
  internalData: true,
  metaAdLibrary: true,
  clientWebsite: false,
  clientWebsiteUrl: "",
  imageGeneration: false,
  customInstructions: "",
};

const AI_SOURCES_KEY = "ai_suggestion_sources";

export async function getAiSourceSettings(
  supabase: SupabaseClient
): Promise<AiSourceSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", AI_SOURCES_KEY)
    .maybeSingle<{ value: Record<string, unknown> }>();

  if (error || !data?.value) return DEFAULT_AI_SOURCES;
  const raw = data.value;
  return {
    internalData: raw.internalData !== false,
    metaAdLibrary: raw.metaAdLibrary !== false,
    clientWebsite: raw.clientWebsite === true,
    clientWebsiteUrl: typeof raw.clientWebsiteUrl === "string" ? raw.clientWebsiteUrl : "",
    imageGeneration: raw.imageGeneration === true,
    customInstructions: typeof raw.customInstructions === "string" ? raw.customInstructions : "",
  };
}

export async function setAiSourceSettings(
  supabase: SupabaseClient,
  next: AiSourceSettings
): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert(
    { key: AI_SOURCES_KEY, value: next, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw new Error(`save AI source settings: ${error.message}`);
}

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

// ── Engine scoring thresholds ────────────────────────────────────────────

export type EngineThresholds = {
  goodCtr: number;
  badCtr: number;
  goodCpc: number;
  badCpc: number;
  maxCostPerResult: number;
  minSpendToJudge: number;
  minImpressionsToJudge: number;
};

export const DEFAULT_ENGINE_THRESHOLDS: EngineThresholds = {
  goodCtr: 2.0,
  badCtr: 1.0,
  goodCpc: 1.5,
  badCpc: 3.0,
  maxCostPerResult: 8,
  minSpendToJudge: 10,
  minImpressionsToJudge: 1000,
};

export const ENGINE_BOUNDS = {
  goodCtr: { min: 0.5, max: 10 },
  badCtr: { min: 0.1, max: 5 },
  goodCpc: { min: 0.1, max: 10 },
  badCpc: { min: 0.5, max: 20 },
  maxCostPerResult: { min: 1, max: 50 },
  minSpendToJudge: { min: 1, max: 100 },
  minImpressionsToJudge: { min: 100, max: 10000 },
} as const;

const ENGINE_KEY = "engine_thresholds";

export async function getEngineThresholds(
  supabase: SupabaseClient
): Promise<EngineThresholds> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", ENGINE_KEY)
    .maybeSingle<{ value: Record<string, unknown> }>();

  if (error || !data?.value) return DEFAULT_ENGINE_THRESHOLDS;

  const raw = data.value;
  const d = DEFAULT_ENGINE_THRESHOLDS;
  const b = ENGINE_BOUNDS;

  function num(key: keyof EngineThresholds): number {
    const v = Number(raw[key]);
    return Number.isFinite(v) &&
      v >= b[key].min &&
      v <= b[key].max
      ? v
      : d[key];
  }

  return {
    goodCtr: num("goodCtr"),
    badCtr: num("badCtr"),
    goodCpc: num("goodCpc"),
    badCpc: num("badCpc"),
    maxCostPerResult: num("maxCostPerResult"),
    minSpendToJudge: num("minSpendToJudge"),
    minImpressionsToJudge: num("minImpressionsToJudge"),
  };
}

export async function setEngineThresholds(
  supabase: SupabaseClient,
  next: EngineThresholds
): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: ENGINE_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(`save engine thresholds: ${error.message}`);
}

// ── Auto-approve settings ────────────────────────────────────────────────

export type AutoApproveSettings = {
  enabled: boolean;
  minConfidence: "high" | "medium";
  allowedTypes: string[];
};

export const DEFAULT_AUTO_APPROVE: AutoApproveSettings = {
  enabled: false,
  minConfidence: "high",
  allowedTypes: ["pause_or_replace", "kill_test"],
};

const AUTO_APPROVE_KEY = "auto_approve";

export async function getAutoApproveSettings(
  supabase: SupabaseClient
): Promise<AutoApproveSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", AUTO_APPROVE_KEY)
    .maybeSingle<{ value: Record<string, unknown> }>();

  if (error || !data?.value) return DEFAULT_AUTO_APPROVE;

  const raw = data.value;
  const enabled = raw.enabled === true;
  const minConfidence =
    raw.minConfidence === "medium" ? "medium" : "high";
  const allowedTypes = Array.isArray(raw.allowedTypes)
    ? (raw.allowedTypes as string[]).filter(
        (t) => typeof t === "string" && t.length > 0
      )
    : DEFAULT_AUTO_APPROVE.allowedTypes;

  return { enabled, minConfidence, allowedTypes };
}

export async function setAutoApproveSettings(
  supabase: SupabaseClient,
  next: AutoApproveSettings
): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: AUTO_APPROVE_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(`save auto-approve settings: ${error.message}`);
}

const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function shouldAutoApprove(
  settings: AutoApproveSettings,
  decision: { confidence: string; type: string }
): boolean {
  if (!settings.enabled) return false;
  const rank = CONFIDENCE_RANK[decision.confidence] ?? 0;
  const minRank = CONFIDENCE_RANK[settings.minConfidence] ?? 3;
  if (rank < minRank) return false;
  if (!settings.allowedTypes.includes(decision.type)) return false;
  return true;
}

// Shared predicate so the cron sweep and the settings-page dry-run preview
// can never drift on what "failing hard enough to retire" means.
export function shouldRetirePattern(
  positive: number,
  negative: number,
  settings: ReaperSettings
): boolean {
  const decisive = positive + negative;
  if (decisive < settings.minDecisiveVerdicts) return false;
  return negative / decisive >= settings.negRatio;
}
