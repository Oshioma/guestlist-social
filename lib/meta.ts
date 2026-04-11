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

/** Single page fetch from Meta Graph API. */
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

/** Paginated fetch — follows `paging.next` until all pages are consumed. */
async function metaFetchAll<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const { token } = getCredentials();

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const all: T[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const response = await fetch(nextUrl, { cache: "no-store" });
    const data: { data?: T[]; paging?: { next?: string }; error?: { message?: string } } = await response.json();

    if (data.error) {
      console.error("Meta API pagination error:", data.error);
      throw new Error(data.error.message ?? "Meta API request failed.");
    }

    if (data.data) {
      all.push(...data.data);
    }

    nextUrl = data.paging?.next ?? null;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Types — what Meta returns
// ---------------------------------------------------------------------------

export type MetaAdAccount = {
  id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
};

export type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
};

export type MetaAdSet = {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  daily_budget?: string;
  lifetime_budget?: string;
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: { countries?: string[] };
    interests?: { id: string; name: string }[];
  };
  start_time?: string;
  end_time?: string;
};

export type MetaAd = {
  id: string;
  name: string;
  status: string;
  adset_id: string;
  campaign_id: string;
  created_time?: string;
  creative?: {
    id: string;
    body?: string;
    title?: string;
    image_url?: string;
    thumbnail_url?: string;
  };
};

export type MetaInsight = {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc?: string;
  cpm?: string;
  reach?: string;
  frequency?: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
  date_start: string;
  date_stop: string;
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Verify credentials — returns ad account info. */
export async function getAdAccount(): Promise<MetaAdAccount> {
  const { accountId } = getCredentials();
  return metaFetch<MetaAdAccount>(`/${accountId}`, {
    fields: "id,name,currency,timezone_name,account_status",
  });
}

/** Fetch all campaigns (paginated). Optionally filter by effective_status. */
export async function getCampaigns(
  statuses?: string[]
): Promise<MetaCampaign[]> {
  const { accountId } = getCredentials();
  const params: Record<string, string> = {
    fields:
      "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time",
    limit: "200",
  };
  if (statuses) {
    params.effective_status = JSON.stringify(statuses);
  }
  return metaFetchAll<MetaCampaign>(`/${accountId}/campaigns`, params);
}

/** Fetch all ad sets (paginated). */
export async function getAdSets(): Promise<MetaAdSet[]> {
  const { accountId } = getCredentials();
  return metaFetchAll<MetaAdSet>(`/${accountId}/adsets`, {
    fields:
      "id,name,status,campaign_id,daily_budget,lifetime_budget,targeting,start_time,end_time",
    limit: "200",
  });
}

/** Fetch all ads (paginated). */
export async function getAds(): Promise<MetaAd[]> {
  const { accountId } = getCredentials();
  return metaFetchAll<MetaAd>(`/${accountId}/ads`, {
    fields:
      "id,name,status,adset_id,campaign_id,created_time,creative{id,body,title,image_url,thumbnail_url}",
    limit: "200",
  });
}

/**
 * Fetch ad-level insights for a custom date range.
 * Defaults to last 12 months. Aggregates the full period per ad.
 */
export async function getAdInsights(opts?: {
  since?: string;
  until?: string;
  datePreset?: string;
}): Promise<MetaInsight[]> {
  const { accountId } = getCredentials();
  const params: Record<string, string> = {
    fields:
      "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,spend,ctr,cpc,cpm,reach,frequency,actions,cost_per_action_type",
    level: "ad",
    limit: "500",
  };

  if (opts?.since && opts?.until) {
    params.time_range = JSON.stringify({
      since: opts.since,
      until: opts.until,
    });
  } else {
    params.date_preset = opts?.datePreset ?? "last_year";
  }

  return metaFetchAll<MetaInsight>(`/${accountId}/insights`, params);
}

/**
 * Fetch campaign-level insights for a custom date range.
 */
export async function getCampaignInsights(opts?: {
  since?: string;
  until?: string;
  datePreset?: string;
}): Promise<MetaInsight[]> {
  const { accountId } = getCredentials();
  const params: Record<string, string> = {
    fields:
      "campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,cpm,reach,frequency,actions",
    level: "campaign",
    limit: "200",
  };

  if (opts?.since && opts?.until) {
    params.time_range = JSON.stringify({
      since: opts.since,
      until: opts.until,
    });
  } else {
    params.date_preset = opts?.datePreset ?? "last_year";
  }

  return metaFetchAll<MetaInsight>(`/${accountId}/insights`, params);
}

/**
 * Fetch daily ad-level insights (one row per ad per day) for trend tracking.
 */
export async function getDailyAdInsights(opts?: {
  since?: string;
  until?: string;
  datePreset?: string;
}): Promise<MetaInsight[]> {
  const { accountId } = getCredentials();
  const params: Record<string, string> = {
    fields:
      "campaign_id,ad_id,ad_name,impressions,clicks,spend,ctr,actions",
    level: "ad",
    time_increment: "1", // daily breakdown
    limit: "500",
  };

  if (opts?.since && opts?.until) {
    params.time_range = JSON.stringify({
      since: opts.since,
      until: opts.until,
    });
  } else {
    params.date_preset = opts?.datePreset ?? "last_30d";
  }

  return metaFetchAll<MetaInsight>(`/${accountId}/insights`, params);
}

// ---------------------------------------------------------------------------
// Mapping helpers — Meta data → your DB shape
// ---------------------------------------------------------------------------

/** Map Meta campaign/ad status to your DB status. */
export function mapMetaStatus(
  metaStatus: string
): "winner" | "testing" | "losing" | "paused" {
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
    LINK_CLICKS: "traffic",
    POST_ENGAGEMENT: "engagement",
    BRAND_AWARENESS: "awareness",
    REACH: "awareness",
    CONVERSIONS: "conversions",
    LEAD_GENERATION: "leads",
    MESSAGES: "engagement",
    VIDEO_VIEWS: "engagement",
    PAGE_LIKES: "engagement",
  };
  return map[objective] ?? objective?.toLowerCase().replace(/_/g, " ") ?? "unknown";
}

