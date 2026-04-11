/**
 * Meta (Facebook) Ads API integration layer.
 *
 * All Meta Graph API calls live here. The rest of the app imports
 * from this single file — keeps the external dependency isolated.
 *
 * Env vars required:
 *   META_ACCESS_TOKEN   — long-lived user or system token
 *   META_AD_ACCOUNT_ID  — e.g. "act_123456789"
 */

const API_VERSION = "v25.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

function getCredentials() {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    throw new Error(
      "Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID environment variables."
    );
  }

  return { token, accountId };
}

async function metaFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { token } = getCredentials();

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = await res.json();

  if (data.error) {
    console.error("Meta API error:", data.error);
    throw new Error(data.error.message ?? "Meta API request failed.");
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Types — what Meta returns
// ---------------------------------------------------------------------------

export type MetaAdAccount = {
  id: string;
  name: string;
};

export type MetaCampaign = {
  id: string;
  name: string;
  status: string;       // ACTIVE, PAUSED, DELETED, ARCHIVED
  objective: string;    // OUTCOME_ENGAGEMENT, OUTCOME_TRAFFIC, etc.
  daily_budget?: string;
  lifetime_budget?: string;
};

export type MetaAdSet = {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: { countries?: string[] };
  };
};

export type MetaAd = {
  id: string;
  name: string;
  status: string;       // ACTIVE, PAUSED, DELETED, ARCHIVED
  adset_id: string;
  campaign_id: string;
  creative?: {
    id: string;
    body?: string;
    title?: string;
  };
};

export type MetaInsight = {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  campaign_name?: string;
  ad_name?: string;
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  actions?: { action_type: string; value: string }[];
  date_start: string;
  date_stop: string;
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Verify credentials — returns ad account id + name. */
export async function getAdAccount(): Promise<MetaAdAccount> {
  const { accountId } = getCredentials();
  return metaFetch<MetaAdAccount>(`/${accountId}`, {
    fields: "id,name",
  });
}

/** Fetch all campaigns for the ad account. */
export async function getCampaigns(): Promise<MetaCampaign[]> {
  const { accountId } = getCredentials();
  const res = await metaFetch<{ data: MetaCampaign[] }>(
    `/${accountId}/campaigns`,
    {
      fields: "id,name,status,objective,daily_budget,lifetime_budget",
      limit: "200",
    }
  );
  return res.data ?? [];
}

/** Fetch all ad sets for the ad account. */
export async function getAdSets(): Promise<MetaAdSet[]> {
  const { accountId } = getCredentials();
  const res = await metaFetch<{ data: MetaAdSet[] }>(
    `/${accountId}/adsets`,
    {
      fields: "id,name,status,campaign_id,targeting",
      limit: "200",
    }
  );
  return res.data ?? [];
}

/** Fetch all ads for the ad account. */
export async function getAds(): Promise<MetaAd[]> {
  const { accountId } = getCredentials();
  const res = await metaFetch<{ data: MetaAd[] }>(
    `/${accountId}/ads`,
    {
      fields: "id,name,status,adset_id,campaign_id,creative{id,body,title}",
      limit: "200",
    }
  );
  return res.data ?? [];
}

/** Fetch ad-level insights for a date range (defaults to last 7 days). */
export async function getAdInsights(
  datePreset: string = "last_7d"
): Promise<MetaInsight[]> {
  const { accountId } = getCredentials();
  const res = await metaFetch<{ data: MetaInsight[] }>(
    `/${accountId}/insights`,
    {
      fields:
        "campaign_id,campaign_name,ad_id,ad_name,impressions,clicks,spend,ctr,actions",
      level: "ad",
      date_preset: datePreset,
      limit: "500",
    }
  );
  return res.data ?? [];
}

/** Fetch campaign-level insights for a date range. */
export async function getCampaignInsights(
  datePreset: string = "last_7d"
): Promise<MetaInsight[]> {
  const { accountId } = getCredentials();
  const res = await metaFetch<{ data: MetaInsight[] }>(
    `/${accountId}/insights`,
    {
      fields:
        "campaign_id,campaign_name,impressions,clicks,spend,ctr,actions",
      level: "campaign",
      date_preset: datePreset,
      limit: "200",
    }
  );
  return res.data ?? [];
}

// ---------------------------------------------------------------------------
// Mapping helpers — Meta data → your DB shape
// ---------------------------------------------------------------------------

/** Map Meta campaign status to your DB status. */
export function mapMetaStatus(metaStatus: string): "winner" | "testing" | "losing" | "paused" {
  switch (metaStatus) {
    case "ACTIVE":
      return "winner";
    case "PAUSED":
      return "paused";
    case "DELETED":
    case "ARCHIVED":
      return "losing";
    default:
      return "testing";
  }
}

/** Map Meta objective string to a clean label. */
export function mapMetaObjective(objective: string): string {
  const map: Record<string, string> = {
    OUTCOME_ENGAGEMENT: "engagement",
    OUTCOME_TRAFFIC: "traffic",
    OUTCOME_AWARENESS: "awareness",
    OUTCOME_LEADS: "leads",
    OUTCOME_SALES: "conversions",
    OUTCOME_APP_PROMOTION: "app promotion",
  };
  return map[objective] ?? objective?.toLowerCase() ?? "unknown";
}

/** Convert a Meta insight row into the shape your ads table expects. */
export function insightToAdRow(insight: MetaInsight) {
  const spend = Number(insight.spend ?? 0);
  const impressions = Number(insight.impressions ?? 0);
  const clicks = Number(insight.clicks ?? 0);
  const costPerResult =
    clicks > 0 && spend > 0 ? Number((spend / clicks).toFixed(4)) : 0;

  // Extract conversions from actions array if present
  const conversions =
    insight.actions
      ?.filter(
        (a) =>
          a.action_type === "offsite_conversion" ||
          a.action_type === "lead" ||
          a.action_type === "purchase"
      )
      .reduce((sum, a) => sum + Number(a.value ?? 0), 0) ?? 0;

  return {
    name: insight.ad_name ?? "Meta ad",
    spend,
    impressions,
    clicks,
    cost_per_result: costPerResult,
    conversions,
    engagement: 0,
    followers_gained: 0,
  };
}
