/**
 * Create a campaign + ad set in Meta Ads Manager from the local campaign form.
 *
 * This is the execution bridge between the local campaigns table and Meta's
 * Graph API. The form collects name / objective / budget / audience / status;
 * this module turns that into two Graph calls:
 *
 *   1. POST /act_{id}/campaigns  →  returns a campaign ID
 *   2. POST /act_{id}/adsets     →  returns an ad set ID
 *
 * We deliberately stop here for MVP. Ads (creative + ad object) are added
 * later via the client → campaign → ads → new flow, or directly in Meta
 * Ads Manager. The campaign still shows up in Ads Manager and the next
 * meta-sync will pick it up.
 */

import { logMetaWrite } from "./meta-write-log";

const API_VERSION = "v25.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

function getCredentials() {
  const token = process.env.META_ACCESS_TOKEN;
  let accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error(
      "Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID environment variables."
    );
  }
  if (!accountId.startsWith("act_")) {
    accountId = `act_${accountId}`;
  }
  return { token, accountId };
}

// The form stores objectives as lowercase labels; Meta expects OUTCOME_*
// enum values. This is the reverse of mapMetaObjective in lib/meta.ts.
const OBJECTIVE_TO_META: Record<string, string> = {
  engagement: "OUTCOME_ENGAGEMENT",
  traffic: "OUTCOME_TRAFFIC",
  awareness: "OUTCOME_AWARENESS",
  leads: "OUTCOME_LEADS",
  conversions: "OUTCOME_SALES",
};

const OBJECTIVE_TO_OPTIMIZATION: Record<string, string> = {
  engagement: "POST_ENGAGEMENT",
  traffic: "LINK_CLICKS",
  awareness: "REACH",
  leads: "LEAD_GENERATION",
  conversions: "OFFSITE_CONVERSIONS",
};

const STATUS_TO_META: Record<string, string> = {
  testing: "PAUSED",
  paused: "PAUSED",
  live: "ACTIVE",
  winner: "ACTIVE",
  losing: "PAUSED",
};

export type CreateCampaignInput = {
  name: string;
  objective: string;
  budgetPounds: number;
  audience: string;
  status: string;
};

export type CreateCampaignResult =
  | {
      ok: true;
      metaCampaignId: string;
      metaAdSetId: string;
    }
  | { ok: false; error: string; step: "campaign" | "adset" };

export async function createMetaCampaign(
  input: CreateCampaignInput
): Promise<CreateCampaignResult> {
  const { token, accountId } = getCredentials();

  const metaObjective =
    OBJECTIVE_TO_META[input.objective] ?? "OUTCOME_ENGAGEMENT";
  const metaStatus = STATUS_TO_META[input.status] ?? "PAUSED";
  const optimizationGoal =
    OBJECTIVE_TO_OPTIMIZATION[input.objective] ?? "REACH";

  // Budget in cents (Meta expects the smallest currency unit).
  const dailyBudgetCents = Math.max(
    Math.round(input.budgetPounds * 100),
    100
  );

  // Start time: tomorrow at 00:00 UTC — Meta rejects ad sets with a
  // start_time in the past.
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const startTimeIso = tomorrow.toISOString();

  // ── 1. Create Campaign ──────────────────────────────────────────────
  try {
    const campaignParams = new URLSearchParams({
      access_token: token,
      name: input.name,
      objective: metaObjective,
      status: metaStatus,
      buying_type: "AUCTION",
      special_ad_categories: "NONE",
      is_adset_budget_sharing_enabled: "false",
    });

    const campaignStart = Date.now();
    const campaignRes = await fetch(`${BASE}/${accountId}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: campaignParams,
    });
    const campaignData = (await campaignRes.json()) as {
      id?: string;
      error?: { message?: string; error_user_title?: string; error_user_msg?: string };
    };

    logMetaWrite({
      operation: "campaign:create_campaign",
      metaEndpoint: `/${accountId}/campaigns`,
      requestBody: Object.fromEntries(campaignParams.entries()),
      responseStatus: campaignRes.status,
      responseBody: campaignData,
      success: !campaignData.error && !!campaignData.id,
      errorMessage: campaignData.error?.message ?? null,
      durationMs: Date.now() - campaignStart,
    });

    if (campaignData.error || !campaignData.id) {
      const errParts = [
        campaignData.error?.message,
        campaignData.error?.error_user_title,
        campaignData.error?.error_user_msg,
      ].filter(Boolean);
      return {
        ok: false,
        error: errParts.join(" — ") || "Meta returned no campaign ID.",
        step: "campaign",
      };
    }

    const metaCampaignId = campaignData.id;

    // ── 2. Create Ad Set ────────────────────────────────────────────────
    const adSetParams = new URLSearchParams({
      access_token: token,
      campaign_id: metaCampaignId,
      name: `${input.name} — ad set`,
      daily_budget: String(dailyBudgetCents),
      billing_event: "IMPRESSIONS",
      optimization_goal: optimizationGoal,
      status: metaStatus,
      start_time: startTimeIso,
      targeting: JSON.stringify(buildTargeting(input.audience)),
    });

    const adSetStart = Date.now();
    const adSetRes = await fetch(`${BASE}/${accountId}/adsets`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: adSetParams,
    });
    const adSetData = (await adSetRes.json()) as {
      id?: string;
      error?: { message?: string };
    };

    logMetaWrite({
      operation: "campaign:create_adset",
      metaEndpoint: `/${accountId}/adsets`,
      requestBody: Object.fromEntries(adSetParams.entries()),
      responseStatus: adSetRes.status,
      responseBody: adSetData,
      success: !adSetData.error && !!adSetData.id,
      errorMessage: adSetData.error?.message ?? null,
      durationMs: Date.now() - adSetStart,
    });

    if (adSetData.error || !adSetData.id) {
      return {
        ok: false,
        error: adSetData.error?.message ?? "Meta returned no ad set ID.",
        step: "adset",
      };
    }

    return {
      ok: true,
      metaCampaignId,
      metaAdSetId: adSetData.id,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step: "campaign",
    };
  }
}

// Build a Meta targeting spec from the free-text audience field. For MVP
// this is a broad "all genders, 18-65, GB" default — the audience string
// is stored locally for context but doesn't drive real targeting yet.
// Future: parse structured audience data from AudiencePicker.
function buildTargeting(audience: string): Record<string, unknown> {
  const targeting: Record<string, unknown> = {
    age_min: 18,
    age_max: 65,
    geo_locations: { countries: ["GB"] },
  };

  // Simple keyword extraction from the free-text field — best-effort,
  // not a contract. Operators can refine in Meta Ads Manager.
  const lower = audience.toLowerCase();

  const ageMatch = lower.match(/(\d{2})\s*[-–]\s*(\d{2})/);
  if (ageMatch) {
    targeting.age_min = Math.max(13, Math.min(65, Number(ageMatch[1])));
    targeting.age_max = Math.max(
      targeting.age_min as number,
      Math.min(65, Number(ageMatch[2]))
    );
  }

  if (/\bmale\b/.test(lower) && !/\bfemale\b/.test(lower)) {
    targeting.genders = [1];
  } else if (/\bfemale\b/.test(lower) || /\bwomen\b/.test(lower)) {
    targeting.genders = [2];
  }

  return targeting;
}