/** Convert a Meta insight row into the shape your ads table expects. */
export function insightToAdRow(insight: MetaInsight) {
  const spend = Number(insight.spend ?? 0);
  const impressions = Number(insight.impressions ?? 0);
  const clicks = Number(insight.clicks ?? 0);
  const costPerResult =
    clicks > 0 && spend > 0 ? Number((spend / clicks).toFixed(4)) : 0;

  // Extract conversions from actions array
  const conversionTypes = new Set([
    "offsite_conversion",
    "lead",
    "purchase",
    "complete_registration",
    "omni_purchase",
  ]);
  const conversions =
    insight.actions
      ?.filter((a) => conversionTypes.has(a.action_type))
      .reduce((sum, a) => sum + Number(a.value ?? 0), 0) ?? 0;

  // Extract engagement (likes, comments, shares, reactions)
  const engagementTypes = new Set([
    "post_engagement",
    "page_engagement",
    "post_reaction",
    "comment",
    "like",
  ]);
  const engagement =
    insight.actions
      ?.filter((a) => engagementTypes.has(a.action_type))
      .reduce((sum, a) => sum + Number(a.value ?? 0), 0) ?? 0;

  return {
    name: insight.ad_name ?? "Meta ad",
    spend,
    impressions,
    clicks,
    cost_per_result: costPerResult,
    conversions,
    engagement,
    followers_gained: 0,
  };
}

/** Flatten ad set targeting into a readable audience string. */
export function targetingToAudience(adSet: MetaAdSet): string {
  const parts: string[] = [];
  const t = adSet.targeting;
  if (!t) return "";

  if (t.age_min || t.age_max) {
    parts.push(`${t.age_min ?? 18}–${t.age_max ?? 65}yo`);
  }
  if (t.genders?.length) {
    const labels = t.genders.map((g) => (g === 1 ? "Male" : g === 2 ? "Female" : "All"));
    parts.push(labels.join(", "));
  }
  if (t.geo_locations?.countries?.length) {
    parts.push(t.geo_locations.countries.join(", "));
  }
  if (t.interests?.length) {
    parts.push(t.interests.map((i) => i.name).slice(0, 5).join(", "));
  }

  return parts.join(" · ");
}
